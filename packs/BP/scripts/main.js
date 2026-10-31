import { system, world, BlockVolume, EntityInitializationCause, EquipmentSlot, GameMode, ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

// NS, ESSENCE (the tier-1 essence), BALANCE, FARMLAND_BONUS, ACCELERATOR_ROLLS, GUIDE_PAGES, FARMLAND_TIER and CROP_TIER placeholders are filled in from crops.json at build time.
const GROWTH = "__NS__:growth";
const MAX_STAGE = 3;
const {
  growChance: GROW_CHANCE, // per random tick
  boneMealChance: BONE_MEAL_CHANCE,
  grassEssenceChance: GRASS_CHANCE,
  cropEssenceChance: CROP_CHANCE,
  logEssenceChance: LOG_CHANCE,
  maxAccelerators: MAX_ACCELERATORS,
} = __BALANCE__;

// Essence farmland id -> chance that a ripe crop on it drops one extra essence.
const FARMLAND_BONUS = __FARMLAND_BONUS__;

// Accelerator id -> growth rolls it adds per random tick, for an unbroken stack under the farmland.
const ACCELERATOR_ROLLS = __ACCELERATOR_ROLLS__;

// Tier-1 essence also has a small chance to drop from grass and ripe vanilla crops,
// so older worlds without essence ore in their explored chunks can still get started.
const GRASS = new Set(["minecraft:short_grass", "minecraft:tall_grass", "minecraft:fern", "minecraft:large_fern"]);
// Item a harvested vanilla crop drops -> smallest stack that means it was ripe.
// Unripe wheat and beetroot drop only seeds; unripe carrots and potatoes drop exactly 1.
const RIPE_DROP = { "minecraft:wheat": 1, "minecraft:beetroot": 1, "minecraft:carrot": 2, "minecraft:potato": 2 };
const FARMLAND = new Set(["minecraft:farmland", ...Object.keys(FARMLAND_BONUS)]);

const SICKLE = "__NS__:essence_sickle";
const HOE = "__NS__:essence_hoe";
// Vanilla crop block -> the item that replants it. Vanilla crops are ripe at growth 7.
const VANILLA_SEEDS = { "minecraft:wheat": "minecraft:wheat_seeds", "minecraft:carrots": "minecraft:carrot", "minecraft:potatoes": "minecraft:potato", "minecraft:beetroot": "minecraft:beetroot_seeds" };
const isOurCrop = (id) => id.startsWith("__NS__:") && id.endsWith("_crop");
const isCrop = (id) => id in VANILLA_SEEDS || isOurCrop(id);
const growthState = (id) => (isOurCrop(id) ? GROWTH : "growth");
const isRipe = (permutation) => {
  const id = permutation?.type.id;
  return !!id && isCrop(id) && permutation.getState(growthState(id)) === (isOurCrop(id) ? MAX_STAGE : 7);
};

// Tools harvest with `destroy` so their drops take the same path as machines' (see entitySpawn below).
function harvest(dimension, { x, y, z }) {
  dimension.runCommand(`setblock ${x} ${y} ${z} air destroy`);
}

function wear(player, amount) {
  if (player.getGameMode() === GameMode.Creative) return;
  const equip = player.getComponent("minecraft:equippable");
  const tool = equip?.getEquipment(EquipmentSlot.Mainhand);
  const durability = tool?.getComponent("minecraft:durability");
  if (!durability) return;
  if (durability.damage + amount > durability.maxDurability) {
    equip.setEquipment(EquipmentSlot.Mainhand);
    player.playSound("random.break");
    return;
  }
  durability.damage += amount;
  equip.setEquipment(EquipmentSlot.Mainhand, tool);
}

function sweep(player, dimension, { x, y, z }) {
  let harvested = 1; // the crop the player broke
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const location = { x: x + dx, y, z: z + dz };
      if (!isRipe(dimension.getBlock(location)?.permutation)) continue;
      harvest(dimension, location);
      harvested++;
    }
  wear(player, harvested);
}

// The sickle never breaks an unripe crop.
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const { block, itemStack } = event;
  if (itemStack?.typeId === SICKLE && isCrop(block.typeId) && !isRipe(block.permutation)) event.cancel = true;
});

