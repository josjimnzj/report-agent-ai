using Npgsql;

namespace AD.Data.Assistant.Api.Storage;

public static class PgConnection
{
    /// <summary>Acepta una URL postgresql://usuario:clave@host/db?sslmode=require&amp;channel_binding=require o una cadena clave=valor de Npgsql.</summary>
    public static string Normalize(string input)
    {
        var s = input.Trim();
        if (!s.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) && !s.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
            return s;

        var uri = new Uri(s);
        var b = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            Pooling = true,
            MaxPoolSize = 4,
            Timeout = 15,
            CommandTimeout = 20,
        };
        var ui = uri.UserInfo.Split(':', 2);
        b.Username = Uri.UnescapeDataString(ui[0]);
        if (ui.Length > 1) b.Password = Uri.UnescapeDataString(ui[1]);

        foreach (var pair in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = pair.Split('=', 2);
            var v = kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : "";
            switch (kv[0].ToLowerInvariant())
            {
                case "sslmode": b.SslMode = Enum.TryParse<SslMode>(v.Replace("-", ""), true, out var m) ? m : SslMode.Require; break;
                case "channel_binding": b.ChannelBinding = Enum.TryParse<ChannelBinding>(v, true, out var cb) ? cb : ChannelBinding.Prefer; break;
            }
        }
        if (b.SslMode == SslMode.Disable) b.SslMode = SslMode.Require;
        return b.ConnectionString;
    }
}
