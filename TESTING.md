# In-game test list

Everything below is built but not yet checked in-game. Tick items off as they pass, and delete a section once it's all done.

Before starting: upload the latest `addon/*.mcaddon` to the server, and use creative mode or `/give` for anything expensive.

## Ores and materials (v0.12.0)

- [ ] **Check this first:** the add-on loads with no script errors or content log errors about features.
- [ ] New chunks have Essence Ore between y -32 and 64, and Vita Ore between y -60 and 24, each in stone and deepslate. Veins are about 8 blocks.
- [ ] Essence Ore drops 2–4 Terra Essence, and Vita Ore drops 1–4 Vita Shards. Old ore in the world keeps working.
- [ ] Most mobs drop Terra Essence about 20% of the time. Slimes, magma cubes, ghasts, phantoms and players never do.
- [ ] Mob essence that lands on farmland doesn't cause extra drops, and neither does ore essence.
- [ ] 4 shards + iron ingot makes a Vita Ingot, and 4 shards + diamond makes a Vita Gemstone.
- [ ] Vita Ingot + 2 tier essence makes that tier's ingot, in any slots, and the same for gemstones.
- [ ] Nuggets, ingot blocks, gemstone blocks, essence blocks and the Vita Block all craft both ways. Blocks show their textures and names.
- [ ] 1 tier essence breaks back into 4 of the tier below.
- [ ] Each accelerator crafts from 4 essence, 4 stone and 1 gemstone, and makes 3.
- [ ] About 10% of ripe resource crops drop Fertilized Essence. The Terra crop never does.
- [ ] Fertilized Essence advances an unripe crop 1 or 2 stages, or 2–5 on vanilla crops, and uses one. Essence Fertilizer ripens a crop and uses one. Neither is used on a ripe crop, and creative mode uses none.
- [ ] Essence Fertilizer crafts from 4 Terra + 4 bone meal + diamond (makes 4), and 4 Terra + 4 Fertilized Essence + diamond (makes 8).

## Bedrock risk checks (v0.11.1)

Nothing in the add-on uses these yet. They decide how the later gear and machine phases get built.

Already answered by reading Deepcore v4.58's package:

- **Machine storage and screens work.** Its `dq:machine_screen` is an invisible, undamageable entity with a `minecraft:inventory`, sitting in the machine's block.
- **Item displays work.** Its `dq:crate_view` entity shows items. A note in its `crate.js` says an item held in a hand bone draws as a tilted 3D model, so it moved to flat icons picked by entity properties.
- **Custom armor works.** It ships a wearable suit with attachables.

Still needs testing in-game:

- [ ] **Crystal wear:** can a crafting recipe return a damaged tool? Try a shaped recipe with a damaged item as an ingredient. Until this is settled, tier upgrades stay at 4 essence with no Infusion Crystal.
- [ ] **Flight:** nothing in Deepcore grants flight, and I found no script call for it. Confirm whether `/ability` works on the server. If not, the flight augment becomes Levitation or Slow Falling.

## Farming rebalance (v0.11.0)

- [ ] **Check this first:** the add-on loads on the server with no script errors in the log.
- [ ] Time a crop with no accelerators, ideally a few. **Expect about 24 minutes.**
- [ ] One accelerator directly under the farmland ripens a crop in **about 3.5 minutes**, and two take about half that.
- [ ] **Accelerators already placed before this update keep working.** If they do nothing, breaking and replacing one should start it. Note which happens.
- [ ] A Terra accelerator reaches a crop 9 blocks up from its range start, with other blocks between, and an Astra one reaches 45. It speeds up only the first crop above it.
- [ ] Accelerators also speed up wheat, carrots, potatoes and beetroot.
- [ ] 50 or so accelerators cause no noticeable lag.
- [ ] Seeds plant on vanilla farmland and every essence farmland tier. A crop grows on all of them, including higher-tier seeds on Terra Farmland.
- [ ] A crop on vanilla farmland pops off cleanly if the farmland dries back to dirt.
- [ ] Ripe crops on vanilla farmland drop exactly 1 essence and 1 seed.
- [ ] Over many harvests, second essence and second seed each drop about 10% of the time on non-matching essence farmland, and 20% on matching.
- [ ] A ripe Terra crop averages 1, 1.5, 2, 2.5 and 3 essence from Terra up to Astra Farmland, with no separate essence item.
- [ ] Using tier essence on vanilla farmland converts it, uses one essence, and keeps the crop on top. Creative mode uses none.
- [ ] Using a different tier's essence on essence farmland swaps it, returning the old essence about 25% of the time. The same tier's essence does nothing and isn't used.
- [ ] 1 dirt + 1 tier essence crafts that tier's farmland, in any slots.
- [ ] Bone meal does nothing on our crops and isn't used up. It still works on vanilla crops.
- [ ] Every output recipe shows and crafts its shape: ring 8, full 9 (diamond, emerald, wither skeleton, wither), row 3 in each of the 3 rows (wood, nether wart, zombie, spider string, skeleton arrows, creeper, slime), and square 4 (sand, clay).
- [ ] Spider and skeleton show both recipes in the recipe book, and each gives the right item.
- [ ] Copper, iron and gold now craft ingots, and netherite crafts ingots rather than scrap.
- [ ] The sickle and hoe still work, and the hoe's seed removal still takes one seed when a second seed drops.
- [ ] A retired bone meal crop still grows, and its essence still crafts bone meal.
- [ ] The Guide's pages and the wiki match what happens in-game.

## Terra crop (v0.10.0)

- [ ] Terra seeds craft from 4 Terra + 4 dirt around wheat seeds.

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
- [ ] Right-clicking an unripe crop with the hoe does nothing.
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

- [ ] Seeds won't plant on dirt or grass.
- [ ] Breaking farmland pops the crop on top, and the farmland drops itself.

## Growth accelerators (v0.6.0)

- [ ] Each shows the right name and tier colour, with white sparks around the roots.
- [ ] Each drops itself when mined.

## Mob crops (v0.7.0)

- [ ] All 9 seeds craft from 4 tier essence + 4 of the drop around wheat seeds: zombie, spider (eyes), skeleton (bones), creeper, slime, blaze, enderman, wither skeleton, wither.
- [ ] Each crop grows, and shows its colour when ripe. Enderman is purple, wither is pale blue, and their essence stays dark.
- [ ] Each mob essence shows its face in the inventory, and is recognisable at normal size.
- [ ] Bone meal seeds can no longer be crafted.
- [ ] Wither skeleton seeds accept real skulls, and the crafted skull works for summoning a wither.

## Machines (Wildbloom)

Read against Wildbloom v0.1.34's code on 2026-10-30. These still need a real run.

- [ ] The Reaper breaks only ripe crops and replants them at stage 0, and the essence, seed and farmland bonus all drop. It keeps the seed too, so expect a surplus of seeds.
- [ ] Quickbloom advances our crops one stage at a time and stops at ripe.
- [ ] Harvestbloom resets ripe crops to stage 0 with no drops, in exchange for mana. Keep it away from farms you want to harvest.
- [ ] The Tiller leaves our seeds and farmland alone ([Wildbloom issue #2](https://github.com/baseballr/Wildbloom/issues/2), fixed in v0.1.34).
- [ ] **Spring ritual:** it looks like it will crash before growing anything, in `growAround` in Wildbloom's `machines.js`, because `c` is used before it's defined. This would affect every crop, including vanilla.

## Wiki

- [ ] The accelerators section, mob crop pages and roadmap all appear on the live site.
- [ ] The download link gets the current version.
