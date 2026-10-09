namespace AD.Data.Assistant.Api;

/// <summary>Error con código HTTP y mensaje para el usuario (en español).</summary>
public sealed class ApiException(int statusCode, string message, Exception? inner = null) : Exception(message, inner)
{
    public int StatusCode { get; } = statusCode;
}
