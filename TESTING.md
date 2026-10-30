# In-game test list

Everything below is built but not yet checked in-game. Tick items off as they pass, and delete a section once it's all done.

Before starting: upload the latest `addon/*.mcaddon` to the server, and use creative mode or `/give` for anything expensive.

## Farmland (v0.5.0)

- [ ] Seeds won't plant on vanilla farmland, dirt or grass.
- [ ] Seeds plant on every tier of essence farmland.
- [ ] Terra farmland crafts from 5 dirt + 4 Terra Essence and makes 1.
- [ ] Each later farmland crafts from 5 of the tier below + 4 of its essence and makes 1.
- [ ] Breaking farmland pops the crop on top, and the farmland drops itself.
- [ ] Crops planted before this update on vanilla farmland stop growing and don't crash anything.

## Raw metal (v0.5.1)

- [ ] Copper, iron and gold essence craft raw metal, not ingots.
- [ ] The raw metal goes through the Deepcore Crusher and comes out as dust.

## Growth accelerators (v0.6.0)

- [ ] All 5 accelerators craft: 5 cobblestone + 4 Terra for the first, then 5 of the tier below + 4 of its essence.
- [ ] Each shows the right name and tier colour, with white sparks around the roots.
- [ ] Each drops itself when mined.
- [ ] Time a crop with no accelerators, ideally a few. **The plan expects about 20 minutes on average.** Note the real number, because all the plan's times depend on it.
- [ ] A stack of 4 Astra under the farmland makes the crop ripen far faster. **The plan expects about 3.7 minutes.**
- [ ] A mixed stack (3 Terra + 1 Ignis) works and is faster than no stack.
- [ ] A stone block in the middle of a stack cuts off the accelerators below it.
- [ ] A fifth accelerator adds nothing.
- [ ] An accelerator with no farmland between it and the crop does nothing.

## Balance settings and bone meal (v0.6.1)

- [ ] Bone meal on a crop sometimes misses, and shows green particles and uses one item every time.
- [ ] A crop takes about 12 bone meal on average.
- [ ] Bone meal on a ripe crop isn't used up.
- [ ] Creative mode uses no bone meal.
- [ ] Vanilla crops still take bone meal normally.

## Mob crops (v0.7.0)

- [ ] All 9 seeds craft from 4 tier essence + 4 of the drop around wheat seeds: zombie, spider (eyes), skeleton (bones), creeper, slime, blaze, enderman, wither skeleton, wither.
- [ ] Each crop grows, and shows its colour when ripe. Enderman is purple, wither is pale blue, and their essence stays dark.
- [ ] Each mob essence shows its face in the inventory, and is recognisable at normal size.
- [ ] 8 essence in a ring (gap in the middle) crafts the drop: rotten flesh, string, bones, gunpowder, slime balls, blaze rods, ender pearls, wither skeleton skulls, nether stars.
- [ ] 8 spider essence with the gap in the top middle crafts spider eyes.
- [ ] 8 skeleton essence with the gap in the top middle crafts arrows.
- [ ] Both shapes appear in the recipe book for spider and skeleton, and each gives the right item.
- [ ] Bone meal seeds can no longer be crafted, but a bone meal crop that's already planted still grows, and its essence still crafts bone meal.
- [ ] Diamond seeds now use Aether Essence, and diamond crops already planted keep working.
- [ ] A second seed drops rarely, about 1 harvest in 20.
- [ ] Wither skeleton seeds accept real skulls, and the crafted skull works for summoning a wither.

## Machines (Wildbloom)

- [ ] Wildbloom's harvester breaks ripe crops, and the farmland bonus essence still drops.
- [ ] Wildbloom's growth machine advances our crops.
- [ ] The Tiller's known issue: it can place our seeds on vanilla farmland, where they won't grow. See [Wildbloom issue #2](https://github.com/baseballr/Wildbloom/issues/2).

## Wiki

- [ ] The accelerators section, mob crop pages and roadmap all appear on the live site.
- [ ] The download link gets the current version.
