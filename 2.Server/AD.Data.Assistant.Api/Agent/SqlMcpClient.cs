using AD.Data.Assistant.Api.Options;
using Microsoft.Extensions.Options;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;

namespace AD.Data.Assistant.Api.Agent;

/// <summary>
/// Lanza addaccion-mcp-sql como proceso hijo (stdio) y expone sus herramientas: grafo del esquema (schema_*),
/// exploración (list_tables, describe_table…) y execute_query (solo lectura). Se reinicia si el proceso muere.
/// </summary>
public sealed class SqlMcpClient(IOptions<SqlMcpOptions> options, ILoggerFactory loggerFactory) : IAsyncDisposable
{
    private readonly SqlMcpOptions _opt = options.Value;
    private readonly ILogger _log = loggerFactory.CreateLogger<SqlMcpClient>();
    private readonly SemaphoreSlim _gate = new(1, 1);
    private McpClient? _client;
    private IList<McpClientTool>? _tools;

    private async Task<McpClient> ConnectAsync(CancellationToken ct)
    {
        if (_client is not null) return _client;

        var env = new Dictionary<string, string?>
        {
            ["SQLSERVER_HOST"] = _opt.Host,
            ["SQLSERVER_PORT"] = _opt.Port.ToString(),
            ["SQLSERVER_DATABASE"] = _opt.Database,
            ["SQLSERVER_USER"] = _opt.User,
            ["SQLSERVER_PASSWORD"] = _opt.Password,
            ["SQLSERVER_ENCRYPT"] = _opt.Encrypt ? "true" : "false",
            ["SQLSERVER_TRUST_CERT"] = _opt.TrustCert ? "true" : "false",
            ["SQLSERVER_MAX_ROWS"] = _opt.MaxRows.ToString(),
            ["SQLSERVER_CONNECTION_TIMEOUT"] = _opt.ConnectionTimeoutMs.ToString(),
            ["SQLSERVER_REQUEST_TIMEOUT"] = _opt.RequestTimeoutMs.ToString(),
            ["MCP_TRANSPORT"] = "stdio",
        };
        foreach (var (k, v) in _opt.ExtraEnv) env[k] = v;

        var transport = new StdioClientTransport(new StdioClientTransportOptions
        {
            Name = "addaccion-mcp-sql",
            Command = _opt.Command,
            Arguments = [_opt.Script],
            EnvironmentVariables = env,
        }, loggerFactory);

        try
        {
            _client = await McpClient.CreateAsync(transport, cancellationToken: ct);
            _tools = await _client.ListToolsAsync(cancellationToken: ct);
            _log.LogInformation("MCP SQL conectado: {Count} herramientas", _tools.Count);
            return _client;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            await ResetAsync();
            throw new ApiException(502, $"No se pudo iniciar el MCP de SQL Server ({_opt.Command}): {ex.Message}", ex);
        }
    }

    private async Task ResetAsync()
    {
        var c = _client;
        _client = null;
        _tools = null;
        if (c is not null) { try { await c.DisposeAsync(); } catch { /* ya cerrado */ } }
    }

    public async Task<IReadOnlyList<McpClientTool>> ListToolsAsync(CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            await ConnectAsync(ct);
            return _tools!.ToList();
        }
        finally { _gate.Release(); }
    }

    public async Task<(string Text, bool IsError)> CallToolAsync(string name, IReadOnlyDictionary<string, object?> args, CancellationToken ct)
    {
        for (var attempt = 0; ; attempt++)
        {
            McpClient client;
            await _gate.WaitAsync(ct);
            try { client = await ConnectAsync(ct); }
            finally { _gate.Release(); }

            try
            {
                CallToolResult result = await client.CallToolAsync(name, args!, cancellationToken: ct);
                var text = string.Join("\n", result.Content.OfType<TextContentBlock>().Select(b => b.Text));
                return (text, result.IsError ?? false);
            }
            catch (Exception ex) when (attempt == 0 && ex is not OperationCanceledException)
            {
                _log.LogWarning(ex, "Fallo llamando {Tool}; reiniciando el MCP y reintentando una vez", name);
                await _gate.WaitAsync(ct);
                try { await ResetAsync(); } finally { _gate.Release(); }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                throw new ApiException(502, $"Error del MCP al ejecutar '{name}': {ex.Message}", ex);
            }
        }
    }

    public async ValueTask DisposeAsync() => await ResetAsync();
}
