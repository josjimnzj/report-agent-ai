using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace AD.Data.Assistant.Api.Tests;

[Collection("api")]
public class PublicationTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    /// <summary>Un mismo host (almacén en memoria compartido): cliente con clave y cliente anónimo.</summary>
    private (HttpClient Owner, HttpClient Anon, Clock Clock) Host()
    {
        var clock = new Clock(new DateTimeOffset(2026, 10, 1, 12, 0, 0, TimeSpan.Zero));
        var app = factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("Auth:ApiKey", "test-key");
            b.UseSetting("Storage:ConnectionString", "");
            b.UseSetting("Anthropic:ApiKey", "");
            b.ConfigureServices(s => s.AddSingleton<TimeProvider>(clock));
        });
        var owner = app.CreateClient();
        owner.DefaultRequestHeaders.Add("X-Api-Key", "test-key");
        return (owner, app.CreateClient(), clock);
    }

    private static object Report(DateTimeOffset? expiresAt, object? filters = null) => new
    {
        reportId = "rep-1",
        title = "Ventas por mes",
        expiresAt,
        filters = filters ?? new object[] { new { column = "Mes", kind = "date", label = "Periodo", @default = new { preset = "last6" } }, new { column = "Sucursal", kind = "select" } },
        result = new
        {
            columns = new[] { "Mes", "Sucursal", "Monto" },
            rows = new object[] { new object[] { "2026-08", "Centro", 10 }, new object[] { "2026-09", "Norte", 20 } },
            totalRows = 2,
            chart = new { type = "bar", x = "Mes", y = new[] { "Monto" } },
            queries = new[] { "SELECT * FROM dbo.AD_Case" },
            answer = "Respuesta del chat",
        },
    };

    [Fact]
    public async Task Publicar_y_abrir_sin_clave_sin_exponer_sql()
    {
        var (owner, anon, clock) = Host();
        var res = await owner.PostAsJsonAsync("/api/publications", Report(clock.Now.AddDays(7)));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var pub = await res.Content.ReadFromJsonAsync<JsonElement>();
        var token = pub.GetProperty("token").GetString()!;
        Assert.True(token.Length >= 43);
        Assert.Equal($"/p/{token}", pub.GetProperty("path").GetString());
        Assert.NotEqual(token, pub.GetProperty("id").GetString()); // la clave guardada es el hash

        var view = await anon.GetAsync($"/api/public/reports/{token}");
        Assert.Equal(HttpStatusCode.OK, view.StatusCode);
        Assert.Equal("no-store", view.Headers.CacheControl?.ToString());
        var body = await view.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Ventas por mes", body.GetProperty("title").GetString());
        Assert.Equal(2, body.GetProperty("result").GetProperty("rows").GetArrayLength());
        Assert.False(body.GetProperty("result").TryGetProperty("queries", out _));
        Assert.False(body.GetProperty("result").TryGetProperty("answer", out _));
        var filters = body.GetProperty("filters");
        Assert.Equal("Periodo", filters[0].GetProperty("label").GetString());
        Assert.Equal("last6", filters[0].GetProperty("default").GetProperty("preset").GetString());
        Assert.Equal("Sucursal", filters[1].GetProperty("label").GetString());

        // La gestión sí exige clave.
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsJsonAsync("/api/publications", Report(clock.Now.AddDays(7)))).StatusCode);
    }

    [Fact]
    public async Task Caduca_se_prolonga_y_se_revoca()
    {
        var (owner, anon, clock) = Host();
        var pub = await (await owner.PostAsJsonAsync("/api/publications", Report(clock.Now.AddDays(1)))).Content.ReadFromJsonAsync<JsonElement>();
        var (id, token) = (pub.GetProperty("id").GetString()!, pub.GetProperty("token").GetString()!);

        clock.Now = clock.Now.AddDays(2);
        Assert.Equal(HttpStatusCode.Gone, (await anon.GetAsync($"/api/public/reports/{token}")).StatusCode);

        var patch = await owner.PatchAsJsonAsync($"/api/publications/{id}", new { expiresAt = clock.Now.AddDays(30), filters = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
        var body = await anon.GetFromJsonAsync<JsonElement>($"/api/public/reports/{token}");
        Assert.Equal(0, body.GetProperty("filters").GetArrayLength());

        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/publications/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/api/public/reports/{token}")).StatusCode);
    }

    [Fact]
    public async Task Validaciones()
    {
        var (owner, anon, clock) = Host();
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsJsonAsync("/api/publications", Report(clock.Now.AddDays(-1)))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsJsonAsync("/api/publications", Report(clock.Now.AddDays(400)))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsJsonAsync("/api/publications",
            Report(clock.Now.AddDays(7), new object[] { new { column = "NoExiste", kind = "date" } }))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsJsonAsync("/api/publications", new { title = "Sin datos" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync("/api/public/reports/corto")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/api/public/reports/{new string('a', 43)}")).StatusCode);

        // Sin caducidad: 30 días.
        var pub = await (await owner.PostAsJsonAsync("/api/publications", Report(null))).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(clock.Now.AddDays(30), pub.GetProperty("expiresAt").GetDateTimeOffset());
    }
}
