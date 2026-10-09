namespace AD.Data.Assistant.Api.Options;

public sealed class AnthropicOptions
{
    /// <summary>Clave de la API de Anthropic. Variable: Anthropic__ApiKey (también ANTHROPIC_API_KEY).</summary>
    public string? ApiKey { get; set; }
    /// <summary>Solo pruebas: otra URL base (p. ej. un servidor simulado).</summary>
    public string? BaseUrl { get; set; }
    public string Model { get; set; } = "claude-opus-5-5";
    public string Effort { get; set; } = "high";
    public long MaxTokens { get; set; } = 64000;
    /// <summary>Vueltas modelo→herramientas por defecto en cada pregunta.</summary>
    public int DefaultMaxIterations { get; set; } = 12;
    public int MaxIterationsLimit { get; set; } = 25;
    /// <summary>Si es false no se envía el parámetro beta de fallbacks (p. ej. si la organización no lo tiene habilitado).</summary>
    public bool ServerFallbacks { get; set; } = true;
}

/// <summary>MCP SQL Server (addaccion-mcp-sql) lanzado como proceso hijo por stdio.</summary>
public sealed class SqlMcpOptions
{
    public string Command { get; set; } = "node";
    /// <summary>Ruta al MCP compilado. Variable: SqlMcp__Script. En la imagen Docker vive en /opt/addaccion-mcp-sql.</summary>
    public string Script { get; set; } = "/opt/addaccion-mcp-sql/dist/index.js";
    public string Host { get; set; } = "";
    public int Port { get; set; } = 1433;
    public string Database { get; set; } = "";
    public string User { get; set; } = "";
    public string Password { get; set; } = "";
    public bool Encrypt { get; set; } = true;
    public bool TrustCert { get; set; }
    public int MaxRows { get; set; } = 1000;
    public int ConnectionTimeoutMs { get; set; } = 30000;
    public int RequestTimeoutMs { get; set; } = 60000;
    /// <summary>Variables extra para el proceso del MCP (p. ej. SCHEMA_GRAPH_PATH).</summary>
    public Dictionary<string, string> ExtraEnv { get; set; } = [];
}

public sealed class StorageOptions
{
    /// <summary>Cadena de Neon (Postgres). Variable: Storage__ConnectionString (también DATABASE_URL). Sin cadena se usa memoria (solo desarrollo).</summary>
    public string? ConnectionString { get; set; }
    /// <summary>Dueño de los documentos. Por ahora todo pertenece al usuario admin.</summary>
    public string Owner { get; set; } = "admin";
    /// <summary>Tamaño máximo de un documento (los chats guardan filas de resultados).</summary>
    public int MaxDocumentBytes { get; set; } = 4 * 1024 * 1024;
}

public sealed class AuthOptions
{
    /// <summary>API key requerida en /api/* (X-Api-Key o Authorization: Bearer). Variable: Auth__ApiKey.</summary>
    public string? ApiKey { get; set; }
    /// <summary>Solo desarrollo local.</summary>
    public bool Disabled { get; set; }
}

public sealed class CorsOptions
{
    /// <summary>Orígenes permitidos, separados por coma. Variable: Cors__AllowedOrigins. "*" = cualquiera.</summary>
    public string? AllowedOrigins { get; set; }

    public string[] Origins => (AllowedOrigins ?? "").Split([',', ';', ' '], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Select(o => o.TrimEnd('/')).ToArray();
}

/// <summary>
/// Registro de ejecuciones y valoraciones (👍/👎) en Postgres, en una base aparte de la de documentos.
/// Variable: Telemetry__ConnectionString. Sin cadena, el registro queda desactivado.
/// </summary>
public sealed class TelemetryOptions
{
    public string? ConnectionString { get; set; }
    /// <summary>Días que se conservan las ejecuciones SIN valoración. Las valoradas se conservan siempre.</summary>
    public int RetentionDays { get; set; } = 90;
    /// <summary>Tope de bytes de eventos por ejecución.</summary>
    public int MaxEventBytes { get; set; } = 300_000;
    public int MaxToolResultChars { get; set; } = 4000;
    /// <summary>Filas de ejemplo del resultado que se guardan (los datos pueden ser sensibles).</summary>
    public int RowSample { get; set; } = 20;
    public bool Enabled => !string.IsNullOrWhiteSpace(ConnectionString);
}
