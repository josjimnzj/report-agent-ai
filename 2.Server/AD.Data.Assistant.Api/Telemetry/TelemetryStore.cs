using System.Text.Json;
using System.Threading.Channels;
using Microsoft.Extensions.Options;
using Npgsql;
using NpgsqlTypes;
using AD.Data.Assistant.Api.Options;
using AD.Data.Assistant.Api.Storage;

namespace AD.Data.Assistant.Api.Telemetry;

public sealed record FeedbackInput(Guid RunId, int Rating, string[]? Tags, string? Comment);

/// <summary>Filtros del historial y la exportación. Rating: 1 buenas, -1 malas, 0 sin valorar.</summary>
public sealed record RunFilter(int Days = 30, int? Rating = null, string? Model = null, string? Mode = null, string? Status = null, string? Q = null);

/// <summary>
/// Registro de ejecuciones y valoraciones en Postgres (Neon). Las escrituras van por una cola en segundo plano:
/// si la base está lenta, dormida o caída, el usuario no lo nota y nunca se rompe una respuesta.
/// </summary>
public sealed class TelemetryStore : BackgroundService
{
    private readonly TelemetryOptions _opt;
    private readonly ILogger<TelemetryStore> _log;
    private readonly NpgsqlDataSource? _db;
    private readonly Channel<RunRecord> _queue = Channel.CreateBounded<RunRecord>(new BoundedChannelOptions(200) { FullMode = BoundedChannelFullMode.DropOldest });
    private volatile string? _lastError;

    public TelemetryStore(IOptions<TelemetryOptions> options, ILogger<TelemetryStore> log)
    {
        _opt = options.Value;
        _log = log;
        if (_opt.Enabled)
        {
            try { _db = NpgsqlDataSource.Create(PgConnection.Normalize(_opt.ConnectionString!)); }
            catch (Exception ex) { _lastError = $"Cadena de conexión inválida: {ex.Message}"; _log.LogError("Telemetry: {Err}", _lastError); }
        }
    }

    public bool Enabled => _db is not null;
    public string? LastError => _lastError;
    public TelemetryOptions Options => _opt;

