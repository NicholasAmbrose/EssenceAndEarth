// Caches icons for the vanilla items the wiki shows (crop ingredients and outputs) in tools/vanilla/,
// from the minecraft-textures npm package. Run it after adding a crop that uses a new vanilla item.
import fs from "node:fs";
import path from "node:path";

const PKG = "https://cdn.jsdelivr.net/npm/minecraft-textures@26.3.0/dist/textures";
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "tools", "vanilla");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "crops.json"), "utf8"));

const wanted = new Set(["minecraft:wheat_seeds", "minecraft:farmland", "minecraft:short_grass", "minecraft:bone_meal", "minecraft:wheat"]);
for (const c of cfg.crops) wanted.add(c.ingredient).add(c.output);

const manifest = await (await fetch(`${PKG}/manifest/26.3.json`)).json();
const byId = new Map(manifest.items.map((i) => [i.id, i]));
const namesFile = path.join(OUT, "names.json");
const names = fs.existsSync(namesFile) ? JSON.parse(fs.readFileSync(namesFile, "utf8")) : {};
fs.mkdirSync(OUT, { recursive: true });

for (const id of wanted) {
  const item = byId.get(id);
  if (!item) {
    console.warn(`no texture for ${id}`);
    continue;
  }
  const file = path.join(OUT, `${id.split(":")[1]}.png`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, Buffer.from(await (await fetch(`${PKG}/assets/${item.texture}`)).arrayBuffer()));
  names[id] = item.readable;
}
fs.writeFileSync(namesFile, JSON.stringify(names, null, 2) + "\n");
console.log(`${Object.keys(names).length} vanilla icons in tools/vanilla/`);
