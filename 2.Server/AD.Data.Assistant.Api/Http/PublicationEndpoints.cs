using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using AD.Data.Assistant.Api.Options;
using AD.Data.Assistant.Api.Storage;
using Microsoft.Extensions.Options;

namespace AD.Data.Assistant.Api.Http;

public sealed record PublishRequest(string? ReportId, string? Title, DateTimeOffset? ExpiresAt, JsonElement? Filters, JsonElement? Result);
public sealed record PublicationUpdate(string? Title, DateTimeOffset? ExpiresAt, JsonElement? Filters);

/// <summary>
/// Reportes publicados con un enlace con token y caducidad. Se guarda una copia del resultado (no se vuelve a consultar
/// SQL Server al abrir el enlace) con los filtros que el visitante puede usar. La clave del documento es el SHA-256 del
/// token: quien lea la tabla no puede abrir los enlaces. El SQL, la respuesta del chat y la traza no se publican.
/// </summary>
public static partial class Publications
{
    public const string RateLimitPolicy = "public";
    public const int MaxDays = 365;
    public const int DefaultDays = 30;
    public const int MaxFilters = 6;
    public const int MaxRows = 5000;
    public const int MaxColumns = 200;
    /// <summary>Lo único del resultado que ve el visitante. Fuera: queries (SQL), answer, traza y log.</summary>
    private static readonly string[] ResultFields = ["columns", "rows", "totalRows", "chart", "chartType", "chartLines", "insights"];
    private static readonly HashSet<string> FilterKinds = ["date", "select", "range"];

    [GeneratedRegex("^[A-Za-z0-9_-]{40,64}$")]
    private static partial Regex TokenPattern();
    [GeneratedRegex("^[0-9a-f]{64}$")]
    private static partial Regex IdPattern();
    [GeneratedRegex("^[A-Za-z0-9_.:-]{1,120}$")]
    private static partial Regex ReportIdPattern();

