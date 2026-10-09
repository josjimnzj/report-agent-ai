using System.Collections.Concurrent;
using System.Text.Json;
using AD.Data.Assistant.Api.Options;
using Microsoft.Extensions.Options;
using Npgsql;
using NpgsqlTypes;

namespace AD.Data.Assistant.Api.Storage;

/// <summary>
/// Almacén de documentos JSON por colección (estilo NoSQL). En producción vive en Neon como una tabla JSONB;
/// sin cadena de conexión usa memoria (solo desarrollo y pruebas).
/// </summary>
public interface IDocumentStore
{
    string Kind { get; }
    Task InitializeAsync(CancellationToken ct);
    Task<IReadOnlyList<JsonElement>> ListAsync(string collection, int limit, CancellationToken ct);
    Task<JsonElement?> GetAsync(string collection, string id, CancellationToken ct);
    Task PutAsync(string collection, string id, JsonElement doc, CancellationToken ct);
    Task<bool> DeleteAsync(string collection, string id, CancellationToken ct);
}

public static class Collections
{
    public const string Chats = "chats";
    public const string Reports = "reports";
    public const string Prefs = "prefs";
    /// <summary>Historial que usa el agente para las preguntas de seguimiento.</summary>
    public const string Conversations = "conversations";
    /// <summary>Registro de cada ejecución del agente (auditoría y costos).</summary>
    public const string Runs = "runs";

    /// <summary>Colecciones que el front puede leer y escribir por /api/docs.</summary>
    public static readonly HashSet<string> Public = [Chats, Reports, Prefs];
}

public sealed class PgDocumentStore(IOptions<StorageOptions> options, ILogger<PgDocumentStore> log) : IDocumentStore, IAsyncDisposable
{
    private readonly StorageOptions _opt = options.Value;
    private readonly NpgsqlDataSource _db = NpgsqlDataSource.Create(PgConnection.Normalize(options.Value.ConnectionString!));

    public string Kind => "neon";

    public async Task InitializeAsync(CancellationToken ct)
    {
        await using var cmd = _db.CreateCommand("""
            CREATE TABLE IF NOT EXISTS ada_documents (
                owner       text        NOT NULL,
                collection  text        NOT NULL,
                id          text        NOT NULL,
                data        jsonb       NOT NULL,
                created_at  timestamptz NOT NULL DEFAULT now(),
                updated_at  timestamptz NOT NULL DEFAULT now(),
                PRIMARY KEY (owner, collection, id)
            );
            CREATE INDEX IF NOT EXISTS ada_documents_recent ON ada_documents (owner, collection, updated_at DESC);
            """);
        await cmd.ExecuteNonQueryAsync(ct);
        log.LogInformation("Almacén de documentos listo (Neon/Postgres)");
    }

    public async Task<IReadOnlyList<JsonElement>> ListAsync(string collection, int limit, CancellationToken ct)
    {
        await using var cmd = _db.CreateCommand(
            "SELECT data::text FROM ada_documents WHERE owner = $1 AND collection = $2 ORDER BY updated_at DESC LIMIT $3");
        cmd.Parameters.AddWithValue(_opt.Owner);
        cmd.Parameters.AddWithValue(collection);
        cmd.Parameters.AddWithValue(limit);
        var list = new List<JsonElement>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) list.Add(Parse(r.GetString(0)));
        return list;
    }

    public async Task<JsonElement?> GetAsync(string collection, string id, CancellationToken ct)
    {
        await using var cmd = _db.CreateCommand("SELECT data::text FROM ada_documents WHERE owner = $1 AND collection = $2 AND id = $3");
        cmd.Parameters.AddWithValue(_opt.Owner);
        cmd.Parameters.AddWithValue(collection);
        cmd.Parameters.AddWithValue(id);
        return await cmd.ExecuteScalarAsync(ct) is string s ? Parse(s) : null;
    }

    public async Task PutAsync(string collection, string id, JsonElement doc, CancellationToken ct)
    {
        await using var cmd = _db.CreateCommand("""
            INSERT INTO ada_documents (owner, collection, id, data) VALUES ($1, $2, $3, $4)
            ON CONFLICT (owner, collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
            """);
        cmd.Parameters.AddWithValue(_opt.Owner);
        cmd.Parameters.AddWithValue(collection);
        cmd.Parameters.AddWithValue(id);
        cmd.Parameters.Add(new NpgsqlParameter { NpgsqlDbType = NpgsqlDbType.Jsonb, Value = doc.GetRawText() });
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<bool> DeleteAsync(string collection, string id, CancellationToken ct)
    {
        await using var cmd = _db.CreateCommand("DELETE FROM ada_documents WHERE owner = $1 AND collection = $2 AND id = $3");
        cmd.Parameters.AddWithValue(_opt.Owner);
        cmd.Parameters.AddWithValue(collection);
        cmd.Parameters.AddWithValue(id);
        return await cmd.ExecuteNonQueryAsync(ct) > 0;
    }

    private static JsonElement Parse(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    public ValueTask DisposeAsync() => _db.DisposeAsync();
}

/// <summary>Almacén en memoria para desarrollo local sin Neon. Se pierde al reiniciar.</summary>
public sealed class MemoryDocumentStore : IDocumentStore
{
    private readonly ConcurrentDictionary<(string Collection, string Id), (JsonElement Doc, long Ticks)> _docs = new();
    private long _seq;

    public string Kind => "memory";

    public Task InitializeAsync(CancellationToken ct) => Task.CompletedTask;

    public Task<IReadOnlyList<JsonElement>> ListAsync(string collection, int limit, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<JsonElement>>(_docs.Where(kv => kv.Key.Collection == collection)
            .OrderByDescending(kv => kv.Value.Ticks).Take(limit).Select(kv => kv.Value.Doc).ToList());

    public Task<JsonElement?> GetAsync(string collection, string id, CancellationToken ct) =>
        Task.FromResult(_docs.TryGetValue((collection, id), out var v) ? v.Doc : (JsonElement?)null);

    public Task PutAsync(string collection, string id, JsonElement doc, CancellationToken ct)
    {
        _docs[(collection, id)] = (doc.Clone(), Interlocked.Increment(ref _seq)); // orden de actualización
        return Task.CompletedTask;
    }

    public Task<bool> DeleteAsync(string collection, string id, CancellationToken ct) => Task.FromResult(_docs.TryRemove((collection, id), out _));
}

/// <summary>Crea las tablas al arrancar. Si Neon no responde, la API sigue viva y /health lo informa.</summary>
public sealed class StoreInitializer(IDocumentStore store, ILogger<StoreInitializer> log) : IHostedService
{
    public static string? LastError { get; private set; }

    public async Task StartAsync(CancellationToken ct)
    {
        try { await store.InitializeAsync(ct); LastError = null; }
        catch (Exception ex)
        {
            LastError = ex.Message;
            log.LogError(ex, "No se pudo inicializar el almacén de documentos");
        }
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
