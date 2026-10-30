// Builds the add-on: copies packs/ into build/, generates every tier, crop, recipe, loot table and
// texture from crops.json, zips dist/<Name>_v<version>.mcaddon.
// --deploy also copies the packs into Minecraft's development pack folders.
// A PNG in art/ (e.g. art/textures/items/iron_seeds.png) replaces the generated placeholder.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "crops.json"), "utf8"));
const NS = cfg.namespace;
const FMT = "1.21.90";
const SLUG = cfg.name.replaceAll("&", "And").replace(/\W/g, "");
const BUILD = path.join(ROOT, "build");
const BP = path.join(BUILD, `${SLUG}_BP`);
const RP = path.join(BUILD, `${SLUG}_RP`);

const title = (id) => id.replace(/(^|_)(\w)/g, (_, sep, c) => (sep ? " " : "") + c.toUpperCase());

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2));
}

// ---------- textures ----------
// 16x16 masks. a/b/c/d = light/base/dark/darker of the tint colour, g/G = stem greens, s = stone.

const ESSENCE = [
  "................",
  "................",
  ".......cc.......",
  "......cabc......",
  ".....cabbbc.....",
  "....cabbbbbc....",
  "....cabbbbbc....",
  "...cabbbbbbbc...",
  "...cbbbbbbbbc...",
  "...cbbbbbbbdc...",
  "...cbbbbbbbdc...",
  "....cbbbbbdc....",
  ".....cbbddc.....",
  "......cccc......",
  "................",
  "................",
];

const SEEDS = [
  "................",
  "................",
  "................",
  "................",
  ".....ab.........",
  "....abbc...ab...",
  "....bbcc..abbc..",
  ".....cc...bbcc..",
  "...........cc...",
  "......ab........",
  ".....abbc.......",
  ".....bbcc.......",
  "......cc........",
  "................",
  "................",
  "................",
];

const ORE = [
  "ssssssssssssssss",
  "sssabsssssssssss",
  "ssabbcssssssabss",
  "sssbccsssssabbcs",
  "ssssssssssssbccs",
  "sssssssabsssssss",
  "ssssssabbcssssss",
  "sssssssbccssssss",
  "ssabssssssssssss",
  "sabbcsssssssabss",
  "ssbccssssssabbcs",
  "sssssssssssbbccs",
  "ssssssabssssccss",
  "sssssabbcsssssss",
  "ssssssbccsssssss",
  "ssssssssssssssss",
];

const blank = (n) => Array(n).fill("................");
const STAGES = [
  [
    ...blank(12),
    "..g....g....g...",
    "..gg..gG...gG...",
    "...G...G...G....",
    "...G...G...G....",
  ],
  [
    ...blank(8),
    ".g.........g....",
    ".gg...g...gg....",
    "..G..gg....G..g.",
    "..G...G...gG.gg.",
    "..gg..Gg..G...G.",
    "...G..G...G..gG.",
    "...G..G...G...G.",
    "...G..G...G...G.",
  ],
  [
    ...blank(4),
    "..g.......g.....",
    ".gg...g...gg....",
    "..G..gg....G..g.",
    "..Gg..G...gG.gg.",
    ".gG...Gg..G...G.",
    "..G..gG...Gg.gG.",
    "..gg..G..gG...G.",
    "...G..Gg..G..gG.",
    "..gG..G...Gg..G.",
    "...G.gG...G..gG.",
    "...G..G...G...G.",
    "...G..G...G...G.",
  ],
  [
    ".ab.......ab....",
    "abbc..ab.abbc.ab",
    ".bcc.abbc.bcc.bb",
    "..g...bcc..g..cc",
    "..g....g...g..g.",
    ".gg...gg..gg..g.",
    "..G..gg....G..g.",
    "..Gg..G...gG.gg.",
    ".gG...Gg..G...G.",
    "..G..gG...Gg.gG.",
    "..gg..G..gG...G.",
    "...G..Gg..G..gG.",
    "..gG..G...Gg..G.",
    "...G.gG...G..gG.",
    "...G..G...G...G.",
    "...G..G...G...G.",
  ],
];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const shade = (rgb, f) => rgb.map((v) => Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)));
function palette(color) {
  const c = hex(color);
  return { a: shade(c, 0.4), b: c, c: shade(c, -0.35), d: shade(c, -0.55), g: hex("#5aa83a"), G: hex("#3d7a28") };
}

