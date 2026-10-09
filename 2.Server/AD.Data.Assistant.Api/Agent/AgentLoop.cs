using System.Diagnostics;
using System.Text;
using System.Text.Json;
using AD.Data.Assistant.Api.Options;
using Anthropic;
using Anthropic.Exceptions;
using Anthropic.Models.Beta.Messages;
using Microsoft.Extensions.Options;

namespace AD.Data.Assistant.Api.Agent;

public sealed class AgentRunResult
{
    public string FinalText { get; init; } = "";
    /// <summary>"end_turn", "max_iterations"…</summary>
    public string StopReason { get; init; } = "";
    public int Iterations { get; init; }
    /// <summary>Modelo que sirvió la última respuesta (distinto del pedido si actuó el fallback del servidor).</summary>
    public string? ServedBy { get; init; }
    public List<ToolCallTrace> Trace { get; } = [];
    public UsageInfo Usage { get; init; } = new(0, 0, 0, 0);
}

/// <summary>
/// Bucle de tool use con streaming hacia Claude (endpoint beta, para el fallback del servidor). Ejecuta las herramientas
/// que Claude pide (en paralelo) y reenvía el progreso por <see cref="EmitAsync"/>. El historial es append-only.
/// </summary>
public sealed class AgentLoop(AnthropicClient client, IOptions<AnthropicOptions> options, ILogger<AgentLoop> log)
{
    private const string FallbackBeta = "server-side-fallback-2026-06-01";
    private readonly AnthropicOptions _opt = options.Value;

    private sealed class BlockAcc
    {
        public string Kind = "";
        public readonly StringBuilder Text = new();
        public string Signature = "";
        public string? RedactedData;
        public string? Id, Name;
        public readonly StringBuilder Json = new();
    }

    private sealed record Turn(List<BetaContentBlockParam> Assistant, List<ToolCall> ToolCalls, string Text, string StopReason,
        string? RefusalCategory, string? ServedBy, long In, long Out, long CacheRead, long CacheCreate);

    public async Task<AgentRunResult> RunAsync(
        string systemPrompt,
        List<BetaMessageParam> messages,
        IReadOnlyList<BetaToolUnion> tools,
        int maxIterations,
        Func<ToolCall, CancellationToken, Task<ToolOutcome>> handleTool,
        IReadOnlyDictionary<string, JsonElement>? jsonSchema,
        RunSettings settings,
        EmitAsync emit,
        CancellationToken ct)
    {
        var trace = new List<ToolCallTrace>();
        long inTok = 0, outTok = 0, cacheRead = 0, cacheCreate = 0;
        string finalText = "", stop = "";
        string? servedBy = null;
        var iterations = 0;
        var watch = Stopwatch.StartNew();
        // Parámetros de la solicitud, para el log del front y la telemetría.
        await emit(new AgentEvent("request", new
        {
            provider = "anthropic", model = settings.Model, effort = settings.Effort, fallback = settings.Fallback,
            thinking = "adaptive", showThinking = true, maxTokens = _opt.MaxTokens, maxIterations,
            systemChars = systemPrompt.Length,
            tools = tools.Select(t => t.TryPickBetaTool(out var bt) ? bt.Name : "?").ToArray(),
        }));

        for (var iter = 0; iter < maxIterations; iter++)
        {
            iterations++;
            await emit(new AgentEvent("status", new { message = $"Claude pensando (iteración {iter + 1})…" }));
            var turnWatch = Stopwatch.StartNew();
            var turn = await StreamTurnAsync(systemPrompt, messages, tools, jsonSchema, settings, emit, ct);
            await emit(new AgentEvent("turn_end", new
            {
                iteration = iter + 1, stopReason = turn.StopReason, servedBy = turn.ServedBy,
                inputTokens = turn.In, outputTokens = turn.Out, cacheReadTokens = turn.CacheRead, cacheCreationTokens = turn.CacheCreate,
                ms = turnWatch.ElapsedMilliseconds,
            }));
            inTok += turn.In; outTok += turn.Out; cacheRead += turn.CacheRead; cacheCreate += turn.CacheCreate;
            stop = turn.StopReason;
            finalText = turn.Text;
            servedBy = turn.ServedBy ?? servedBy;

            if (stop == "refusal")
                throw new ApiException(422, $"El modelo rechazó la consulta por política de uso ({turn.RefusalCategory ?? "sin categoría"}). Reformúlala o prueba con otro modelo.");

            if (turn.Assistant.Count > 0)
                messages.Add(new BetaMessageParam { Role = Role.Assistant, Content = turn.Assistant });

            if (stop == "max_tokens")
                throw new ApiException(502, "La respuesta del modelo se cortó por longitud (max_tokens). Acota la pregunta.");

            if (stop != "tool_use" || turn.ToolCalls.Count == 0) break;

            var outcomes = await ExecuteToolsAsync(turn.ToolCalls, handleTool, emit, trace, ct);
            List<BetaContentBlockParam> results = [];
            for (var i = 0; i < turn.ToolCalls.Count; i++)
                results.Add(new BetaToolResultBlockParam { ToolUseID = turn.ToolCalls[i].Id, Content = outcomes[i].Content, IsError = outcomes[i].IsError });
            messages.Add(new BetaMessageParam { Role = Role.User, Content = results });

            if (iter == maxIterations - 1) stop = "max_iterations";
        }

        log.LogInformation("Agente: modelo={Model} servido={Served} esfuerzo={Effort} iteraciones={Iter} herramientas={Tools} tokens(in/out/cacheR/cacheW)={In}/{Out}/{CR}/{CW} ms={Ms} stop={Stop}",
            settings.Model, servedBy, settings.Effort, iterations, trace.Count, inTok, outTok, cacheRead, cacheCreate, watch.ElapsedMilliseconds, stop);

        var result = new AgentRunResult
        {
            FinalText = finalText, StopReason = stop, Iterations = iterations, ServedBy = servedBy,
            Usage = new UsageInfo(inTok, outTok, cacheRead, cacheCreate),
        };
        result.Trace.AddRange(trace);
        return result;
    }

