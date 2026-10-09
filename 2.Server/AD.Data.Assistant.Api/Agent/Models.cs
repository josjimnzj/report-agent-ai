using System.Text.Json;

namespace AD.Data.Assistant.Api.Agent;

public sealed record QueryRequest(string? Question, string? ConversationId = null, string? Model = null, string? Effort = null, int? MaxIterations = null);

public sealed record FeedbackRequest(string? RunId, int Rating, string[]? Tags = null, string? Comment = null);

public sealed record ToolCallTrace(string Tool, long DurationMs, bool IsError);

public sealed record UsageInfo(long InputTokens, long OutputTokens, long CacheReadTokens, long CacheCreationTokens);

/// <summary>Payload del evento «done» (mismo contrato que espera el front).</summary>
public sealed record QueryResponse(
    string ConversationId,
    string Status,                 // "ok" | "max_iterations"
    int Iterations,
    string Answer,
    IReadOnlyList<string> Columns,
    IReadOnlyList<IReadOnlyList<JsonElement>> Rows,
    IReadOnlyList<string> Queries,
    IReadOnlyList<ToolCallTrace> ToolCalls,
    UsageInfo Usage,
    long ElapsedMs,
    string RunId,
    string Model,
    string? Effort,
    string? ServedBy,
    ChartHint? Chart,
    long TotalRows,
    bool AskChart = false,
    bool OpenReport = false);

/// <param name="AskChart">El agente no tuvo claro qué gráfica quiere el usuario y se lo pregunta en la respuesta.</param>
/// <param name="OpenReport">El usuario pidió ver el resultado en el reporte.</param>
public sealed record AnswerParts(string Answer, int ResultQuery, ChartHint? Chart, bool AskChart, bool OpenReport);

/// <summary>Gráfica sugerida por el agente para el resultado principal.</summary>
public sealed record ChartHint(string Type, string X, IReadOnlyList<string> Y);

/// <summary>Resultado de un execute_query exitoso, capturado en el servidor (el modelo solo ve una muestra).</summary>
public sealed record QueryResult(string Sql, IReadOnlyList<string> Columns, IReadOnlyList<IReadOnlyList<JsonElement>> Rows, long RowCount);

/// <summary>Turno guardado de una conversación: lo que el agente recuerda para las preguntas de seguimiento.</summary>
public sealed record ConversationTurn(string Question, string Answer, IReadOnlyList<string> Queries, IReadOnlyList<string> Columns, IReadOnlyList<IReadOnlyList<JsonElement>> SampleRows, DateTimeOffset At);

public sealed record ConversationDoc(string Id, string? Model, List<ConversationTurn> Turns, DateTimeOffset UpdatedAt);

/// <summary>Evento de progreso que se reenvía por SSE.</summary>
public sealed record AgentEvent(string Type, object? Data);

public delegate ValueTask EmitAsync(AgentEvent e);

public sealed record ToolCall(string Id, string Name, IReadOnlyDictionary<string, JsonElement> Input);

public sealed record ToolOutcome(string Content, bool IsError);
