using System.Text.Json;
using AD.Data.Assistant.Api.Options;
using AD.Data.Assistant.Api.Storage;
using Microsoft.Extensions.Logging.Abstractions;
using MsOptions = Microsoft.Extensions.Options.Options;

namespace AD.Data.Assistant.Api.Tests;

public class DocumentStoreTests
{
    private static JsonElement J(string json) => JsonDocument.Parse(json).RootElement.Clone();

    public static IEnumerable<object[]> Stores()
    {
        yield return [new MemoryDocumentStore()];
        // Postgres real solo si se indica (p. ej. ADA_TEST_PG="Host=localhost;Port=5433;Username=postgres;Database=ada_test").
        if (Environment.GetEnvironmentVariable("ADA_TEST_PG") is { Length: > 0 } cs)
            yield return [new PgDocumentStore(MsOptions.Create(new StorageOptions { ConnectionString = cs, Owner = $"test-{Guid.NewGuid():N}" }), NullLogger<PgDocumentStore>.Instance)];
    }

    [Theory]
    [MemberData(nameof(Stores))]
    public async Task Guarda_lista_ordenada_actualiza_y_borra(IDocumentStore store)
    {
        var ct = CancellationToken.None;
        await store.InitializeAsync(ct);
        await store.PutAsync("chats", "a", J("""{"id":"a","title":"Uno"}"""), ct);
        await store.PutAsync("chats", "b", J("""{"id":"b","title":"Dos"}"""), ct);
        await store.PutAsync("reports", "r", J("""{"id":"r"}"""), ct);
        await Task.Delay(20);
        await store.PutAsync("chats", "a", J("""{"id":"a","title":"Uno editado","tags":["Ventas"]}"""), ct);

        var chats = await store.ListAsync("chats", 10, ct);
        Assert.Equal(["a", "b"], chats.Select(c => c.GetProperty("id").GetString()));
        Assert.Equal("Uno editado", chats[0].GetProperty("title").GetString());
        Assert.Equal("Ventas", (await store.GetAsync("chats", "a", ct))!.Value.GetProperty("tags")[0].GetString());
        Assert.Single(await store.ListAsync("reports", 10, ct));

        Assert.True(await store.DeleteAsync("chats", "b", ct));
        Assert.False(await store.DeleteAsync("chats", "b", ct));
        Assert.Null(await store.GetAsync("chats", "b", ct));
    }
}
