# Essence & Earth

A Minecraft Bedrock add-on: mine essence, upgrade it through five tiers, and grow crops that produce coal,
iron, gold, diamonds and more.

## Building

Needs Node 22+. No packages to install.

```sh
node tools/build.mjs            # writes dist/EssenceAndEarth_v<version>.mcaddon
node tools/build.mjs --deploy   # also copies the packs into your local Minecraft dev pack folders
```

`--deploy` is for testing in single player. Turn on both packs in a new world; dev packs reload when you
re-enter the world.

## Installing on a server

Upload `dist/*.mcaddon` (most hosts accept it as-is), or unzip it and copy `EssenceAndEarth_BP` into the
server's `behavior_packs/` and `EssenceAndEarth_RP` into `resource_packs/`, then enable them for the world
(`worlds/<world>/world_behavior_packs.json` and `world_resource_packs.json`, using the `uuid` and `version`
from each `manifest.json`). Bump `version` in `crops.json` on every release so clients download the new
resource pack.

## Layout

| Path | What |
|---|---|
| `crops.json` | Name, namespace, version, essence tiers and every crop. Most changes happen here. |
| `packs/BP`, `packs/RP` | Hand-written files copied into the build: manifests and `scripts/main.js` (crop growth and bone meal). |
| `tools/build.mjs` | Generates blocks, items, recipes, loot tables, ore worldgen and textures from `crops.json`. |
| `art/` | Optional hand-drawn textures. `art/textures/items/iron_seeds.png` replaces the generated placeholder at that path. |

`build/` and `dist/` are generated and not committed.

## Adding a crop

Add an entry to `crops.json`:

```json
{ "id": "lapis", "tier": 2, "color": "#2a4fbf", "ingredient": "minecraft:lapis_lazuli", "output": "minecraft:lapis_lazuli", "count": 8 }
```

- **Seeds:** 4 tier essence + 4 `ingredient` around wheat seeds.
- **Crop:** plant on farmland; grows in 4 stages (bone meal works). Ripe crops drop 1–2 crop essence and a seed (10% chance of a second).
- **Output:** 8 crop essence in a ring crafts `count` × `output`.

## Known limits

- Unwatered farmland under a custom crop still turns back to dirt, which pops the crop. Keep farmland hydrated.
- Essence ore only generates in newly generated chunks.
