using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using AD.Data.Assistant.Api.Agent;

namespace AD.Data.Assistant.Api.Http;

/// <summary>
/// Ejecuta el agente en segundo plano y transmite su progreso al navegador como Server-Sent Events.
/// Eventos: status, block, text, thinking, tool_use_start, tool_call, tool_result, turn_end, done, error
/// (más comentarios «: keep-alive» cada 15 s para que los proxies no corten la conexión).
/// </summary>
public static class SseResponse
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static async Task WriteAsync<T>(HttpContext ctx, Func<EmitAsync, CancellationToken, Task<T>> run)
    {
        var ct = ctx.RequestAborted;
        ctx.Response.Headers.ContentType = "text/event-stream";
        ctx.Response.Headers.CacheControl = "no-cache";
        ctx.Response.Headers["X-Accel-Buffering"] = "no";
        await ctx.Response.Body.FlushAsync(ct);

        var clock = System.Diagnostics.Stopwatch.StartNew();
        var channel = Channel.CreateUnbounded<AgentEvent>(new UnboundedChannelOptions { SingleReader = true });
        EmitAsync emit = e => channel.Writer.WriteAsync(e, ct);

        var worker = Task.Run(async () =>
        {
            try
            {
                var result = await run(emit, ct);
                await channel.Writer.WriteAsync(new AgentEvent("done", result), ct);
            }
            catch (ApiException ex)
            {
                await channel.Writer.WriteAsync(new AgentEvent("error", new { error = ex.Message, status = ex.StatusCode }), CancellationToken.None);
            }
            catch (OperationCanceledException) { /* el cliente se desconectó o pulsó Detener */ }
            catch (Exception ex)
            {
                await channel.Writer.WriteAsync(new AgentEvent("error", new { error = ex.Message, status = 500 }), CancellationToken.None);
            }
            finally { channel.Writer.TryComplete(); }
        }, CancellationToken.None);

        try
        {
            while (true)
            {
                using var keepAlive = CancellationTokenSource.CreateLinkedTokenSource(ct);
                keepAlive.CancelAfter(TimeSpan.FromSeconds(15));
                try
                {
                    if (!await channel.Reader.WaitToReadAsync(keepAlive.Token)) break;
                }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested)
                {
                    await ctx.Response.WriteAsync(": keep-alive\n\n", CancellationToken.None);
                    await ctx.Response.Body.FlushAsync(CancellationToken.None);
                    continue;
                }

                while (channel.Reader.TryRead(out var e))
                {
                    var node = JsonSerializer.SerializeToNode(e.Data, Json);
                    if (node is JsonObject obj) obj["t"] = clock.ElapsedMilliseconds; // ms desde el inicio, para el registro del front
                    await ctx.Response.WriteAsync($"event: {e.Type}\ndata: {node?.ToJsonString(Json) ?? "null"}\n\n", ct);
                    await ctx.Response.Body.FlushAsync(ct);
                }
            }
        }
        catch (OperationCanceledException) { /* cliente desconectado */ }
        await worker;
    }
}
