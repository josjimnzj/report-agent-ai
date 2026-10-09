using System.Text.Json;
using AD.Data.Assistant.Api;
using AD.Data.Assistant.Api.Agent;
using AD.Data.Assistant.Api.Options;
using MsOptions = Microsoft.Extensions.Options.Options;

namespace AD.Data.Assistant.Api.Tests;

public class AgentTests
{
    private static JsonElement J(string json) => JsonDocument.Parse(json).RootElement.Clone();

    [Fact]
    public void ParseQueryResult_lee_la_salida_de_execute_query()
    {
        var r = DataAgent.ParseQueryResult("SELECT 1", """{"columns":["Mes","Monto"],"rows":[["2026-01",10],["2026-02",20]],"rowCount":2,"executionTime":5}""");
        Assert.NotNull(r);
        Assert.Equal(["Mes", "Monto"], r!.Columns);
        Assert.Equal(2, r.Rows.Count);
        Assert.Equal(20, r.Rows[1][1].GetInt32());
        Assert.Null(DataAgent.ParseQueryResult("x", "no es json"));
        Assert.Null(DataAgent.ParseQueryResult("x", """{"error":"falló"}"""));
    }

    [Fact]
    public void DescribeForModel_recorta_las_filas_que_ve_el_modelo()
    {
        var rows = Enumerable.Range(1, 250).Select(i => (IReadOnlyList<JsonElement>)[J(i.ToString())]).ToList();
        var text = DataAgent.DescribeForModel(3, new QueryResult("SELECT", ["N"], rows, 250));
        using var doc = JsonDocument.Parse(text);
        Assert.Equal(3, doc.RootElement.GetProperty("consulta").GetInt32());
        Assert.Equal(DataAgent.ModelRowSample, doc.RootElement.GetProperty("rows").GetArrayLength());
        Assert.Contains("250", doc.RootElement.GetProperty("nota").GetString());
    }

    [Fact]
    public void ParseAnswer_lee_respuesta_consulta_principal_y_grafica()
    {
        var (answer, index, chart, askChart, openReport) = DataAgent.ParseAnswer("""{"answer":"Centro lidera.","resultQuery":2,"chart":{"type":"bar","x":"Sucursal","y":["Monto"]},"askChart":false,"openReport":true}""");
        Assert.Equal("Centro lidera.", answer);
        Assert.Equal(2, index);
        Assert.Equal(new ChartHint("bar", "Sucursal", ["Monto"]).Type, chart!.Type);
        Assert.Equal(["Monto"], chart.Y);
        Assert.False(askChart);
        Assert.True(openReport);

        var ask = DataAgent.ParseAnswer("""{"answer":"¿Barras o pastel?","resultQuery":1,"chart":{"type":"bar","x":"A","y":["B"]},"askChart":true}""");
        Assert.True(ask.AskChart);
        Assert.False(ask.OpenReport);

        var none = DataAgent.ParseAnswer("""{"answer":"Sin datos.","resultQuery":0,"chart":{"type":"none","x":"","y":[]}}""");
        Assert.Null(none.Chart);

        var plain = DataAgent.ParseAnswer("Texto libre sin JSON");
        Assert.Equal("Texto libre sin JSON", plain.Answer);
        Assert.Equal(0, plain.ResultQuery);
    }

    [Fact]
    public void BuildMessages_incluye_historial_compacto_y_fecha_en_el_ultimo_mensaje()
    {
        var turns = Enumerable.Range(1, 12).Select(i =>
            new ConversationTurn($"p{i}", $"r{i}", [$"SELECT {i}"], ["A"], [], DateTimeOffset.UnixEpoch)).ToList();
        var conv = new ConversationDoc("c1", "claude-opus-5-5", turns, DateTimeOffset.UnixEpoch);
        var messages = DataAgent.BuildMessages(conv, "nueva", new DateTimeOffset(2026, 10, 9, 8, 0, 0, TimeSpan.Zero));

        Assert.Equal(DataAgent.HistoryTurns * 2 + 1, messages.Count);
        var json = JsonSerializer.Serialize(messages);
        Assert.Contains("p5", json);          // conserva los últimos 8 turnos (5..12)
        Assert.DoesNotContain("\"p4\"", json);
        Assert.Contains("SELECT 12", json);
        Assert.Contains("Fecha de hoy: 2026-10-09", JsonSerializer.Serialize(messages[^1]));
    }

    [Fact]
    public void ModelCatalog_valida_modelo_esfuerzo_y_fallback()
    {
        var catalog = new ModelCatalog(MsOptions.Create(new AnthropicOptions()));
        var opus = catalog.Resolve(null, null);
        Assert.Equal("claude-opus-5-5", opus.Model);
        Assert.Equal("high", opus.Effort);
        Assert.Equal("claude-opus-4-8", opus.Fallback);
        Assert.Null(catalog.Resolve("claude-haiku-5-5", "low").Fallback);
        Assert.Throws<ApiException>(() => catalog.Resolve("gpt-4", null));
        Assert.Throws<ApiException>(() => catalog.Resolve("claude-opus-5-5", "turbo"));
        Assert.Throws<ApiException>(() => catalog.ResolveIterations(99));

        var sinFallback = new ModelCatalog(MsOptions.Create(new AnthropicOptions { ServerFallbacks = false }));
        Assert.Null(sinFallback.Resolve("claude-opus-5-5", null).Fallback);
    }

    [Fact]
    public async Task PhaseTracker_traduce_herramientas_a_fases_sin_repetir_consecutivas()
    {
        var phases = new List<string>();
        var tracker = new PhaseTracker(e => { phases.Add(JsonSerializer.SerializeToElement(e.Data).GetProperty("phase").GetString()!); return ValueTask.CompletedTask; });
        await tracker.SetAsync("interpret", "Interpretando");
        foreach (var (type, tool) in new[]
        {
            ("tool_use_start", "schema_search"), ("tool_use_start", "schema_describe"), ("text", ""),
            ("tool_use_start", "execute_query"), ("tool_call", "execute_query"), ("tool_result", "execute_query"),
            ("tool_use_start", "schema_checks"),
        })
            await tracker.OnEventAsync(new AgentEvent(type, new { tool }));
        Assert.Equal(["interpret", "schema", "sql", "execute", "process", "schema"], phases);
    }
}

public class PgConnectionTests
{
    [Fact]
    public void Normalize_fuerza_ssl_salvo_que_la_url_lo_indique()
    {
        Assert.Contains("SSL Mode=Require", Storage.PgConnection.Normalize("postgresql://u:p@host/db"));
        Assert.Contains("SSL Mode=Disable", Storage.PgConnection.Normalize("postgresql://u@localhost:5433/db?sslmode=disable"));
        Assert.Equal("Host=h;Database=d", Storage.PgConnection.Normalize("Host=h;Database=d"));
    }
}
