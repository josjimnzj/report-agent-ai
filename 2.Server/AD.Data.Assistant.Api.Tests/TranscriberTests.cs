using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AD.Data.Assistant.Api.Agent;
using AD.Data.Assistant.Api.Options;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using MsOptions = Microsoft.Extensions.Options.Options;

namespace AD.Data.Assistant.Api.Tests;

public class TranscriberTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private sealed class StubHandler(HttpStatusCode status, string body) : HttpMessageHandler
    {
        public string? Form;
        public HttpRequestMessage? Request;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Request = request;
            Form = await request.Content!.ReadAsStringAsync(ct);
            return new HttpResponseMessage(status) { Content = new StringContent(body) };
        }
    }

    private static GroqTranscriber Groq(StubHandler h, string? key = "gsk_test") =>
        new(new HttpClient(h), MsOptions.Create(new TranscriptionOptions { GroqApiKey = key, GroqBaseUrl = "https://groq.test/openai/v1/" }));

    [Fact]
    public async Task Envia_audio_idioma_y_contexto_y_devuelve_el_texto()
    {
        var h = new StubHandler(HttpStatusCode.OK, """{"text":"  ventas por sucursal  "}""");
        var text = await Groq(h).TranscribeAsync(new MemoryStream([1, 2, 3]), "audio.webm", "audio/webm;codecs=opus", "es", default, new string('x', 250) + "fin");
        Assert.Equal("ventas por sucursal", text);
        Assert.Equal("https://groq.test/openai/v1/audio/transcriptions", h.Request!.RequestUri!.ToString());
        Assert.Equal("Bearer gsk_test", h.Request.Headers.Authorization!.ToString());
        Assert.Contains("whisper-large-v3-turbo", h.Form);
        Assert.Contains("Content-Type: audio/webm", h.Form);
        Assert.Contains("name=language", h.Form);
        Assert.Contains(new string('x', 197) + "fin", h.Form);          // contexto: solo los últimos 200 caracteres
        Assert.DoesNotContain(new string('x', 198) + "fin", h.Form);
    }

    [Theory]
    [InlineData(HttpStatusCode.TooManyRequests, 503)]
    [InlineData(HttpStatusCode.BadRequest, 502)]
    public async Task Errores_de_groq_se_traducen(HttpStatusCode groq, int expected)
    {
        var ex = await Assert.ThrowsAsync<ApiException>(() => Groq(new StubHandler(groq, "{}")).TranscribeAsync(new MemoryStream([1]), "a.webm", "audio/webm", "es", default));
        Assert.Equal(expected, ex.StatusCode);
    }

    [Fact]
    public async Task Sin_clave_el_motor_groq_queda_deshabilitado()
    {
        var c = factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("Auth:ApiKey", "test-key");
            b.UseSetting("Storage:ConnectionString", "");
            b.UseSetting("Transcription:GroqApiKey", "");
        }).CreateClient();
        c.DefaultRequestHeaders.Add("X-Api-Key", "test-key");

        var status = await c.GetFromJsonAsync<JsonElement>("/api/dictation");
        Assert.False(status.GetProperty("groq").GetBoolean());
        Assert.Equal(10 * 1024 * 1024, status.GetProperty("maxBytes").GetInt64());

        using var form = new MultipartFormDataContent { { new ByteArrayContent([1, 2, 3]), "audio", "audio.webm" } };
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await c.PostAsync("/api/transcribe", form)).StatusCode);
    }

    [Fact]
    public async Task Transcribe_exige_clave_y_valida_el_formulario()
    {
        var app = factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("Auth:ApiKey", "test-key");
            b.UseSetting("Storage:ConnectionString", "");
            b.UseSetting("Transcription:GroqApiKey", "gsk_test");
        });
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().PostAsync("/api/transcribe", new StringContent(""))).StatusCode);

        var c = app.CreateClient();
        c.DefaultRequestHeaders.Add("X-Api-Key", "test-key");
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync("/api/transcribe", new { audio = "x" })).StatusCode);
        using var empty = new MultipartFormDataContent { { new StringContent("es"), "language" } };
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsync("/api/transcribe", empty)).StatusCode);
    }
}
