import { system, world, EntityInitializationCause, EquipmentSlot, GameMode, ItemStack } from "@minecraft/server";

// __NS__, __ESSENCE__ (the tier-1 essence) and __FARMLAND_BONUS__ are filled in from crops.json at build time.
const GROWTH = "__NS__:growth";
const MAX_STAGE = 3;
const GROW_CHANCE = 0.5; // per random tick

// Essence farmland id -> chance that a ripe crop on it drops one extra essence.
const FARMLAND_BONUS = __FARMLAND_BONUS__;

// Tier-1 essence also has a small chance to drop from grass and ripe vanilla crops,
// so older worlds without essence ore in their explored chunks can still get started.
const GRASS = new Set(["minecraft:short_grass", "minecraft:tall_grass", "minecraft:fern", "minecraft:large_fern"]);
const GRASS_CHANCE = 0.02;
const CROP_CHANCE = 0.05;
// Item a harvested vanilla crop drops -> smallest stack that means it was ripe.
// Unripe wheat and beetroot drop only seeds; unripe carrots and potatoes drop exactly 1.
const RIPE_DROP = { "minecraft:wheat": 1, "minecraft:beetroot": 1, "minecraft:carrot": 2, "minecraft:potato": 2 };
const FARMLAND = new Set(["minecraft:farmland", ...Object.keys(FARMLAND_BONUS)]);

// Grass: only players cut it, and it often drops nothing, so this one stays a player event.
world.afterEvents.playerBreakBlock.subscribe(({ block, brokenBlockPermutation: broken, player, dimension }) => {
  if (player.getGameMode() === GameMode.Creative) return;
  if (GRASS.has(broken.type.id) && Math.random() < GRASS_CHANCE) drop(dimension, "__ESSENCE__", block.center());
});

// Crops are judged by what they drop rather than who broke them, so harvesting machines
// (anything that breaks blocks with drops, like `setblock ... destroy`) roll the same chances as players.
// A harvest drop appears inside the crop's block, right above the farmland; items a player throws appear
// at head height, so they never match.
const ours = new Set(); // ids of item entities this script spawned, so they don't roll again

function drop(dimension, item, location) {
  ours.add(dimension.spawnItem(new ItemStack(item), location).id);
}

world.afterEvents.entitySpawn.subscribe(({ entity, cause }) => {
  if (cause !== EntityInitializationCause.Spawned || entity.typeId !== "minecraft:item") return;
  if (ours.delete(entity.id) || !entity.isValid) return; // picked up or merged in the same tick
  const stack = entity.getComponent("minecraft:item")?.itemStack;
  if (!stack) return;
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

function grow(block) {
  // Machines can setType a crop onto any soil, past the placement filter. It just won't grow there.
  if (!(block.below()?.typeId in FARMLAND_BONUS)) return false;
  const stage = block.permutation.getState(GROWTH);
  if (stage >= MAX_STAGE) return false;
  block.setPermutation(block.permutation.withState(GROWTH, stage + 1));
  return true;
}

system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
  blockComponentRegistry.registerCustomComponent("__NS__:crop", {
    onRandomTick({ block }) {
      if (Math.random() < GROW_CHANCE) grow(block);
    },
    onPlayerInteract({ block, player, dimension }) {
      const equip = player?.getComponent("minecraft:equippable");
      const item = equip?.getEquipment(EquipmentSlot.Mainhand);
      if (item?.typeId !== "minecraft:bone_meal" || !grow(block)) return;
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
