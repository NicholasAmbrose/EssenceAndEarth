# Mob essence fallbacks

Mob essence uses straight-on faces. These are the two styles we tried and kept in case the faces don't work out. Nothing here goes into the add-on.

- `original/`: the plain puff in each mob's first colour.
- `suggested/`: the plain puff, recoloured to stand apart from the other crops.

| Crop | Original | Suggested |
|---|---|---|
| `zombie` | `#5f8a4a` | `#5f8a4a` |
| `spider` | `#5a3f3a` | `#7a1f4a` |
| `skeleton` | `#c9c9c0` | `#efe3bf` |
| `creeper` | `#4fbf4a` | `#8fd42a` |
| `slime` | `#7fcf6a` | `#b8eca0` |
| `blaze` | `#f0a020` | `#f0a020` |
| `enderman` | `#2a7d6f` | `#2a7d6f` |
| `wither_skeleton` | `#2e2e33` | `#1e1826` |
| `wither` | `#6a6385` | `#6a6385` |

## Switching to a fallback

Essence only: copy a set's PNGs into `art/textures/items/` and rebuild. A PNG there replaces the generated texture.

Everything: delete the crop's `face`, `faceColors` and `essenceColor` in `crops.json` and set its `color` from the table, which also changes its seeds and ripe crop.