// Takes one seed back out of a harvest's drops, so the hoe's replant costs what replanting by hand does.
// ponytail: wheat and beetroot can drop no seeds, which makes that replant free; harmless, and vanilla already gives plenty.
function takeSeed(dimension, location, seed) {
  const center = { x: location.x + 0.5, y: location.y + 0.5, z: location.z + 0.5 };
  for (const entity of dimension.getEntities({ location: center, maxDistance: 1.5, type: "minecraft:item" })) {
    const stack = entity.getComponent("minecraft:item")?.itemStack;
    if (stack?.typeId !== seed) continue;
    entity.remove();
    if (stack.amount > 1) drop(dimension, seed, entity.location, stack.amount - 1);
    return;
  }
}

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { block, itemStack, player, isFirstEvent } = event;
  if (itemStack?.typeId !== HOE || !isRipe(block.permutation)) return;
  event.cancel = true;
  if (!isFirstEvent) return; // holding the button repeats the event
  const { dimension, location, permutation: ripe } = block;
  const id = ripe.type.id;
  const seed = VANILLA_SEEDS[id] ?? id.replace(/_crop$/, "_seeds");
  system.run(() => {
    harvest(dimension, location);
    dimension.getBlock(location)?.setPermutation(ripe.withState(growthState(id), 0));
    if (player.isValid) wear(player, 1);
    system.run(() => takeSeed(dimension, location, seed)); // the drops exist from the next tick
  });
});

const GUIDE = "__NS__:essence_guide";
const GUIDE_PAGES = __GUIDE_PAGES__; // [{ title, body }]
const GOT_GUIDE = "__NS__:got_guide"; // player tag, so the free copy only comes once

async function showGuide(player) {
  const menu = new ActionFormData().title("Essence Guide").body("Grow your resources. Pick a topic.");
  for (const { title } of GUIDE_PAGES) menu.button(title);
  const { canceled, selection } = await menu.show(player);
  if (canceled) return;
  const { title, body } = GUIDE_PAGES[selection];
  const page = await new ActionFormData().title(title).body(body).button("Back").show(player);
  if (!page.canceled) await showGuide(player);
}

world.afterEvents.itemUse.subscribe(({ itemStack, source }) => {
  if (itemStack.typeId === GUIDE) showGuide(source);
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn || player.hasTag(GOT_GUIDE)) return;
  player.addTag(GOT_GUIDE);
  const left = player.getComponent("minecraft:inventory")?.container.addItem(new ItemStack(GUIDE));
  if (left) player.dimension.spawnItem(left, player.location); // full inventory
});

// Grass: only players cut it, and it often drops nothing, so this one stays a player event.
world.afterEvents.playerBreakBlock.subscribe(({ block, brokenBlockPermutation: broken, itemStackBeforeBreak: tool, player, dimension }) => {
  if (tool?.typeId === SICKLE && isRipe(broken)) sweep(player, dimension, block.location);
  if (player.getGameMode() === GameMode.Creative) return;
  if (GRASS.has(broken.type.id) && Math.random() < GRASS_CHANCE) drop(dimension, "__ESSENCE__", block.center());
});

// Crops are judged by what they drop rather than who broke them, so harvesting machines
// (anything that breaks blocks with drops, like `setblock ... destroy`) roll the same chances as players.
// A harvest drop appears inside the crop's block, right above the farmland; items a player throws appear
// at head height, so they never match.
const ours = new Set(); // ids of item entities this script spawned, so they don't roll again

function drop(dimension, item, location, amount = 1) {
  ours.add(dimension.spawnItem(new ItemStack(item, amount), location).id);
}

// Wildbloom's Logger flower breaks logs with `setblock ... destroy`, and reaches 6 blocks out and up a whole tree.
// Nothing marks who broke a log, so any log item dropping near a Logger counts.
// ponytail: logs a player chops near a Logger roll too; needs Wildbloom to send a script event to tell them apart.
function nearLogger(dimension, { x, y, z }) {
  const { min, max } = dimension.heightRange;
  const volume = new BlockVolume(
    { x: Math.floor(x) - 8, y: Math.max(min, Math.floor(y) - 32), z: Math.floor(z) - 8 },
    { x: Math.floor(x) + 8, y: Math.min(max - 1, Math.floor(y) + 8), z: Math.floor(z) + 8 },
  );
  try {
    return !dimension.getBlocks(volume, { includeTypes: ["wb:fn_logger"] }, true).getBlockLocationIterator().next().done;
  } catch {
    return false; // Wildbloom isn't installed
  }
}

