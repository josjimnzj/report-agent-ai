using System.Net.Http.Headers;
using System.Text.Json;
using AD.Data.Assistant.Api.Options;
using Microsoft.Extensions.Options;

namespace AD.Data.Assistant.Api.Agent;

/// <summary>Voz a texto con Whisper en Groq (capa gratuita), igual que workflow-agent-api. No usa modelos de Claude.</summary>
public sealed class GroqTranscriber(HttpClient http, IOptions<TranscriptionOptions> options)
{
    private readonly TranscriptionOptions _opt = options.Value;

    public bool Enabled => !string.IsNullOrWhiteSpace(_opt.GroqApiKey);
    public long MaxBytes => _opt.MaxBytes;

    public async Task<string> TranscribeAsync(Stream audio, string fileName, string contentType, string language, CancellationToken ct, string? prompt = null)
    {
        if (!Enabled) throw new ApiException(503, "Transcripción Groq no configurada (Transcription__GroqApiKey).");

        using var form = new MultipartFormDataContent();
        var file = new StreamContent(audio);
        // Los navegadores envían p. ej. "audio/webm;codecs=opus": se usa solo el tipo base.
        var baseType = (contentType ?? "").Split(';')[0].Trim();
        file.Headers.ContentType = MediaTypeHeaderValue.TryParse(baseType, out var mt) ? mt : new MediaTypeHeaderValue("application/octet-stream");
        form.Add(file, "file", string.IsNullOrWhiteSpace(fileName) ? "audio.webm" : fileName);
        form.Add(new StringContent(_opt.GroqModel), "model");
        form.Add(new StringContent("json"), "response_format");
        form.Add(new StringContent("0"), "temperature");
        if (!string.IsNullOrWhiteSpace(language)) form.Add(new StringContent(language), "language");
        // Texto previo como contexto: mejora la continuidad entre frases dictadas por partes.
        if (!string.IsNullOrWhiteSpace(prompt)) form.Add(new StringContent(prompt.Length > 200 ? prompt[^200..] : prompt), "prompt");

        using var req = new HttpRequestMessage(HttpMethod.Post, $"{_opt.GroqBaseUrl.TrimEnd('/')}/audio/transcriptions") { Content = form };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _opt.GroqApiKey);

        HttpResponseMessage res;
        try { res = await http.SendAsync(req, ct); }
        catch (HttpRequestException ex) { throw new ApiException(502, $"No se pudo contactar a Groq: {ex.Message}", ex); }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested) { throw new ApiException(504, "Groq no respondió a tiempo.", ex); }

        using (res)
        {
            var body = await res.Content.ReadAsStringAsync(ct);
            if (res.StatusCode == System.Net.HttpStatusCode.TooManyRequests)
                throw new ApiException(503, "Límite de la capa gratuita de Groq alcanzado; espera un momento o usa el dictado del navegador.");
            if (!res.IsSuccessStatusCode)
                throw new ApiException(502, $"Groq respondió {(int)res.StatusCode}: {Truncate(body)}");
            try
            {
                using var doc = JsonDocument.Parse(body);
                return doc.RootElement.TryGetProperty("text", out var t) ? t.GetString()?.Trim() ?? "" : "";
            }
            catch (JsonException ex) { throw new ApiException(502, "Groq devolvió una respuesta no válida.", ex); }
        }
    }

    private static string Truncate(string s) => s.Length <= 300 ? s : s[..300] + "…";
}
