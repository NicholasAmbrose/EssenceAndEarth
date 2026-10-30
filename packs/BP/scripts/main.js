import { system, EquipmentSlot, GameMode } from "@minecraft/server";

// __NS__ is replaced with the namespace from crops.json at build time.
const GROWTH = "__NS__:growth";
const MAX_STAGE = 3;
const GROW_CHANCE = 0.5; // per random tick

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
