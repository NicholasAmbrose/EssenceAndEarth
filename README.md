# Essence & Earth

A Minecraft Bedrock add-on: gather essence, upgrade it through five tiers, and grow crops that produce coal,
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
| `packs/BP`, `packs/RP` | Hand-written files copied into the build: manifests and `scripts/main.js` (crop growth, accelerators, farmland conversion, tools and the Essence Guide menu). |
| `tools/build.mjs` | Generates blocks, items, recipes, loot tables and textures from `crops.json`, and checks it for mistakes. Writes `build/preview.png`, a sheet of every generated texture. |
| `tools/wiki.mjs`, `src/EssenceWiki` | The wiki: data generator and Blazor site. |
| `tools/backup.mjs` | Downloads the server world into `backups/`. |
| `art/` | Optional hand-drawn textures. `art/textures/items/iron_seeds.png` replaces the generated placeholder at that path. |

`build/` is generated and not committed. `addon/` holds the latest `.mcaddon` and is committed so it can be downloaded from GitHub.

## Adding a crop

Add an entry to `crops.json`:

```json
{ "id": "lapis", "tier": 2, "color": "#2a4fbf", "ingredient": "minecraft:lapis_lazuli", "output": "minecraft:lapis_lazuli", "count": 8 }
```

Never rename or remove a crop `id` once it is on a server: crops already planted in the world become unknown blocks. To take a crop out of the game, add `"retired": true`: its seeds can no longer be crafted and it leaves the wiki, but planted crops keep working.

- **Seeds:** 4 tier essence + 4 `ingredient` around wheat seeds.
- **Crop:** plants on any farmland and grows in 4 stages. Ripe crops drop crop essence and a seed. Essence farmland adds a chance of a second of each, which is higher if its tier matches the crop's.
- **Output:** crop essence in the crop's `shape` crafts `count` × `output`. Shapes are listed under `shapes` in `crops.json`, and the default is `ring`.
- **Essence crop (optional):** `"essenceCrop": true`, on a crop whose `id` matches a tier, drops that tier's essence directly, with no crop essence or ring recipe. The Terra crop uses this.
- **Face (optional):** `face` is 8 rows of 8 characters drawn on the essence, and `faceColors` gives each character's colour. `essenceColor` optionally gives the essence a different body colour from its seeds and crop. Mob crops use these. See [the fallbacks](reference/mob-essence-fallbacks/README.md) for the plain versions.
- **Second output (optional):** add `"alt": { "output": "minecraft:arrow", "count": 8, "shape": "row" }`. It needs a different shape from the main output.

Growth accelerators (`ee:<tier>_accelerator`) go below a crop. On a timer, each gives the first crop above it (from 2 blocks up, within its tier's range) one extra growth roll.

Balance, tiers and recipes follow [Mystical Agriculture](https://github.com/BlakeBr0/MysticalAgriculture) by BlakeBr0 (MIT licence, © BlakeBr0), so its players feel at home. No code or art is copied.

## Balance

Every tuning number lives in the `balance` block of `crops.json`. Change one, rebuild and upload the add-on; the wiki picks it up from the same place.

| Setting | What it does |
|---|---|
| `growChance` | Chance per random tick or accelerator tick to advance a stage |
| `grassEssenceChance`, `cropEssenceChance`, `logEssenceChance` | Chance of Terra Essence from grass, ripe vanilla crops, and each log dropped near a Wildbloom Logger |
| `harvestEssence`, `oreEssence`, `vitaShards` | `[min, max]` essence from a ripe crop and Essence Ore, and shards from Vita Ore |
| `mobEssenceChance`, `fertilizedEssenceChance` | Chance of Terra Essence from a mob, and of Fertilized Essence from a ripe crop |
| `secondaryChance` | Chance of a second essence, and of a second seed, on essence farmland |
| `matchingFarmlandChance` | Added to `secondaryChance` when the farmland's tier matches the crop's |
| `terraCropYield` | Per farmland tier: average essence from a ripe Terra crop |
| `farmlandRefundChance` | Chance of getting one old essence back when swapping a farmland's tier |
| `acceleratorSeconds` | Average time between an accelerator's growth rolls |
| `acceleratorRange` | Per tier: how many blocks up an accelerator reaches |
| `farmlandYield`, `acceleratorYield` | How many blocks one craft makes |
| `toolDurability` | Uses the Essence Sickle and Essence Hoe last. An anvil repair with Aqua Essence restores a quarter |

## For other add-ons

Machines that harvest, grow or replant crops can support Essence & Earth like this:

- **Growth:** each crop is `ee:<id>_crop` with a block state `ee:growth` from 0 to 3. Ripe is 3.
- **Harvest:** break it with drops (for example `setblock x y z air destroy`). The ripe crop's loot table drops its essence
  and seeds; the farmland bonus essence is added by our script whatever broke the crop.
- **Replant:** `setType("ee:<id>_crop")` gives a fresh stage-1 crop. Crops grow on vanilla farmland and any `ee:<tier>_farmland`.
  A crop placed on anything else by script never grows.
- **Seeds:** `ee:<id>_seeds` places `ee:<id>_crop`.

## Testing

[TESTING.md](TESTING.md) lists what still needs checking in-game.

## Known limits

- Ores always drop their items, because Bedrock's block loot can't check for Silk Touch.
- Tier upgrades take 4 essence with no Infusion Crystal, until crafting is confirmed to be able to wear a crystal down.
