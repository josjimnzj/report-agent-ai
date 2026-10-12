using System.Collections.Concurrent;
using System.ComponentModel;
using System.Globalization;
using System.Reflection;

namespace AD.Data.Assistant.Api.Options;

/// <summary>
/// Enlaza una sección de configuración sin lanzar excepciones: un valor que no se puede convertir
/// (p. ej. <c>Anthropic__ServerFallbacks=no</c> o <c>Anthropic__MaxTokens=64k</c>) se ignora, se usa el valor por defecto
/// y el problema queda en <see cref="Errors"/> (visible en /health). Con el binder estándar, un solo valor así hacía
/// fallar cada resolución de IOptions y la API respondía 500 sin cuerpo en /health y /api/models.
/// </summary>
public static class TolerantBinder
{
    private static readonly ConcurrentDictionary<string, string> _errors = new();

    /// <summary>Errores de configuración detectados (clave → problema). No incluye los valores: pueden ser secretos.</summary>
    public static IReadOnlyCollection<string> Errors => _errors.Values.OrderBy(e => e, StringComparer.Ordinal).ToArray();

    public static IServiceCollection ConfigureTolerant<T>(this IServiceCollection services, IConfigurationSection section) where T : class =>
        services.Configure<T>(o => Bind(section, o));

    public static void Bind(IConfigurationSection section, object target)
    {
        foreach (var p in target.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            if (!p.CanWrite || p.GetIndexParameters().Length > 0) continue;
            var child = section.GetSection(p.Name);
            var key = child.Path;
            var type = Nullable.GetUnderlyingType(p.PropertyType) ?? p.PropertyType;

            if (type == typeof(string) || type.IsPrimitive || type.IsEnum || type == typeof(decimal))
            {
                if (child.Value is null) continue;
                if (TryConvert(child.Value.Trim(), p.PropertyType, out var value))
                {
                    p.SetValue(target, value);
                    _errors.TryRemove(key, out _);
                }
                else
                    _errors[key] = $"{key}: valor no válido (se esperaba {Describe(type)}); se usa el valor por defecto.";
                continue;
            }

            // Tipos compuestos (diccionarios, listas): binder estándar, pero sin dejar que tumbe el resto.
            if (!child.Exists()) continue;
            try
            {
                var current = p.GetValue(target);
                if (current is null) p.SetValue(target, child.Get(p.PropertyType));
                else child.Bind(current);
                _errors.TryRemove(key, out _);
            }
            catch (InvalidOperationException)
            {
                _errors[key] = $"{key}: valor no válido; se usa el valor por defecto.";
            }
        }
    }

    private static bool TryConvert(string raw, Type propertyType, out object? value)
    {
        var type = Nullable.GetUnderlyingType(propertyType) ?? propertyType;
        value = null;
        if (type == typeof(string)) { value = raw; return true; }
        if (raw.Length == 0) return Nullable.GetUnderlyingType(propertyType) is not null; // vacío: null si admite null
        if (type == typeof(bool))
        {
            switch (raw.ToLowerInvariant())
            {
                case "true" or "1" or "yes" or "y" or "si" or "sí" or "on": value = true; return true;
                case "false" or "0" or "no" or "n" or "off": value = false; return true;
                default: return false;
            }
        }
        try
        {
            value = TypeDescriptor.GetConverter(type).ConvertFromString(null, CultureInfo.InvariantCulture, raw);
            return value is not null;
        }
        catch (Exception ex) when (ex is FormatException or NotSupportedException or ArgumentException or OverflowException)
        {
            return false;
        }
    }

    private static string Describe(Type t) =>
        t == typeof(bool) ? "true/false"
        : t == typeof(int) || t == typeof(long) ? "un número entero"
        : t.IsEnum ? string.Join("/", Enum.GetNames(t))
        : t.Name;
}
