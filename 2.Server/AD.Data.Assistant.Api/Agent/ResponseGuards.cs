using System.Text.RegularExpressions;

namespace AD.Data.Assistant.Api.Agent;

/// <summary>
/// Guardarraíl de datos de contacto: el usuario no tiene permiso para extraer teléfonos, direcciones ni correos de la base.
/// Se aplica antes de llamar al modelo (la pregunta lo pide) y después (algún resultado trae columnas de contacto).
/// </summary>
public static class ContactDataGuard
{
    private const RegexOptions Opts = RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled;

    // Términos que solo pueden ser datos de contacto.
    private static readonly Regex Strong = new(
        @"\b(tel[eé]fonos?|celulares?|m[oó]viles?|whats\s?app|n[uú]meros?\s+(de\s+)?(contacto|celular|tel[eé]fono|m[oó]vil)|datos?\s+de\s+contacto|informaci[oó]n\s+de\s+contacto|direcciones|domicilios?|"
        + @"direcci[oó]n\s+(de\s+)?(correo|e-?mail|domicilio|postal|f[ií]sica|particular|del?\s+(los\s+|las\s+)?(clientes?|cuentas?|contactos?|usuarios?|personas?|prospectos?))|"
        + @"phones?(\s+numbers?)?|contact\s+(info|information|details|data)|(e-?mail|home|mailing|street)\s+address(es)?|addresses)\b", Opts);

    // También son métricas de campañas («cuántos correos se enviaron»): solo cuentan si no piden una cifra.
    private static readonly Regex Ambiguous = new(@"\b(correos?(\s+electr[oó]nicos?)?|e-?mails?|mails?)\b", Opts);
    private static readonly Regex Metric = new(@"\b(cu[aá]nt[oa]s?|n[uú]mero\s+de|cantidad\s+de|total\s+de|how\s+many|number\s+of|count)\b", Opts);

    // Columnas del resultado (nombre o alias) que son datos de contacto.
    private static readonly Regex Column = new(
        @"phone|tel[eé]fono|celular|m[oó]vil|mobile|whats\s?app|e-?mail|correo|\bmail\b|street|calle|direcci[oó]n|domicilio|address|^tel\b|^cel\b", Opts);

    public static bool IsRequest(string? question)
    {
        if (string.IsNullOrWhiteSpace(question)) return false;
        return Strong.IsMatch(question) || (Ambiguous.IsMatch(question) && !Metric.IsMatch(question));
    }

    public static bool HasContactColumns(IEnumerable<QueryResult> results) =>
        results.Any(r => r.Columns.Any(c => Column.IsMatch(c) && !c.Contains("AddressType", StringComparison.OrdinalIgnoreCase)));

    public static string Message(string question) => Language.IsEnglish(question)
        ? "Your user does not have permission to extract contact information (phone numbers, addresses or email addresses) from the database. "
          + "What I can do right away is the same analysis at an aggregate level: by branch, executive, period or customer type."
        : "Tu usuario no tiene permiso para extraer información de contacto (teléfonos, direcciones o correos electrónicos) de la base de datos. "
          + "Lo que sí puedo entregarte de inmediato es ese mismo análisis a nivel agregado: por sucursal, ejecutivo, periodo o tipo de cliente.";
}

/// <summary>
/// Guardarraíl comercial: el asistente nunca responde «no puedo». Cuando una frase de la respuesta es una negativa
/// se sustituye por el mensaje de que la capacidad aún está en entrenamiento, junto con lo que sí se puede hacer hoy.
/// </summary>
public static class LimitationGuard
{
    private const RegexOptions Opts = RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled;

    private static readonly Regex Refusal = new(
        @"\bno\s+(puedo|podemos|podr[eé]|pudimos|es\s+posible|me\s+es\s+posible|se\s+puede|se\s+pudo|soy\s+capaz|logro|tengo\s+(la\s+)?(capacidad|forma|manera|habilidad|acceso)|cuento\s+con|estoy\s+(en\s+condiciones|capacitado|habilitado)|est[aá]\s+disponible)\b"
        + @"|\bimposible\b|\b(i|we)\s+(can('|’)?t|cannot|can\s+not|am\s+unable|are\s+unable|am\s+not\s+able|are\s+not\s+able)\b|\b(i|we)['’]m\s+(unable|not\s+able)\b"
        + @"|\bunable\s+to\b|\bnot\s+(possible|something\s+i\s+can)\b|\bi\s+don['’]?t\s+have\s+(access|the\s+ability)\b", Opts);

