// Builds the add-on: copies packs/ into build/, generates every tier, crop, recipe, loot table and
// texture from crops.json, zips addon/<Name>_v<version>.mcaddon (replacing older versions there).
// --deploy also copies the packs into Minecraft's development pack folders.
// A PNG in art/ (e.g. art/textures/items/iron_seeds.png) replaces the generated placeholder.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "crops.json"), "utf8"));
const RECIPES = JSON.parse(fs.readFileSync(path.join(ROOT, "recipes.json"), "utf8"));
const NS = cfg.namespace;
const FMT = "1.21.90";
const SLUG = cfg.name.replaceAll("&", "And").replace(/\W/g, "");
const BUILD = path.join(ROOT, "build");
const BP = path.join(BUILD, `${SLUG}_BP`);
const RP = path.join(BUILD, `${SLUG}_RP`);

// Catch crops.json mistakes here instead of as silent failures in-game.
const problems = [];
const seen = new Set();
for (const c of cfg.crops) {
  if (seen.has(c.id)) problems.push(`duplicate crop id "${c.id}"`);
  seen.add(c.id);
  if (!/^[a-z0-9_]+$/.test(c.id)) problems.push(`${c.id}: id must be lowercase letters, digits and _`);
  if (!(c.tier >= 1 && c.tier <= cfg.tiers.length)) problems.push(`${c.id}: tier must be 1-${cfg.tiers.length}`);
  if (!/^#[0-9a-f]{6}$/i.test(c.color)) problems.push(`${c.id}: color must look like #a1b2c3`);
  if (!/^[a-z0-9_]+:[a-z0-9_.]+$/.test(c.ingredient ?? "")) problems.push(`${c.id}: ingredient must be an item id like minecraft:iron_ingot`);
  if (c.essenceColor && !/^#[0-9a-f]{6}$/i.test(c.essenceColor)) problems.push(`${c.id}: essenceColor must look like #a1b2c3`);
  if (c.face && !(c.face.length === 8 && c.face.every((r) => r.length === 8) && [...c.face.join("")].every((ch) => ch === "." || c.faceColors?.[ch]))) problems.push(`${c.id}: face must be 8 rows of 8, using . or a faceColors key`);
  if (c.essenceCrop && !cfg.tiers.some((t) => t.id === c.id)) problems.push(`${c.id}: an essenceCrop's id must match a tier, because it drops that tier's essence`);
}
// Every recipe needs a crop's essence, and two recipes with the same grid would hide each other.
const recipeGrid = (r) => (r.pattern ? r.pattern.map((row) => [...row].map((ch) => r.key[ch] ?? "-").join(",")).join("/") : [...r.ingredients].sort().join("+"));
const grids = new Set();
for (const r of RECIPES) {
  const parts = r.ingredients ?? Object.values(r.key);
  for (const id of parts) if (id.startsWith(`${NS}:`) && id.endsWith("_essence") && !seen.has(id.slice(NS.length + 1, -8))) problems.push(`recipe for ${r.result}: no crop for ${id}`);
  if (!parts.some((id) => id.endsWith("_essence"))) problems.push(`recipe for ${r.result}: uses no essence`);
  if (r.pattern && [...r.pattern.join("")].some((ch) => ch !== " " && !r.key[ch])) problems.push(`recipe for ${r.result}: pattern letter missing from key`);
  if (!(Number.isInteger(r.count) && r.count >= 1 && r.count <= 64)) problems.push(`recipe for ${r.result}: count must be 1-64`);
  if (grids.has(recipeGrid(r))) problems.push(`recipe for ${r.result}: another recipe has the same grid`);
  grids.add(recipeGrid(r));
}
const BAL = cfg.balance;
for (const k of ["grassEssenceChance", "cropEssenceChance", "logEssenceChance", "mobEssenceChance", "fertilizedEssenceChance", "secondaryChance", "matchingFarmlandChance", "farmlandRefundChance"])
  if (!(BAL[k] >= 0 && BAL[k] <= 1)) problems.push(`balance.${k} must be 0-1`);
if (!(BAL.growChance > 0 && BAL.growChance <= 1)) problems.push("balance.growChance must be above 0, up to 1");
for (const k of ["harvestEssence", "oreEssence", "vitaShards"]) {
  const [min, max] = BAL[k] ?? [];
  if (!(Number.isInteger(min) && Number.isInteger(max) && min >= 1 && min <= max)) problems.push(`balance.${k} must be [min, max], whole numbers from 1`);
}
if (BAL.terraCropYield?.length !== cfg.tiers.length || !BAL.terraCropYield.every((v) => v >= 1)) problems.push(`balance.terraCropYield needs ${cfg.tiers.length} values, each from 1`);
if (BAL.acceleratorRange?.length !== cfg.tiers.length || !BAL.acceleratorRange.every((v) => Number.isInteger(v) && v >= 1)) problems.push(`balance.acceleratorRange needs ${cfg.tiers.length} whole numbers from 1`);
if (!(BAL.acceleratorSeconds >= 1)) problems.push("balance.acceleratorSeconds must be at least 1");
for (const k of ["farmlandYield", "acceleratorYield"])
  if (!(Number.isInteger(BAL[k]) && BAL[k] >= 1 && BAL[k] <= 64)) problems.push(`balance.${k} must be 1-64`);
if (!(Number.isInteger(BAL.toolDurability) && BAL.toolDurability >= 1)) problems.push("balance.toolDurability must be a whole number from 1");
if (problems.length) {
  console.error(`crops.json has problems:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

const title = (id) => id.replace(/(^|_)(\w)/g, (_, sep, c) => (sep ? " " : "") + c.toUpperCase());

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2));
}

// ---------- textures ----------
// 16x16 masks, shaded automatically in the tint colour:
//   # body (outlined, lit from the top-left)   * highlight   ~ shadow   + sparkle   : faint haze
//   g/G/l stem green, dark green, leaf green   s stone   d deepslate   v vein   w white   . transparent
//   any key of the palette passed to render(): that exact colour, counted as body

// Tier essence: a cut gem. Higher tiers get more sparkles around it.
const GEM = [
  "................",
  ".......##.......",
  "......####......",
  ".....######.....",
  ".....#*####.....",
  "....#*######....",
  "....#*######....",
  "....##*#####....",
  "....########....",
  "....########....",
  "....########....",
  ".....######.....",
  ".....######.....",
  "......####......",
  ".......##.......",
  "................",
];
const SPARKLES = [[2, 2], [13, 3], [13, 12], [2, 12]];
const withSparkles = (mask, n) =>
  mask.map((row, y) => [...row].map((ch, x) => (SPARKLES.slice(0, n).some(([sx, sy]) => sx === x && sy === y) ? "+" : ch)).join(""));

// Crop essence: a lumpy puff of gas with drifting motes and haze, so it reads differently from the tier gems.
const WISP = [
  "................",
  ".......:...+....",
  "......####......",
  "..+..######.:...",
  "...##*######....",
  "..####*##~####..",
  ".###*###~~###.#.",
  ".##*#####*####..",
  ".###*##~##*####.",
  "..###*####*~###.",
  "..####~##*####..",
  "...###*##~###...",
  "....#########...",
  "..:...#####..+..",
  "................",
  "................",
];

// Mob essence: the plain puff with a mob's 8x8 face in the middle.
const faceMask = (face) => WISP.map((row, y) => [...row].map((ch, x) => (y >= 4 && y < 12 && x >= 4 && x < 12 && face[y - 4][x - 4] !== "." ? face[y - 4][x - 4] : ch === "*" || ch === "~" ? "#" : ch)).join(""));

const SEEDS = [
  "................",
  "................",
  "................",
  "..##............",
  ".####.....##....",
  ".#*###...####...",
  ".#####..#*###...",
  "..###...#####...",
  "........#####...",
  ".........###....",
  "....##..........",
  "...####.........",
  "...#*###........",
  "...#####........",
  "....###.........",
  "................",
];

const ORE = [
  "ssssssssssssssss",
  "ss###sssssssssss",
  "s#*###sssss###ss",
  "s#####ssss#*###s",
  "ss###sssss#####s",
  "sssssss###s###ss",
  "ssssss#*###sssss",
  "ssssss#####sssss",
  "sss###s###ssssss",
  "ss#*###sssss###s",
  "ss#####ssss#*###",
  "sss###sssss#####",
  "ssssssss###s###s",
  "sssssss#*###ssss",
  "sssssss#####ssss",
  "ssssssss###sssss",
];

// Growth accelerator: essence roots climbing through stone, with white sparks around them.
const ACCELERATOR = [
  "sssvsssssvsssvss",
  "sswvssssvvsssvss",
  "ssssvsssvswsvvss",
  "ssssvvsvvssvvsss",
  "sssssvvvwsvsssss",
  "svssssvssvvsssss",
  "svvwssvsvvssssvs",
  "ssvvssvvvssswvvs",
  "sssvvvvvssvvvvss",
  "sssswsvvsvvsssss",
  "sssssvvvvvssssss",
  "ssssssvvvwssssss",
  "ssssssvvvsssssss",
  "sssssvvvwsssssss",
  "ssswsvvsssssssss",
  "ssssvvvsssssssss",
];

// Tools: b blade, o outline, h and H handle are palette colours, * blade highlight, ~ blade shadow.
const SICKLE = [
  "................",
  ".....oooooo.....",
  "...oo******oo...",
  "..o**bbbbbbb~o..",
  "..o*boooooobb~o.",
  "...oo......ob~o.",
  "...........ob~o.",
  "...........ob~o.",
  "..........ob~~o.",
  ".........ob~~o..",
  "........oob~o...",
  ".......oHhoo....",
  "......oHho......",
  ".....oHho.......",
  "....ohho........",
  ".....oo.........",
];
const HOE = [
  "................",
  "................",
  "........oooooo..",
  ".......o****bbo.",
  ".......o*bbbbb~o",
  "........ooHho~~o",
  ".........oHhoo~o",
  "........oHho..oo",
  ".......oHho.....",
  "......oHho......",
  ".....oHho.......",
  "....oHho........",
  "...oHho.........",
  "..ohho..........",
  "...oo...........",
  "................",
];

// Essence Guide: c cover, d spine, g gem, p page edges (all palette colours).
const BOOK = [
  "................",
  "..ddcccccccccc..",
  "..ddcccccccccc..",
  "..ddcccccccccc..",
  "..ddccccggcccc..",
  "..ddcccggggccc..",
  "..ddcccggggccc..",
  "..ddccccggcccc..",
  "..ddcccccccccc..",
  "..ddcccccccccc..",
  "..ddcccccccccc..",
  "..ddcccccccccc..",
  "..ddpppppppppp..",
  "..ddcccccccccc..",
  "................",
  "................",
];

const grid = (fn) => Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => fn(x, y)).join(""));

// Materials. Tier essence is already a cut gem, so the gemstone is a wide brilliant-cut stone.
const INGOT = [
  "................",
  "................",
  "................",
  "................",
  ".........####...",
  ".......##****#..",
  ".....##**####~#.",
  "...##**#####~~#.",
  ".##*#######~~#..",
  ".#*######~~~##..",
  ".#####~~~~##....",
  "..###~~~##......",
  "...###.#........",
  "................",
  "................",
  "................",
];
const NUGGET = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "......###.......",
  ".....#***#......",
  "....#*###~#.....",
  "...##*###~##....",
  "..#*#####~~~#...",
  "..#*####~~~~#...",
  "...##~~~~~~#....",
  ".....#####......",
  "................",
  "................",
  "................",
];
const GEMSTONE = [
  "................",
  "................",
  "...##########...",
  "..#**##**##~~#..",
  ".#**##****##~~#.",
  "#############~~#",
  ".#**#*##**#~~~#.",
  "..#*##*##*#~~#..",
  "...#*#*##*#~#...",
  "....#*#*##~#....",
  ".....#*#*~#.....",
  "......#*~#......",
  ".......##.......",
  "................",
  "................",
  "................",
];
const SHARD = [
  "................",
  "..........##....",
  ".........#*#....",
  "........#**#....",
  ".......#**#~#...",
  "......#**##~#...",
  ".....#**###~#...",
  "....#**###~#....",
  "....#*###~~#....",
  "...#*###~~#.....",
  "...#*##~~#......",
  "..#*##~~#.......",
  "..#*#~~#........",
  "..##~##.........",
  "...##...........",
  "................",
];
// Fertilized Essence is a glowing seed-pod; Essence Fertilizer is a full sack.
const POD = [
  "................",
  ".......gg.......",
  "......gGg.......",
  ".......G..+.....",
  "......###.......",
  "..+..#***#......",
  "....#*####~.....",
  "....#*####~.....",
  "....#*####~..+..",
  "....##*##~~.....",
  ".....##~~~......",
  "......###.......",
  "................",
  "..+.......+.....",
  "................",
  "................",
];
const SACK = [
  "................",
  "......G..G......",
  ".......GG.......",
  "......####......",
  ".....#*###~.....",
  "....#*#####~....",
  "...#*#######~...",
  "...#*#ggg###~...",
  "..#*##gGg####~..",
  "..#*###g#####~..",
  "..#*##gGg####~..",
  "..##*#ggg###~~..",
  "...##*#####~~...",
  "....#########...",
  "................",
  "................",
];
// Storage blocks: a raw essence block, an ingot block with bands, and a gem block with facets.
const ESSENCE_BLOCK = grid((x, y) => (x === 0 || y === 0 ? "*" : x === 15 || y === 15 ? "~" : (x + y) % 8 === 0 ? "*" : (x - y + 16) % 8 === 0 ? "~" : "b"));
const INGOT_BLOCK = grid((x, y) => (y === 0 || x === 0 ? "*" : y === 15 || x === 15 ? "~" : y % 5 === 0 ? "~" : y % 5 === 1 ? "*" : "b"));
const GEM_BLOCK = grid((x, y) => {
  if (x === 0 || y === 0) return "*";
  if (x === 15 || y === 15) return "~";
  const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
  return d < 3 ? "*" : d < 6 ? "b" : d < 7.5 ? "~" : "b";
});

const blank = (n) => Array(n).fill("................");
const STEMS = [
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
];
// Ripe crop: crystal shards in the crop's colour growing out of a bed of leaves.
const CRYSTALS = [
  "................",
  ".......#........",
  "......#*#.......",
  "......#*#...#...",
  "..#...#~#..#*#..",
  ".#*#..#*#..#*#..",
  ".#*#..#~#..#~#..",
  ".#~#..#*#..#*#..",
  ".#*#..#~#..#~#..",
  ".#~#..###..#*#..",
  "l#gl..lg..gl#l.l",
  "lgGgllgGlgGglgGl",
  ".gGGgGGgGGgGGGg.",
  "..G.gG.GG.Gg.G..",
  "..G..G..G..G..G.",
  "..G..G..G..G..G.",
];
const STAGES = [
  [...blank(12), "..g....g....g...", "..gg..gG...gG...", "...G...G...G....", "...G...G...G...."],
  [...blank(8), ".g.........g....", ".gg...g...gg....", ...STEMS.slice(4)],
  CRYSTALS.map((r) => r.replace(/#/g, "G").replace(/[*~]/g, "g")), // the shards, still green
  CRYSTALS,
];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const shade = (rgb, f) => rgb.map((v) => Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)));
const shadeHex = (h, f) => `#${shade(hex(h), f).map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const GREEN = { g: hex("#5aa83a"), G: hex("#3d7a28"), l: hex("#7cc44e") };
const noise = (x, y, seed = 0) => {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// Tinted soil (T lit soil, t soil, k groove): the tier colour mixed half and half with brown, darkened a little.
const soilTint = (c) => shade(c.map((v, i) => Math.round(v * 0.5 + [107, 74, 50][i] * 0.5)), -0.25);

// Essence farmland: tinted tilled soil. The top has long furrows (lit ridge, soil, groove) with the odd break;
// the side is speckled soil under a tilled edge.
const FARMLAND_TOP = grid((x, y) => {
  const row = y % 4;
  if (row === 3) return noise(x, y, 8) < 0.2 ? "t" : "k";
  if (row !== 0 && noise(x, Math.floor(y / 4), 9) < 0.08) return "k";
  return row === 0 ? "T" : "t";
});
const FARMLAND_SIDE = grid((x, y) => (y === 0 ? "T" : y === 1 ? "k" : noise(x, y, 4) < 0.07 ? "k" : noise(x, y, 6) > 0.88 ? "T" : "t"));

const grain = (x, y) => ((x * 31 + y * 17) * 2654435761 >>> 0) % 40;

function render(mask, color, palette = {}) {
  if (mask.length !== 16) throw new Error(`mask is ${mask.length} rows tall`);
  mask.forEach((row, y) => {
    if (row.length !== 16) throw new Error(`mask row ${y} is ${row.length} wide: ${row}`);
  });
  const c = color && hex(color);
  const isBody = (x, y) => "#*~".includes(mask[y]?.[x] ?? ".") || (mask[y]?.[x] ?? ".") in palette;
  let lo = Infinity, hi = -Infinity; // range of x+y over the body, for the light gradient
  mask.forEach((row, y) => [...row].forEach((ch, x) => isBody(x, y) && ((lo = Math.min(lo, x + y)), (hi = Math.max(hi, x + y)))));

  const px = Buffer.alloc(16 * 16 * 4);
  mask.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      let rgb, alpha = 255;
      if (ch === ".") return;
      else if (ch in palette) rgb = hex(palette[ch]);
      else if (ch === ":") (rgb = shade(c, 0.2)), (alpha = 110);
      else if (ch === "s") rgb = Array(3).fill(105 + grain(x, y));
      else if (ch === "d") rgb = Array(3).fill(55 + grain(x, y));
      else if (ch === "v") rgb = shade(c, (grain(x, y) - 20) / 150);
      else if (ch === "w") rgb = [255, 255, 255];
      else if (ch in GREEN) rgb = GREEN[ch];
      else if (ch === "T") rgb = shade(shade(soilTint(c), 0.18), (noise(x, y) - 0.5) * 0.2);
      else if (ch === "t") rgb = shade(soilTint(c), (noise(x, y) - 0.5) * 0.25);
      else if (ch === "k") rgb = shade(soilTint(c), -0.5 + (noise(x, y) - 0.5) * 0.15);
      else if (ch === "+") rgb = shade(c, 0.7);
      else if (ch === "*") rgb = shade(c, 0.8);
      else if (ch === "~") rgb = shade(c, -0.3);
      else if (!isBody(x - 1, y) || !isBody(x + 1, y) || !isBody(x, y - 1) || !isBody(x, y + 1)) rgb = shade(c, -0.55);
      else rgb = shade(c, 0.3 - (0.6 * (x + y - lo)) / (hi - lo || 1));
      px.set([...rgb, alpha], (y * 16 + x) * 4);
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

function png(w, px, h = w) {
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
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6], 8); // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const previews = []; // generated textures, laid out in build/preview.png

function texture(rel, mask, color, palette) {
  const art = path.join(ROOT, "art", `${rel}.png`);
  if (fs.existsSync(art)) return write(path.join(RP, `${rel}.png`), fs.readFileSync(art));
  const px = render(mask, color, palette);
  previews.push(px);
  write(path.join(RP, `${rel}.png`), png(16, px));
}

function previewSheet(file, k = 4, cols = 12) {
  const cell = 16 * k + 4, w = cols * cell, h = Math.ceil(previews.length / cols) * cell;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) out.set([150, 150, 150, 255], i * 4);
  previews.forEach((px, i) => {
    const big = scale(px, k), ox = (i % cols) * cell + 2, oy = ((i / cols) | 0) * cell + 2;
    for (let y = 0; y < 16 * k; y++)
      for (let x = 0; x < 16 * k; x++) {
        const s = (y * 16 * k + x) * 4;
        if (big[s + 3]) big.copy(out, ((oy + y) * w + ox + x) * 4, s, s + 4);
      }
  });
  write(file, png(w, out, h));
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
// The Essence Guide's pages, so the book always matches the settings and crop list.
const pct = (v) => `${+(v * 100).toFixed(1)}%`;
const range = ([min, max]) => (min === max ? `${min}` : `${min}-${max}`);
const tierTitle = (t) => title(t.id);
const GUIDE_PAGES = [
  { title: "Getting Started", body: `Mine Essence Ore underground, between y -32 and 64, for ${range(BAL.oreEssence)} ${tierTitle(cfg.tiers[0])} Essence each. It also drops from most mobs (${pct(BAL.mobEssenceChance)}), grass and ferns (${pct(BAL.grassEssenceChance)}) and ripe vanilla crops (${pct(BAL.cropEssenceChance)}).\n\nOnce you have a little, plant the ${tierTitle(cfg.tiers[0])} crop for a steady supply.\n\nFour essence of one tier craft one of the next:\n${cfg.tiers.map(tierTitle).join(" > ")}` },
  { title: "Infusion Altar", body: `Seeds are made at an Infusion Altar with 8 Infusion Pedestals around it, at the same height: 3 blocks away on each side, and 2 away on each diagonal.\n\nPut a seed base on the altar, and 4 of the resource and 4 tier essence on the pedestals. Use an item on either block to place it, and an empty hand to take it back. Then use a Wand on the altar, or power it with redstone.\n\nTo make a Vita Seed Base, craft 4 Vita Shards around wheat seeds. Mob seeds need an Anima Seed Base instead: craft a Vita Seed Base with 2 Anima Dust.` },
  { title: "Souls", body: `Mob seeds use Soul Jars instead of the resource. Kill mobs with an Anima Dagger in your hand and a Soul Jar in your inventory to fill it. Each jar holds one mob type, and shows its count on the jar.\n\nThe jar empties when it's used in a recipe, so you keep it.\n\nAttuned daggers, made at the altar, fill jars ${BAL.attunedSoulMultiplier} times as fast from passive or hostile mobs.` },
  { title: "Seeds and Harvest", body: `Seeds come from the Infusion Altar. The ${tierTitle(cfg.tiers[0])} seeds are the exception: craft 8 ${tierTitle(cfg.tiers[0])} Essence around wheat seeds.\n\nSeeds grow on any farmland, but give extras only on essence farmland.\n\nA ripe crop drops ${range(BAL.harvestEssence)} essence and its seed. The ${tierTitle(cfg.tiers[0])} crop drops ${tierTitle(cfg.tiers[0])} Essence directly, and more on higher tiers of farmland.\n\nEach crop's essence crafts its resource. Common resources use a ring of 8 or a row of 3 and make a lot. Rare ones take a full grid of 9 and make 1. The wiki lists every recipe.\n\nBone meal doesn't work on these crops.` },
  { title: "Essence Farmland", body: `Use tier essence on farmland to turn it into that tier, or craft 1 dirt + 1 tier essence. It never dries out and needs no water.\n\nOn any essence farmland, a ripe crop has a ${pct(BAL.secondaryChance)} chance of a second essence and of a second seed. Farmland matching the crop's tier raises each to ${pct(BAL.secondaryChance + BAL.matchingFarmlandChance)}.\n\nUsing a different tier's essence swaps the farmland, with a ${pct(BAL.farmlandRefundChance)} chance of getting one of the old essence back.` },
  { title: "Growth Accelerators", body: `Place below a crop to give it an extra growth chance about every ${BAL.acceleratorSeconds} seconds. Each one works on its own, so more means faster.\n\nThey work through other blocks, on the first crop above them. The block directly above an accelerator is skipped, because that's where the farmland goes.\n\nReach by tier:\n${cfg.tiers.map((t, i) => `${tierTitle(t)}: ${BAL.acceleratorRange[i]} blocks`).join("\n")}\n\n4 tier essence, 4 stone and 1 tier gemstone make ${BAL.acceleratorYield}.` },
  { title: "Materials", body: `Vita Ore, between y -60 and 24, drops ${range(BAL.vitaShards)} Vita Shards. Or craft 4 ${tierTitle(cfg.tiers[0])} Blocks around a flint for 4 shards.\n\n4 shards around an iron ingot make a Vita Ingot, and around a diamond a Vita Gemstone. Add 2 tier essence to either for that tier's version.\n\nNine of anything stores in a block, and ingots break down into 9 nuggets.` },
  { title: "Fertilizer", body: `Ripe crops have a ${pct(BAL.fertilizedEssenceChance)} chance of dropping Fertilized Essence, which advances a crop a stage or two.\n\nEssence Fertilizer ripens a crop at once. 4 Terra Essence, 4 bone meal and a diamond make 4, or use Fertilized Essence instead of bone meal to make 8.` },
  { title: "Tools", body: `Essence Sickle: break a ripe crop to harvest every ripe crop in the 3x3 around it. It won't break unripe crops.\n\nEssence Hoe: right-click a ripe crop to harvest and replant it. The replant takes one seed from the drops.\n\nBoth last ${BAL.toolDurability} uses and repair with ${tierTitle(cfg.tiers[1])} Essence in an anvil.` },
  { title: "Harvester", body: `Harvests and replants ripe crops for you. Place it at the height of your crops, with its front facing them. It works on the square in front of it, one block at a time.\n\nTap it with an empty hand to open it. The first slot takes fuel, the second a Machine Upgrade, and the rest hold the harvest. To mine it, hold a tool or sneak.\n\nFuel: coal, charcoal, coal blocks, lava buckets, blaze rods, logs, planks or sticks. Each one fills an internal tank, and each crop harvested uses some. Look at the machine to see its tank.\n\nA chest or barrel touching its back gets the harvest automatically, and hoppers can take it from there. Redstone power pauses it.\n\nUpgrades make it wider and faster, but it burns much more fuel:\n${["No upgrade", ...cfg.tiers.map(tierTitle)].map((name, i) => { const side = (BAL.harvester.range + (BAL.harvester.upgrades[i - 1]?.range ?? 0)) * 2 + 1; return `${name}: ${side}x${side}`; }).join("\n")}` },
  { title: "Crops by Tier", body:`${cfg.tiers.map((t, i) => [t, cfg.crops.filter((c) => c.tier === i + 1 && !c.retired)]).filter(([, crops]) => crops.length).map(([t, crops]) => `${tierTitle(t)}: ${crops.map((c) => title(c.id)).join(", ")}`).join("\n\n")}\n\nFull recipes: nicholasambrose.github.io/EssenceAndEarth` },
];

// Infusion recipes for the script: a seed base on the altar, 4 of the ingredient and 4 tier essence on the pedestals.
const FULL_JAR = (soul) => ({ soul });
const ATTUNED_DAGGERS = [["passive", ["pig", "chicken", "cow", "sheep"]], ["hostile", ["zombie", "skeleton", "creeper", "spider"]]];
const ALTAR_RECIPES = [
  ...cfg.crops.filter((c) => !c.retired && !c.essenceCrop).map((c) => ({
    input: `${NS}:${c.soul ? "anima" : "vita"}_seed_base`,
    ingredients: [...Array(4).fill(c.soul ? FULL_JAR(c.soul) : c.ingredient), ...Array(4).fill(`${NS}:${cfg.tiers[c.tier - 1].id}_essence`)],
    output: `${NS}:${c.id}_seeds`,
  })),
  ...ATTUNED_DAGGERS.map(([kind, mobs]) => ({
    input: `${NS}:anima_dagger`,
    ingredients: [`${NS}:anima_ingot`, `${NS}:anima_ingot`, `${NS}:anima_gemstone`, `${NS}:anima_gemstone`, ...mobs.map(FULL_JAR)],
    output: `${NS}:${kind}_anima_dagger`,
  })),
];

// Guide pages listing every altar recipe, one per tier. There's no recipe viewer on Bedrock, and these don't show in the recipe book.
cfg.tiers.forEach((t, i) => {
  const crops = cfg.crops.filter((c) => !c.retired && !c.essenceCrop && c.tier === i + 1);
  const section = (base, list, line) => (list.length ? [`${base} on the altar:\n${list.map(line).join("\n")}`] : []);
  if (crops.length) GUIDE_PAGES.push({
    title: `Altar Recipes: ${tierTitle(t)}`,
    body: [
      `Each of these takes 4 ${tierTitle(t)} Essence on the pedestals, plus the 4 items listed.`,
      ...section("Vita Seed Base", crops.filter((c) => !c.soul), (c) => `${title(c.id)}: 4 ${title(c.ingredient.split(":")[1])}`),
      ...section("Anima Seed Base", crops.filter((c) => c.soul), (c) => `${title(c.id)}: 4 Soul Jars, each with ${cfg.souls[c.soul].need} ${title(c.soul)} Soul${cfg.souls[c.soul].need === 1 ? "" : "s"}`),
    ].join("\n\n"),
  });
});
GUIDE_PAGES.push({
  title: "Altar Recipes: Daggers",
  body: `Put an Anima Dagger on the altar. On the pedestals, put 2 Anima Ingots, 2 Anima Gemstones and 4 full Soul Jars.\n\n${ATTUNED_DAGGERS.map(([kind, mobs]) => `${title(kind)} dagger: ${mobs.map(title).join(", ")} jars`).join("\n")}`,
});

// Our ores for Deepcore's Geo Scanner (see scripts/main.js). Its hologram wants colours as 0-1.
const rgb = (hex) => [1, 3, 5].map((i) => +(parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(2));
const DEEPCORE_ORES = [
  { k: "essence", name: "Essence", blocks: [`${NS}:essence_ore`, `${NS}:deepslate_essence_ore`], rgb: rgb(cfg.tiers[0].color) },
  { k: "vita", name: "Vita", blocks: [`${NS}:vita_ore`, `${NS}:deepslate_vita_ore`], rgb: rgb(cfg.vita.color) },
  { k: "anima", name: "Anima", blocks: [`${NS}:anima_ore`], rgb: rgb(cfg.anima.color) },
];

for (const file of fs.readdirSync(path.join(BP, "scripts"), { recursive: true })) {
  const f = path.join(BP, "scripts", file);
  if (f.endsWith(".js"))
    write(f, fs.readFileSync(f, "utf8")
      .replaceAll("__BALANCE__", JSON.stringify(BAL))
      .replaceAll("__ACCELERATOR_RANGE__", JSON.stringify(Object.fromEntries(cfg.tiers.map((t, i) => [`${NS}:${t.id}_accelerator`, BAL.acceleratorRange[i]]))))
      .replaceAll("__ESSENCE_FARMLAND__", JSON.stringify(Object.fromEntries(cfg.tiers.map((t) => [`${NS}:${t.id}_essence`, `${NS}:${t.id}_farmland`]))))
      .replaceAll("__GUIDE_PAGES__", JSON.stringify(GUIDE_PAGES))
      .replaceAll("__ALTAR_RECIPES__", JSON.stringify(ALTAR_RECIPES))
      .replaceAll("__MACHINE_UPGRADES__", JSON.stringify(Object.fromEntries(cfg.tiers.map((t, i) => [`${NS}:${t.id}_machine_upgrade`, { name: tierTitle(t), ...BAL.harvester.upgrades[i] }]))))
      .replaceAll("__SOULS__", JSON.stringify(cfg.souls))
      .replaceAll("__DEEPCORE_ORES__", JSON.stringify(DEEPCORE_ORES))
      .replaceAll("__FARMLAND_TIER__", JSON.stringify(Object.fromEntries(cfg.tiers.map((t, i) => [`${NS}:${t.id}_farmland`, i + 1]))))
      .replaceAll("__CROP_TIER__", JSON.stringify(Object.fromEntries(cfg.crops.map((c) => [`${NS}:${c.id}_crop`, c.retired ? 1 : c.tier]))))
      .replaceAll("__ESSENCE__", `${NS}:${cfg.tiers[0].id}_essence`)
      .replaceAll("__NS__", NS));
}

const terrain = {}, itemTextures = {}, sounds = {}, lang = [];
const TAG = "§9@ESSENCE&EARTH"; // second tooltip line on everything in the inventory, like Deepcore's @DEEPCORE

function item(id, mask, color, components = {}, palette) {
  texture(`textures/items/${id}`, mask, color, palette);
  itemTextures[`${NS}_${id}`] = { textures: `textures/items/${id}` };
  write(path.join(BP, "items", `${id}.json`), {
    format_version: FMT,
    "minecraft:item": {
      description: { identifier: `${NS}:${id}`, menu_category: { category: "items" } },
      components: { "minecraft:icon": `${NS}_${id}`, "minecraft:display_name": { value: `${title(id)}\n${TAG}` }, ...components },
    },
  });
}

function blockTexture(id, mask, color, palette) {
  texture(`textures/blocks/${id}`, mask, color, palette);
  terrain[`${NS}_${id}`] = { textures: `textures/blocks/${id}` };
}

function block(id, sound, description, { "minecraft:display_name": name, ...components }, permutations) {
  sounds[`${NS}:${id}`] = { sound };
  if (name) lang.push(`tile.${NS}:${id}.name=${name}\\n${TAG}`); // block names go in the lang file, as Deepcore's do
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
  ...(chance !== undefined && { conditions: [{ condition: "random_chance", chance }] }),
  entries: [{ type: "item", name, weight: 1, ...(max > 1 && { functions: [{ function: "set_count", count: { min, max } }] }) }],
});

// Every crafting recipe in Deepcore's format, so its Network Crafter can make them (see scripts/main.js).
const DEEPCORE_RECIPES = [];
function deepcoreRecipe({ pattern, key, ingredients, result }) {
  const { item: o, count: n = 1 } = result;
  if (pattern) return { o, n, s: pattern, k: Object.fromEntries(Object.entries(key).map(([ch, v]) => [ch, v.item])) };
  return { o, n, i: ingredients.flatMap((v) => Array(v.count ?? 1).fill(v.item)) }; // Deepcore lists one entry per grid cell
}

function recipe(id, type, body, unlock) {
  DEEPCORE_RECIPES.push(deepcoreRecipe(body));
  write(path.join(BP, "recipes", `${id}.json`), {
    format_version: "1.20.10",
    [`minecraft:recipe_${type}`]: { description: { identifier: `${NS}:${id}` }, tags: ["crafting_table"], unlock: [{ item: unlock }], ...body },
  });
}

// Essence tiers: 4 of the previous tier make 1 of the next, and 1 breaks back down into 4.
const tierEssence = (n) => `${NS}:${cfg.tiers[n - 1].id}_essence`;
cfg.tiers.forEach((t, i) => {
  item(`${t.id}_essence`, withSparkles(GEM, i), t.color);
  if (i > 0)
    recipe(`${t.id}_essence`, "shapeless", { ingredients: [{ item: tierEssence(i), count: 4 }], result: { item: tierEssence(i + 1) } }, tierEssence(i));
  if (i > 0)
    recipe(`${t.id}_essence_uncraft`, "shapeless", { ingredients: [{ item: tierEssence(i + 1) }], result: { item: tierEssence(i), count: 4 } }, tierEssence(i + 1));
});

// Essence farmland: never dries out, and gives ripe crops a chance of extras (see scripts/main.js).
// Vanilla farmland has no item to craft with, so 1 dirt + 1 tier essence stands in for it. Essence used on placed farmland converts it too.
const FARMLANDS = cfg.tiers.map((t) => `${NS}:${t.id}_farmland`);
cfg.tiers.forEach((t, i) => {
  const id = `${t.id}_farmland`;
  blockTexture(`${id}_top`, FARMLAND_TOP, t.color);
  blockTexture(`${id}_side`, FARMLAND_SIDE, t.color);
  block(id, "gravel", { menu_category: { category: "nature" } }, {
    "minecraft:display_name": `${title(t.id)} Farmland`,
    "minecraft:geometry": "minecraft:geometry.full_block",
    "minecraft:destructible_by_mining": { seconds_to_destroy: 0.6 },
    "minecraft:material_instances": { "*": { texture: `${NS}_${id}_side` }, up: { texture: `${NS}_${id}_top` } },
    "minecraft:loot": loot(id, [drop(`${NS}:${id}`)]),
  });
  recipe(id, "shapeless", {
    ingredients: [{ item: "minecraft:dirt" }, { item: tierEssence(i + 1) }],
    result: { item: `${NS}:${id}`, count: BAL.farmlandYield },
  }, tierEssence(i + 1));
});

// Growth accelerators: each gives the first crop above it an extra growth roll on a timer (see scripts/main.js).
// 4 essence, 4 stone and 1 gemstone of a tier make 3.
cfg.tiers.forEach((t, i) => {
  const id = `${t.id}_accelerator`;
  blockTexture(id, ACCELERATOR, t.color);
  block(id, "stone", { menu_category: { category: "items" } }, {
    "minecraft:display_name": `${title(t.id)} Growth Accelerator`,
    "minecraft:geometry": "minecraft:geometry.full_block",
    "minecraft:destructible_by_mining": { seconds_to_destroy: 1.5 },
    "minecraft:material_instances": { "*": { texture: `${NS}_${id}` } },
    "minecraft:loot": loot(id, [drop(`${NS}:${id}`)]),
    "minecraft:tick": { interval_range: [Math.round(BAL.acceleratorSeconds * 18), Math.round(BAL.acceleratorSeconds * 22)], looping: true }, // game ticks, with 10% variance
    [`${NS}:accelerator`]: {},
  });
  recipe(id, "shaped", {
    pattern: ["ESE", "SGS", "ESE"],
    key: { E: { item: tierEssence(i + 1) }, S: { item: "minecraft:stone" }, G: { item: `${NS}:${t.id}_gemstone` } },
    result: { item: `${NS}:${id}`, count: BAL.acceleratorYield },
  }, tierEssence(i + 1));
});

// Essence tools: their behaviour and durability loss are in scripts/main.js.
const TOOL_TIER = cfg.tiers[1];
const toolEssence = tierEssence(2);
for (const [id, mask, pattern] of [
  ["essence_sickle", SICKLE, ["EE ", " SE", "S  "]],
  ["essence_hoe", HOE, ["EE", " S", " S"]],
]) {
  item(id, mask, TOOL_TIER.color, {
    "minecraft:max_stack_size": 1,
    "minecraft:hand_equipped": true,
    "minecraft:durability": { max_durability: BAL.toolDurability },
    "minecraft:repairable": { repair_items: [{ items: [toolEssence], repair_amount: Math.ceil(BAL.toolDurability / 4) }] },
  }, { b: TOOL_TIER.color, o: "#12263c", h: "#6b4a2f", H: "#93704a" });
  recipe(id, "shaped", { pattern, key: { E: { item: toolEssence }, S: { item: "minecraft:stick" } }, result: { item: `${NS}:${id}` } }, toolEssence);
}

// Essence Guide: using it opens the menu in scripts/main.js.
item("essence_guide", BOOK, cfg.tiers[0].color, { "minecraft:max_stack_size": 1 }, { c: cfg.tiers[0].color, d: "#2f6e20", g: "#dff5d4", p: "#efe9d8" });
recipe("essence_guide", "shapeless", { ingredients: [{ item: "minecraft:book" }, { item: tierEssence(1) }], result: { item: `${NS}:essence_guide` } }, tierEssence(1));

// Ores: each has stone and deepslate versions, in one vein feature that replaces whichever rock it's generating in.
const STONES = ["minecraft:stone", "minecraft:granite", "minecraft:diorite", "minecraft:andesite"];
const DEEPSLATES = ["minecraft:deepslate", "minecraft:tuff"];
const DEEPSLATE_ORE = ORE.map((row) => row.replaceAll("s", "d"));
function ore(id, name, color, [min, max], item, veins, [low, high]) {
  for (const [variant, mask, label, seconds] of [[id, ORE, name, 3], [`deepslate_${id}`, DEEPSLATE_ORE, `Deepslate ${name}`, 4.5]]) {
    blockTexture(variant, mask, color);
    block(variant, variant === id ? "stone" : "deepslate", { menu_category: { category: "nature" } }, {
      "minecraft:display_name": label,
      "minecraft:geometry": "minecraft:geometry.full_block",
      "minecraft:destructible_by_mining": { seconds_to_destroy: seconds },
      "minecraft:material_instances": { "*": { texture: `${NS}_${variant}` } },
      "minecraft:loot": loot(variant, [drop(item, min, max)]),
    });
  }
  write(path.join(BP, "features", `${id}_feature.json`), {
    format_version: "1.13.0",
    "minecraft:ore_feature": {
      description: { identifier: `${NS}:${id}_feature` },
      count: 8,
      replace_rules: [{ places_block: `${NS}:${id}`, may_replace: STONES }, { places_block: `${NS}:deepslate_${id}`, may_replace: DEEPSLATES }],
    },
  });
  write(path.join(BP, "feature_rules", `${id}_rule.json`), {
    format_version: "1.13.0",
    "minecraft:feature_rules": {
      description: { identifier: `${NS}:${id}_rule`, places_feature: `${NS}:${id}_feature` },
      conditions: { placement_pass: "underground_pass", "minecraft:biome_filter": [{ test: "has_biome_tag", operator: "==", value: "overworld" }] },
      distribution: {
        iterations: veins,
        coordinate_eval_order: "zyx",
        x: { distribution: "uniform", extent: [0, 16] },
        y: { distribution: "uniform", extent: [low, high] },
        z: { distribution: "uniform", extent: [0, 16] },
      },
    },
  });
}
ore("essence_ore", "Essence Ore", cfg.tiers[0].color, BAL.oreEssence, tierEssence(1), 16, [-32, 64]);
ore("vita_ore", "Vita Ore", cfg.vita.color, BAL.vitaShards, `${NS}:vita_shard`, 12, [-60, 24]);

// Materials: a nugget, ingot and gemstone for Vita and each tier, and storage blocks of each.
const packs = (id, into, unlock) => {
  recipe(`${into}_craft`, "shaped", { pattern: ["###", "###", "###"], key: { "#": { item: `${NS}:${id}` } }, result: { item: `${NS}:${into}` } }, unlock ?? `${NS}:${id}`);
  recipe(`${into}_uncraft`, "shapeless", { ingredients: [{ item: `${NS}:${into}` }], result: { item: `${NS}:${id}`, count: 9 } }, `${NS}:${into}`);
};
function storageBlock(id, name, mask, color, sound) {
  blockTexture(id, mask, color, { b: shadeHex(color, 0.08) });
  block(id, sound, { menu_category: { category: "construction" } }, {
    "minecraft:display_name": name,
    "minecraft:geometry": "minecraft:geometry.full_block",
    "minecraft:destructible_by_mining": { seconds_to_destroy: 2.5 },
    "minecraft:material_instances": { "*": { texture: `${NS}_${id}` } },
    "minecraft:loot": loot(id, [drop(`${NS}:${id}`)]),
  });
}
function materials(id, color) {
  item(`${id}_ingot`, INGOT, color);
  item(`${id}_nugget`, NUGGET, color);
  item(`${id}_gemstone`, GEMSTONE, color);
  storageBlock(`${id}_ingot_block`, `${title(id)} Ingot Block`, INGOT_BLOCK, color, "metal");
  storageBlock(`${id}_gemstone_block`, `${title(id)} Gemstone Block`, GEM_BLOCK, color, "metal");
  packs(`${id}_nugget`, `${id}_ingot`);
  packs(`${id}_ingot`, `${id}_ingot_block`);
  packs(`${id}_gemstone`, `${id}_gemstone_block`);
}
item("vita_shard", SHARD, cfg.vita.color);
materials("vita", cfg.vita.color);
storageBlock("vita_block", "Vita Block", ESSENCE_BLOCK, cfg.vita.color, "stone");
packs("vita_shard", "vita_block");
for (const [out, center] of [["vita_ingot", "minecraft:iron_ingot"], ["vita_gemstone", "minecraft:diamond"]])
  recipe(out, "shaped", { pattern: [" # ", "#X#", " # "], key: { "#": { item: `${NS}:vita_shard` }, X: { item: center } }, result: { item: `${NS}:${out}` } }, `${NS}:vita_shard`);
// A way to Vita without finding ore: one craft makes enough shards for a Vita Seed Base.
recipe("vita_shard_from_terra", "shaped", { pattern: [" # ", "#X#", " # "], key: { "#": { item: `${NS}:${cfg.tiers[0].id}_block` }, X: { item: "minecraft:flint" } }, result: { item: `${NS}:vita_shard`, count: 4 } }, `${NS}:${cfg.tiers[0].id}_block`);
cfg.tiers.forEach((t, i) => {
  materials(t.id, t.color);
  storageBlock(`${t.id}_block`, `${title(t.id)} Block`, ESSENCE_BLOCK, t.color, "stone");
  packs(`${t.id}_essence`, `${t.id}_block`);
  for (const kind of ["ingot", "gemstone"])
    recipe(`${t.id}_${kind}`, "shapeless", { ingredients: [{ item: `${NS}:vita_${kind}` }, { item: tierEssence(i + 1), count: 2 }], result: { item: `${NS}:${t.id}_${kind}` } }, tierEssence(i + 1));
});

// Fertilizers: Fertilized Essence advances a crop a stage or two, and Essence Fertilizer ripens it (see scripts/main.js).
item("fertilized_essence", POD, "#7cc44e");
item("essence_fertilizer", SACK, "#b39a6b");
for (const [id, side, count] of [["essence_fertilizer", "minecraft:bone_meal", 4], ["essence_fertilizer_better", `${NS}:fertilized_essence`, 8]])
  recipe(id, "shaped", { pattern: ["E#E", "#D#", "E#E"], key: { E: { item: tierEssence(1) }, "#": { item: side }, D: { item: "minecraft:diamond" } }, result: { item: `${NS}:essence_fertilizer`, count } }, tierEssence(1));

// Crops. Stages 0-2 share green textures; the ripe stage is tinted per crop.
[0, 1, 2].forEach((s) => blockTexture(`crop_${s}`, STAGES[s]));
const cropMaterial = (tex) => ({ "*": { texture: `${NS}_${tex}`, render_method: "alpha_test", ambient_occlusion: false, face_dimming: false } });

for (const c of cfg.crops) {
  const seeds = `${NS}:${c.id}_seeds`, essence = `${NS}:${c.id}_essence`, growth = `${NS}:growth`;
  const soils = ["minecraft:farmland", ...FARMLANDS];
  blockTexture(`${c.id}_crop`, STAGES[3], c.color);

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
      // Also pops the crop when the farmland under it is broken.
      "minecraft:placement_filter": { conditions: [{ allowed_faces: ["up"], block_filter: soils }] },
      "minecraft:loot": loot(`${c.id}_crop`, [drop(seeds)]),
      [`${NS}:crop`]: {},
    },
    [1, 2, 3].map((s) => ({
      condition: `q.block_state('${growth}') == ${s}`,
      components: {
        "minecraft:material_instances": cropMaterial(s < 3 ? `crop_${s}` : `${c.id}_crop`),
        // The second essence and seed depend on the farmland, so scripts/main.js rolls them.
        ...(s === 3 && { "minecraft:loot": loot(`${c.id}_crop_ripe`, [drop(essence, ...BAL.harvestEssence), drop(seeds), ...(c.essenceCrop ? [] : [drop(`${NS}:fertilized_essence`, 1, 1, BAL.fertilizedEssenceChance)])]) }),
      },
    })),
  );

  item(`${c.id}_seeds`, SEEDS, c.color, { "minecraft:block_placer": { block: `${NS}:${c.id}_crop`, use_on: soils } });
  // An essence crop drops its tier's essence directly, so it has no essence item of its own.
  if (!c.essenceCrop) item(`${c.id}_essence`, c.face ? faceMask(c.face) : WISP, c.essenceColor ?? c.color, {}, c.faceColors);

  // Every other crop's seeds come from the Infusion Altar (see scripts/main.js).
  if (c.essenceCrop)
    recipe(`${c.id}_seeds`, "shaped", {
      pattern: ["EEE", "ESE", "EEE"],
      key: { E: { item: tierEssence(c.tier) }, S: { item: "minecraft:wheat_seeds" } },
      result: { item: seeds },
    }, tierEssence(c.tier));
}

// Essence recipes, from recipes.json.
RECIPES.forEach((r, i) => {
  const parts = r.ingredients ?? Object.values(r.key);
  const unlock = parts.find((id) => id.endsWith("_essence"));
  const name = `essence_${i}_${r.result.split(":")[1]}`;
  const result = { item: r.result, count: r.count };
  if (r.pattern) recipe(name, "shaped", { pattern: r.pattern, key: Object.fromEntries(Object.entries(r.key).map(([k, id]) => [k, { item: id }])), result }, unlock);
  else recipe(name, "shapeless", { ingredients: r.ingredients.map((id) => ({ item: id })), result }, unlock);
});

// Clusters: four themed items pressed together, used as the seed ingredient for crops that make a whole family of things.
const CLUSTER = [
  "................",
  "................",
  "....####.###....",
  "...#*###~*##~...",
  "...#*###~###~...",
  "....####~###~...",
  "...###.#####....",
  "..#*###~*###~...",
  "..#*###~*###~...",
  "..######~###~...",
  "...####.###~....",
  ".....#*##~......",
  ".....####~......",
  "................",
  "................",
  "................",
];
const v = (id) => `minecraft:${id}`;
for (const [id, color, pattern, key] of [
  ["air", "#dad64d", ["IG", "DC"], { I: v("glass_bottle"), G: v("gravel"), D: v("dirt"), C: v("clay_ball") }],
  ["earth", "#54da4d", ["IG", "DC"], { I: v("short_grass"), G: v("gravel"), D: v("dirt"), C: v("clay_ball") }],
  ["water", "#4d7eda", ["IG", "DC"], { I: v("water_bucket"), G: v("gravel"), D: v("dirt"), C: v("clay_ball") }],
  ["fire", "#da4d4d", ["IG", "DC"], { I: v("lava_bucket"), G: v("gravel"), D: v("dirt"), C: v("clay_ball") }],
  ["nature", "#3fa63a", ["PO", "CS"], { P: v("pumpkin"), O: v("potato"), C: v("cactus"), S: v("sugar_cane") }],
  ["dye", "#d94fa0", ["CO", "PL"], { C: v("cyan_dye"), O: v("orange_dye"), P: v("pink_dye"), L: v("lime_dye") }],
  ["nether", "#8a2f2f", ["NS", "BW"], { N: v("netherrack"), S: v("soul_sand"), B: v("nether_brick"), W: v("nether_wart") }],
  ["coral", "#e0607a", ["CO", "PL"], { C: v("brain_coral_block"), O: v("tube_coral_block"), P: v("fire_coral_block"), L: v("horn_coral_block") }],
  ["honey", "#e8a424", ["BC", "CB"], { B: v("honey_bottle"), C: v("honeycomb") }],
  ["prismarine", "#63b5a5", ["CS", "SC"], { C: v("prismarine_crystals"), S: v("prismarine_shard") }],
  ["end", "#d8d68f", ["SC", "PS"], { S: v("end_stone"), C: v("chorus_fruit"), P: v("purpur_block") }],
]) {
  item(`${id}_cluster`, CLUSTER, color);
  recipe(`${id}_cluster`, "shaped", { pattern, key: Object.fromEntries(Object.entries(key).map(([k, i]) => [k, { item: i }])), result: { item: `${NS}:${id}_cluster` } }, key[Object.keys(key)[0]]);
}

// Blanks for skulls and music discs, and the droplet the experience crop makes.
const BLANK_SKULL = [
  "................",
  "....########....",
  "...#*#######~...",
  "..#*#########~..",
  "..#*#########~..",
  "..#*##dd##dd#~..",
  "..#*##dd##dd#~..",
  "..#*#########~..",
  "...#*##d#d##~...",
  "....##dddd##....",
  ".....#*###~.....",
  ".....#d#d#~.....",
  ".....#####......",
  "................",
  "................",
  "................",
];
const BLANK_RECORD = [
  "................",
  ".....######.....",
  "...##*#####~#...",
  "..#*#######~~#..",
  "..#*####*###~#..",
  ".#*###*###*##~#.",
  ".#*##*#wwww#*~#.",
  ".#*##*#wwww#*~#.",
  ".#*##*#wwww#*~#.",
  ".#*##*#wwww#*~#.",
  ".#*###*###*##~#.",
  "..#*####*###~#..",
  "..#*#######~~#..",
  "...##*#####~#...",
  ".....######.....",
  "................",
];
const DROPLET = [
  "................",
  ".......#........",
  ".......#........",
  "......#*#.......",
  "......#*#.......",
  ".....#*###......",
  ".....#*##~......",
  "....#*####~.....",
  "....#*####~.....",
  "....#*####~.....",
  "....##*##~~.....",
  ".....##~~~......",
  "......###.......",
  "................",
  "................",
  "................",
];
item("blank_skull", BLANK_SKULL, "#d8d4c4", {}, { d: "#2c2c2c" });
item("blank_record", BLANK_RECORD, "#3a3a3a");
item("experience_droplet", DROPLET, "#9fe04d");
recipe("blank_skull", "shaped", { pattern: [" S ", "SBS", " S "], key: { S: { item: `${NS}:soul_dust` }, B: { item: "minecraft:bone_block" } }, result: { item: `${NS}:blank_skull`, count: 4 } }, `${NS}:soul_dust`);
recipe("blank_record", "shaped", { pattern: ["CSC", "SIS", "CSC"], key: { C: { item: `${NS}:creeper_essence` }, S: { item: `${NS}:skeleton_essence` }, I: { item: "minecraft:iron_ingot" } }, result: { item: `${NS}:blank_record` } }, `${NS}:creeper_essence`);
recipe("experience_bottle", "shapeless", { ingredients: [{ item: "minecraft:glass_bottle" }, { item: `${NS}:experience_droplet` }], result: { item: "minecraft:experience_bottle" } }, `${NS}:experience_droplet`);

// Soulstone: generates in the Nether, with Anima Ore inside it. Soul Dust comes from smelting smooth soulstone.
const speckle = (seed) => grid((x, y) => { const n = noise(x, y, seed); return n < 0.16 ? "k" : n > 0.84 ? "T" : "t"; });
const BRICKS = grid((x, y) => {
  const row = Math.floor(y / 4), off = row % 2 ? 4 : 0;
  if (y % 4 === 3 || (x + off) % 8 === 7) return "k";
  return noise(x, y, 3) > 0.85 ? "T" : "t";
});
const CRACKED = grid((x, y) => (Math.abs(((x * 3 + y * 2) % 13) - 6) < 1 && noise(x, y, 5) > 0.4 ? "k" : BRICKS[y][x]));
const SMOOTH = grid((x, y) => (x === 0 || y === 0 ? "T" : x === 15 || y === 15 ? "k" : "t"));
const SOUL_PALETTE = { T: "#5f4a3a", t: "#4a3a2e", k: "#2f251d" };
function plainBlock(id, name, mask, palette, sound, seconds, drops = id, extra = {}) {
  blockTexture(id, mask, palette.t, palette);
  block(id, sound, { menu_category: { category: "construction" } }, {
    "minecraft:display_name": name,
    "minecraft:geometry": "minecraft:geometry.full_block",
    "minecraft:destructible_by_mining": { seconds_to_destroy: seconds },
    "minecraft:material_instances": { "*": { texture: `${NS}_${id}`, ...extra.material } },
    "minecraft:loot": loot(id, [drop(`${NS}:${drops}`)]),
    ...extra.components,
  });
}
plainBlock("soulstone", "Soulstone", speckle(1), SOUL_PALETTE, "stone", 1.5, "soulstone_cobble");
plainBlock("soulstone_cobble", "Soulstone Cobble", grid((x, y) => { const c = (Math.floor(x / 4) + Math.floor(y / 4)) % 2; return x % 4 === 3 || y % 4 === 3 ? "k" : c ? "T" : "t"; }), SOUL_PALETTE, "stone", 2);
plainBlock("soulstone_smooth", "Smooth Soulstone", SMOOTH, SOUL_PALETTE, "stone", 1.5);
plainBlock("soulstone_bricks", "Soulstone Bricks", BRICKS, SOUL_PALETTE, "stone", 1.5);
plainBlock("soulstone_cracked_bricks", "Cracked Soulstone Bricks", CRACKED, SOUL_PALETTE, "stone", 1.5);
plainBlock("soul_glass", "Soul Glass", grid((x, y) => (x === 0 || y === 0 || x === 15 || y === 15 ? "k" : ".")), { k: "#6a4f3c", t: "#4a3a2e" }, "glass", 0.3, "soul_glass", { material: { render_method: "alpha_test" }, components: { "minecraft:light_dampening": 0 } });
const ANIMA_ORE = speckle(1).map((row, y) => [...row].map((ch, x) => { const m = ORE[y][x]; return m === "s" ? ch : m === "#" ? "a" : m === "*" ? "A" : ch; }).join(""));
plainBlock("anima_ore", "Anima Ore", ANIMA_ORE, { ...SOUL_PALETTE, a: cfg.anima.color, A: shadeHex(cfg.anima.color, 0.5) }, "stone", 3, "anima_dust");
write(path.join(BP, "loot_tables", "blocks", "anima_ore.json"), { pools: [drop(`${NS}:anima_dust`, ...BAL.animaDust)] });
const NETHER_FEATURES = [
  ["soulstone", 64, ["minecraft:netherrack"], 4, "underground_pass"],
  ["anima_ore", 4, [`${NS}:soulstone`], 12, "final_pass"], // runs after the soulstone, so it only lands inside it
];
for (const [id, count, may_replace, iterations, pass] of NETHER_FEATURES) {
  write(path.join(BP, "features", `${id}_feature.json`), {
    format_version: "1.13.0",
    "minecraft:ore_feature": { description: { identifier: `${NS}:${id}_feature` }, count, replace_rules: [{ places_block: `${NS}:${id}`, may_replace }] },
  });
  write(path.join(BP, "feature_rules", `${id}_rule.json`), {
    format_version: "1.13.0",
    "minecraft:feature_rules": {
      description: { identifier: `${NS}:${id}_rule`, places_feature: `${NS}:${id}_feature` },
      conditions: { placement_pass: pass, "minecraft:biome_filter": [{ test: "has_biome_tag", operator: "==", value: "nether" }] },
      distribution: { iterations, coordinate_eval_order: "zyx", x: { distribution: "uniform", extent: [0, 16] }, y: { distribution: "uniform", extent: [0, 128] }, z: { distribution: "uniform", extent: [0, 16] } },
    },
  });
}
const furnace = (id, input, output) => write(path.join(BP, "recipes", `${id}.json`), {
  format_version: "1.20.10",
  "minecraft:recipe_furnace": { description: { identifier: `${NS}:${id}` }, tags: ["furnace", "blast_furnace"], input: `${NS}:${input}`, output: `${NS}:${output}` },
});
furnace("soulstone_smelted", "soulstone_cobble", "soulstone");
furnace("soulstone_smooth_smelted", "soulstone", "soulstone_smooth");
furnace("soul_dust_smelted", "soulstone_smooth", "soul_dust");
furnace("soulstone_cracked_smelted", "soulstone_bricks", "soulstone_cracked_bricks");
const nsItem = (id) => ({ item: `${NS}:${id}` });
recipe("soulstone_bricks", "shaped", { pattern: ["##", "##"], key: { "#": nsItem("soulstone") }, result: { ...nsItem("soulstone_bricks"), count: 4 } }, `${NS}:soulstone`);
recipe("soul_glass", "shaped", { pattern: [" E ", "EGE", " E "], key: { E: nsItem("soul_dust"), G: { item: "minecraft:glass" } }, result: nsItem("soul_glass") }, `${NS}:soul_dust`);

// Anima: the second material family, from Anima Ore in the Nether.
const DUST = [
  "................",
  "................",
  "................",
  "........#.......",
  ".......#*#......",
  "......#*##~.....",
  ".....#*####~....",
  "....#*######~...",
  "...#*########~..",
  "...#*#~##*##~~..",
  "..#*####~####~..",
  "..############..",
  "................",
  "................",
  "................",
  "................",
];
item("anima_dust", DUST, cfg.anima.color);
item("soul_dust", DUST, "#7a6250");
materials("anima", cfg.anima.color);
storageBlock("anima_block", "Anima Block", ESSENCE_BLOCK, cfg.anima.color, "stone");
packs("anima_dust", "anima_block");
for (const kind of ["ingot", "gemstone"])
  recipe(`anima_${kind}`, "shapeless", { ingredients: [nsItem(`vita_${kind}`), { item: `${NS}:anima_dust`, count: 2 }], result: nsItem(`anima_${kind}`) }, `${NS}:anima_dust`);

// Seed bases: what goes on the altar. Anima bases are for mob seeds.
item("vita_seed_base", SEEDS, cfg.vita.color);
item("anima_seed_base", SEEDS, cfg.anima.color);
recipe("vita_seed_base", "shaped", { pattern: [" # ", "#X#", " # "], key: { "#": nsItem("vita_shard"), X: { item: "minecraft:wheat_seeds" } }, result: nsItem("vita_seed_base") }, `${NS}:vita_shard`);
recipe("anima_seed_base", "shapeless", { ingredients: [nsItem("vita_seed_base"), { item: `${NS}:anima_dust`, count: 2 }], result: nsItem("anima_seed_base") }, `${NS}:anima_dust`);

// Hand items.
const WAND = [
  "................",
  "............+...",
  "..........+###..",
  "...........#*#+.",
  "..........h###..",
  ".........hh.+...",
  "........hh......",
  ".......hh.......",
  "......hh........",
  ".....hh.........",
  "....hh..........",
  "...hh...........",
  "..ss............",
  ".sss............",
  ".ss.............",
  "................",
];
const JAR = [
  "................",
  ".....bbbbbb.....",
  ".....bbbbbb.....",
  "......gggg......",
  ".....g....g.....",
  "....g......g....",
  "....g......g....",
  "....g......g....",
  "....g......g....",
  "....g......g....",
  "....g......g....",
  "....g......g....",
  "....gggggggg....",
  ".....gggggg.....",
  "................",
  "................",
];
const DAGGER = [
  "................",
  ".............bb.",
  "............b*b.",
  "...........b*bb.",
  "..........b*bb..",
  ".........b*bb...",
  "........b*bb....",
  ".......b*bb.....",
  "......b*bb......",
  "..gg.b*bb.......",
  "...ggbbb........",
  "....ggb.........",
  "...hhgg.........",
  "..hh..gg........",
  ".hh.............",
  "................",
];
item("wand", WAND, cfg.tiers[0].color, { "minecraft:max_stack_size": 1 }, { h: "#6b4a2f", s: "#8a8a8a" });
item("soul_jar", JAR, "#b8c8d8", { "minecraft:max_stack_size": 1 }, { b: cfg.anima.color, g: "#b8c8d8" });
recipe("wand", "shaped", { pattern: ["  E", " S ", "R  "], key: { E: { item: tierEssence(1) }, S: { item: "minecraft:stick" }, R: { item: "minecraft:stone" } }, result: nsItem("wand") }, tierEssence(1));
recipe("soul_jar", "shaped", { pattern: [" S ", "G G", " G "], key: { S: nsItem("anima_ingot"), G: nsItem("soul_glass") }, result: nsItem("soul_jar") }, `${NS}:anima_ingot`);
for (const [id, color, durability, damage] of [["anima_dagger", cfg.anima.color, BAL.daggerDurability, 3], ["passive_anima_dagger", "#6fbf5a", BAL.attunedDaggerDurability, 6], ["hostile_anima_dagger", "#c84a4a", BAL.attunedDaggerDurability, 6]])
  item(id, DAGGER, color, { "minecraft:max_stack_size": 1, "minecraft:hand_equipped": true, "minecraft:durability": { max_durability: durability }, "minecraft:damage": { value: damage } }, { b: color, g: "#e0b84a", h: "#6b4a2f" });
recipe("anima_dagger", "shaped", { pattern: [" D ", "ISI", " D "], key: { D: nsItem("anima_dust"), I: nsItem("anima_ingot"), S: { item: "minecraft:golden_sword" } }, result: nsItem("anima_dagger") }, `${NS}:anima_ingot`);

// Altar and pedestal: shaped blocks that hold one item each, in a hidden display entity (see scripts/main.js).
const boxFaces = (origin, size) => ({ origin, size, uv: Object.fromEntries(["north", "south", "east", "west", "up", "down"].map((f) => [f, { uv: [0, 0], uv_size: [16, 16] }])) });
const standGeometry = (id, cubes) => write(path.join(RP, "models", "blocks", `${id}.geo.json`), {
  format_version: "1.21.0",
  "minecraft:geometry": [{ description: { identifier: `geometry.${NS}_${id}`, texture_width: 16, texture_height: 16 }, bones: [{ name: "stand", pivot: [0, 0, 0], cubes }] }],
});
standGeometry("infusion_altar", [boxFaces([-8, 0, -8], [16, 3, 16]), boxFaces([-3, 3, -3], [6, 7, 6]), boxFaces([-7, 10, -7], [14, 3, 14])]);
standGeometry("infusion_pedestal", [boxFaces([-5, 0, -5], [10, 2, 10]), boxFaces([-2, 2, -2], [4, 9, 4]), boxFaces([-5, 11, -5], [10, 2, 10])]);
const STAND = grid((x, y) => {
  if (y < 3) return x % 5 === 2 ? "o" : "r"; // the gold-trimmed wool top
  return noise(x, y, 11) > 0.85 ? "T" : noise(x, y, 12) < 0.15 ? "k" : "t";
});
for (const [id, name, height] of [["infusion_altar", "Infusion Altar", 13], ["infusion_pedestal", "Infusion Pedestal", 13]]) {
  blockTexture(id, STAND, "#8f8f8f", { r: "#b02a2a", o: "#e8c14a", T: "#a8a8a8", t: "#8f8f8f", k: "#6e6e6e" });
  block(id, "stone", { menu_category: { category: "items" } }, {
    "minecraft:display_name": name,
    "minecraft:geometry": `geometry.${NS}_${id}`,
    "minecraft:collision_box": { origin: [-8, 0, -8], size: [16, height, 16] },
    "minecraft:selection_box": { origin: [-8, 0, -8], size: [16, height, 16] },
    "minecraft:destructible_by_mining": { seconds_to_destroy: 2 },
    "minecraft:light_dampening": 0,
    "minecraft:material_instances": { "*": { texture: `${NS}_${id}`, render_method: "alpha_test" } },
    "minecraft:loot": loot(id, [drop(`${NS}:${id}`)]),
    [`${NS}:stand`]: {},
    ...(id === "infusion_altar" && { "minecraft:tick": { interval_range: [20, 20], looping: true }, [`${NS}:altar`]: {} }),
  });
}
for (const [id, pattern] of [["infusion_altar", ["GCG", " S ", "SSS"]], ["infusion_pedestal", ["GCG", " S ", " S "]]])
  recipe(id, "shaped", { pattern, key: { S: { item: "minecraft:stone" }, C: { item: "minecraft:red_wool" }, G: { item: "minecraft:gold_ingot" } }, result: nsItem(id) }, "minecraft:gold_ingot");

// The display entity: invisible and untouchable, shows its item in a hand bone, and keeps the item in its own inventory across restarts.
write(path.join(BP, "entities", "item_display.json"), {
  format_version: "1.21.0",
  "minecraft:entity": {
    description: { identifier: `${NS}:item_display`, is_spawnable: false, is_summonable: true, is_experimental: false },
    components: {
      "minecraft:nameable": { always_show: false, allow_name_tag_renaming: false },
      "minecraft:type_family": { family: ["inanimate", `${NS}_item_display`] },
      "minecraft:damage_sensor": { triggers: [{ cause: "all", deals_damage: false }] },
      "minecraft:health": { value: 1, max: 1, min: 1 },
      "minecraft:knockback_resistance": { value: 1000, max: 1000 },
      "minecraft:collision_box": { width: 0.1, height: 0.1 },
      "minecraft:physics": { has_gravity: false, has_collision: false },
      "minecraft:pushable": { is_pushable: false, is_pushable_by_piston: false },
      "minecraft:fire_immune": true,
      "minecraft:inventory": { inventory_size: 1, container_type: "container", private: true },
    },
  },
});
write(path.join(RP, "entity", "item_display.entity.json"), {
  format_version: "1.10.0",
  "minecraft:client_entity": {
    description: {
      identifier: `${NS}:item_display`,
      materials: { default: "entity_alphatest" },
      textures: { default: "textures/entity/item_display" },
      geometry: { default: "geometry.item_display" },
      render_controllers: [`controller.render.${NS}_item_display`],
      enable_attachables: true,
    },
  },
});
write(path.join(RP, "models", "entity", "item_display.geo.json"), {
  format_version: "1.21.0",
  "minecraft:geometry": [{ description: { identifier: "geometry.item_display", texture_width: 16, texture_height: 16 }, bones: [{ name: "root", pivot: [0, 0, 0] }, { name: "rightItem", parent: "root", pivot: [0, 0, 0] }] }],
});
write(path.join(RP, "render_controllers", "item_display.render_controllers.json"), {
  format_version: "1.8.0",
  render_controllers: { [`controller.render.${NS}_item_display`]: { geometry: "Geometry.default", materials: [{ "*": "Material.default" }], textures: ["Texture.default"] } },
});
write(path.join(RP, "textures", "entity", "item_display.png"), png(16, Buffer.alloc(16 * 16 * 4)));

// Harvester: the front faces where the player stood, the way a furnace does. Its back shows where a chest goes.
const MACHINE_PALETTE = { b: TOOL_TIER.color, o: "#12263c", h: "#6b4a2f", H: "#93704a", e: "#2a2d33", r: "#9aa0a8", a: "#5c6168", c: "#4d5258", x: "#1c1e22", n: TOOL_TIER.color };
const machinePlate = (x, y) => {
  const edge = (v) => v === 0 || v === 15;
  if (edge(x) && edge(y)) return "r";
  if (edge(x) || edge(y)) return "e";
  return noise(x, y, 21) > 0.7 ? "a" : "c";
};
const inSquare = (x, y, from, to) => x >= from && x <= to && y >= from && y <= to;
blockTexture("machine_frame", grid((x, y) => (inSquare(x, y, 3, 12) ? "x" : machinePlate(x, y))), TOOL_TIER.color, MACHINE_PALETTE);
blockTexture("harvester_side", grid(machinePlate), TOOL_TIER.color, MACHINE_PALETTE);
blockTexture("harvester_front", grid((x, y) => (SICKLE[y][x] === "." ? machinePlate(x, y) : SICKLE[y][x])), TOOL_TIER.color, MACHINE_PALETTE);
blockTexture("harvester_back", grid((x, y) => (inSquare(x, y, 5, 10) ? "x" : inSquare(x, y, 4, 11) ? "n" : machinePlate(x, y))), TOOL_TIER.color, MACHINE_PALETTE);
block("machine_frame", "metal", { menu_category: { category: "items" } }, {
  "minecraft:display_name": "Machine Frame",
  "minecraft:geometry": "minecraft:geometry.full_block",
  "minecraft:destructible_by_mining": { seconds_to_destroy: 2.5 },
  "minecraft:material_instances": { "*": { texture: `${NS}_machine_frame` } },
  "minecraft:loot": loot("machine_frame", [drop(`${NS}:machine_frame`)]),
});
const FACING_ROTATIONS = { north: 0, south: 180, east: -90, west: 90 };
block("harvester", "metal", {
  menu_category: { category: "items" },
  traits: { "minecraft:placement_direction": { enabled_states: ["minecraft:cardinal_direction"], y_rotation_offset: 180 } },
}, {
  "minecraft:display_name": "Harvester",
  "minecraft:geometry": "minecraft:geometry.full_block",
  "minecraft:destructible_by_mining": { seconds_to_destroy: 2.5 },
  "minecraft:material_instances": { "*": { texture: `${NS}_harvester_side` }, north: { texture: `${NS}_harvester_front` }, south: { texture: `${NS}_harvester_back` } },
  "minecraft:loot": loot("harvester", [drop(`${NS}:harvester`)]),
  "minecraft:tick": { interval_range: [BAL.harvester.tickEvery, BAL.harvester.tickEvery], looping: true },
  [`${NS}:harvester`]: {},
}, Object.entries(FACING_ROTATIONS).map(([facing, y]) => ({
  condition: `q.block_state('minecraft:cardinal_direction') == '${facing}'`,
  components: { "minecraft:transformation": { rotation: [0, y, 0] } },
})));
const UPGRADE = [
  "................",
  "................",
  "...gggggggggg...",
  "..gg########gg..",
  "..g##*****##~g..",
  "..g#*######~~g..",
  "..g#*##gg##~~g..",
  "..g#*##gg##~~g..",
  "..g#*##gg##~~g..",
  "..g#*######~~g..",
  "..g##~~~~~~~~g..",
  "..gg~~~~~~~~gg..",
  "...gggggggggg...",
  "................",
  "................",
  "................",
];
const v_ = (id) => ({ item: `minecraft:${id}` });
item("upgrade_base", UPGRADE, cfg.vita.color, {}, { g: "#e0b84a" });
cfg.tiers.forEach((t) => item(`${t.id}_machine_upgrade`, UPGRADE, t.color, { "minecraft:max_stack_size": 1 }, { g: "#e0b84a" }));
recipe("machine_frame", "shaped", { pattern: ["IRI", "RSR", "IRI"], key: { I: v_("iron_ingot"), R: v_("redstone"), S: v_("stone") }, result: nsItem("machine_frame") }, "minecraft:redstone");
recipe("harvester", "shaped", { pattern: ["IAI", "SFS", "IAI"], key: { I: v_("iron_ingot"), A: nsItem("anima_ingot"), S: nsItem("essence_sickle"), F: nsItem("machine_frame") }, result: nsItem("harvester") }, `${NS}:machine_frame`);
recipe("upgrade_base", "shaped", { pattern: ["SVS", "VDV", "SVS"], key: { S: nsItem("vita_shard"), V: nsItem("vita_ingot"), D: v_("diamond") }, result: nsItem("upgrade_base") }, `${NS}:vita_ingot`);
cfg.tiers.forEach((t, i) => recipe(`${t.id}_machine_upgrade`, "shaped", {
  pattern: ["EIE", "IUI", "EIE"],
  key: { E: nsItem(`${t.id}_essence`), I: nsItem(`${t.id}_ingot`), U: nsItem(i ? `${cfg.tiers[i - 1].id}_machine_upgrade` : "upgrade_base") },
  result: nsItem(`${t.id}_machine_upgrade`),
}, `${NS}:${t.id}_ingot`));

// The Harvester's screen: an invisible entity inside the block, opened like a chest. It's only hittable while the "open" group is on (see scripts/main.js).
lang.push(`entity.${NS}:harvester_screen.name=Harvester`);
write(path.join(BP, "entities", "harvester_screen.json"), {
  format_version: "1.21.0",
  "minecraft:entity": {
    description: { identifier: `${NS}:harvester_screen`, is_spawnable: false, is_summonable: true, is_experimental: false },
    component_groups: {
      [`${NS}:closed`]: { "minecraft:collision_box": { width: 0.1, height: 0.1 } },
      [`${NS}:open`]: { "minecraft:collision_box": { width: 1.1, height: 1.1 } },
    },
    components: {
      "minecraft:nameable": { always_show: false, allow_name_tag_renaming: false },
      "minecraft:type_family": { family: ["inanimate", `${NS}_harvester_screen`] },
      "minecraft:damage_sensor": { triggers: [{ cause: "all", deals_damage: false }] },
      "minecraft:health": { value: 1, max: 1, min: 1 },
      "minecraft:knockback_resistance": { value: 1000, max: 1000 },
      "minecraft:physics": { has_gravity: false, has_collision: false },
      "minecraft:pushable": { is_pushable: false, is_pushable_by_piston: false },
      "minecraft:fire_immune": true,
      "minecraft:inventory": { inventory_size: 27, container_type: "container" },
    },
    events: {
      "minecraft:entity_spawned": { add: { component_groups: [`${NS}:closed`] } },
      [`${NS}:open`]: { remove: { component_groups: [`${NS}:closed`] }, add: { component_groups: [`${NS}:open`] } },
      [`${NS}:close`]: { remove: { component_groups: [`${NS}:open`] }, add: { component_groups: [`${NS}:closed`] } },
    },
  },
});

// Crop geometry: four planes in a # shape, like vanilla wheat. One face each: alpha_test draws both sides, and a second face would z-fight.
const plane = (origin, size, faces) => ({ origin, size, uv: Object.fromEntries(faces.map((f) => [f, { uv: [0, 0], uv_size: [16, 16] }])) });
write(path.join(RP, "models", "blocks", "crop.geo.json"), {
  format_version: "1.21.0",
  "minecraft:geometry": [{
    description: { identifier: `geometry.${NS}_crop`, texture_width: 16, texture_height: 16 },
    bones: [{
      name: "crop",
      pivot: [0, 0, 0],
      cubes: [
        plane([-8, 0, -4], [16, 16, 0], ["north"]),
        plane([-8, 0, 4], [16, 16, 0], ["north"]),
        plane([-4, 0, -8], [0, 16, 16], ["east"]),
        plane([4, 0, -8], [0, 16, 16], ["east"]),
      ],
    }],
  }],
});

write(path.join(RP, "textures", "terrain_texture.json"), { resource_pack_name: NS, texture_name: "atlas.terrain", padding: 8, num_mip_levels: 4, texture_data: terrain });
write(path.join(RP, "textures", "item_texture.json"), { resource_pack_name: NS, texture_name: "atlas.items", texture_data: itemTextures });
write(path.join(RP, "blocks.json"), { format_version: [1, 1, 0], ...sounds });
write(path.join(RP, "texts", "en_US.lang"), lang.join("\n") + "\n");
write(path.join(RP, "texts", "languages.json"), ["en_US"]);

const icon = png(128, scale(render(withSparkles(GEM, 4), cfg.tiers[0].color), 8));
write(path.join(BP, "pack_icon.png"), icon);
write(path.join(RP, "pack_icon.png"), icon);

// Filled in here because the other placeholders go in before any recipes exist.
const mainScript = path.join(BP, "scripts", "main.js");
write(mainScript, fs.readFileSync(mainScript, "utf8").replaceAll("__DEEPCORE_RECIPES__", JSON.stringify(DEEPCORE_RECIPES)));

// ---------- package ----------

const files = fs.readdirSync(BUILD, { recursive: true })
  .filter((f) => fs.statSync(path.join(BUILD, f)).isFile())
  .map((f) => ({ name: f.replaceAll("\\", "/"), data: fs.readFileSync(path.join(BUILD, f)) }));
const addonDir = path.join(ROOT, "addon");
fs.mkdirSync(addonDir, { recursive: true });
for (const f of fs.readdirSync(addonDir)) if (f.endsWith(".mcaddon")) fs.rmSync(path.join(addonDir, f));
const out = path.join(addonDir, `${SLUG}_v${cfg.version.join(".")}.mcaddon`);
write(out, zip(files));
console.log(`built ${path.relative(ROOT, out)} (${files.length} files)`);
previewSheet(path.join(BUILD, "preview.png")); // after zipping, so it stays out of the add-on
await import("./wiki.mjs"); // refreshes the wiki data and images from this build

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