function render(mask, pal) {
  if (mask.length !== 16) throw new Error(`mask is ${mask.length} rows tall`);
  const px = Buffer.alloc(16 * 16 * 4);
  mask.forEach((row, y) => {
    if (row.length !== 16) throw new Error(`mask row ${y} is ${row.length} wide: ${row}`);
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      const v = 105 + (((x * 31 + y * 17) * 2654435761) >>> 0) % 40;
      px.set([...(ch === "s" ? [v, v, v] : pal[ch]), 255], (y * 16 + x) * 4);
    });
  });
  return px;
}

function scale(px, k) {
  const w = 16 * k, out = Buffer.alloc(px.length * k * k);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const src = (((y / k) | 0) * 16 + ((x / k) | 0)) * 4;
      px.copy(out, (y * w + x) * 4, src, src + 4);
    }
  return out;
}

function png(w, px) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(w, 4);
  ihdr.set([8, 6], 8); // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * w);
  for (let y = 0; y < w; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function texture(rel, mask, pal) {
  const art = path.join(ROOT, "art", `${rel}.png`);
  write(path.join(RP, `${rel}.png`), fs.existsSync(art) ? fs.readFileSync(art) : png(16, render(mask, pal)));
}

// ---------- zip ----------

function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const n = Buffer.from(name), z = zlib.deflateRawSync(data), crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(33, 12); // 1980-01-01, the earliest valid DOS date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(z.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(33, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(z.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(n.length, 28);
    dir.writeUInt32LE(offset, 42);
    parts.push(local, n, z);
    central.push(dir, n);
    offset += 30 + n.length + z.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

// ---------- pack content ----------

fs.rmSync(BUILD, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, "packs", "BP"), BP, { recursive: true });
fs.cpSync(path.join(ROOT, "packs", "RP"), RP, { recursive: true });

for (const dir of [BP, RP]) {
  const file = path.join(dir, "manifest.json");
  const m = JSON.parse(fs.readFileSync(file, "utf8"));
  m.header.name = `${cfg.name} ${dir === BP ? "BP" : "RP"}`;
  m.header.version = cfg.version;
  m.modules.forEach((mod) => (mod.version = cfg.version));
  m.dependencies?.forEach((dep) => dep.uuid && (dep.version = cfg.version));
  write(file, m);
}
for (const file of fs.readdirSync(path.join(BP, "scripts"), { recursive: true })) {
  const f = path.join(BP, "scripts", file);
  if (f.endsWith(".js")) write(f, fs.readFileSync(f, "utf8").replaceAll("__NS__", NS));
}

const terrain = {}, itemTextures = {}, sounds = {};

function item(id, mask, pal, components = {}) {
  texture(`textures/items/${id}`, mask, pal);
  itemTextures[`${NS}_${id}`] = { textures: `textures/items/${id}` };
  write(path.join(BP, "items", `${id}.json`), {
    format_version: FMT,
    "minecraft:item": {
      description: { identifier: `${NS}:${id}`, menu_category: { category: "items" } },
      components: { "minecraft:icon": `${NS}_${id}`, "minecraft:display_name": { value: title(id) }, ...components },
    },
  });
}

function blockTexture(id, mask, pal) {
  texture(`textures/blocks/${id}`, mask, pal);
  terrain[`${NS}_${id}`] = { textures: `textures/blocks/${id}` };
}

function block(id, sound, description, components, permutations) {
  sounds[`${NS}:${id}`] = { sound };
  write(path.join(BP, "blocks", `${id}.json`), {
    format_version: FMT,
    "minecraft:block": { description: { identifier: `${NS}:${id}`, ...description }, components, permutations },
  });
}

function loot(id, pools) {
  write(path.join(BP, "loot_tables", "blocks", `${id}.json`), { pools });
  return `loot_tables/blocks/${id}.json`;
}

const drop = (name, min = 1, max = min, chance) => ({
  rolls: 1,
  ...(chance && { conditions: [{ condition: "random_chance", chance }] }),
  entries: [{ type: "item", name, weight: 1, ...(max > 1 && { functions: [{ function: "set_count", count: { min, max } }] }) }],
});

