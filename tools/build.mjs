// Builds the add-on: copies packs/ into build/, generates every tier, crop, recipe, loot table and
// texture from crops.json, zips addon/<Name>_v<version>.mcaddon (replacing older versions there).
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

// Catch crops.json mistakes here instead of as silent failures in-game.
const problems = [];
const seen = new Set();
for (const c of cfg.crops) {
  if (seen.has(c.id)) problems.push(`duplicate crop id "${c.id}"`);
  seen.add(c.id);
  if (!/^[a-z0-9_]+$/.test(c.id)) problems.push(`${c.id}: id must be lowercase letters, digits and _`);
  if (!(c.tier >= 1 && c.tier <= cfg.tiers.length)) problems.push(`${c.id}: tier must be 1-${cfg.tiers.length}`);
  if (!/^#[0-9a-f]{6}$/i.test(c.color)) problems.push(`${c.id}: color must look like #a1b2c3`);
  for (const k of ["ingredient", "output"]) if (!/^[a-z0-9_]+:[a-z0-9_.]+$/.test(c[k] ?? "")) problems.push(`${c.id}: ${k} must be an item id like minecraft:iron_ingot`);
  if (!(Number.isInteger(c.count) && c.count >= 1 && c.count <= 64)) problems.push(`${c.id}: count must be 1-64`);
  if (c.essenceColor && !/^#[0-9a-f]{6}$/i.test(c.essenceColor)) problems.push(`${c.id}: essenceColor must look like #a1b2c3`);
  if (c.face && !(c.face.length === 8 && c.face.every((r) => r.length === 8) && [...c.face.join("")].every((ch) => ch === "." || c.faceColors?.[ch]))) problems.push(`${c.id}: face must be 8 rows of 8, using . or a faceColors key`);
  if (c.alt && !/^[a-z0-9_]+:[a-z0-9_.]+$/.test(c.alt.output ?? "")) problems.push(`${c.id}: alt.output must be an item id like minecraft:iron_ingot`);
  if (c.alt && !(Number.isInteger(c.alt.count) && c.alt.count >= 1 && c.alt.count <= 64)) problems.push(`${c.id}: alt.count must be 1-64`);
}
const BAL = cfg.balance;
for (const k of ["boneMealChance", "grassEssenceChance", "cropEssenceChance", "logEssenceChance", "secondSeedChance"])
  if (!(BAL[k] >= 0 && BAL[k] <= 1)) problems.push(`balance.${k} must be 0-1`);
if (!(BAL.growChance > 0 && BAL.growChance <= 1)) problems.push("balance.growChance must be above 0, up to 1");
for (const k of ["harvestEssence", "oreEssence"]) {
  const [min, max] = BAL[k] ?? [];
  if (!(Number.isInteger(min) && Number.isInteger(max) && min >= 1 && min <= max)) problems.push(`balance.${k} must be [min, max], whole numbers from 1`);
}
if (BAL.farmlandBonus?.length !== cfg.tiers.length || !BAL.farmlandBonus.every((v) => v >= 0 && v <= 1)) problems.push(`balance.farmlandBonus needs ${cfg.tiers.length} values, each 0-1`);
if (BAL.acceleratorRolls?.length !== cfg.tiers.length || !BAL.acceleratorRolls.every((v) => v > 0)) problems.push(`balance.acceleratorRolls needs ${cfg.tiers.length} values, each above 0`);
if (!(Number.isInteger(BAL.maxAccelerators) && BAL.maxAccelerators >= 1)) problems.push("balance.maxAccelerators must be a whole number from 1");
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
//   g/G/l stem green, dark green, leaf green   s stone   v vein   w white   . transparent
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

// Tools: b blade and h handle are palette colours, * blade highlight.
const SICKLE = [
  "................",
  ".....bbbbb......",
  "...bb***bbbb....",
  "..bbb....bbbb...",
  "..b.......bbbb..",
  "...........bbb..",
  "...........bbb..",
  "..........bbbb..",
  ".........bbbb...",
  "........hbbb....",
  ".......hhb......",
  "......hhh.......",
  ".....hhh........",
  "....hhh.........",
  "...hh...........",
  "................",
];
const HOE = [
  "................",
  "................",
  "........bbbbbb..",
  ".......b**bbbbb.",
  ".......bbbbhhbb.",
  "........bbhhhbb.",
  "..........hhh.b.",
  ".........hhh....",
  "........hhh.....",
  ".......hhh......",
  "......hhh.......",
  ".....hhh........",
  "....hhh.........",
  "...hhh..........",
  "...h............",
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
const grid = (fn) => Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => fn(x, y)).join(""));
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
  { title: "Getting Started", body: `Mine Essence Ore underground, between y -48 and 48, in newly explored chunks. Each ore drops ${range(BAL.oreEssence)} ${tierTitle(cfg.tiers[0])} Essence.\n\n${tierTitle(cfg.tiers[0])} Essence also drops now and then from grass and ferns (${pct(BAL.grassEssenceChance)}) and ripe vanilla crops (${pct(BAL.cropEssenceChance)}).\n\nFour essence of one tier craft one of the next:\n${cfg.tiers.map(tierTitle).join(" > ")}` },
  { title: "Seeds and Harvest", body: `Surround wheat seeds with 4 tier essence and 4 of the resource to craft seeds.\n\nSeeds only grow on essence farmland.\n\nA ripe crop drops ${range(BAL.harvestEssence)} essence and its seed, with a ${pct(BAL.secondSeedChance)} chance of a second seed.\n\nEight essence in a ring craft the resource. Each use of bone meal has a ${pct(BAL.boneMealChance)} chance to advance a crop one stage.` },
  { title: "Essence Farmland", body: `Crops need essence farmland, of any tier. It never dries out and needs no water.\n\n5 dirt + 4 ${tierTitle(cfg.tiers[0])} Essence make ${tierTitle(cfg.tiers[0])} Farmland. Each later tier takes 5 of the tier below + 4 of its essence.\n\nChance of +1 essence per ripe harvest:\n${cfg.tiers.map((t, i) => `${tierTitle(t)} ${pct(BAL.farmlandBonus[i])}`).join("\n")}` },
  { title: "Growth Accelerators", body: `Stack up to ${BAL.maxAccelerators} directly under essence farmland to make the crop above grow faster.\n\nTiers can be mixed in any order. Any other block in the stack cuts off the accelerators below it.\n\n5 cobblestone + 4 ${tierTitle(cfg.tiers[0])} Essence make the first. Each later tier takes 5 of the tier below + 4 of its essence.` },
  { title: "Tools", body: `Essence Sickle: break a ripe crop to harvest every ripe crop in the 3x3 around it. It won't break unripe crops.\n\nEssence Hoe: right-click a ripe crop to harvest and replant it. The replant takes one seed from the drops.\n\nBoth last ${BAL.toolDurability} uses and repair with ${tierTitle(cfg.tiers[1])} Essence in an anvil.` },
  { title: "Crops by Tier", body: `${cfg.tiers.map((t, i) => [t, cfg.crops.filter((c) => c.tier === i + 1 && !c.retired)]).filter(([, crops]) => crops.length).map(([t, crops]) => `${tierTitle(t)}: ${crops.map((c) => title(c.id)).join(", ")}`).join("\n\n")}\n\nFull recipes: nicholasambrose.github.io/EssenceAndEarth` },
];

