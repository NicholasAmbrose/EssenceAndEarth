using System.Text.Json.Serialization;

namespace EssenceWiki.Data;

// Mirrors wwwroot/data/wiki.json, which tools/wiki.mjs writes.

public sealed class Wiki
{
    public string Name { get; set; } = "";
    public Release Release { get; set; } = new();
    public Stats Stats { get; set; } = new();
    public List<Category> Categories { get; set; } = new();
    public List<Recipe> Recipes { get; set; } = new();
    public List<GalleryGroup> Gallery { get; set; } = new();
}

public sealed class Release
{
    public string Version { get; set; } = "";
    public string File { get; set; } = "";
    public string MinBedrock { get; set; } = "";
    public string Download { get; set; } = "";
    public string Repo { get; set; } = "";
}

public sealed class Stats
{
    public int Crops { get; set; }
    public int Tiers { get; set; }
    public int Items { get; set; }
    public int Recipes { get; set; }
}

public sealed class Category
{
    public string Slug { get; set; } = "";
    public string Title { get; set; } = "";
    public string Group { get; set; } = "";
    public string Icon { get; set; } = "";
    public string Blurb { get; set; } = "";
    public List<Entry> Entries { get; set; } = new();
}

public sealed class Entry
{
    public string Slug { get; set; } = "";
    public string Name { get; set; } = "";
    public string Icon { get; set; } = "";
    public string Summary { get; set; } = "";
    public string Href { get; set; } = "";
    public List<Block> Blocks { get; set; } = new();
    [JsonIgnore] public Category Category { get; set; } = null!;
}

/// <summary>One piece of an entry page; <see cref="T"/> says which fields are set.</summary>
public sealed class Block
{
    public string T { get; set; } = "";                // h2, p, facts, items, grid
    public string? Text { get; set; }                   // h2
    public string? Html { get; set; }                   // p
    public List<List<string>>? Facts { get; set; }      // facts: [label, value] rows
    public List<Item>? Items { get; set; }              // items
    public Item? Result { get; set; }                   // grid
    public List<List<Item?>>? Rows { get; set; }        // grid: 3x3
    public string? Note { get; set; }                   // grid
}

public sealed class Item
{
    public string Name { get; set; } = "";
    public string Icon { get; set; } = "";
    public string? Href { get; set; }
    public string? Sub { get; set; }
    public int Count { get; set; }
}

public sealed class Recipe
{
    public Item Result { get; set; } = new();
    public List<List<Item?>> Rows { get; set; } = new();
    public string? Note { get; set; }
}

public sealed class GalleryGroup
{
    public string Title { get; set; } = "";
    public List<Item> Items { get; set; } = new();
}
