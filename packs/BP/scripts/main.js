import { system, world, EquipmentSlot, GameMode, ItemStack } from "@minecraft/server";

// __NS__, __ESSENCE__ (the tier-1 essence) and __FARMLAND_BONUS__ are filled in from crops.json at build time.
const GROWTH = "__NS__:growth";
const MAX_STAGE = 3;
const GROW_CHANCE = 0.5; // per random tick

// Essence farmland id -> chance that a ripe crop on it drops one extra essence.
const FARMLAND_BONUS = __FARMLAND_BONUS__;

// Tier-1 essence also has a small chance to drop from grass and ripe vanilla crops,
// so older worlds without essence ore in their explored chunks can still get started.
const GRASS = new Set(["minecraft:short_grass", "minecraft:tall_grass", "minecraft:fern", "minecraft:large_fern"]);
const CROPS = new Set(["minecraft:wheat", "minecraft:carrots", "minecraft:potatoes", "minecraft:beetroot"]);
const GRASS_CHANCE = 0.02;
const CROP_CHANCE = 0.05;

world.afterEvents.playerBreakBlock.subscribe(({ block, brokenBlockPermutation: broken, player, dimension }) => {
  if (player.getGameMode() === GameMode.Creative) return;
  const id = broken.type.id;
  if (id.startsWith("__NS__:") && id.endsWith("_crop")) {
    const bonus = FARMLAND_BONUS[block.below()?.typeId] ?? 0;
    if (broken.getState(GROWTH) === MAX_STAGE && Math.random() < bonus)
      dimension.spawnItem(new ItemStack(id.replace(/_crop$/, "_essence")), block.center());
    return;
  }
  const chance = GRASS.has(id) ? GRASS_CHANCE : CROPS.has(id) && broken.getState("growth") === 7 ? CROP_CHANCE : 0;
  if (Math.random() < chance) dimension.spawnItem(new ItemStack("__ESSENCE__"), block.center());
});

function grow(block) {
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