    /// <summary>256 bits aleatorios en base64url (43 caracteres).</summary>
    public static string NewToken() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));

    public static string IdOf(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    public static void MapPublications(this WebApplication app)
    {
        // --- Gestión (con API key) ---
        app.MapPost("/api/publications", async (HttpRequest req, IDocumentStore store, IOptions<StorageOptions> opt, TimeProvider clock, CancellationToken ct) =>
        {
            if (req.ContentLength > opt.Value.MaxDocumentBytes) return TooLarge(opt.Value);
            var body = await ReadAsync<PublishRequest>(req, ct);
            if (body is null) return Results.BadRequest(new { error = "El cuerpo debe ser JSON." });

            var now = clock.GetUtcNow();
            var errors = new List<string>();
            var result = SanitizeResult(body.Result, errors);
            var columns = result?["columns"]!.AsArray().Select(c => c!.GetValue<string>()).ToHashSet() ?? [];
            var filters = SanitizeFilters(body.Filters, columns, errors);
            var expiresAt = CheckExpiry(body.ExpiresAt ?? now.AddDays(DefaultDays), now, errors);
            if (body.ReportId is { } rid && !ReportIdPattern().IsMatch(rid)) errors.Add("reportId inválido.");
            if (errors.Count > 0) return Results.BadRequest(new { error = string.Join(" ", errors) });

            var token = NewToken();
            var id = IdOf(token);
            var doc = new JsonObject
            {
                ["id"] = id,
                ["reportId"] = body.ReportId,
                ["title"] = Title(body.Title),
                ["createdAt"] = now,
                ["updatedAt"] = now,
                ["expiresAt"] = expiresAt,
                ["filters"] = filters,
                ["result"] = result,
            };
            var element = JsonSerializer.SerializeToElement(doc);
            if (element.GetRawText().Length > opt.Value.MaxDocumentBytes) return TooLarge(opt.Value);
            await store.PutAsync(Collections.Publications, id, element, ct);
            // El token solo sale en esta respuesta; el front lo guarda en el reporte para volver a copiar el enlace.
            return Results.Ok(new { id, token, path = $"/p/{token}", expiresAt, createdAt = now });
        });

        // Cambia título, caducidad o filtros sin cambiar el enlace.
        app.MapPatch("/api/publications/{id}", async (string id, HttpRequest req, IDocumentStore store, TimeProvider clock, CancellationToken ct) =>
        {
            if (!IdPattern().IsMatch(id)) return Results.NotFound();
            if (await store.GetAsync(Collections.Publications, id, ct) is not { } current) return Results.NotFound(new { error = "La publicación no existe o fue revocada." });
            var body = await ReadAsync<PublicationUpdate>(req, ct);
            if (body is null) return Results.BadRequest(new { error = "El cuerpo debe ser JSON." });

            var doc = JsonNode.Parse(current.GetRawText())!.AsObject();
            var now = clock.GetUtcNow();
            var errors = new List<string>();
            if (body.Title is not null) doc["title"] = Title(body.Title);
            if (body.ExpiresAt is { } exp) doc["expiresAt"] = CheckExpiry(exp, now, errors);
            if (body.Filters is not null)
            {
                var columns = doc["result"]?["columns"]?.AsArray().Select(c => c!.GetValue<string>()).ToHashSet() ?? [];
                doc["filters"] = SanitizeFilters(body.Filters, columns, errors);
            }
            if (errors.Count > 0) return Results.BadRequest(new { error = string.Join(" ", errors) });
            doc["updatedAt"] = now;
            await store.PutAsync(Collections.Publications, id, JsonSerializer.SerializeToElement(doc), ct);
            return Results.Ok(new { id, expiresAt = doc["expiresAt"], title = doc["title"] });
        });

        app.MapDelete("/api/publications/{id}", async (string id, IDocumentStore store, CancellationToken ct) =>
            IdPattern().IsMatch(id) && await store.DeleteAsync(Collections.Publications, id, ct) ? Results.NoContent() : Results.NotFound());

        // --- Lectura pública (sin API key; ApiKeyAuthMiddleware deja pasar /api/public) ---
        app.MapGet("/api/public/reports/{token}", async (string token, HttpContext ctx, IDocumentStore store, TimeProvider clock, CancellationToken ct) =>
        {
            ctx.Response.Headers.CacheControl = "no-store";
            ctx.Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
            ctx.Response.Headers["Referrer-Policy"] = "no-referrer";
            var gone = Results.NotFound(new { error = "Este enlace no existe o fue revocado." });
            if (!TokenPattern().IsMatch(token)) return gone;
            if (await store.GetAsync(Collections.Publications, IdOf(token), ct) is not { } doc) return gone;
            var expiresAt = doc.GetProperty("expiresAt").GetDateTimeOffset();
            if (expiresAt <= clock.GetUtcNow())
                return Results.Json(new { error = "Este enlace caducó. Pide uno nuevo a quien te lo compartió.", expiresAt }, statusCode: StatusCodes.Status410Gone);
            return Results.Ok(new
            {
                title = doc.GetProperty("title").GetString(),
                publishedAt = doc.GetProperty("updatedAt").GetDateTimeOffset(),
                expiresAt,
                filters = doc.GetProperty("filters"),
                result = doc.GetProperty("result"),
            });
        }).RequireRateLimiting(RateLimitPolicy);
    }

    private static async Task<T?> ReadAsync<T>(HttpRequest req, CancellationToken ct) where T : class
    {
        try { return await req.ReadFromJsonAsync<T>(ct); }
        catch (JsonException) { return null; }
        catch (InvalidOperationException) { return null; } // Content-Type que no es JSON
    }

    private static IResult TooLarge(StorageOptions o) =>
        Results.Json(new { error = $"El reporte supera {o.MaxDocumentBytes / 1024 / 1024} MB." }, statusCode: StatusCodes.Status413PayloadTooLarge);

    private static string Title(string? title) => string.IsNullOrWhiteSpace(title) ? "Reporte" : title.Trim()[..Math.Min(title.Trim().Length, 120)];

    private static DateTimeOffset CheckExpiry(DateTimeOffset expiresAt, DateTimeOffset now, List<string> errors)
    {
        if (expiresAt <= now.AddMinutes(5)) errors.Add("La caducidad debe ser una fecha futura.");
        else if (expiresAt > now.AddDays(MaxDays + 1)) errors.Add($"La caducidad no puede superar {MaxDays} días.");
        return expiresAt.ToUniversalTime();
    }

    /// <summary>Copia solo los campos permitidos y comprueba la forma de columnas y filas.</summary>
    public static JsonObject? SanitizeResult(JsonElement? input, List<string> errors)
    {
        if (input is not { ValueKind: JsonValueKind.Object } r) { errors.Add("Falta el resultado del reporte."); return null; }
        if (!r.TryGetProperty("columns", out var cols) || cols.ValueKind != JsonValueKind.Array || cols.GetArrayLength() is 0 or > MaxColumns
            || cols.EnumerateArray().Any(c => c.ValueKind != JsonValueKind.String))
        {
            errors.Add($"columns debe ser una lista de 1 a {MaxColumns} nombres.");
            return null;
        }
        if (!r.TryGetProperty("rows", out var rows) || rows.ValueKind != JsonValueKind.Array || rows.GetArrayLength() > MaxRows
            || rows.EnumerateArray().Any(row => row.ValueKind != JsonValueKind.Array || row.GetArrayLength() != cols.GetArrayLength()))
        {
            errors.Add($"rows debe ser una lista de hasta {MaxRows} filas con un valor por columna.");
            return null;
        }
        var clean = new JsonObject();
        foreach (var field in ResultFields)
            if (r.TryGetProperty(field, out var v) && v.ValueKind != JsonValueKind.Undefined) clean[field] = JsonNode.Parse(v.GetRawText());
        return clean;
    }

    /// <summary>{ column, kind: date|select|range, label?, default? } por columna existente; máximo 6.</summary>
    public static JsonArray SanitizeFilters(JsonElement? input, HashSet<string> columns, List<string> errors)
    {
        var list = new JsonArray();
        if (input is not { ValueKind: JsonValueKind.Array } arr) return list;
        if (arr.GetArrayLength() > MaxFilters) { errors.Add($"Como máximo {MaxFilters} filtros."); return list; }
        var seen = new HashSet<string>();
        foreach (var f in arr.EnumerateArray())
        {
            var column = f.ValueKind == JsonValueKind.Object && f.TryGetProperty("column", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString()! : null;
            var kind = f.ValueKind == JsonValueKind.Object && f.TryGetProperty("kind", out var k) && k.ValueKind == JsonValueKind.String ? k.GetString()! : null;
            if (column is null || !columns.Contains(column) || kind is null || !FilterKinds.Contains(kind) || !seen.Add(column))
            {
                errors.Add($"Filtro inválido: {(column is null ? "sin columna" : $"«{column}»")}.");
                continue;
            }
            var label = f.TryGetProperty("label", out var l) && l.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(l.GetString())
                ? l.GetString()!.Trim()[..Math.Min(l.GetString()!.Trim().Length, 60)] : column;
            var item = new JsonObject { ["column"] = column, ["kind"] = kind, ["label"] = label };
            if (f.TryGetProperty("default", out var d) && d.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined) && d.GetRawText().Length <= 4000)
                item["default"] = JsonNode.Parse(d.GetRawText());
            list.Add(item);
        }
        return list;
    }
}
