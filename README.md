# Essence & Earth

A Minecraft Bedrock add-on: mine essence, upgrade it through five tiers, and grow crops that produce coal,
iron, gold, diamonds and more.

## Building

Needs Node 22+. No packages to install.

```sh
node tools/build.mjs            # writes addon/EssenceAndEarth_v<version>.mcaddon
node tools/build.mjs --deploy   # also copies the packs into your local Minecraft dev pack folders
```

`--deploy` is for testing in single player. Turn on both packs in a new world; dev packs reload when you
re-enter the world.

## Installing on a server

Upload `addon/*.mcaddon` (most hosts accept it as-is), or unzip it and copy `EssenceAndEarth_BP` into the
server's `behavior_packs/` and `EssenceAndEarth_RP` into `resource_packs/`, then enable them for the world
(`worlds/<world>/world_behavior_packs.json` and `world_resource_packs.json`, using the `uuid` and `version`
from each `manifest.json`). Bump `version` in `crops.json` on every release so clients download the new
resource pack.

## Wiki

https://nicholasambrose.github.io/EssenceAndEarth/ is a Blazor WebAssembly site in `src/EssenceWiki`. Its pages aren't
written by hand: every build runs `tools/wiki.mjs`, which writes `wwwroot/data/wiki.json` from `crops.json` and copies
every texture into `wwwroot/img/icons/`. On every push to `main`, `.github/workflows/deploy.yml` rebuilds it and deploys
it to GitHub Pages.

```sh
node tools/build.mjs
cd src/EssenceWiki && dotnet run   # preview locally
```

Vanilla item icons (recipe ingredients) are cached in `tools/vanilla/`. After adding a crop that uses a new vanilla item,
run `node tools/fetch-vanilla.mjs`.

## Backing up the server world

```sh
node tools/backup.mjs           # needs EXAROTON_TOKEN; writes backups/world_<date>.zip
```

Run it before uploading a new version. Saving is paused during the download so the copy is consistent.
`backups/` is git-ignored. To restore, upload the zip's `world` folder in the exaroton panel.

## Layout

| Path | What |
|---|---|
| `crops.json` | Name, namespace, version, essence tiers and every crop. Most changes happen here. |
| `packs/BP`, `packs/RP` | Hand-written files copied into the build: manifests and `scripts/main.js` (crop growth and bone meal). |
| `tools/build.mjs` | Generates blocks, items, recipes, loot tables, ore worldgen and textures from `crops.json`, and checks it for mistakes. Writes `build/preview.png`, a sheet of every generated texture. |
| `tools/wiki.mjs`, `src/EssenceWiki` | The wiki: data generator and Blazor site. |
| `tools/backup.mjs` | Downloads the server world into `backups/`. |
| `art/` | Optional hand-drawn textures. `art/textures/items/iron_seeds.png` replaces the generated placeholder at that path. |

`build/` is generated and not committed. `addon/` holds the latest `.mcaddon` and is committed so it can be downloaded from GitHub.

## Adding a crop

Add an entry to `crops.json`:

```json
{ "id": "lapis", "tier": 2, "color": "#2a4fbf", "ingredient": "minecraft:lapis_lazuli", "output": "minecraft:lapis_lazuli", "count": 8 }
```

Never rename or remove a crop `id` once it is on a server: crops already planted in the world become unknown blocks.

- **Seeds:** 4 tier essence + 4 `ingredient` around wheat seeds.
- **Crop:** plant on farmland; grows in 4 stages (bone meal works). Ripe crops drop 1–2 crop essence and a seed (10% chance of a second).
- **Output:** 8 crop essence in a ring crafts `count` × `output`.

## For other add-ons

Machines that harvest, grow or replant crops can support Essence & Earth like this:

- **Growth:** each crop is `ee:<id>_crop` with a block state `ee:growth` from 0 to 3. Ripe is 3.
- **Harvest:** break it with drops (for example `setblock x y z air destroy`). The ripe crop's loot table drops its essence
  and seeds; the farmland bonus essence is added by our script whatever broke the crop.
- **Replant:** `setType("ee:<id>_crop")` gives a fresh stage-1 crop. Crops grow on `minecraft:farmland` and
  `ee:<tier>_farmland`.
- **Seeds:** `ee:<id>_seeds` places `ee:<id>_crop`.

## Known limits

- Unwatered farmland under a custom crop still turns back to dirt, which pops the crop. Keep farmland hydrated.
- Essence ore only generates in newly generated chunks. Terra essence (tier 1) also drops from grass (2%) and ripe
  wheat, carrots, potatoes and beetroot (5%), so existing worlds can still get started.