    public void Enqueue(RunRecord r) { if (Enabled) _queue.Writer.TryWrite(r); }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        if (_db is null) return;
        var lastPurge = DateTime.MinValue;
        // El esquema se crea con reintentos (Neon puede tardar en despertar).
        for (var attempt = 1; !ct.IsCancellationRequested; attempt++)
        {
            try { await EnsureSchemaAsync(ct); _lastError = null; break; }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _lastError = ex.Message;
                _log.LogWarning(ex, "Telemetry: no se pudo preparar el esquema (intento {N})", attempt);
                await Task.Delay(TimeSpan.FromSeconds(Math.Min(60, 5 * attempt)), ct).ConfigureAwait(false);
            }
        }

        await foreach (var run in _queue.Reader.ReadAllAsync(ct))
        {
            for (var attempt = 1; attempt <= 3; attempt++)
            {
                try
                {
                    await InsertAsync(run, ct);
                    _lastError = null;
                    break;
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _lastError = ex.Message;
                    _log.LogWarning(ex, "Telemetry: error al guardar la ejecución {Id} (intento {N})", run.Id, attempt);
                    await Task.Delay(TimeSpan.FromSeconds(2 * attempt), ct);
                }
            }
            if (DateTime.UtcNow - lastPurge > TimeSpan.FromHours(24))
            {
                lastPurge = DateTime.UtcNow;
                try { await PurgeAsync(ct); } catch (Exception ex) when (ex is not OperationCanceledException) { _log.LogWarning(ex, "Telemetry: error en la limpieza"); }
            }
        }
    }

    public async Task EnsureSchemaAsync(CancellationToken ct)
    {
        const string ddl = """
        create table if not exists runs (
          id uuid primary key,
          created_at timestamptz not null default now(),
          conversation_id text, mode text not null, provider text not null, model text, effort text, reasoning boolean,
          question text not null, continued boolean not null default false, answer text,
          status text not null, error text,
          iterations int not null default 0, max_iterations int,
          input_tokens bigint not null default 0, output_tokens bigint not null default 0,
          cache_read_tokens bigint not null default 0, cache_creation_tokens bigint not null default 0,
          elapsed_ms bigint not null default 0, tool_calls int not null default 0, tool_errors int not null default 0,
          commit text,
          sql_queries jsonb, columns jsonb, rows_sample jsonb, events jsonb, trace jsonb
        );
        create index if not exists runs_created_idx on runs (created_at desc);
        create index if not exists runs_model_idx on runs (model, created_at desc);
        create index if not exists runs_conv_idx on runs (conversation_id);
        create table if not exists feedback (
          run_id uuid primary key references runs(id) on delete cascade,
          rating smallint not null check (rating in (-1, 1)),
          tags text[] not null default '{}',
          comment text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
        create index if not exists feedback_rating_idx on feedback (rating);
        """;
        await using var cmd = _db!.CreateCommand(ddl);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private async Task InsertAsync(RunRecord r, CancellationToken ct)
    {
        await using var cmd = _db!.CreateCommand("""
        insert into runs (id, created_at, conversation_id, mode, provider, model, effort, reasoning, question, continued, answer, status, error,
          iterations, max_iterations, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, elapsed_ms, tool_calls, tool_errors, commit,
          sql_queries, columns, rows_sample, events, trace)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
        on conflict (id) do nothing
        """);
        void P(object? v) => cmd.Parameters.Add(new NpgsqlParameter { Value = v ?? DBNull.Value });
        void J(string? json) => cmd.Parameters.Add(new NpgsqlParameter { NpgsqlDbType = NpgsqlDbType.Jsonb, Value = (object?)json ?? DBNull.Value });
        P(r.Id); P(r.CreatedAt); P(r.ConversationId); P(r.Mode); P(r.Provider); P(r.Model); P(r.Effort); P(r.Reasoning); P(r.Question); P(r.Continued); P(r.Answer); P(r.Status); P(r.Error);
        P(r.Iterations); P(r.MaxIterations); P(r.InputTokens); P(r.OutputTokens); P(r.CacheReadTokens); P(r.CacheCreationTokens); P(r.ElapsedMs); P(r.ToolCalls); P(r.ToolErrors); P(r.Commit);
        J(r.SqlJson); J(r.ColumnsJson); J(r.RowsSampleJson); J(r.EventsJson); J(r.TraceJson);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    /// <summary>Guarda o actualiza la valoración de una ejecución. Devuelve false si la ejecución aún no existe.</summary>
    public async Task<bool> SaveFeedbackAsync(FeedbackInput f, CancellationToken ct)
    {
        if (!Enabled) return false;
        // La ejecución se escribe en segundo plano: dar un margen breve por si la valoración llega primero.
        for (var i = 0; i < 6; i++)
        {
            await using var cmd = _db!.CreateCommand("""
            insert into feedback (run_id, rating, tags, comment) select id, $2, $3, $4 from runs where id = $1
            on conflict (run_id) do update set rating = excluded.rating, tags = excluded.tags, comment = excluded.comment, updated_at = now()
            """);
            cmd.Parameters.Add(new NpgsqlParameter { Value = f.RunId });
            cmd.Parameters.Add(new NpgsqlParameter { Value = (short)f.Rating });
            cmd.Parameters.Add(new NpgsqlParameter { Value = (f.Tags ?? []).Select(t => t.Trim()).Where(t => t.Length is > 0 and <= 40).Distinct().Take(8).ToArray() });
            cmd.Parameters.Add(new NpgsqlParameter { Value = (object?)(f.Comment is { Length: > 2000 } c ? c[..2000] : f.Comment) ?? DBNull.Value });
            if (await cmd.ExecuteNonQueryAsync(ct) > 0) return true;
            await Task.Delay(500, ct);
        }
        return false;
    }

    public async Task PurgeAsync(CancellationToken ct)
    {
        if (!Enabled || _opt.RetentionDays <= 0) return;
        await using var cmd = _db!.CreateCommand("delete from runs r where r.created_at < now() - make_interval(days => $1) and not exists (select 1 from feedback f where f.run_id = r.id)");
        cmd.Parameters.Add(new NpgsqlParameter { Value = _opt.RetentionDays });
        var n = await cmd.ExecuteNonQueryAsync(ct);
        if (n > 0) _log.LogInformation("Telemetry: {N} ejecuciones antiguas sin valoración eliminadas", n);
    }

    public async Task<object> SummaryAsync(RunFilter f, CancellationToken ct)
    {
        var (where, ps) = BuildWhere(f);
        await using var cmd = _db!.CreateCommand($"""
        select r.provider, r.model, r.mode,
               count(*) as runs,
               count(f.run_id) filter (where f.rating = 1) as good,
               count(f.run_id) filter (where f.rating = -1) as bad,
               count(*) filter (where r.status = 'error') as errors,
               count(*) filter (where r.status = 'max_iterations') as limit_hits,
               round(avg(r.iterations)::numeric, 1) as avg_iterations,
               round(avg(r.input_tokens + r.output_tokens)::numeric, 0) as avg_tokens,
               coalesce(sum(r.input_tokens), 0) as input_tokens, coalesce(sum(r.output_tokens), 0) as output_tokens,
               round(avg(r.elapsed_ms)::numeric / 1000, 1) as avg_seconds
        from runs r left join feedback f on f.run_id = r.id
        where {where}
        group by r.provider, r.model, r.mode order by runs desc
        """);
        foreach (var p in ps) cmd.Parameters.Add(p);
        var rows = new List<object>();
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct))
            rows.Add(new
            {
                provider = rd.GetString(0), model = rd.IsDBNull(1) ? null : rd.GetString(1), mode = rd.GetString(2),
                runs = rd.GetInt64(3), good = rd.GetInt64(4), bad = rd.GetInt64(5), errors = rd.GetInt64(6), limitHits = rd.GetInt64(7),
                avgIterations = rd.IsDBNull(8) ? 0m : rd.GetDecimal(8), avgTokens = rd.IsDBNull(9) ? 0m : rd.GetDecimal(9),
                inputTokens = rd.GetInt64(10), outputTokens = rd.GetInt64(11), avgSeconds = rd.IsDBNull(12) ? 0m : rd.GetDecimal(12),
            });
        return new { days = f.Days, byModel = rows };
    }

    /// <summary>WHERE parametrizado a partir de los filtros (r = runs, f = feedback).</summary>
    private static (string Where, List<NpgsqlParameter> Params) BuildWhere(RunFilter f)
    {
        var ps = new List<NpgsqlParameter>();
        string P(object v, NpgsqlDbType? t = null) { ps.Add(t is null ? new NpgsqlParameter { Value = v } : new NpgsqlParameter { NpgsqlDbType = t.Value, Value = v }); return $"${ps.Count}"; }
        var w = new List<string> { $"r.created_at > now() - make_interval(days => {P(Math.Clamp(f.Days, 1, 3650))})" };
        if (f.Rating == 0) w.Add("f.run_id is null"); else if (f.Rating is 1 or -1) w.Add($"f.rating = {P((short)f.Rating.Value)}");
        if (!string.IsNullOrWhiteSpace(f.Model)) w.Add($"r.model = {P(f.Model.Trim())}");
        if (f.Mode is "query" or "workflow") w.Add($"r.mode = {P(f.Mode)}");
        if (!string.IsNullOrWhiteSpace(f.Status)) w.Add($"r.status = {P(f.Status.Trim())}");
        if (!string.IsNullOrWhiteSpace(f.Q))
        {
            var like = "%" + f.Q.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            var n = P(like);
            w.Add($"(r.question ilike {n} or r.answer ilike {n} or f.comment ilike {n})");
        }
        return (string.Join(" and ", w), ps);
    }

    public async Task<object> RecentAsync(RunFilter f, int limit, int offset, CancellationToken ct)
    {
        var (where, ps) = BuildWhere(f);
        await using var cmd = _db!.CreateCommand($"""
        select r.id, r.created_at, r.mode, r.model, r.question, r.status, r.iterations, r.input_tokens + r.output_tokens, r.elapsed_ms, f.rating, f.tags, f.comment,
               count(*) over() as total
        from runs r left join feedback f on f.run_id = r.id
        where {where}
        order by r.created_at desc limit {Math.Clamp(limit, 1, 200)} offset {Math.Max(0, offset)}
        """);
        foreach (var p in ps) cmd.Parameters.Add(p);
        var rows = new List<object>();
        long total = 0;
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        while (await rd.ReadAsync(ct))
        {
            total = rd.GetInt64(12);
            rows.Add(new
            {
                id = rd.GetGuid(0), createdAt = rd.GetFieldValue<DateTimeOffset>(1), mode = rd.GetString(2), model = rd.IsDBNull(3) ? null : rd.GetString(3),
                question = rd.GetString(4), status = rd.GetString(5), iterations = rd.GetInt32(6), tokens = rd.GetInt64(7), elapsedMs = rd.GetInt64(8),
                rating = rd.IsDBNull(9) ? (int?)null : rd.GetInt16(9), tags = rd.IsDBNull(10) ? Array.Empty<string>() : rd.GetFieldValue<string[]>(10),
                comment = rd.IsDBNull(11) ? null : rd.GetString(11),
            });
        }
        return new { total, offset, items = rows };
    }

    /// <summary>Valores distintos para los desplegables de filtro.</summary>
    public async Task<object> FacetsAsync(CancellationToken ct)
    {
        await using var cmd = _db!.CreateCommand("select coalesce(array_agg(distinct model) filter (where model is not null), '{}'), coalesce(array_agg(distinct status), '{}') from runs");
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        await rd.ReadAsync(ct);
        return new { models = rd.GetFieldValue<string[]>(0), statuses = rd.GetFieldValue<string[]>(1) };
    }

    private static readonly string[] CsvHeader =
    [
        "id", "fecha_utc", "modo", "proveedor", "modelo", "esfuerzo", "estado", "iteraciones", "tokens_entrada", "tokens_salida", "tokens_cache_leida",
        "duracion_ms", "herramientas", "errores_herramientas", "pregunta", "respuesta", "sql", "valoracion", "etiquetas", "comentario", "version", "conversacion",
    ];

    /// <summary>Exporta las ejecuciones filtradas a CSV (UTF-8 con BOM, apto para Excel) o JSON, en streaming y con tope de filas.</summary>
    public async Task ExportAsync(RunFilter f, string format, bool detail, int maxRows, Stream output, CancellationToken ct)
    {
        var (where, ps) = BuildWhere(f);
        await using var cmd = _db!.CreateCommand($"""
        select r.id, r.created_at, r.mode, r.provider, r.model, r.effort, r.status, r.iterations, r.input_tokens, r.output_tokens, r.cache_read_tokens,
               r.elapsed_ms, r.tool_calls, r.tool_errors, r.question, r.answer, r.sql_queries::text, f.rating, f.tags, f.comment, r.commit, r.conversation_id,
               r.error, r.rows_sample::text, r.events::text, r.trace::text
        from runs r left join feedback f on f.run_id = r.id
        where {where}
        order by r.created_at desc limit {Math.Clamp(maxRows, 1, 20000)}
        """);
        foreach (var p in ps) cmd.Parameters.Add(p);
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        var str = (int i) => rd.IsDBNull(i) ? null : rd.GetString(i);

        if (format == "json")
        {
            await using var w = new Utf8JsonWriter(output, new JsonWriterOptions { Indented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
            w.WriteStartArray();
            while (await rd.ReadAsync(ct))
            {
                w.WriteStartObject();
                w.WriteString("id", rd.GetGuid(0)); w.WriteString("createdAt", rd.GetFieldValue<DateTimeOffset>(1));
                w.WriteString("mode", rd.GetString(2)); w.WriteString("provider", rd.GetString(3)); w.WriteString("model", str(4)); w.WriteString("effort", str(5));
                w.WriteString("status", rd.GetString(6)); w.WriteNumber("iterations", rd.GetInt32(7));
                w.WriteNumber("inputTokens", rd.GetInt64(8)); w.WriteNumber("outputTokens", rd.GetInt64(9)); w.WriteNumber("cacheReadTokens", rd.GetInt64(10));
                w.WriteNumber("elapsedMs", rd.GetInt64(11)); w.WriteNumber("toolCalls", rd.GetInt32(12)); w.WriteNumber("toolErrors", rd.GetInt32(13));
                w.WriteString("question", rd.GetString(14)); w.WriteString("answer", str(15)); w.WriteString("error", str(22));
                if (str(16) is { } sql) { w.WritePropertyName("sql"); w.WriteRawValue(sql); } else w.WriteNull("sql");
                if (rd.IsDBNull(17)) w.WriteNull("rating"); else w.WriteNumber("rating", rd.GetInt16(17));
                w.WritePropertyName("tags"); w.WriteStartArray(); if (!rd.IsDBNull(18)) foreach (var t in rd.GetFieldValue<string[]>(18)) w.WriteStringValue(t); w.WriteEndArray();
                w.WriteString("comment", str(19)); w.WriteString("commit", str(20)); w.WriteString("conversationId", str(21));
                if (detail)
                {
                    foreach (var (name, idx) in new[] { ("rowsSample", 23), ("events", 24), ("trace", 25) })
                        if (str(idx) is { } raw) { w.WritePropertyName(name); w.WriteRawValue(raw); } else w.WriteNull(name);
                }
                w.WriteEndObject();
                await w.FlushAsync(ct);
            }
            w.WriteEndArray();
            return;
        }

        await using var sw = new StreamWriter(output, new System.Text.UTF8Encoding(true), 16384, leaveOpen: true);
        await sw.WriteLineAsync(string.Join(',', CsvHeader));
        while (await rd.ReadAsync(ct))
        {
            var sqlText = str(16) is { } j ? string.Join("\n---\n", System.Text.Json.JsonSerializer.Deserialize<string[]>(j) ?? []) : "";
            var cells = new[]
            {
                rd.GetGuid(0).ToString(), rd.GetFieldValue<DateTimeOffset>(1).UtcDateTime.ToString("yyyy-MM-dd HH:mm:ss"), rd.GetString(2), rd.GetString(3), str(4), str(5),
                rd.GetString(6), rd.GetInt32(7).ToString(), rd.GetInt64(8).ToString(), rd.GetInt64(9).ToString(), rd.GetInt64(10).ToString(), rd.GetInt64(11).ToString(),
                rd.GetInt32(12).ToString(), rd.GetInt32(13).ToString(), rd.GetString(14), str(15) ?? str(22), sqlText,
                rd.IsDBNull(17) ? "" : rd.GetInt16(17) == 1 ? "buena" : "mala", rd.IsDBNull(18) ? "" : string.Join("; ", rd.GetFieldValue<string[]>(18)), str(19), str(20), str(21),
            };
            await sw.WriteLineAsync(string.Join(',', cells.Select(Csv)));
        }
        await sw.FlushAsync(ct);
    }

    /// <summary>Escapa para CSV y neutraliza fórmulas (=, +, -, @) para que Excel no las ejecute.</summary>
    internal static string Csv(string? v)
    {
        if (string.IsNullOrEmpty(v)) return "";
        if (v[0] is '=' or '+' or '-' or '@' or '\t' or '\r') v = "'" + v;
        return v.Contains('"') || v.Contains(',') || v.Contains('\n') || v.Contains('\r') ? "\"" + v.Replace("\"", "\"\"") + "\"" : v;
    }

    public async Task<string?> RunDetailJsonAsync(Guid id, CancellationToken ct)
    {
        await using var cmd = _db!.CreateCommand("select to_jsonb(r) from runs r where id = $1");
        cmd.Parameters.Add(new NpgsqlParameter { Value = id });
        return (await cmd.ExecuteScalarAsync(ct)) as string;
    }

    public override async Task StopAsync(CancellationToken ct)
    {
        _queue.Writer.TryComplete();
        await base.StopAsync(ct);
        if (_db is not null) await _db.DisposeAsync();
    }
}
