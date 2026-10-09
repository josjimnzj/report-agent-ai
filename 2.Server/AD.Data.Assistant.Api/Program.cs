using System.Text.Json;
using System.Text.RegularExpressions;
using AD.Data.Assistant.Api;
using AD.Data.Assistant.Api.Agent;
using AD.Data.Assistant.Api.Http;
using AD.Data.Assistant.Api.Options;
using AD.Data.Assistant.Api.Storage;
using AD.Data.Assistant.Api.Telemetry;
using Anthropic;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

// Render / Cloud Run inyectan el puerto en PORT.
if (Environment.GetEnvironmentVariable("PORT") is { Length: > 0 } port)
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

builder.Services.Configure<Microsoft.AspNetCore.Builder.ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

builder.Services.Configure<AnthropicOptions>(builder.Configuration.GetSection("Anthropic"));
builder.Services.PostConfigure<AnthropicOptions>(o => o.ApiKey ??= Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY"));
builder.Services.Configure<SqlMcpOptions>(builder.Configuration.GetSection("SqlMcp"));
builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection("Storage"));
builder.Services.PostConfigure<StorageOptions>(o => o.ConnectionString ??= Environment.GetEnvironmentVariable("DATABASE_URL"));
builder.Services.Configure<AuthOptions>(builder.Configuration.GetSection("Auth"));
// Telemetría en otra base (o la misma con otra cadena): Telemetry__ConnectionString o, como en workflow-agent-api, Open__Telemetry.
builder.Services.Configure<TelemetryOptions>(builder.Configuration.GetSection("Telemetry"));
builder.Services.PostConfigure<TelemetryOptions>(o =>
{
    if (string.IsNullOrWhiteSpace(o.ConnectionString)) o.ConnectionString = builder.Configuration["Open:Telemetry"];
});

var corsOrigins = (builder.Configuration.GetSection("Cors").Get<CorsOptions>() ?? new CorsOptions()).Origins;
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
{
    if (corsOrigins.Length == 0) return;
    if (corsOrigins.Contains("*")) p.AllowAnyOrigin(); else p.WithOrigins(corsOrigins);
    p.WithHeaders("Content-Type", "X-Api-Key", "Authorization").WithMethods("GET", "POST", "PUT", "DELETE").SetPreflightMaxAge(TimeSpan.FromHours(1));
}));

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IDocumentStore>(sp =>
{
    var opt = sp.GetRequiredService<IOptions<StorageOptions>>();
    return string.IsNullOrWhiteSpace(opt.Value.ConnectionString)
        ? new MemoryDocumentStore()
        : new PgDocumentStore(opt, sp.GetRequiredService<ILogger<PgDocumentStore>>());
});
builder.Services.AddHostedService<StoreInitializer>();
builder.Services.AddSingleton(sp =>
{
    var o = sp.GetRequiredService<IOptions<AnthropicOptions>>().Value;
    return string.IsNullOrWhiteSpace(o.BaseUrl)
        ? new AnthropicClient { ApiKey = o.ApiKey }
        : new AnthropicClient { ApiKey = o.ApiKey, BaseUrl = o.BaseUrl };
});
builder.Services.AddSingleton<TelemetryStore>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<TelemetryStore>());
builder.Services.AddSingleton<SqlMcpClient>();
builder.Services.AddSingleton<ModelCatalog>();
builder.Services.AddSingleton<PromptStore>();
builder.Services.AddSingleton<AgentLoop>();
builder.Services.AddSingleton<DataAgent>();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase);

var app = builder.Build();

app.UseForwardedHeaders();
app.UseCors(); // antes de la API key: el preflight OPTIONS no lleva credenciales
// Front compilado (wwwroot) servido por la misma API. index.html siempre revalidado; los assets llevan hash.
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = c => c.Context.Response.Headers.CacheControl =
        c.Context.Request.Path.StartsWithSegments("/assets") ? "public, max-age=31536000, immutable" : "no-cache",
});
// El enrutado va después de los estáticos: si no, el fallback de la SPA captura también /assets.
app.UseRouting();
app.UseMiddleware<ApiKeyAuthMiddleware>();
app.Use(async (ctx, next) =>
{
    try { await next(); }
    catch (ApiException ex) when (!ctx.Response.HasStarted)
    {
        ctx.Response.StatusCode = ex.StatusCode;
        await ctx.Response.WriteAsJsonAsync(new { error = ex.Message });
    }
});

