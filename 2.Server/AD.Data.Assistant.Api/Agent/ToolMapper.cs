using System.Text.Json;
using Anthropic.Models.Beta.Messages;
using ModelContextProtocol.Client;

namespace AD.Data.Assistant.Api.Agent;

public static class ToolMapper
{
    /// <summary>Convierte una herramienta MCP en una herramienta cliente de Anthropic.</summary>
    public static BetaToolUnion FromMcp(McpClientTool tool)
    {
        var schema = tool.JsonSchema;
        var props = new Dictionary<string, JsonElement>();
        List<string>? required = null;

        if (schema.ValueKind == JsonValueKind.Object)
        {
            if (schema.TryGetProperty("properties", out var p) && p.ValueKind == JsonValueKind.Object)
                foreach (var kv in p.EnumerateObject()) props[kv.Name] = kv.Value.Clone();
            if (schema.TryGetProperty("required", out var r) && r.ValueKind == JsonValueKind.Array)
                required = r.EnumerateArray().Select(x => x.GetString()!).ToList();
        }

        return new BetaTool
        {
            Name = tool.Name,
            Description = tool.Description,
            InputSchema = new() { Properties = props, Required = required },
        };
    }
}
