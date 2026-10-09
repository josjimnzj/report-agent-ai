using System.Diagnostics;
using System.Text.Json;
using AD.Data.Assistant.Api.Storage;
using AD.Data.Assistant.Api.Telemetry;
using Anthropic.Models.Beta.Messages;

namespace AD.Data.Assistant.Api.Agent;

public sealed class PromptStore
{
    private readonly Lazy<string> _dataAnalyst = new(() => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Prompts", "data-analyst.md")));
    public string DataAnalyst => _dataAnalyst.Value;
}

/// <summary>
/// Agente de consulta de datos: arma el historial de la conversación (guardado en Neon), ejecuta el bucle con las
/// herramientas del MCP, captura en el servidor los resultados reales de execute_query y registra la ejecución.
/// </summary>
public sealed class DataAgent(AgentLoop loop, SqlMcpClient mcp, ModelCatalog catalog, IDocumentStore store, PromptStore prompts, TelemetryStore telemetry, TimeProvider time, ILogger<DataAgent> log)
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Filas de cada resultado que ve el modelo (el usuario recibe todas).</summary>
    internal const int ModelRowSample = 100;
    /// <summary>Turnos previos que se reenvían como contexto en preguntas de seguimiento.</summary>
    internal const int HistoryTurns = 8;
    private const int HistorySampleRows = 15;
    private const int MaxToolTextChars = 60_000;

