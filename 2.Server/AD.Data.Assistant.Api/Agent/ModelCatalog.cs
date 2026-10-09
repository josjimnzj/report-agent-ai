using AD.Data.Assistant.Api.Options;
using Microsoft.Extensions.Options;

namespace AD.Data.Assistant.Api.Agent;

/// <param name="Fallback">Modelo al que la API pasa la petición si el modelo pedido la rechaza por política (fallback del servidor).</param>
public sealed record ModelInfo(string Id, string Label, string Note, string[] Efforts, string? Fallback);

public sealed record RunSettings(string Model, string Label, string Effort, string? Fallback);

/// <summary>Modelos y niveles de esfuerzo que se ofrecen. El cliente solo envía ids; aquí se validan.</summary>
public sealed class ModelCatalog(IOptions<AnthropicOptions> options)
{
    public static readonly string[] Efforts = ["low", "medium", "high", "xhigh", "max"];

    public static readonly ModelInfo[] Models =
    [
        new("claude-opus-5-5", "Claude Opus 5.5", "Recomendado: equilibrio calidad/costo ($4/$20 por MTok)", Efforts, "claude-opus-4-8"),
        new("claude-sonnet-5-5", "Claude Sonnet 5.5", "Más rápido y barato ($2/$10 por MTok)", Efforts, null),
        new("claude-haiku-5-5", "Claude Haiku 5.5", "El más económico ($0.10/$0.50 por MTok); para consultas sencillas", Efforts, null),
        new("claude-fable-5-1", "Claude Fable 5.1", "Máxima capacidad, el más caro ($10/$50 por MTok)", Efforts, "claude-opus-4-8"),
    ];

    private readonly AnthropicOptions _opt = options.Value;

    public string DefaultModel => _opt.Model;
    public string DefaultEffort => _opt.Effort;
    public int DefaultMaxIterations => _opt.DefaultMaxIterations;
    public int MaxIterationsLimit => _opt.MaxIterationsLimit;

    public RunSettings Resolve(string? model, string? effort)
    {
        var id = string.IsNullOrWhiteSpace(model) ? DefaultModel : model.Trim();
        var info = Models.FirstOrDefault(m => m.Id == id)
            ?? throw new ApiException(400, $"Modelo no permitido: '{id}'. Permitidos: {string.Join(", ", Models.Select(m => m.Id))}.");
        var e = string.IsNullOrWhiteSpace(effort) ? DefaultEffort : effort.Trim().ToLowerInvariant();
        if (!info.Efforts.Contains(e))
            throw new ApiException(400, $"Esfuerzo no válido para {info.Label}: '{e}'. Permitidos: {string.Join(", ", info.Efforts)}.");
        return new RunSettings(info.Id, info.Label, e, _opt.ServerFallbacks ? info.Fallback : null);
    }

    public int ResolveIterations(int? requested) =>
        requested is null ? DefaultMaxIterations
        : requested is < 1 || requested > MaxIterationsLimit
            ? throw new ApiException(400, $"maxIterations debe estar entre 1 y {MaxIterationsLimit}.")
            : requested.Value;
}
