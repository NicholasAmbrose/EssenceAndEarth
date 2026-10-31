# In-game test list

Everything below is built but not yet checked in-game. Tick items off as they pass, and delete a section once it's all done.

Before starting: upload the latest `addon/*.mcaddon` to the server, and use creative mode or `/give` for anything expensive.

## Essence ore removed (v0.10.1)

- [ ] Newly explored chunks have no essence ore.
- [ ] Ore already in the world still shows properly and still drops Terra Essence when mined.
- [ ] Getting the first 8 Terra Essence from grass and vanilla crops doesn't feel like too much of a grind.

## Terra crop and tier locking (v0.10.0)

- [ ] **Before uploading:** check higher-tier farms on the server, because crops on too-low farmland stop growing and can pop off.
- [ ] Terra seeds craft from 4 Terra + 4 dirt around wheat seeds, and grow on every farmland tier.
- [ ] A ripe Terra crop drops 1–2 Terra Essence, its seed, and the farmland bonus. There's no separate essence item.
- [ ] Each seed plants on farmland of its own tier and higher, and is refused on anything lower. Test iron on Terra and Aqua, and diamond on Ignis and Aether.
- [ ] All 5 farmland recipes craft with the plus shape: 1 of the tier below (dirt for Terra) in the middle, 4 essence around it.
- [ ] In an old world, a crop on too-low farmland doesn't grow or take bone meal, and if it pops off it drops items and causes no errors.
- [ ] A retired bone meal crop still grows on Terra farmland.
- [ ] The sickle and hoe work on the Terra crop, and the hoe replants correctly on a locked crop.

## Essence Guide (v0.9.0)

- [ ] **Check this first:** the add-on loads on the server with no script errors in the log, and older features such as bone meal still work. The new `@minecraft/server-ui` dependency could stop all the scripts if its version doesn't match.
- [ ] The guide crafts from 1 book + 1 Terra Essence, in any slots, and shows its texture.
- [ ] Using it from the hand opens the menu, and every topic and Back button works.
- [ ] Each player gets one free copy on joining, and no second copy after dying or rejoining. With a full inventory, it drops at their feet.
- [ ] Long pages scroll, and the text reads well on a small screen.

## Essence tools (v0.8.0)

- [ ] The sickle crafts from 3 Aqua Essence + 2 sticks, and the hoe from 2 Aqua Essence + 2 sticks. Both show their textures and hold as a tool in the hand.
- [ ] Breaking a ripe crop with the sickle harvests only the ripe crops in the 3×3, on essence and vanilla crops (wheat, carrots, potatoes, beetroot).
- [ ] The sickle refuses to break an unripe crop, and breaks other blocks normally.
- [ ] Right-clicking a ripe crop with the hoe drops the harvest and replants it at stage 0, leaving one fewer seed in the drops, including on vanilla crops.
- [ ] Right-clicking an unripe crop with the hoe does nothing, and bone meal still works.
- [ ] Farmland bonus essence and vanilla crop Terra Essence still drop from tool harvests.
- [ ] Durability falls by 1 per crop harvested and by nothing extra from the game itself. The tool breaks at zero with the sound, and creative mode uses none.
- [ ] Aqua Essence repairs both tools in an anvil.

## Terra Essence from grass and Loggers (v0.7.4)

- [ ] Hand-cut grass drops Terra Essence about 20% of the time (raised in v0.10.2).
- [ ] A Wildbloom Logger cutting trees drops Terra Essence for about 5% of logs, including logs high up a tall tree.
- [ ] Chopping logs far from any Logger never drops essence.
- [ ] Felling a tree causes no noticeable lag.

## Terra Essence from vanilla crops (v0.7.3)

- [ ] Ripe vanilla crops, harvested by hand or by the reaper, drop Terra Essence about 15% of the time (roughly 15 per 100 harvests).

## Mod tag (v0.7.2)

- [ ] Items and blocks (farmland, accelerators) show a blue `@ESSENCE&EARTH` line under their name in the inventory.
- [ ] Block names show properly, not as `tile.ee:...`.

## Crop rendering (v0.7.1)

- [ ] Crops no longer flicker or show hatching when you walk around them, at every growth stage.
- [ ] Crop planes show from both sides, with no invisible angles.

## Farmland (v0.5.0)

- [ ] Seeds won't plant on vanilla farmland, dirt or grass.
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