world.afterEvents.entitySpawn.subscribe(({ entity, cause }) => {
  if (cause !== EntityInitializationCause.Spawned || entity.typeId !== "minecraft:item") return;
  if (ours.delete(entity.id) || !entity.isValid) return; // picked up or merged in the same tick
  const stack = entity.getComponent("minecraft:item")?.itemStack;
  if (!stack) return;
  if (stack.typeId.startsWith("minecraft:") && stack.typeId.endsWith("_log")) {
    // Rolled first so the search only runs on the logs that win.
    if (Math.random() < LOG_CHANCE && nearLogger(entity.dimension, entity.location)) drop(entity.dimension, "__ESSENCE__", entity.location);
    return;
  }
  const { x, y, z } = entity.location;
  let soil;
  try {
    soil = entity.dimension.getBlock({ x: Math.floor(x), y: Math.floor(y) - 1, z: Math.floor(z) })?.typeId;
  } catch {
    return; // unloaded chunk
  }
  if (!FARMLAND.has(soil)) return;

  if (stack.amount >= (RIPE_DROP[stack.typeId] ?? Infinity)) {
    if (Math.random() < CROP_CHANCE) drop(entity.dimension, "__ESSENCE__", entity.location);
  } else if (stack.typeId.startsWith("__NS__:") && stack.typeId.endsWith("_essence")) {
    // Our crops only drop essence when ripe, so its appearance on farmland is a ripe harvest.
    if (Math.random() < (FARMLAND_BONUS[soil] ?? 0)) drop(entity.dimension, stack.typeId, entity.location);
  }
});

// Farmland id -> its tier, and crop id -> the lowest farmland tier it grows on.
const FARMLAND_TIER = __FARMLAND_TIER__;
const CROP_TIER = __CROP_TIER__;

function canGrow(block) {
  // Machines can setType a crop onto any soil, past the placement filter. It just won't grow there.
  return FARMLAND_TIER[block.below()?.typeId] >= CROP_TIER[block.typeId] && block.permutation.getState(GROWTH) < MAX_STAGE;
}

function grow(block) {
  if (canGrow(block)) block.setPermutation(block.permutation.withState(GROWTH, block.permutation.getState(GROWTH) + 1));
}

function growthRolls(block) {
  let rolls = 1;
  try {
    for (let i = 0; i < MAX_ACCELERATORS; i++) {
      const extra = ACCELERATOR_ROLLS[block.below(i + 2)?.typeId]; // +2 skips the farmland
      if (!extra) break;
      rolls += extra;
    }
  } catch {
    // below the world or in an unloaded chunk
  }
  return rolls;
}

system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
  blockComponentRegistry.registerCustomComponent("__NS__:crop", {
    onRandomTick({ block }) {
      // A fraction of a roll is a last roll at that fraction of the chance.
      for (let rolls = growthRolls(block); rolls > 0; rolls--) if (Math.random() < GROW_CHANCE * Math.min(rolls, 1)) grow(block);
    },
    onPlayerInteract({ block, player, dimension }) {
      const equip = player?.getComponent("minecraft:equippable");
      const item = equip?.getEquipment(EquipmentSlot.Mainhand);
      if (item?.typeId !== "minecraft:bone_meal" || !canGrow(block)) return;
      // A failed roll still uses the bone meal, like vanilla saplings.
      if (Math.random() < BONE_MEAL_CHANCE) grow(block);
      dimension.spawnParticle("minecraft:crop_growth_emitter", block.center());
      if (player.getGameMode() === GameMode.Creative) return;
      if (item.amount > 1) {
        item.amount -= 1;
        equip.setEquipment(EquipmentSlot.Mainhand, item);
      } else {
        equip.setEquipment(EquipmentSlot.Mainhand);
      }
    },
  });
});
