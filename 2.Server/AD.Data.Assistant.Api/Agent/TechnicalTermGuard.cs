using System.Text.Json;
using System.Text.RegularExpressions;
using AD.Data.Assistant.Api.Options;
using Microsoft.Extensions.Options;

namespace AD.Data.Assistant.Api.Agent;

/// <summary>
/// Diccionario de negocio del grafo del MCP (data/schema-graph.addaccion.json): nombre técnico de tabla o columna →
/// término de negocio (primer alias) y descripción. Lo usa <see cref="TechnicalTermGuard"/> para reconocer y sustituir
/// nombres de la base en el texto que lee el usuario. Sin archivo queda vacío y el guardarraíl sigue con los patrones.
/// </summary>
public sealed class BusinessDictionary
{
    public sealed record Entry(string Name, string? Alias, string? Description);

    private readonly Dictionary<string, Entry> _entries;

    public BusinessDictionary(IEnumerable<Entry> entries) =>
        _entries = entries.GroupBy(e => e.Name, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

    public static BusinessDictionary Empty { get; } = new([]);

    public int Count => _entries.Count;

    public Entry? Find(string name) => _entries.GetValueOrDefault(name);

    /// <summary>Ruta del grafo: SqlMcp:ExtraEnv:SCHEMA_GRAPH_PATH o, por defecto, el que viene junto al MCP (…/data/).</summary>
    public static string ResolvePath(SqlMcpOptions o) =>
        o.ExtraEnv.TryGetValue("SCHEMA_GRAPH_PATH", out var p) && !string.IsNullOrWhiteSpace(p)
            ? p
            : Path.GetFullPath(Path.Combine(Path.GetDirectoryName(o.Script) ?? ".", "..", "data", "schema-graph.addaccion.json"));

    public static BusinessDictionary Load(IOptions<SqlMcpOptions> options, ILogger<BusinessDictionary> log)
    {
        var path = ResolvePath(options.Value);
        if (!File.Exists(path))
        {
            log.LogWarning("Diccionario de negocio no encontrado en {Path}: el guardarraíl de nombres técnicos solo usará patrones.", path);
            return Empty;
        }
        try
        {
            using var stream = File.OpenRead(path);
            var dict = Parse(JsonDocument.Parse(stream).RootElement);
            log.LogInformation("Diccionario de negocio: {Count} nombres técnicos desde {Path}", dict.Count, path);
            return dict;
        }
        catch (Exception ex) when (ex is JsonException or IOException or InvalidOperationException)
        {
            log.LogWarning(ex, "No se pudo leer el diccionario de negocio {Path}", path);
            return Empty;
        }
    }

    /// <summary>Lee tables[] del grafo. Una columna repetida en varias tablas toma el alias más frecuente.</summary>
    internal static BusinessDictionary Parse(JsonElement graph)
    {
        var entries = new List<Entry>();
        var columns = new Dictionary<string, (Dictionary<string, int> Aliases, string? Description)>(StringComparer.OrdinalIgnoreCase);
        if (!graph.TryGetProperty("tables", out var tables) || tables.ValueKind != JsonValueKind.Array) return Empty;

        foreach (var t in tables.EnumerateArray())
        {
            var name = Str(t, "name");
            if (name is null) continue;
            var entry = new Entry(name, FirstAlias(t), Short(Str(t, "description")));
            entries.Add(entry);
            if (Str(t, "schema") is { } schema) entries.Add(entry with { Name = $"{schema}.{name}" });

            if (!t.TryGetProperty("columns", out var cols) || cols.ValueKind != JsonValueKind.Array) continue;
            foreach (var c in cols.EnumerateArray())
            {
                if (Str(c, "name") is not { } col) continue;
                if (!columns.TryGetValue(col, out var acc)) columns[col] = acc = (new(StringComparer.OrdinalIgnoreCase), null);
                if (FirstAlias(c) is { } alias) acc.Aliases[alias] = acc.Aliases.GetValueOrDefault(alias) + 1;
                if (acc.Description is null && Short(Str(c, "description")) is { } d) columns[col] = (acc.Aliases, d);
            }
        }
        foreach (var (col, acc) in columns)
        {
            var alias = acc.Aliases.Count == 0 ? null : acc.Aliases.MaxBy(kv => kv.Value).Key;
            entries.Add(new Entry(col, alias, acc.Description));
        }
        // Las tablas se agregaron primero: si una columna se llama igual que una tabla, gana la tabla.
        return new BusinessDictionary(entries);

        static string? Str(JsonElement e, string p) => e.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.String && v.GetString() is { Length: > 0 } s ? s : null;
        static string? FirstAlias(JsonElement e) =>
            e.TryGetProperty("aliases", out var a) && a.ValueKind == JsonValueKind.Array
                ? a.EnumerateArray().Select(x => x.ValueKind == JsonValueKind.String ? x.GetString() : null).FirstOrDefault(x => !string.IsNullOrWhiteSpace(x))
                : null;
        static string? Short(string? d) => d is null ? null : d.Length <= 200 ? d : d[..200] + "…";
    }
}

/// <summary>
/// Guardarraíl de la respuesta: el texto que lee el usuario (answer, insights, etiquetas de líneas de referencia)
/// no debe mostrar nombres de tablas, columnas ni esquemas. El SQL, la traza y los logs no pasan por aquí.
/// </summary>
public static class TechnicalTermGuard
{
    // dbo.Tabla / [dbo].[Tabla]; identificadores con guion bajo (AD_Case, ST_T_User); CamelCase de dos o más partes (AccountId).
    private static readonly Regex Candidate = new(
        @"\[?\b(?:dbo|sys)\]?\.\[?[A-Za-z_]\w*\]?|\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]*[A-Za-z0-9]\b|\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex SqlIdentifier = new(@"[A-Za-z_][A-Za-z0-9_]*", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex SqlLiteral = new(@"N?'(?:[^']|'')*'", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private const int MaxResultValues = 5000;
    private static readonly Regex CamelSplit = new(@"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly HashSet<string> NoisePrefixes = new(["AD", "ST", "T", "SF", "SP", "VW", "TB", "dbo"], StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Contexto de una ejecución: identificadores del SQL ejecutado (sin sus literales) y lo que el usuario ya ve en el
    /// resultado: alias de columnas que puso el modelo y valores de texto de las filas (p. ej. un producto «PLAN_ORO»).
    /// </summary>
    public sealed class Context
    {
        internal readonly HashSet<string> SqlNames = new(StringComparer.OrdinalIgnoreCase);
        internal readonly HashSet<string> Allowed = new(StringComparer.OrdinalIgnoreCase);

        public Context(BusinessDictionary dictionary, IEnumerable<string> queries, IEnumerable<string> resultColumns,
            IEnumerable<IReadOnlyList<JsonElement>>? resultRows = null)
        {
            Dictionary = dictionary;
            foreach (var q in queries) foreach (Match m in SqlIdentifier.Matches(SqlLiteral.Replace(q, " "))) SqlNames.Add(m.Value);
            foreach (var c in resultColumns) if (dictionary.Find(c) is null) Allowed.Add(c);
            foreach (var v in (resultRows ?? []).SelectMany(r => r).Where(e => e.ValueKind == JsonValueKind.String).Take(MaxResultValues))
                foreach (Match m in Candidate.Matches(v.GetString() ?? "")) Allowed.Add(Bare(m.Value));
        }

        public BusinessDictionary Dictionary { get; }
    }

    /// <summary>Nombres técnicos presentes en el texto, sin repetir y en orden de aparición.</summary>
    public static IReadOnlyList<string> Find(string? text, Context ctx)
    {
        if (string.IsNullOrEmpty(text)) return [];
        var found = new List<string>();
        foreach (Match m in Candidate.Matches(text))
            if (IsTechnical(m.Value, ctx) && !found.Contains(m.Value, StringComparer.OrdinalIgnoreCase)) found.Add(m.Value);
        return found;
    }

    public static IReadOnlyList<string> Find(AnswerParts parts, Context ctx) =>
        Texts(parts).SelectMany(t => Find(t, ctx)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

    /// <summary>Sustituye cada nombre técnico por su término de negocio (o por el nombre separado en palabras).</summary>
    public static string Scrub(string text, Context ctx) =>
        string.IsNullOrEmpty(text) ? text : Candidate.Replace(text, m => IsTechnical(m.Value, ctx) ? BusinessName(m.Value, ctx.Dictionary) : m.Value);

    public static AnswerParts Scrub(AnswerParts parts, Context ctx) => parts with
    {
        Answer = Scrub(parts.Answer, ctx),
        Insights = parts.Insights?.Select(i => i with { Title = Scrub(i.Title, ctx), Text = Scrub(i.Text, ctx) }).ToList(),
        Chart = parts.Chart is { RefLines: { Count: > 0 } lines } chart
            ? chart with { RefLines = lines.Select(l => l with { Label = Scrub(l.Label, ctx) }).ToList() }
            : parts.Chart,
    };

    /// <summary>Lo que el modelo necesita saber de cada nombre para reescribir el texto.</summary>
    public static IReadOnlyList<object> Describe(IEnumerable<string> terms, BusinessDictionary dictionary) =>
        terms.Select(t => (object)new { term = t, businessName = dictionary.Find(Bare(t))?.Alias, description = dictionary.Find(Bare(t))?.Description }).ToList();

    internal static IEnumerable<string> Texts(AnswerParts p)
    {
        yield return p.Answer;
        foreach (var i in p.Insights ?? []) { yield return i.Title; yield return i.Text; }
        foreach (var l in p.Chart?.RefLines ?? []) yield return l.Label;
    }

    private static bool IsTechnical(string token, Context ctx)
    {
        var bare = Bare(token);
        if (ctx.Allowed.Contains(bare)) return false;
        // dbo./guion bajo son nombres técnicos aunque no estén en el diccionario; el CamelCase solo si es un nombre conocido
        // (así «AddACCION» o «DevExtreme» no se tocan).
        return token.Contains('.') || bare.Contains('_') || ctx.Dictionary.Find(bare) is not null || ctx.SqlNames.Contains(bare);
    }

    internal static string Bare(string token)
    {
        var t = token.Replace("[", "").Replace("]", "");
        var dot = t.LastIndexOf('.');
        return dot >= 0 ? t[(dot + 1)..] : t;
    }

    internal static string BusinessName(string token, BusinessDictionary dictionary)
    {
        var bare = Bare(token);
        if (dictionary.Find(bare)?.Alias is { } alias) return alias;
        var words = bare.Split('_', StringSplitOptions.RemoveEmptyEntries)
            .SelectMany(p => CamelSplit.Split(p))
            .Where(w => w.Length > 0)
            .ToList();
        while (words.Count > 1 && NoisePrefixes.Contains(words[0])) words.RemoveAt(0);
        if (words.Count > 1 && words[^1].Equals("Id", StringComparison.OrdinalIgnoreCase)) words.RemoveAt(words.Count - 1);
        return words.Count == 0 ? "dato" : string.Join(' ', words).ToLowerInvariant();
    }
}