var commit = Environment.GetEnvironmentVariable("RENDER_GIT_COMMIT") ?? Environment.GetEnvironmentVariable("GIT_COMMIT");
var startedAt = DateTimeOffset.UtcNow;
app.MapGet("/health", (IDocumentStore store, IOptions<AnthropicOptions> ai, TelemetryStore tel) => Results.Ok(new
{
    status = "ok",
    commit = commit is { Length: >= 7 } ? commit[..7] : commit ?? "dev",
    startedAt,
    storage = store.Kind,
    storageError = StoreInitializer.LastError,
    anthropic = !string.IsNullOrWhiteSpace(ai.Value.ApiKey),
    telemetry = tel.Enabled,
}));

app.MapGet("/api/models", (ModelCatalog c) => Results.Ok(new
{
    defaultModel = c.DefaultModel,
    defaultEffort = c.DefaultEffort,
    defaultMaxIterations = c.DefaultMaxIterations,
    maxIterationsLimit = c.MaxIterationsLimit,
    models = ModelCatalog.Models.Select(m => new { m.Id, m.Label, m.Note, m.Efforts, provider = "anthropic" }),
}));

app.MapGet("/api/mcp/tools", async (SqlMcpClient mcp, CancellationToken ct) =>
    Results.Ok((await mcp.ListToolsAsync(ct)).Select(t => new { t.Name, t.Description })));

// --- Agente (Server-Sent Events) ---
app.MapPost("/api/agent/query/stream", async (QueryRequest req, DataAgent agent, IOptions<AnthropicOptions> ai, HttpContext ctx) =>
{
    string? problem = string.IsNullOrWhiteSpace(req.Question) || req.Question.Length > 4000
        ? "La pregunta es obligatoria y no puede superar 4000 caracteres."
        : string.IsNullOrWhiteSpace(ai.Value.ApiKey) ? "Falta configurar la clave de Anthropic (Anthropic__ApiKey)." : null;
    if (problem is not null)
    {
        ctx.Response.StatusCode = problem.StartsWith("Falta") ? 503 : 400;
        await ctx.Response.WriteAsJsonAsync(new { error = problem });
        return;
    }
    await SseResponse.WriteAsync(ctx, (emit, ct) => agent.AskAsync(req, emit, ct));
});

// --- Documentos del front (chats, reportes, preferencias) en Neon ---
var idPattern = new Regex("^[A-Za-z0-9_.:-]{1,120}$", RegexOptions.Compiled);
IResult? CheckDoc(string collection, string? id) =>
    !Collections.Public.Contains(collection) ? Results.NotFound(new { error = $"Colección desconocida: {collection}." })
    : id is not null && !idPattern.IsMatch(id) ? Results.BadRequest(new { error = "Identificador inválido." })
    : null;

app.MapGet("/api/docs/{collection}", async (string collection, int? limit, IDocumentStore store, CancellationToken ct) =>
    CheckDoc(collection, null) ?? Results.Ok(await store.ListAsync(collection, Math.Clamp(limit ?? 500, 1, 2000), ct)));

app.MapGet("/api/docs/{collection}/{id}", async (string collection, string id, IDocumentStore store, CancellationToken ct) =>
    CheckDoc(collection, id) ?? (await store.GetAsync(collection, id, ct) is { } doc ? Results.Ok(doc) : Results.NotFound()));

app.MapPut("/api/docs/{collection}/{id}", async (string collection, string id, HttpRequest req, IDocumentStore store, IOptions<StorageOptions> opt, CancellationToken ct) =>
{
    if (CheckDoc(collection, id) is { } bad) return bad;
    if (req.ContentLength > opt.Value.MaxDocumentBytes)
        return Results.Json(new { error = $"El documento supera {opt.Value.MaxDocumentBytes / 1024 / 1024} MB." }, statusCode: 413);
    JsonElement doc;
    try { doc = (await JsonDocument.ParseAsync(req.Body, cancellationToken: ct)).RootElement.Clone(); }
    catch (JsonException) { return Results.BadRequest(new { error = "El cuerpo debe ser JSON." }); }
    if (doc.ValueKind != JsonValueKind.Object) return Results.BadRequest(new { error = "El documento debe ser un objeto JSON." });
    if (doc.GetRawText().Length > opt.Value.MaxDocumentBytes)
        return Results.Json(new { error = $"El documento supera {opt.Value.MaxDocumentBytes / 1024 / 1024} MB." }, statusCode: 413);
    await store.PutAsync(collection, id, doc, ct);
    return Results.Ok(new { saved = true });
});