    private async Task<ToolOutcome[]> ExecuteToolsAsync(
        List<ToolCall> calls, Func<ToolCall, CancellationToken, Task<ToolOutcome>> handleTool, EmitAsync emit, List<ToolCallTrace> trace, CancellationToken ct) =>
        await Task.WhenAll(calls.Select(async tc =>
        {
            await emit(new AgentEvent("tool_call", new { tool = tc.Name, input = tc.Input }));
            var sw = Stopwatch.StartNew();
            ToolOutcome o;
            try { o = await handleTool(tc, ct); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogWarning(ex, "Herramienta {Tool} falló", tc.Name);
                o = new ToolOutcome($"Error: {ex.Message}", true);
            }
            sw.Stop();
            var preview = Preview(o.Content);
            lock (trace) trace.Add(new ToolCallTrace(tc.Name, JsonSerializer.SerializeToElement(tc.Input), sw.ElapsedMilliseconds, o.IsError, preview));
            await emit(new AgentEvent("tool_result", new
            {
                tool = tc.Name, durationMs = sw.ElapsedMilliseconds, isError = o.IsError, result = preview,
            }));
            return o;
        }));

    public static string Preview(string s) => s.Length <= 1500 ? s : s[..1500] + "… [truncado]";

    /// <summary>Una llamada a Messages en streaming; acumula los bloques y reenvía texto y razonamiento en vivo.</summary>
    private async Task<Turn> StreamTurnAsync(
        string systemPrompt, List<BetaMessageParam> messages, IReadOnlyList<BetaToolUnion> tools,
        IReadOnlyDictionary<string, JsonElement>? jsonSchema, RunSettings settings, EmitAsync emit, CancellationToken ct)
    {
        var request = new MessageCreateParams
        {
            Model = settings.Model,
            MaxTokens = _opt.MaxTokens,
            // Prompt de sistema estable y cacheado; la fecha y la pregunta van en los mensajes.
            System = new List<BetaTextBlockParam> { new() { Text = systemPrompt, CacheControl = new BetaCacheControlEphemeral() } },
            Thinking = new BetaThinkingConfigAdaptive { Display = Display.Summarized },
            OutputConfig = new BetaOutputConfig
            {
                Effort = ParseEffort(settings.Effort),
                Format = jsonSchema is null ? null : new BetaJsonOutputFormat { Schema = jsonSchema.ToDictionary() },
            },
            Tools = tools.ToList(),
            Messages = messages,
        };
        if (settings.Fallback is { } fb)
            request = request with { Betas = [FallbackBeta], Fallbacks = new List<BetaFallbackParam> { new() { Model = fb } } };

        var blocks = new SortedDictionary<long, BlockAcc>();
        string stopReason = "", category = "";
        string? servedBy = null;
        long inTok = 0, outTok = 0, cacheRead = 0, cacheCreate = 0;

        try
        {
            await foreach (var ev in client.Beta.Messages.CreateStreaming(request, ct))
            {
                if (ev.TryPickStart(out var start))
                {
                    servedBy = start.Message.Model.ToString().Trim('"');
                    var u = start.Message.Usage;
                    inTok = u.InputTokens;
                    outTok = u.OutputTokens;
                    cacheRead = u.CacheReadInputTokens ?? 0;
                    cacheCreate = u.CacheCreationInputTokens ?? 0;
                }
                else if (ev.TryPickContentBlockStart(out var cbs))
                {
                    var acc = new BlockAcc();
                    blocks[cbs.Index] = acc;
                    var cb = cbs.ContentBlock;
                    if (cb.TryPickBetaText(out var tb))
                    {
                        acc.Kind = "text"; acc.Text.Append(tb.Text);
                        await emit(new AgentEvent("block", new { kind = "text" }));
                    }
                    else if (cb.TryPickBetaThinking(out var th))
                    {
                        acc.Kind = "thinking"; acc.Text.Append(th.Thinking); acc.Signature = th.Signature;
                        await emit(new AgentEvent("block", new { kind = "thinking" }));
                    }
                    else if (cb.TryPickBetaRedactedThinking(out var rt)) { acc.Kind = "redacted"; acc.RedactedData = rt.Data; }
                    else if (cb.TryPickBetaToolUse(out var tu))
                    {
                        acc.Kind = "tool_use"; acc.Id = tu.ID; acc.Name = tu.Name;
                        await emit(new AgentEvent("tool_use_start", new { tool = tu.Name }));
                    }
                    else if (cb.TryPickBetaFallback(out _))
                    {
                        acc.Kind = "fallback";
                        await emit(new AgentEvent("status", new { message = "El modelo elegido declinó la consulta; continúa el modelo de respaldo." }));
                    }
                }
                else if (ev.TryPickContentBlockDelta(out var cbd))
                {
                    if (!blocks.TryGetValue(cbd.Index, out var acc)) continue;
                    if (cbd.Delta.TryPickText(out var td))
                    {
                        acc.Text.Append(td.Text);
                        if (td.Text.Length > 0) await emit(new AgentEvent("text", new { delta = td.Text }));
                    }
                    else if (cbd.Delta.TryPickThinking(out var thd))
                    {
                        acc.Text.Append(thd.Thinking);
                        if (thd.Thinking.Length > 0) await emit(new AgentEvent("thinking", new { delta = thd.Thinking }));
                    }
                    else if (cbd.Delta.TryPickSignature(out var sd)) acc.Signature = sd.Signature;
                    else if (cbd.Delta.TryPickInputJson(out var jd)) acc.Json.Append(jd.PartialJson);
                }
                else if (ev.TryPickDelta(out var md))
                {
                    stopReason = md.Delta.StopReason?.ToString() ?? stopReason;
                    category = md.Delta.StopDetails?.Category?.ToString().Trim('"') ?? category;
                    outTok = md.Usage.OutputTokens;
                    if (md.Usage.InputTokens is { } i) inTok = i;
                    if (md.Usage.CacheReadInputTokens is { } cr) cacheRead = cr;
                    if (md.Usage.CacheCreationInputTokens is { } cc) cacheCreate = cc;
                }
            }
        }
        catch (AnthropicRateLimitException ex) { throw new ApiException(503, "Límite de uso de Anthropic alcanzado; reintenta en unos segundos.", ex); }
        catch (Anthropic5xxException ex) { throw new ApiException(502, "Anthropic no está disponible temporalmente.", ex); }
        catch (AnthropicApiException ex) { throw new ApiException(502, $"Error de la API de Anthropic: {ex.Message}", ex); }

        // Tras un fallback a mitad de respuesta, los bloques de razonamiento y tool_use anteriores al último bloque
        // «fallback» no se reenvían ni se ejecutan (solo el texto parcial sigue siendo contexto válido).
        var boundary = blocks.LastOrDefault(kv => kv.Value.Kind == "fallback").Key;
        var hasBoundary = blocks.Any(kv => kv.Value.Kind == "fallback");

        List<BetaContentBlockParam> assistant = [];
        List<ToolCall> calls = [];
        var text = new StringBuilder();
        foreach (var (index, acc) in blocks)
        {
            var beforeBoundary = hasBoundary && index < boundary;
            switch (acc.Kind)
            {
                case "text":
                    if (acc.Text.Length == 0) break;
                    assistant.Add(new BetaTextBlockParam { Text = acc.Text.ToString() });
                    if (!beforeBoundary) text.Append(acc.Text);
                    break;
                case "thinking" when !beforeBoundary: // la firma debe conservarse
                    assistant.Add(new BetaThinkingBlockParam { Thinking = acc.Text.ToString(), Signature = acc.Signature });
                    break;
                case "redacted" when !beforeBoundary:
                    assistant.Add(new BetaRedactedThinkingBlockParam { Data = acc.RedactedData! });
                    break;
                case "tool_use" when !beforeBoundary:
                    var json = acc.Json.Length == 0 ? "{}" : acc.Json.ToString();
                    Dictionary<string, JsonElement> input;
                    try { input = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json) ?? []; }
                    catch (JsonException ex) { throw new ApiException(502, $"El modelo devolvió argumentos inválidos para '{acc.Name}': {ex.Message}", ex); }
                    assistant.Add(new BetaToolUseBlockParam { ID = acc.Id!, Name = acc.Name!, Input = input });
                    calls.Add(new ToolCall(acc.Id!, acc.Name!, input));
                    break;
            }
        }

        return new Turn(assistant, calls, text.ToString(), Normalize(stopReason), category, servedBy, inTok, outTok, cacheRead, cacheCreate);
    }

    internal static string Normalize(string s) => s.Trim('"').ToLowerInvariant().Replace("-", "_") switch
    {
        "tooluse" => "tool_use",
        "maxtokens" => "max_tokens",
        "endturn" => "end_turn",
        var x => x,
    };

    private static Effort ParseEffort(string s) => s switch
    {
        "low" => Effort.Low,
        "medium" => Effort.Medium,
        "xhigh" => Effort.Xhigh,
        "max" => Effort.Max,
        _ => Effort.High,
    };
}
