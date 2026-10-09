using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using AD.Data.Assistant.Api.Options;

namespace AD.Data.Assistant.Api.Http;

/// <summary>
/// Protege /api/* con una API key (cabecera X-Api-Key o Authorization: Bearer).
/// Falla cerrado: sin Auth:ApiKey configurada, /api responde 503 (salvo Auth:Disabled=true, solo para desarrollo local).
/// Limita los intentos fallidos por IP para frenar fuerza bruta.
/// </summary>
public sealed class ApiKeyAuthMiddleware(RequestDelegate next, IOptions<AuthOptions> options, ILogger<ApiKeyAuthMiddleware> log)
{
    private const int MaxFailuresPerMinute = 10;
    private readonly AuthOptions _opt = options.Value;
    private readonly byte[]? _expected = string.IsNullOrEmpty(options.Value.ApiKey) ? null : SHA256.HashData(Encoding.UTF8.GetBytes(options.Value.ApiKey));
    private readonly ConcurrentDictionary<string, (long Window, int Count)> _failures = new();

    public async Task InvokeAsync(HttpContext ctx)
    {
        if (!ctx.Request.Path.StartsWithSegments("/api") || _opt.Disabled)
        {
            await next(ctx);
            return;
        }

        if (_expected is null)
        {
            ctx.Response.StatusCode = 503;
            await ctx.Response.WriteAsJsonAsync(new { error = "Auth:ApiKey no está configurada en el servidor." });
            return;
        }

        var ip = ctx.Connection.RemoteIpAddress?.ToString() ?? "?";
        var window = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 60;
        if (_failures.TryGetValue(ip, out var f) && f.Window == window && f.Count >= MaxFailuresPerMinute)
        {
            ctx.Response.StatusCode = 429;
            await ctx.Response.WriteAsJsonAsync(new { error = "Demasiados intentos fallidos; espera un minuto." });
            return;
        }

        var provided = ctx.Request.Headers["X-Api-Key"].FirstOrDefault();
        if (string.IsNullOrEmpty(provided))
        {
            var auth = ctx.Request.Headers.Authorization.FirstOrDefault();
            if (auth is not null && auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) provided = auth[7..].Trim();
        }

        var ok = !string.IsNullOrEmpty(provided)
            && CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(provided)), _expected);
        if (!ok)
        {
            _failures.AddOrUpdate(ip, _ => (window, 1), (_, cur) => cur.Window == window ? (window, cur.Count + 1) : (window, 1));
            log.LogWarning("API key inválida desde {Ip} en {Path}", ip, ctx.Request.Path);
            ctx.Response.StatusCode = 401;
            await ctx.Response.WriteAsJsonAsync(new { error = "API key inválida o ausente." });
            return;
        }

        await next(ctx);
    }
}
