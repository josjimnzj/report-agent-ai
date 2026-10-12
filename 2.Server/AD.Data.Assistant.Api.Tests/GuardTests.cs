using System.Text.Json;
using AD.Data.Assistant.Api.Agent;
using AD.Data.Assistant.Api.Options;

namespace AD.Data.Assistant.Api.Tests;

public class GuardTests
{
    private static readonly BusinessDictionary Dict = BusinessDictionary.Parse(JsonDocument.Parse("""
    {
      "tables": [
        { "schema": "dbo", "name": "AD_Case", "aliases": ["trámites", "casos"], "description": "Casos y ventas.",
          "columns": [
            { "name": "EstimatedAmount", "aliases": ["monto", "importe"], "description": "Monto estimado." },
            { "name": "CaseTypeId", "aliases": [], "description": "Tipo de trámite." }
          ] },
        { "schema": "dbo", "name": "AD_Account", "aliases": ["clientes"],
          "columns": [ { "name": "OwnerId", "aliases": ["ejecutivo asignado"] } ] },
        { "schema": "dbo", "name": "AD_Lead", "aliases": [],
          "columns": [ { "name": "OwnerId", "aliases": ["ejecutivo asignado"] }, { "name": "OwnerId", "aliases": ["dueño"] } ] }
      ]
    }
    """).RootElement);

    private static TechnicalTermGuard.Context Ctx(string sql = "", params string[] columns) => new(Dict, [sql], columns);

    [Fact]
    public void Diccionario_lee_tablas_columnas_y_alias_mas_frecuente()
    {
        Assert.Equal("trámites", Dict.Find("AD_Case")!.Alias);
        Assert.Equal("trámites", Dict.Find("dbo.AD_Case")!.Alias);
        Assert.Equal("monto", Dict.Find("estimatedamount")!.Alias);
        Assert.Null(Dict.Find("CaseTypeId")!.Alias);
        Assert.Equal("Tipo de trámite.", Dict.Find("CaseTypeId")!.Description);
        Assert.Equal("ejecutivo asignado", Dict.Find("OwnerId")!.Alias);
    }

    [Fact]
    public void Find_detecta_tablas_columnas_y_esquemas_pero_no_palabras_ni_marcas()
    {
        var text = "Según AD_Case y [dbo].[AD_Account], el EstimatedAmount total de AddACCION en DevExtreme fue $1,200 por CaseTypeId.";
        Assert.Equal(["AD_Case", "[dbo].[AD_Account]", "EstimatedAmount", "CaseTypeId"], TechnicalTermGuard.Find(text, Ctx()));
        Assert.Empty(TechnicalTermGuard.Find("Las ventas de septiembre suman $1,234,567 (12.5 % más que agosto).", Ctx()));
    }

    [Fact]
    public void Find_usa_el_sql_ejecutado_y_respeta_los_alias_del_resultado()
    {
        var ctx = Ctx("SELECT B.BranchName AS Sucursal, SUM(C.EstimatedAmount) AS MontoTotal FROM AD_Case C", "Sucursal", "MontoTotal");
        Assert.Equal(["BranchName"], TechnicalTermGuard.Find("La BranchName con mayor MontoTotal es Centro.", ctx));
    }

    [Fact]
    public void Literales_del_sql_y_valores_del_resultado_no_son_nombres_tecnicos()
    {
        var rows = new List<IReadOnlyList<JsonElement>> { new[] { JsonDocument.Parse("\"PLAN_ORO\"").RootElement } };
        var ctx = new TechnicalTermGuard.Context(Dict, ["SELECT P.ProductName FROM AD_Case WHERE B.BranchName = 'CentroNorte'"], ["Producto"], rows);
        Assert.Empty(TechnicalTermGuard.Find("En CentroNorte el producto PLAN_ORO lidera.", ctx));
        Assert.Equal(["ProductName"], TechnicalTermGuard.Find("Por ProductName, PLAN_ORO lidera.", ctx));
    }

    [Fact]
    public void Scrub_sustituye_por_alias_o_por_el_nombre_en_palabras()
    {
        var ctx = Ctx("SELECT BranchName FROM ST_T_Branch");
        Assert.Equal("El monto de trámites por branch name en branch.",
            TechnicalTermGuard.Scrub("El EstimatedAmount de dbo.AD_Case por BranchName en ST_T_Branch.", ctx));
        Assert.Equal("case type", TechnicalTermGuard.BusinessName("CaseTypeId", Dict));
    }

    [Fact]
    public void Scrub_cubre_answer_insights_y_etiquetas_de_referencia()
    {
        var parts = new AnswerParts("Total EstimatedAmount: $10.", 1,
            new ChartHint("bar", "Mes", ["Monto"], [], [new ChartRefLine("average", "Monto", null, "Promedio de EstimatedAmount")]),
            false, false, Insights: [new Insight("finding", "Lidera AD_Case", "El OwnerId 7 concentra todo.")]);
        var clean = TechnicalTermGuard.Scrub(parts, Ctx());
        Assert.Equal("Total monto: $10.", clean.Answer);
        Assert.Equal("Lidera trámites", clean.Insights![0].Title);
        Assert.Equal("El ejecutivo asignado 7 concentra todo.", clean.Insights[0].Text);
        Assert.Equal("Promedio de monto", clean.Chart!.RefLines![0].Label);
        Assert.Empty(TechnicalTermGuard.Find(clean, Ctx()));
    }

    [Fact]
    public void ApplyRewrite_reemplaza_por_posicion_y_conserva_lo_que_falta()
    {
        var parts = new AnswerParts("Usa AD_Case.", 1, new ChartHint("bar", "Mes", ["Monto"], [], [new ChartRefLine("value", "Monto", 5, "Meta EstimatedAmount")]),
            false, false, Insights: [new Insight("finding", "A", "uno"), new Insight("alert", "B", "dos")]);
        var r = DataAgent.ApplyRewrite(parts, """{"answer":"Usa los trámites.","insights":[{"title":"A1","text":"uno bis"}],"refLabels":["Meta de monto"]}""");
        Assert.Equal("Usa los trámites.", r.Answer);
        Assert.Equal(["A1", "B"], r.Insights!.Select(i => i.Title));
        Assert.Equal("alert", r.Insights[1].Kind);
        Assert.Equal("Meta de monto", r.Chart!.RefLines![0].Label);
        Assert.Same(parts, DataAgent.ApplyRewrite(parts, "no es json"));
    }

    [Fact]
    public void Grafo_del_repositorio_se_carga_desde_la_ruta_del_mcp()
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (root is not null && !Directory.Exists(Path.Combine(root.FullName, "3.Mcp"))) root = root.Parent;
        Assert.NotNull(root);
        var mcp = Path.Combine(root!.FullName, "3.Mcp", "addaccion-mcp-sql");
        var path = BusinessDictionary.ResolvePath(new SqlMcpOptions { Script = Path.Combine(mcp, "dist", "index.js") });
        Assert.Equal(Path.Combine(mcp, "data", "schema-graph.addaccion.json"), path);

        var dict = BusinessDictionary.Parse(JsonDocument.Parse(File.ReadAllText(path)).RootElement);
        Assert.True(dict.Count > 1000);
        Assert.Equal("cliente", dict.Find("AccountId")!.Alias);
        Assert.Equal(["AD_Account", "AccountId"], TechnicalTermGuard.Find("Los AD_Account con AccountId duplicado.", new(dict, [], [])));
    }
}