    private static readonly Regex Sentences = new(@"(?<=[.!?])\s+", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static string Message(string question) => Language.IsEnglish(question)
        ? "This capability is still in training: we are teaching the assistant to handle this kind of request and it will be available very soon. "
          + "In the meantime I can help you right away with sales, opportunities, cases and trends by branch, executive or period."
        : "Esta capacidad todavía está en entrenamiento: seguimos preparando al asistente para resolver este tipo de solicitudes y muy pronto estará disponible. "
          + "Mientras tanto, con gusto te apoyo de inmediato con ventas, oportunidades, casos y tendencias por sucursal, ejecutivo o periodo.";

    public static bool HasRefusal(string? text) => !string.IsNullOrWhiteSpace(text) && Refusal.IsMatch(text);

    /// <summary>Reemplaza cada frase que sea una negativa (una sola vez) por el mensaje de entrenamiento.</summary>
    public static string Sanitize(string? answer, string question)
    {
        if (string.IsNullOrWhiteSpace(answer) || !Refusal.IsMatch(answer)) return answer ?? "";
        var message = Message(question);
        var output = new List<string>();
        var replaced = false;
        foreach (var sentence in Sentences.Split(answer.Trim()))
        {
            if (!Refusal.IsMatch(sentence)) { output.Add(sentence); continue; }
            if (replaced) continue;
            output.Add(message);
            replaced = true;
        }
        return string.Join(' ', output);
    }
}

/// <summary>
/// Guardarraíl de volumen: ningún resultado muestra más de 100 registros; en listados de cuentas con productos valiosos
/// o casos abiertos, el máximo es 50. Se recorta en el servidor aunque el modelo olvide el TOP.
/// </summary>
public static class RowLimitGuard
{
    public const int MaxRows = 100;
    public const int MaxAccountRows = 50;

    private const RegexOptions Opts = RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled;
    private static readonly Regex Accounts = new(@"\b(cuentas?|clientes?|prospectos?|accounts?|customers?)\b", Opts);
    private static readonly Regex Valuable = new(@"\bvalios[oa]s?\b|\babiert[oa]s?\b|\bopen\s+(cases?|tickets?)\b|\bvaluable\b|\bhigh[- ]value\b", Opts);

    public static int LimitFor(string? question) =>
        !string.IsNullOrWhiteSpace(question) && Accounts.IsMatch(question) && Valuable.IsMatch(question) ? MaxAccountRows : MaxRows;

    public static QueryResult Cap(QueryResult r, int limit) =>
        r.Rows.Count <= limit ? r : r with { Rows = r.Rows.Take(limit).ToList() };

    public static bool IsTruncated(QueryResult? r, int limit) => r is not null && r.Rows.Count >= limit && r.RowCount > r.Rows.Count;

    public static string Note(int limit, string question) => Language.IsEnglish(question)
        ? $"For data protection, only the first {limit} records are shown."
        : $"Por protección de la información, solo se muestran los primeros {limit} registros.";
}

internal static class Language
{
    private static readonly Regex English = new(@"\b(the|what|which|show|give|how|many|list|with|please|top|per|and|of|for|by|me|my|are|is|that|have|has)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private static readonly Regex Spanish = new(@"\b(el|la|los|las|de|del|por|para|con|y|que|qu[eé]|cu[aá]l(es)?|cu[aá]nt[oa]s?|dame|muestra|mu[eé]strame|ventas|mes|sucursal|cuentas|clientes|tienen|con)\b|[áéíóúñ¿¡]",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    /// <summary>Español por defecto; inglés solo si la pregunta tiene claramente más palabras en inglés.</summary>
    public static bool IsEnglish(string? text) =>
        !string.IsNullOrWhiteSpace(text) && English.Matches(text).Count >= 2 && English.Matches(text).Count > Spanish.Matches(text).Count;
}