app.MapDelete("/api/docs/{collection}/{id}", async (string collection, string id, IDocumentStore store, CancellationToken ct) =>
    CheckDoc(collection, id) ?? (await store.DeleteAsync(collection, id, ct) ? Results.NoContent() : Results.NotFound()));

// --- Telemetría: registro y valoración de ejecuciones (base aparte) ---
IResult TelemetryOff() => Results.Json(new { error = "La telemetría no está configurada (Telemetry__ConnectionString u Open__Telemetry)." }, statusCode: 503);

app.MapGet("/api/telemetry/status", (TelemetryStore t) => Results.Ok(new { enabled = t.Enabled, lastError = t.LastError, retentionDays = t.Options.RetentionDays }));

app.MapPost("/api/feedback", async (FeedbackRequest req, TelemetryStore t, CancellationToken ct) =>
{
    if (!t.Enabled) return TelemetryOff();
    if (!Guid.TryParse(req.RunId, out var id) || req.Rating is not (1 or -1)) return Results.BadRequest(new { error = "runId (guid) y rating (1 o -1) son obligatorios." });
    if (req.Comment is { Length: > 2000 } || req.Tags is { Length: > 20 }) return Results.BadRequest(new { error = "Comentario o etiquetas demasiado largos." });
    return await t.SaveFeedbackAsync(new FeedbackInput(id, req.Rating, req.Tags, req.Comment), ct)
        ? Results.Ok(new { saved = true })
        : Results.NotFound(new { error = "Esta respuesta no está en el registro (es anterior a la telemetría o ya se depuró) y no se puede valorar." });
});

static RunFilter ToFilter(int? days, int? rating, string? model, string? mode, string? status, string? q) =>
    new(days ?? 30, rating is 1 or -1 or 0 ? rating : null, model, mode, status, q);

app.MapGet("/api/telemetry/runs", async (int? days, int? rating, string? model, string? mode, string? status, string? q, int? limit, int? offset, TelemetryStore t, CancellationToken ct) =>
    !t.Enabled ? TelemetryOff() : Results.Ok(await t.RecentAsync(ToFilter(days, rating, model, mode, status, q), Math.Clamp(limit ?? 50, 1, 500), Math.Max(offset ?? 0, 0), ct)));

app.MapGet("/api/telemetry/summary", async (int? days, int? rating, string? model, string? mode, string? status, string? q, TelemetryStore t, CancellationToken ct) =>
    !t.Enabled ? TelemetryOff() : Results.Ok(await t.SummaryAsync(ToFilter(days, rating, model, mode, status, q), ct)));

app.MapGet("/api/telemetry/facets", async (TelemetryStore t, CancellationToken ct) =>
    !t.Enabled ? TelemetryOff() : Results.Ok(await t.FacetsAsync(ct)));

// Exportación: CSV (Excel) o JSON; detail=1 añade filas de muestra, eventos y traza (solo JSON).
app.MapGet("/api/telemetry/export", async (HttpContext ctx, TelemetryStore t, string? format, string? detail, int? days, int? rating, string? model, string? mode, string? status, string? q, int? max) =>
{
    if (!t.Enabled) { ctx.Response.StatusCode = 503; await ctx.Response.WriteAsJsonAsync(new { error = "La telemetría no está configurada." }); return; }
    var json = string.Equals(format, "json", StringComparison.OrdinalIgnoreCase);
    ctx.Response.ContentType = json ? "application/json; charset=utf-8" : "text/csv; charset=utf-8";
    ctx.Response.Headers.ContentDisposition = $"attachment; filename=\"ejecuciones-{DateTime.UtcNow:yyyyMMdd-HHmm}.{(json ? "json" : "csv")}\"";
    await t.ExportAsync(ToFilter(days, rating, model, mode, status, q), json ? "json" : "csv", detail is "1" or "true" && json, Math.Clamp(max ?? 5000, 1, 20000), ctx.Response.Body, ctx.RequestAborted);
});

app.MapGet("/api/telemetry/runs/{id:guid}", async (Guid id, TelemetryStore t, CancellationToken ct) =>
    !t.Enabled ? TelemetryOff() : await t.RunDetailJsonAsync(id, ct) is { } json ? Results.Content(json, "application/json") : Results.NotFound());

// SPA: cualquier ruta que no sea /api ni /health devuelve index.html (si el front está incluido en la imagen).
app.MapFallbackToFile("{*path:regex(^(?!api/|health$).*$)}", "index.html");

app.Lifetime.ApplicationStopping.Register(() =>
    app.Services.GetRequiredService<SqlMcpClient>().DisposeAsync().AsTask().GetAwaiter().GetResult());

app.Run();

public partial class Program;
