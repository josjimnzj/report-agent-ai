using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;
using AD.Data.Assistant.Api.Agent;
using AD.Data.Assistant.Api.Options;

namespace AD.Data.Assistant.Api.Telemetry;

/// <summary>Una ejecución lista para guardar.</summary>
public sealed class RunRecord
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public string? ConversationId { get; set; }
    public string Mode { get; set; } = "";
    public string Provider { get; set; } = "anthropic";
    public string? Model { get; set; }
    public string? Effort { get; set; }
    public bool? Reasoning { get; set; }
    public string Question { get; set; } = "";
    public bool Continued { get; set; }
    public string? Answer { get; set; }
    public string Status { get; set; } = "error";
    public string? Error { get; set; }
    public int Iterations { get; set; }
    public int? MaxIterations { get; set; }
    public long InputTokens { get; set; }
    public long OutputTokens { get; set; }
    public long CacheReadTokens { get; set; }
    public long CacheCreationTokens { get; set; }
    public long ElapsedMs { get; set; }
    public int ToolCalls { get; set; }
    public int ToolErrors { get; set; }
    public string? Commit { get; set; }
    public string? SqlJson { get; set; }
    public string? ColumnsJson { get; set; }
    public string? RowsSampleJson { get; set; }
    public string? EventsJson { get; set; }
    public string? TraceJson { get; set; }
}

/// <summary>Captura los eventos de una ejecución (con tope de tamaño) y los convierte en un <see cref="RunRecord"/>.</summary>
public sealed class RunRecorder
{
    private readonly TelemetryOptions _opt;
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    private readonly List<JsonObject> _events = [];
    private JsonObject? _cur;
    private int _bytes;
    private bool _truncated;
    public RunRecord Record { get; }

    public RunRecorder(TelemetryOptions opt, Guid id, string mode, string question, QueryRequestInfo info, string? commit)
    {
        _opt = opt;
        Record = new RunRecord
        {
            Id = id,
            Mode = mode, Question = question, ConversationId = info.ConversationId, Model = info.Model, Effort = info.Effort,
            Reasoning = info.Reasoning, MaxIterations = info.MaxIterations, Continued = info.Continue, Commit = commit,
        };
    }

    public EmitAsync Wrap(EmitAsync? inner) => async e =>
    {
        Capture(e);
        if (inner is not null) await inner(e);
    };

    public void Capture(AgentEvent e)
    {
        var data = e.Data is null ? null : JsonSerializer.SerializeToNode(e.Data, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var obj = data as JsonObject ?? new JsonObject();

        if (e.Type is "text" or "thinking")
        {
            var delta = obj["delta"]?.GetValue<string>() ?? "";
            if (_cur is null || _cur["k"]!.GetValue<string>() != e.Type)
            {
                _cur = new JsonObject { ["t"] = _clock.ElapsedMilliseconds, ["k"] = e.Type, ["text"] = "" };
                Add(_cur, 0);
            }
            if (!_truncated) { _cur["text"] = _cur["text"]!.GetValue<string>() + delta; _bytes += delta.Length * 2; }
            return;
        }
        _cur = null;
        if (e.Type == "request")
        {
            Record.Model = obj["model"]?.GetValue<string>() ?? Record.Model;
            Record.Effort = obj["effort"]?.GetValue<string>() ?? Record.Effort;
            Record.Provider = obj["provider"]?.GetValue<string>() ?? "anthropic";
            Record.Reasoning = obj["showThinking"]?.GetValue<bool>() ?? Record.Reasoning;
        }
        if (e.Type is "block" or "done") return;

        var entry = new JsonObject { ["t"] = _clock.ElapsedMilliseconds, ["k"] = e.Type };
        foreach (var (k, v) in obj)
        {
            if (k is "t" or "resultPreview") continue; // "result" ya trae el contenido; la vista previa es redundante
            entry[k] = k == "result" && v is JsonValue jv && jv.TryGetValue<string>(out var full)
                ? (full.Length > _opt.MaxToolResultChars ? full[.._opt.MaxToolResultChars] + $"… [truncado, {full.Length} caracteres]" : full)
                : k == "input" ? Clip(v) : v?.DeepClone();
        }
        Add(entry, entry.ToJsonString().Length * 2);
    }

    private JsonNode? Clip(JsonNode? n)
    {
        var s = n?.ToJsonString() ?? "";
        return s.Length > _opt.MaxToolResultChars ? JsonValue.Create(s[.._opt.MaxToolResultChars] + "… [truncado]") : n?.DeepClone();
    }

    private void Add(JsonObject o, int bytes)
    {
        if (_truncated) return;
        if (_bytes + bytes > _opt.MaxEventBytes)
        {
            _truncated = true;
            _events.Add(new JsonObject { ["t"] = _clock.ElapsedMilliseconds, ["k"] = "truncated", ["text"] = $"Log recortado al superar {_opt.MaxEventBytes} bytes." });
            return;
        }
        _bytes += bytes;
        _events.Add(o);
    }

    private void Finish(UsageInfo? usage, IReadOnlyList<ToolCallTrace>? trace, long? elapsed)
    {
        Record.ElapsedMs = elapsed ?? _clock.ElapsedMilliseconds;
        if (usage is not null)
        {
            Record.InputTokens = usage.InputTokens; Record.OutputTokens = usage.OutputTokens;
            Record.CacheReadTokens = usage.CacheReadTokens; Record.CacheCreationTokens = usage.CacheCreationTokens;
        }
        if (trace is not null)
        {
            Record.ToolCalls = trace.Count;
            Record.ToolErrors = trace.Count(t => t.IsError);
            Record.TraceJson = JsonSerializer.Serialize(trace, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        }
        Record.EventsJson = new JsonArray(_events.Select(e => (JsonNode)e).ToArray()).ToJsonString();
    }

    public RunRecord Complete(QueryResponse r)
    {
        Record.ConversationId = r.ConversationId; Record.Status = r.Status; Record.Iterations = r.Iterations; Record.Answer = r.Answer;
        Record.SqlJson = JsonSerializer.Serialize(r.Queries);
        Record.ColumnsJson = JsonSerializer.Serialize(r.Columns);
        Record.RowsSampleJson = JsonSerializer.Serialize(r.Rows.Take(_opt.RowSample));
        Finish(r.Usage, r.ToolCalls, r.ElapsedMs);
        return Record;
    }

    public RunRecord Fail(Exception ex)
    {
        Record.Status = ex is OperationCanceledException ? "cancelled" : "error";
        Record.Error = ex.Message;
        Finish(null, null, null);
        return Record;
    }
}

public sealed record QueryRequestInfo(string? ConversationId, string? Model, string? Effort, bool? Reasoning, int? MaxIterations, bool Continue);