    private static readonly IReadOnlyDictionary<string, JsonElement> AnswerSchema = JsonDocument.Parse("""
    {
      "type": "object",
      "properties": {
        "answer": { "type": "string" },
        "resultQuery": { "type": "integer" },
        "chart": {
          "type": "object",
          "properties": {
            "type": { "type": "string", "enum": ["bar", "stackedbar", "fullstackedbar", "horizontalbar", "line", "spline", "stepline", "area", "stackedarea", "splinearea", "scatter", "combo", "pie", "doughnut", "none"] },
            "x": { "type": "string" },
            "y": { "type": "array", "items": { "type": "string" } },
            "series": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "column": { "type": "string" },
                  "type": { "type": "string", "enum": ["bar", "line", "spline", "area", "scatter"] },
                  "axis": { "type": "string", "enum": ["left", "right"] }
                },
                "required": ["column", "type", "axis"],
                "additionalProperties": false
              }
            },
            "refLines": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "kind": { "type": "string", "enum": ["average", "max", "min", "value"] },
                  "column": { "type": "string" },
                  "value": { "anyOf": [{ "type": "number" }, { "type": "null" }] },
                  "label": { "type": "string" }
                },
                "required": ["kind", "column", "value", "label"],
                "additionalProperties": false
              }
            }
          },
          "required": ["type", "x", "y", "series", "refLines"],
          "additionalProperties": false
        },
        "askChart": { "type": "boolean" },
        "openReport": { "type": "boolean" }
      },
      "required": ["answer", "resultQuery", "chart", "askChart", "openReport"],
      "additionalProperties": false
    }
    """).RootElement.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone());

    public async Task<QueryResponse> AskAsync(QueryRequest req, EmitAsync emit, CancellationToken ct)
    {
        var question = req.Question?.Trim() ?? "";
        var settings = catalog.Resolve(req.Model, req.Effort);
        var maxIter = catalog.ResolveIterations(req.MaxIterations);
        var conversationId = string.IsNullOrWhiteSpace(req.ConversationId) ? Guid.NewGuid().ToString("N") : req.ConversationId.Trim();
        var runGuid = Guid.NewGuid();
        var runId = runGuid.ToString("N");
        var sw = Stopwatch.StartNew();
        // Telemetría (base aparte): captura los eventos de la ejecución si está configurada.
        var recorder = telemetry.Enabled
            ? new RunRecorder(telemetry.Options, runGuid, "query", question, new(conversationId, settings.Model, settings.Effort, true, maxIter, false), Commit)
            : null;
        if (recorder is not null) emit = recorder.Wrap(emit);
        var phases = new PhaseTracker(emit);

        try
        {
            await phases.SetAsync("interpret", "Interpretando tu consulta");
            var conv = await LoadConversationAsync(conversationId, ct);
            var tools = (await mcp.ListToolsAsync(ct)).Select(ToolMapper.FromMcp).ToList();

            var messages = BuildMessages(conv, question, time.GetLocalNow());
            var results = new List<QueryResult>();
            EmitAsync tracked = async e => { await phases.OnEventAsync(e); await emit(e); };

            var run = await loop.RunAsync(
                prompts.DataAnalyst, messages, tools, maxIter,
                (tc, c) => ExecuteToolAsync(tc, results, c),
                AnswerSchema, settings, tracked, ct);

            QueryResponse response;
            if (run.StopReason == "max_iterations")
            {
                var last = results.LastOrDefault();
                response = Build(conversationId, runId, "max_iterations", run, settings, sw.ElapsedMilliseconds,
                    string.IsNullOrWhiteSpace(run.FinalText) ? $"El agente usó las {maxIter} iteraciones permitidas sin terminar. Puedes reformular la pregunta o subir el esfuerzo." : run.FinalText,
                    last, results, null, null);
            }
            else
            {
                var parts = ParseAnswer(run.FinalText);
                var main = parts.ResultQuery >= 1 && parts.ResultQuery <= results.Count ? results[parts.ResultQuery - 1] : null;
                response = Build(conversationId, runId, "ok", run, settings, sw.ElapsedMilliseconds, parts.Answer, main, results, parts.Chart, parts);
            }

            await SaveTurnAsync(conv, settings.Model, question, response, ct);
            await SaveRunAsync(runId, conversationId, question, settings, response, null, ct);
            if (recorder is not null) telemetry.Enqueue(recorder.Complete(response));
            return response;
        }
        catch (Exception ex)
        {
            if (ex is not OperationCanceledException)
                await SaveRunAsync(runId, conversationId, question, settings, null, ex.Message, CancellationToken.None);
            if (recorder is not null) telemetry.Enqueue(recorder.Fail(ex));
            throw;
        }
    }

    private static QueryResponse Build(string conversationId, string runId, string status, AgentRunResult run, RunSettings settings, long ms,
        string answer, QueryResult? main, List<QueryResult> results, ChartHint? chart, AnswerParts? parts) =>
        new(conversationId, status, run.Iterations, answer,
            main?.Columns ?? [], main?.Rows ?? [], results.Select(r => r.Sql).ToList(), run.Trace, run.Usage, ms,
            runId, settings.Model, settings.Effort, run.ServedBy, chart, main?.RowCount ?? 0,
            AskChart: parts?.AskChart ?? false, OpenReport: parts?.OpenReport ?? false);

    private static readonly string? Commit = (Environment.GetEnvironmentVariable("RENDER_GIT_COMMIT") ?? Environment.GetEnvironmentVariable("GIT_COMMIT")) is { Length: >= 7 } c ? c[..7] : null;

    /// <summary>Historial compacto: cada turno previo como pregunta + respuesta con su SQL y una muestra de filas.</summary>
    internal static List<BetaMessageParam> BuildMessages(ConversationDoc conv, string question, DateTimeOffset now)
    {
        var messages = new List<BetaMessageParam>();
        foreach (var t in conv.Turns.TakeLast(HistoryTurns))
        {
            messages.Add(new BetaMessageParam { Role = Role.User, Content = t.Question });
            var summary = JsonSerializer.Serialize(new { answer = t.Answer, sql = t.Queries, columns = t.Columns, sampleRows = t.SampleRows, chart = t.Chart }, Json);
            messages.Add(new BetaMessageParam { Role = Role.Assistant, Content = $"Respuesta anterior (resumen): {summary}" });
        }
        // La fecha va en el mensaje, no en el prompt de sistema, para no romper la caché del prefijo.
        messages.Add(new BetaMessageParam { Role = Role.User, Content = $"Fecha de hoy: {now:yyyy-MM-dd}.\n\n{question}" });
        return messages;
    }

    private async Task<ToolOutcome> ExecuteToolAsync(ToolCall tc, List<QueryResult> results, CancellationToken ct)
    {
        var args = tc.Input.ToDictionary(kv => kv.Key, kv => (object?)kv.Value);
        var (text, isError) = await mcp.CallToolAsync(tc.Name, args, ct);
        if (tc.Name != "execute_query" || isError) return new ToolOutcome(Cap(text), isError);

        var sql = tc.Input.TryGetValue("query", out var q) && q.ValueKind == JsonValueKind.String ? q.GetString() ?? "" : "";
        if (ParseQueryResult(sql, text) is not { } result) return new ToolOutcome(Cap(text), false);

        int number;
        lock (results) { results.Add(result); number = results.Count; }
        return new ToolOutcome(DescribeForModel(number, result), false);
    }

    /// <summary>Lee la salida de execute_query de addaccion-mcp-sql: { columns, rows, rowCount, executionTime }.</summary>
    internal static QueryResult? ParseQueryResult(string sql, string text)
    {
        try
        {
            using var doc = JsonDocument.Parse(text);
            var root = doc.RootElement;
            if (!root.TryGetProperty("columns", out var c) || c.ValueKind != JsonValueKind.Array) return null;
            if (!root.TryGetProperty("rows", out var r) || r.ValueKind != JsonValueKind.Array) return null;
            var columns = c.EnumerateArray().Select(x => x.GetString() ?? "").ToList();
            var rows = r.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.Array)
                .Select(x => (IReadOnlyList<JsonElement>)x.EnumerateArray().Select(e => e.Clone()).ToList()).ToList();
            var count = root.TryGetProperty("rowCount", out var n) && n.TryGetInt64(out var v) ? v : rows.Count;
            return new QueryResult(sql, columns, rows, count);
        }
        catch (JsonException) { return null; }
    }

    internal static string DescribeForModel(int number, QueryResult r)
    {
        var sample = r.Rows.Take(ModelRowSample).ToList();
        var note = r.Rows.Count > sample.Count
            ? $"Se muestran {sample.Count} de {r.Rows.Count} filas; el usuario recibe todas."
            : $"{r.Rows.Count} filas.";
        return JsonSerializer.Serialize(new { consulta = number, columns = r.Columns, rows = sample, rowCount = r.RowCount, nota = note }, Json);
    }

    private static string Cap(string s) => s.Length <= MaxToolTextChars ? s : s[..MaxToolTextChars] + "\n… [recortado]";

    /// <summary>Lee el JSON final { answer, resultQuery, chart, askChart, openReport }. Si el modelo no lo respetó, el texto se usa como respuesta.</summary>
    internal static AnswerParts ParseAnswer(string text)
    {
        var t = text.Trim();
        var i = t.IndexOf('{'); var j = t.LastIndexOf('}');
        if (i < 0 || j <= i) return new(t, 0, null, false, false);
        try
        {
            using var doc = JsonDocument.Parse(t[i..(j + 1)]);
            var root = doc.RootElement;
            var answer = root.TryGetProperty("answer", out var a) && a.ValueKind == JsonValueKind.String ? a.GetString() ?? "" : t;
            var index = root.TryGetProperty("resultQuery", out var rq) && rq.TryGetInt32(out var n) ? n : 0;
            ChartHint? chart = null;
            if (root.TryGetProperty("chart", out var ch) && ch.ValueKind == JsonValueKind.Object
                && ch.TryGetProperty("type", out var ty) && ty.GetString() is { } type && type != "none")
            {
                var x = ch.TryGetProperty("x", out var xe) ? xe.GetString() ?? "" : "";
                var y = ch.TryGetProperty("y", out var ye) && ye.ValueKind == JsonValueKind.Array ? ye.EnumerateArray().Select(e => e.GetString() ?? "").ToList() : [];
                List<ChartSeries> series = ch.TryGetProperty("series", out var se) && se.ValueKind == JsonValueKind.Array
                    ? se.EnumerateArray().Where(e => e.ValueKind == JsonValueKind.Object)
                        .Select(e => new ChartSeries(Str(e, "column"), Str(e, "type") is { Length: > 0 } st ? st : "bar", Str(e, "axis") == "right" ? "right" : "left"))
                        .Where(s => s.Column.Length > 0).ToList()
                    : [];
                List<ChartRefLine> lines = ch.TryGetProperty("refLines", out var le) && le.ValueKind == JsonValueKind.Array
                    ? le.EnumerateArray().Where(e => e.ValueKind == JsonValueKind.Object)
                        .Select(e => new ChartRefLine(Str(e, "kind") is { Length: > 0 } k ? k : "average", Str(e, "column"),
                            e.TryGetProperty("value", out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null, Str(e, "label")))
                        .ToList()
                    : [];
                chart = new ChartHint(type, x, y, series, lines);
            }
            bool Flag(string name) => root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;
            static string Str(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
            return new(answer, index, chart, Flag("askChart"), Flag("openReport"));
        }
        catch (JsonException) { return new(t, 0, null, false, false); }
    }

    private async Task<ConversationDoc> LoadConversationAsync(string id, CancellationToken ct)
    {
        var doc = await store.GetAsync(Collections.Conversations, id, ct);
        return doc is { } d ? d.Deserialize<ConversationDoc>(Json) ?? Empty(id) : Empty(id);

        ConversationDoc Empty(string i) => new(i, null, [], time.GetUtcNow());
    }

    private async Task SaveTurnAsync(ConversationDoc conv, string model, string question, QueryResponse r, CancellationToken ct)
    {
        var turn = new ConversationTurn(question, r.Answer, r.Queries, r.Columns, r.Rows.Take(HistorySampleRows).ToList(), time.GetUtcNow(), r.Chart);
        var turns = conv.Turns.Append(turn).TakeLast(HistoryTurns * 2).ToList();
        var updated = conv with { Model = model, Turns = turns, UpdatedAt = time.GetUtcNow() };
        await store.PutAsync(Collections.Conversations, conv.Id, JsonSerializer.SerializeToElement(updated, Json), ct);
    }

    /// <summary>Registro de la ejecución (sin filas de datos). Un fallo al registrar nunca afecta a la respuesta.</summary>
    private async Task SaveRunAsync(string runId, string conversationId, string question, RunSettings s, QueryResponse? r, string? error, CancellationToken ct)
    {
        try
        {
            var run = new
            {
                id = runId, conversationId, question, model = s.Model, effort = s.Effort, servedBy = r?.ServedBy,
                status = r?.Status ?? "error", error, iterations = r?.Iterations, usage = r?.Usage, elapsedMs = r?.ElapsedMs,
                queries = r?.Queries, rowCount = r?.TotalRows, toolCalls = r?.ToolCalls, at = time.GetUtcNow(),
            };
            await store.PutAsync(Collections.Runs, runId, JsonSerializer.SerializeToElement(run, Json), ct);
        }
        catch (Exception ex) { log.LogWarning(ex, "No se pudo registrar la ejecución {RunId}", runId); }
    }
}

/// <summary>
/// Traduce los eventos del bucle a fases legibles para el progreso del front (evento «status» con phase y label).
/// Repite una fase solo si hubo otra en medio, así el usuario ve los pasos reales.
/// </summary>
internal sealed class PhaseTracker(EmitAsync emit)
{
    private string? _current;

    public async ValueTask SetAsync(string phase, string label)
    {
        if (_current == phase) return;
        _current = phase;
        await emit(new AgentEvent("status", new { phase, label }));
    }

    public ValueTask OnEventAsync(AgentEvent e)
    {
        if (e.Type is not ("tool_use_start" or "tool_call" or "tool_result") || e.Data is null) return ValueTask.CompletedTask;
        var data = JsonSerializer.SerializeToElement(e.Data, DataAgent.Json);
        var tool = data.TryGetProperty("tool", out var t) ? t.GetString() ?? "" : "";
        return (e.Type, tool) switch
        {
            ("tool_use_start", "execute_query") => SetAsync("sql", "Generando consulta SQL"),
            ("tool_use_start", _) => SetAsync("schema", "Revisando el modelo de datos"),
            ("tool_call", "execute_query") => SetAsync("execute", "Ejecutando en SQL Server"),
            ("tool_result", "execute_query") => SetAsync("process", "Analizando resultados"),
            _ => ValueTask.CompletedTask,
        };
    }
}