function recipe(id, type, body, unlock) {
  write(path.join(BP, "recipes", `${id}.json`), {
    format_version: "1.20.10",
    [`minecraft:recipe_${type}`]: { description: { identifier: `${NS}:${id}` }, tags: ["crafting_table"], unlock: [{ item: unlock }], ...body },
  });
}

// Essence tiers: 4 of the previous tier make 1 of the next.
const tierEssence = (n) => `${NS}:${cfg.tiers[n - 1].id}_essence`;
cfg.tiers.forEach((t, i) => {
  item(`${t.id}_essence`, ESSENCE, palette(t.color));
  if (i > 0)
    recipe(`${t.id}_essence`, "shapeless", { ingredients: [{ item: tierEssence(i), count: 4 }], result: { item: tierEssence(i + 1) } }, tierEssence(i));
});

// Essence ore: the only source of tier-1 essence.
blockTexture("essence_ore", ORE, palette(cfg.tiers[0].color));
block("essence_ore", "stone", { menu_category: { category: "nature" } }, {
  "minecraft:display_name": "Essence Ore",
  "minecraft:destructible_by_mining": { seconds_to_destroy: 3 },
  "minecraft:material_instances": { "*": { texture: `${NS}_essence_ore` } },
  "minecraft:loot": loot("essence_ore", [drop(tierEssence(1), 1, 3)]),
});
write(path.join(BP, "features", "essence_ore_feature.json"), {
  format_version: "1.13.0",
  "minecraft:ore_feature": {
    description: { identifier: `${NS}:essence_ore_feature` },
    count: 6,
    replace_rules: [{ places_block: `${NS}:essence_ore`, may_replace: ["minecraft:stone", "minecraft:deepslate", "minecraft:granite", "minecraft:diorite", "minecraft:andesite", "minecraft:tuff"] }],
  },
});
write(path.join(BP, "feature_rules", "essence_ore_rule.json"), {
  format_version: "1.13.0",
  "minecraft:feature_rules": {
    description: { identifier: `${NS}:essence_ore_rule`, places_feature: `${NS}:essence_ore_feature` },
    conditions: { placement_pass: "underground_pass", "minecraft:biome_filter": [{ test: "has_biome_tag", operator: "==", value: "overworld" }] },
    distribution: {
      iterations: 8,
      coordinate_eval_order: "zyx",
      x: { distribution: "uniform", extent: [0, 16] },
      y: { distribution: "uniform", extent: [-48, 48] },
      z: { distribution: "uniform", extent: [0, 16] },
    },
  },
});

// Crops. Stages 0-2 share green textures; the ripe stage is tinted per crop.
[0, 1, 2].forEach((s) => blockTexture(`crop_${s}`, STAGES[s], palette("#000000")));
const cropMaterial = (tex) => ({ "*": { texture: `${NS}_${tex}`, render_method: "alpha_test", ambient_occlusion: false, face_dimming: false } });

