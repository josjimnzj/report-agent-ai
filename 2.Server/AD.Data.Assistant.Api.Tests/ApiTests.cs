using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace AD.Data.Assistant.Api.Tests;

public class ApiTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private HttpClient Client(string? key = "test-key")
    {
        var app = factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("Auth:ApiKey", "test-key");
            b.UseSetting("Storage:ConnectionString", "");
            b.UseSetting("Anthropic:ApiKey", "");
        });
        var client = app.CreateClient();
        if (key is not null) client.DefaultRequestHeaders.Add("X-Api-Key", key);
        return client;
    }

    [Fact]
    public async Task Health_es_publico_y_api_exige_clave()
    {
        var anon = Client(null);
        Assert.Equal(HttpStatusCode.OK, (await anon.GetAsync("/health")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/models")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client("otra").GetAsync("/api/models")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client().GetAsync("/api/models")).StatusCode);
    }

    [Fact]
    public async Task Documentos_crud_y_validaciones()
    {
        var c = Client();
        var put = await c.PutAsJsonAsync("/api/docs/chats/chat-1", new { id = "chat-1", title = "Ventas", tags = new[] { "Ventas" } });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        var list = await c.GetFromJsonAsync<JsonElement>("/api/docs/chats");
        Assert.Contains(list.EnumerateArray(), d => d.GetProperty("id").GetString() == "chat-1");
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync("/api/docs/runs")).StatusCode);         // no pública
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PutAsJsonAsync("/api/docs/chats/a%20b", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PutAsJsonAsync("/api/docs/prefs/default", new[] { 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await c.DeleteAsync("/api/docs/chats/chat-1")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync("/api/docs/chats/chat-1")).StatusCode);
    }

    [Fact]
    public async Task Consulta_sin_clave_de_anthropic_responde_503()
    {
        var r = await Client().PostAsJsonAsync("/api/agent/query/stream", new { question = "ventas" });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, r.StatusCode);
        var empty = await Client().PostAsJsonAsync("/api/agent/query/stream", new { question = "" });
        Assert.Equal(HttpStatusCode.BadRequest, empty.StatusCode);
    }
}
