using System.Net.Http.Json;

namespace EssenceWiki.Data;

public sealed class WikiService(HttpClient http)
{
    Task? loading;

    public Wiki Wiki { get; private set; } = new();
    public bool Ready { get; private set; }
    public Release Release => Wiki.Release;

    public Task EnsureLoadedAsync() => loading ??= LoadAsync();

    async Task LoadAsync()
    {
        Wiki = await http.GetFromJsonAsync<Wiki>("data/wiki.json") ?? new();
        foreach (var c in Wiki.Categories)
            foreach (var e in c.Entries)
                e.Category = c;
        Ready = true;
    }

    public IEnumerable<IGrouping<string, Category>> Groups => Wiki.Categories.GroupBy(c => c.Group);

    public IEnumerable<Entry> AllEntries => Wiki.Categories.SelectMany(c => c.Entries);

    public Category? FindCategory(string slug) => Wiki.Categories.FirstOrDefault(c => c.Slug == slug);

    public List<Entry> Search(string query, int max)
    {
        var q = query.Trim();
        return AllEntries
            .Where(e => e.Name.Contains(q, StringComparison.OrdinalIgnoreCase) || e.Summary.Contains(q, StringComparison.OrdinalIgnoreCase))
            .OrderBy(e => !e.Name.StartsWith(q, StringComparison.OrdinalIgnoreCase))
            .Take(max)
            .ToList();
    }
}