for (const c of cfg.crops) {
  const pal = palette(c.color);
  const seeds = `${NS}:${c.id}_seeds`, essence = `${NS}:${c.id}_essence`, growth = `${NS}:growth`;
  blockTexture(`${c.id}_crop`, STAGES[3], pal);

  block(
    `${c.id}_crop`,
    "grass",
    { menu_category: { category: "none" }, states: { [growth]: [0, 1, 2, 3] } },
    {
      "minecraft:geometry": `geometry.${NS}_crop`,
      "minecraft:material_instances": cropMaterial("crop_0"),
      "minecraft:collision_box": false,
      "minecraft:selection_box": { origin: [-8, 0, -8], size: [16, 6, 16] },
      "minecraft:destructible_by_mining": { seconds_to_destroy: 0 },
      "minecraft:light_dampening": 0,
      // Also pops the crop when the farmland under it is broken or trampled.
      "minecraft:placement_filter": { conditions: [{ allowed_faces: ["up"], block_filter: ["minecraft:farmland"] }] },
      "minecraft:loot": loot(`${c.id}_crop`, [drop(seeds)]),
      [`${NS}:crop`]: {},
    },
    [1, 2, 3].map((s) => ({
      condition: `q.block_state('${growth}') == ${s}`,
      components: {
        "minecraft:material_instances": cropMaterial(s < 3 ? `crop_${s}` : `${c.id}_crop`),
        ...(s === 3 && { "minecraft:loot": loot(`${c.id}_crop_ripe`, [drop(essence, 1, 2), drop(seeds), drop(seeds, 1, 1, 0.1)]) }),
      },
    })),
  );

  item(`${c.id}_seeds`, SEEDS, pal, { "minecraft:block_placer": { block: `${NS}:${c.id}_crop`, use_on: ["minecraft:farmland"] } });
  item(`${c.id}_essence`, ESSENCE, pal);

  recipe(`${c.id}_seeds`, "shaped", {
    pattern: ["ERE", "RSR", "ERE"],
    key: { E: { item: tierEssence(c.tier) }, R: { item: c.ingredient }, S: { item: "minecraft:wheat_seeds" } },
    result: { item: seeds },
  }, tierEssence(c.tier));
  recipe(`${c.id}_from_essence`, "shaped", {
    pattern: ["EEE", "E E", "EEE"],
    key: { E: { item: essence } },
    result: { item: c.output, count: c.count },
  }, essence);
}

// Crop geometry: four planes in a # shape, like vanilla wheat.
const plane = (origin, size, faces) => ({ origin, size, uv: Object.fromEntries(faces.map((f) => [f, { uv: [0, 0], uv_size: [16, 16] }])) });
write(path.join(RP, "models", "blocks", "crop.geo.json"), {
  format_version: "1.21.0",
  "minecraft:geometry": [{
    description: { identifier: `geometry.${NS}_crop`, texture_width: 16, texture_height: 16 },
    bones: [{
      name: "crop",
      pivot: [0, 0, 0],
      cubes: [
        plane([-8, 0, -4], [16, 16, 0], ["north", "south"]),
        plane([-8, 0, 4], [16, 16, 0], ["north", "south"]),
        plane([-4, 0, -8], [0, 16, 16], ["east", "west"]),
        plane([4, 0, -8], [0, 16, 16], ["east", "west"]),
      ],
    }],
  }],
});

write(path.join(RP, "textures", "terrain_texture.json"), { resource_pack_name: NS, texture_name: "atlas.terrain", padding: 8, num_mip_levels: 4, texture_data: terrain });
write(path.join(RP, "textures", "item_texture.json"), { resource_pack_name: NS, texture_name: "atlas.items", texture_data: itemTextures });
write(path.join(RP, "blocks.json"), { format_version: [1, 1, 0], ...sounds });

const icon = png(128, scale(render(ESSENCE, palette(cfg.tiers[0].color)), 8));
write(path.join(BP, "pack_icon.png"), icon);
write(path.join(RP, "pack_icon.png"), icon);

// ---------- package ----------

const files = fs.readdirSync(BUILD, { recursive: true })
  .filter((f) => fs.statSync(path.join(BUILD, f)).isFile())
  .map((f) => ({ name: f.replaceAll("\\", "/"), data: fs.readFileSync(path.join(BUILD, f)) }));
const out = path.join(ROOT, "dist", `${SLUG}_v${cfg.version.join(".")}.mcaddon`);
write(out, zip(files));
console.log(`built ${path.relative(ROOT, out)} (${files.length} files)`);

if (process.argv.includes("--deploy")) {
  const mojang = [
    path.join(process.env.APPDATA ?? "", "Minecraft Bedrock", "Users", "Shared", "games", "com.mojang"),
    path.join(process.env.LOCALAPPDATA ?? "", "Packages", "Microsoft.MinecraftUWP_8wekyb3d8bbwe", "LocalState", "games", "com.mojang"),
  ].find((p) => fs.existsSync(p));
  if (!mojang) throw new Error("Couldn't find Minecraft's com.mojang folder");
  for (const [dir, kind] of [[BP, "behavior"], [RP, "resource"]]) {
    const dest = path.join(mojang, `development_${kind}_packs`, path.basename(dir));
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(dir, dest, { recursive: true });
  }
  console.log(`deployed to ${mojang}`);
}