for (const file of fs.readdirSync(path.join(BP, "scripts"), { recursive: true })) {
  const f = path.join(BP, "scripts", file);
  const bonus = Object.fromEntries(cfg.tiers.map((t, i) => [`${NS}:${t.id}_farmland`, BAL.farmlandBonus[i]]));
  if (f.endsWith(".js"))
    write(f, fs.readFileSync(f, "utf8")
      .replaceAll("__BALANCE__", JSON.stringify(BAL))
      .replaceAll("__FARMLAND_BONUS__", JSON.stringify(bonus))
      .replaceAll("__ACCELERATOR_ROLLS__", JSON.stringify(Object.fromEntries(cfg.tiers.map((t, i) => [`${NS}:${t.id}_accelerator`, BAL.acceleratorRolls[i]]))))
      .replaceAll("__GUIDE_PAGES__", JSON.stringify(GUIDE_PAGES))
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

function blockTexture(id, mask, color) {
  texture(`textures/blocks/${id}`, mask, color);
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

function recipe(id, type, body, unlock) {
  write(path.join(BP, "recipes", `${id}.json`), {
    format_version: "1.20.10",
    [`minecraft:recipe_${type}`]: { description: { identifier: `${NS}:${id}` }, tags: ["crafting_table"], unlock: [{ item: unlock }], ...body },
  });
}

// Essence tiers: 4 of the previous tier make 1 of the next.
const tierEssence = (n) => `${NS}:${cfg.tiers[n - 1].id}_essence`;
cfg.tiers.forEach((t, i) => {
  item(`${t.id}_essence`, withSparkles(GEM, i), t.color);
  if (i > 0)
    recipe(`${t.id}_essence`, "shapeless", { ingredients: [{ item: tierEssence(i), count: 4 }], result: { item: tierEssence(i + 1) } }, tierEssence(i));
});

// Essence farmland: never dries out, and gives ripe crops a chance of extra essence (see scripts/main.js).
// Our crops grow on nothing else. 5 dirt + 4 Terra make 1 Terra farmland; 5 of the tier below + 4 of its essence make 1 of each later tier.
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
  recipe(id, "shaped", {
    pattern: ["BEB", "EBE", "BEB"],
    key: { B: { item: i ? FARMLANDS[i - 1] : "minecraft:dirt" }, E: { item: tierEssence(i + 1) } },
    result: { item: `${NS}:${id}`, count: BAL.farmlandYield },
  }, tierEssence(i + 1));
});

// Growth accelerators: go under essence farmland and add growth rolls to the crop above (see scripts/main.js).
// 5 cobblestone + 4 Terra make 1 Terra accelerator; 5 of the tier below + 4 of its essence make 1 of each later tier.
cfg.tiers.forEach((t, i) => {
  const id = `${t.id}_accelerator`;
  blockTexture(id, ACCELERATOR, t.color);
  block(id, "stone", { menu_category: { category: "items" } }, {
    "minecraft:display_name": `${title(t.id)} Growth Accelerator`,
    "minecraft:geometry": "minecraft:geometry.full_block",
    "minecraft:destructible_by_mining": { seconds_to_destroy: 1.5 },
    "minecraft:material_instances": { "*": { texture: `${NS}_${id}` } },
    "minecraft:loot": loot(id, [drop(`${NS}:${id}`)]),
  });
  recipe(id, "shaped", {
    pattern: ["BEB", "EBE", "BEB"],
    key: { B: { item: i ? `${NS}:${cfg.tiers[i - 1].id}_accelerator` : "minecraft:cobblestone" }, E: { item: tierEssence(i + 1) } },
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
  }, { b: TOOL_TIER.color, h: "#6b4a2f" });
  recipe(id, "shaped", { pattern, key: { E: { item: toolEssence }, S: { item: "minecraft:stick" } }, result: { item: `${NS}:${id}` } }, toolEssence);
}

// Essence Guide: using it opens the menu in scripts/main.js.
item("essence_guide", BOOK, cfg.tiers[0].color, { "minecraft:max_stack_size": 1 }, { c: cfg.tiers[0].color, d: "#2f6e20", g: "#dff5d4", p: "#efe9d8" });
recipe("essence_guide", "shapeless", { ingredients: [{ item: "minecraft:book" }, { item: tierEssence(1) }], result: { item: `${NS}:essence_guide` } }, tierEssence(1));

// Essence ore: the only source of tier-1 essence.
blockTexture("essence_ore", ORE, cfg.tiers[0].color);
block("essence_ore", "stone", { menu_category: { category: "nature" } }, {
  "minecraft:display_name": "Essence Ore",
  "minecraft:geometry": "minecraft:geometry.full_block",
  "minecraft:destructible_by_mining": { seconds_to_destroy: 3 },
  "minecraft:material_instances": { "*": { texture: `${NS}_essence_ore` } },
  "minecraft:loot": loot("essence_ore", [drop(tierEssence(1), ...BAL.oreEssence)]),
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
[0, 1, 2].forEach((s) => blockTexture(`crop_${s}`, STAGES[s]));
const cropMaterial = (tex) => ({ "*": { texture: `${NS}_${tex}`, render_method: "alpha_test", ambient_occlusion: false, face_dimming: false } });

for (const c of cfg.crops) {
  const seeds = `${NS}:${c.id}_seeds`, essence = `${NS}:${c.id}_essence`, growth = `${NS}:growth`;
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
      "minecraft:placement_filter": { conditions: [{ allowed_faces: ["up"], block_filter: FARMLANDS }] },
      "minecraft:loot": loot(`${c.id}_crop`, [drop(seeds)]),
      [`${NS}:crop`]: {},
    },
    [1, 2, 3].map((s) => ({
      condition: `q.block_state('${growth}') == ${s}`,
      components: {
        "minecraft:material_instances": cropMaterial(s < 3 ? `crop_${s}` : `${c.id}_crop`),
        ...(s === 3 && { "minecraft:loot": loot(`${c.id}_crop_ripe`, [drop(essence, ...BAL.harvestEssence), drop(seeds), drop(seeds, 1, 1, BAL.secondSeedChance)]) }),
      },
    })),
  );

  item(`${c.id}_seeds`, SEEDS, c.color, { "minecraft:block_placer": { block: `${NS}:${c.id}_crop`, use_on: FARMLANDS } });
  item(`${c.id}_essence`, c.face ? faceMask(c.face) : WISP, c.essenceColor ?? c.color, {}, c.faceColors);

  // A retired crop can't be started any more, but what's already planted keeps working.
  if (!c.retired)
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
  // A second drop needs its own shape: the ring with its gap at the top instead of the middle.
  if (c.alt)
    recipe(`${c.id}_alt_from_essence`, "shaped", {
      pattern: ["E E", "EEE", "EEE"],
      key: { E: { item: essence } },
      result: { item: c.alt.output, count: c.alt.count },
    }, essence);
}

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
