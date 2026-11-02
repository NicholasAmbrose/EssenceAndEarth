// Writes the wiki's data from crops.json and the built packs (build.mjs runs this at the end):
//   src/EssenceWiki/wwwroot/data/wiki.json   every page, recipe and gallery image
//   src/EssenceWiki/wwwroot/img/icons/       our textures, straight from the resource pack
//   src/EssenceWiki/wwwroot/img/vanilla/     vanilla icons, from the tools/vanilla/ cache
import fs from "node:fs";
import path from "node:path";

const REPO = "NicholasAmbrose/EssenceAndEarth";
const MIN_BEDROCK = "1.21.90";

const ROOT = path.resolve(import.meta.dirname, "..");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "crops.json"), "utf8"));
const RECIPES = JSON.parse(fs.readFileSync(path.join(ROOT, "recipes.json"), "utf8"));
const BAL = cfg.balance;
const ALL_CROPS = cfg.crops;
const RETIRED_FILES = new Set(ALL_CROPS.filter((c) => c.retired).flatMap((c) => [`${c.id}_seeds.json`, `${c.id}_essence.json`]));
cfg.crops = cfg.crops.filter((c) => !c.retired);
const SLUG = cfg.name.replaceAll("&", "And").replace(/\W/g, "");
const RP = path.join(ROOT, "build", `${SLUG}_RP`);
const BP = path.join(ROOT, "build", `${SLUG}_BP`);
const WWW = path.join(ROOT, "src", "EssenceWiki", "wwwroot");
const VANILLA = path.join(ROOT, "tools", "vanilla");
const vanillaNames = JSON.parse(fs.readFileSync(path.join(VANILLA, "names.json"), "utf8"));
const version = cfg.version.join(".");
const file = `${SLUG}_v${version}.mcaddon`;

const title = (id) => id.replace(/(^|_)(\w)/g, (_, sep, c) => (sep ? " " : "") + c.toUpperCase());
const slug = (id) => id.replaceAll("_", "-");
const pct = (v) => `${+(v * 100).toFixed(1)}%`;
const range = ([min, max]) => (min === max ? `${min}` : `${min}–${max}`);
const harvest = range(BAL.harvestEssence), secondary = pct(BAL.secondaryChance), matching = pct(BAL.secondaryChance + BAL.matchingFarmlandChance);

// ---------- images ----------

for (const dir of ["icons", "vanilla"]) fs.rmSync(path.join(WWW, "img", dir), { recursive: true, force: true });
fs.mkdirSync(path.join(WWW, "img", "icons"), { recursive: true });
fs.mkdirSync(path.join(WWW, "img", "vanilla"), { recursive: true });
for (const sub of ["items", "blocks"])
  for (const f of fs.readdirSync(path.join(RP, "textures", sub))) fs.copyFileSync(path.join(RP, "textures", sub, f), path.join(WWW, "img", "icons", f));
fs.copyFileSync(path.join(RP, "pack_icon.png"), path.join(WWW, "img", "pack_icon.png"));

function vanilla(id) {
  const name = id.split(":")[1];
  const src = path.join(VANILLA, `${name}.png`);
  if (!fs.existsSync(src)) throw new Error(`No cached icon for ${id}. Run: node tools/fetch-vanilla.mjs`);
  fs.copyFileSync(src, path.join(WWW, "img", "vanilla", `${name}.png`));
  return { name: vanillaNames[id] ?? title(name), icon: `img/vanilla/${name}.png` };
}

// ---------- items and links ----------

const tierName = (t) => `${title(t.id)} Essence`;
const essenceHref = (id) => `wiki/essence/${slug(id)}`;
const cropHref = (c) => `wiki/${slug(cfg.tiers[c.tier - 1].id)}-crops/${slug(c.id)}`;
const tierItem = (t) => ({ name: tierName(t), icon: `img/icons/${t.id}_essence.png`, href: essenceHref(`${t.id}_essence`) });
const seedsItem = (c) => ({ name: `${title(c.id)} Seeds`, icon: `img/icons/${c.id}_seeds.png`, href: cropHref(c) });
const essenceItem = (c) => ({ name: `${title(c.id)} Essence`, icon: `img/icons/${c.id}_essence.png`, href: cropHref(c) });
const ripeItem = (c) => ({ name: `${title(c.id)} Crop`, icon: `img/icons/${c.id}_crop.png`, href: cropHref(c) });
const farmlandItem = (t) => ({ name: `${title(t.id)} Farmland`, icon: `img/icons/${t.id}_farmland_top.png`, href: `wiki/farmland/${slug(`${t.id}_farmland`)}` });
const acceleratorItem = (t) => ({ name: `${title(t.id)} Growth Accelerator`, icon: `img/icons/${t.id}_accelerator.png`, href: `wiki/accelerators/${slug(`${t.id}_accelerator`)}` });
// Average minutes for one accelerator alone to ripen a crop: 3 stages at growChance per timer.
const acceleratorMinutes = (3 / BAL.growChance * BAL.acceleratorSeconds / 60).toFixed(1);
const stages = (c) =>[0, 1, 2].map((s) => ({ name: `Stage ${s + 1}`, icon: `img/icons/crop_${s}.png` })).concat({ name: "Ripe", icon: `img/icons/${c.id}_crop.png` });

// ---------- recipes ----------

const recipes = [];
function recipe(result, count, rows, note) {
  const r = { result: { ...result, count }, rows, note };
  recipes.push(r);
  return { t: "grid", ...r };
}
const upgrade = (t, i) => {
  const p = tierItem(cfg.tiers[i - 1]);
  return recipe(tierItem(t), 1, [[p, p, null], [p, p, null], [null, null, null]], "Shapeless: 4 in any slots");
};
// An item in a recipe: a crop essence, one of our materials, or a vanilla item.
const ourCrops = new Map(ALL_CROPS.map((c) => [c.id, c]));
const anyItem = (id) => {
  const [ns, name] = id.split(":");
  if (ns !== "ee") return vanilla(id);
  const crop = name.endsWith("_essence") && ourCrops.get(name.slice(0, -8));
  return crop ? (crop.retired ? { name: title(name), icon: `img/icons/${name}.png` } : essenceItem(crop)) : { name: title(name), icon: `img/icons/${name}.png` };
};
const jarOf = (soul) => ({ name: `Soul Jar: ${cfg.souls[soul].need} ${title(soul)} Souls`, icon: "img/icons/soul_jar.png", href: "wiki/infusion/soul-jars" });
const seedBase = (kind) => ({ name: `${title(kind)} Seed Base`, icon: `img/icons/${kind}_seed_base.png`, href: "wiki/infusion/seed-bases" });
const seedsRecipe = (c) => {
  const e = tierItem(cfg.tiers[c.tier - 1]);
  if (c.essenceCrop) return recipe(seedsItem(c), 1, [[e, e, e], [e, vanilla("minecraft:wheat_seeds"), e], [e, e, e]]);
  const r = c.soul ? jarOf(c.soul) : anyItem(c.ingredient);
  return recipe(seedsItem(c), 1, [[e, r, e], [r, seedBase(c.soul ? "anima" : "vita"), r], [e, r, e]], "Made at the Infusion Altar: the seed base on the altar, the rest on any pedestals");
};
// A recipe belongs to the crop of the first essence in it, so each shows on one crop's page.
const recipeParts = (r) => r.ingredients ?? Object.values(r.key);
const recipesOf = (c) => RECIPES.filter((r) => recipeParts(r).find((id) => id.endsWith("_essence")) === `ee:${c.id}_essence`);
const essenceRecipe = (r) => {
  if (r.ingredients) {
    const items = r.ingredients.map(anyItem);
    return recipe(anyItem(r.result), r.count, [[items[0] ?? null, items[1] ?? null, items[2] ?? null], [null, null, null], [null, null, null]], "Shapeless: any slots");
  }
  const rows = [0, 1, 2].map((y) => [0, 1, 2].map((x) => {
    const id = r.key[r.pattern[y]?.[x]];
    return id ? anyItem(id) : null;
  }));
  return recipe(anyItem(r.result), r.count, rows);
};
const makesOne = (r) => `${r.count} × ${anyItem(r.result).name}`;
const yields = (c) => {
  if (c.essenceCrop) return `Drops ${tierName(cfg.tiers[c.tier - 1])} directly`;
  const all = recipesOf(c);
  if (!all.length) return "No recipes of its own yet";
  return all.length > 3 ? `${all.slice(0, 2).map(makesOne).join(", ")} and ${all.length - 2} more` : all.map(makesOne).join(", or ");
};
const farmlandRecipe = (t) => recipe(farmlandItem(t), BAL.farmlandYield, [[vanilla("minecraft:dirt"), tierItem(t), null], [null, null, null], [null, null, null]], "Shapeless: any slots");

const matItem = (id) => ({ name: title(id), icon: `img/icons/${id}.png`, href: "wiki/materials/" + slug(id.replace(/_(ingot|nugget|gemstone|shard|ingot_block|gemstone_block|block)$/, "")) });
const acceleratorRecipe = (t) => {
  const e = tierItem(t), s = vanilla("minecraft:stone"), g = matItem(`${t.id}_gemstone`);
  return recipe(acceleratorItem(t), BAL.acceleratorYield, [[e, s, e], [s, g, s], [e, s, e]]);
};

// ---------- pages ----------

const p = (html) => ({ t: "p", html });
const h2 = (text) => ({ t: "h2", text });
const facts = (rows) => ({ t: "facts", facts: rows });
const list = (items) => ({ t: "items", items });
const terraCrop = cfg.crops.find((c) => c.essenceCrop);
const terraYield = `${BAL.terraCropYield[0]} to ${BAL.terraCropYield.at(-1)} per ripe harvest on average, by farmland tier`;
const terraCropDrop = { ...seedsItem(terraCrop), name: "Terra Crop", icon: `img/icons/${terraCrop.id}_crop.png`, sub: terraYield };
const grassDrops = list([
  { name: "Essence Ore", icon: "img/icons/essence_ore.png", href: "wiki/materials/ores", sub: `Underground, y -32 to 64: ${range(BAL.oreEssence)} each` },
  { name: "Mobs", icon: vanilla("minecraft:rotten_flesh").icon, sub: `Most mobs: ${pct(BAL.mobEssenceChance)} chance` },
  { ...vanilla("minecraft:short_grass"), sub: `Grass and ferns: ${pct(BAL.grassEssenceChance)} chance` },
  { ...vanilla("minecraft:wheat"), sub: `Ripe wheat, carrots, potatoes, beetroot: ${pct(BAL.cropEssenceChance)} chance` },
]);

const guideItem = { name: "Essence Guide", icon: "img/icons/essence_guide.png", href: "wiki/guide/essence-guide" };
const guide = {
  slug: "guide", title: "Guide", group: "Getting started", icon: tierItem(cfg.tiers[0]).icon,
  blurb: "How Essence & Earth works, from your first essence to a farm of diamonds.",
  entries: [
    {
      slug: "getting-started", name: "Getting started", icon: tierItem(cfg.tiers[0]).icon,
      summary: "Find Terra Essence, upgrade it, and plant your first resource crop.",
      blocks: [
        p("Essence & Earth lets you grow resources. Every crop starts as essence: you combine essence with the resource you want, plant the seeds, and harvest essence that crafts back into that resource."),
        h2("1. Collect Terra Essence"),
        p(`Mine <a href="wiki/materials/ores">Essence Ore</a> underground, or collect Terra Essence from mobs, grass and ripe vanilla crops. Once you have a little, the <a href="${cropHref(terraCrop)}">Terra crop</a> gives you a steady supply.`),
        list([...grassDrops.items, terraCropDrop]),
        h2("2. Upgrade it"),
        p(`Four essence of one tier craft one of the next: ${cfg.tiers.map((t) => `<a href="${essenceHref(`${t.id}_essence`)}">${title(t.id)}</a>`).join(" → ")}. Each crop needs the essence of its tier.`),
        h2("3. Craft seeds and plant them"),
        p(`Build an <a href="wiki/infusion/infusion-altar">Infusion Altar</a> with eight pedestals. Put a seed base on the altar, and four tier essence and four of the resource on the pedestals, then use a Wand on the altar. Plant the seeds on any farmland and wait. <a href="wiki/farmland">Essence farmland</a> gives extra drops, and <a href="wiki/accelerators">growth accelerators</a> speed them up.`),
        h2("4. Harvest and craft"),
        p(`A ripe crop drops ${harvest} of its essence and its seed back. Each crop page shows the recipe that turns its essence into the resource.`),
      ],
    },
    {
      slug: "growing-crops", name: "Growing crops", icon: "img/icons/crop_2.png",
      summary: "Planting, growth stages and harvesting.",
      blocks: [
        facts([["Plant on", "Any farmland"], ["Growth", `4 stages, about ${pct(BAL.growChance)} chance per random tick`], ["Bone meal", "Doesn't work on these crops"], ["Ripe drops", `${harvest} essence and 1 seed, with extras on essence farmland`], ["Unripe drops", "The seed back"]]),
        list(stages(cfg.crops.find((c) => c.id === "iron") ?? cfg.crops[0])),
        h2("Essence farmland"),
        p(`On any <a href="wiki/farmland">essence farmland</a>, a ripe crop has a ${secondary} chance of a second essence and a ${secondary} chance of a second seed. If the farmland matches the crop's tier, each rises to ${matching}. On vanilla farmland there are no extras.`),
        h2("Growth accelerators"),
        p(`Place <a href="wiki/accelerators">growth accelerators</a> below a crop. Each gives it an extra growth chance about every ${BAL.acceleratorSeconds} seconds, so more means faster.`),
      ],
    },
    {
      slug: "essence-guide", name: guideItem.name, icon: guideItem.icon,
      summary: "An in-game book covering the basics.",
      blocks: [
        facts([["Use", "Hold it and press use to open the menu"], ["Topics", "Everything from your first essence to the Infusion Altar, plus crops by tier"], ["Free copy", "Every player gets one, once, when they join"]]),
        p("The guide's numbers and crop list always match the installed version of the add-on."),
        h2("Recipe"),
        (() => {
          const b = vanilla("minecraft:book"), e = tierItem(cfg.tiers[0]);
          return recipe(guideItem, 1, [[b, e, null], [null, null, null], [null, null, null]], "Shapeless: any slots");
        })(),
      ],
    },
  ],
};

const essence = {
  slug: "essence", title: "Essence", group: "Getting started", icon: tierItem(cfg.tiers[2]).icon,
  blurb: "The five essence tiers every crop is made from.",
  entries: [
    ...cfg.tiers.map((t, i) => {
      const crops = cfg.crops.filter((c) => c.tier === i + 1);
      return {
        slug: slug(`${t.id}_essence`), name: tierName(t), icon: tierItem(t).icon,
        summary: `Tier ${i + 1}. ${crops.length} crops use it.`,
        blocks: [
          facts([["Tier", `${i + 1} of ${cfg.tiers.length}`], ["Crops", `${crops.length}`]]),
          h2("How to get it"),
          ...(i === 0 ? [list([...grassDrops.items, terraCropDrop])] : [upgrade(t, i)]),
          h2("Seeds that need it"),
          crops.length ? list(crops.map((c) => ({ ...seedsItem(c), sub: yields(c) }))) : p("No crops use this tier yet."),
        ],
      };
    }),
  ],
};

const farmland = {
  slug: "farmland", title: "Essence farmland", group: "Getting started", icon: farmlandItem(cfg.tiers[0]).icon,
  blurb: "Farmland that never dries out and gives ripe crops a chance of a second essence and seed.",
  entries: cfg.tiers.map((t, i) => ({
    slug: slug(`${t.id}_farmland`), name: `${title(t.id)} Farmland`, icon: farmlandItem(t).icon,
    summary: `Best for tier ${i + 1} crops: ${matching} chance of each extra.`,
    blocks: [
      facts([["Tier", `${i + 1} of ${cfg.tiers.length}`], ["Tier " + (i + 1) + " crops", `${matching} chance of a second essence, and of a second seed`], ["Other crops", `${secondary} chance of each`], ["Terra crop", `${BAL.terraCropYield[i]} Terra Essence per harvest on average`], ["Water", "Not needed; never dries out"]]),
      list([{ ...farmlandItem(t), name: "Top", sub: "" }, { name: "Side", icon: `img/icons/${t.id}_farmland_side.png` }]),
      h2("How to make it"),
      p(`Use one ${tierName(t)} on placed farmland, or craft one dirt and one ${tierName(t)} to make ${BAL.farmlandYield}. Using it on farmland of another tier swaps the tier, with a ${pct(BAL.farmlandRefundChance)} chance of getting one of the old essence back.`),
      farmlandRecipe(t),
    ],
  })),
};

const accelerators = {
  slug: "accelerators", title: "Growth accelerators", group: "Getting started", icon: acceleratorItem(cfg.tiers[0]).icon,
  blurb: "Blocks that go below a crop and make it grow faster. Higher tiers reach further.",
  entries: cfg.tiers.map((t, i) => ({
    slug: slug(`${t.id}_accelerator`), name: `${title(t.id)} Growth Accelerator`, icon: acceleratorItem(t).icon,
    summary: `Reaches a crop up to ${BAL.acceleratorRange[i]} blocks away.`,
    blocks: [
      facts([["Tier", `${i + 1} of ${cfg.tiers.length}`], ["Reach", `${BAL.acceleratorRange[i]} blocks up`], ["Effect", `1 extra growth chance about every ${BAL.acceleratorSeconds} seconds`], ["Ripens a crop", `In about ${acceleratorMinutes} minutes with one accelerator`], ["Place", "Anywhere below the crop, with room for the farmland"]]),
      list([acceleratorItem(t)]),
      p("Every tier grows crops at the same speed, and higher tiers only reach further. Each accelerator works on its own, so more of them means faster, and it works on the first crop above it, through any blocks in between."),
      h2("Recipe"),
      p(`Four ${tierName(t)}, four stone and one ${title(t.id)} Gemstone make ${BAL.acceleratorYield}.`),
      acceleratorRecipe(t),
    ],
  })),
};

const toolTier = cfg.tiers[1];
const toolFacts = [["Durability", `${BAL.toolDurability}`], ["Repair", `${tierName(toolTier)} in an anvil`], ["Works on", "Essence crops, wheat, carrots, potatoes and beetroot"]];
const sickleItem = { name: "Essence Sickle", icon: "img/icons/essence_sickle.png", href: "wiki/tools/essence-sickle" };
const hoeItem = { name: "Essence Hoe", icon: "img/icons/essence_hoe.png", href: "wiki/tools/essence-hoe" };
const tools = {
  slug: "tools", title: "Tools", group: "Getting started", icon: sickleItem.icon,
  blurb: "A sickle that harvests 3×3 and a hoe that replants as it harvests.",
  entries: [
    {
      slug: "essence-sickle", name: sickleItem.name, icon: sickleItem.icon,
      summary: "Harvests every ripe crop in a 3×3.",
      blocks: [
        facts([["Use", "Break a ripe crop"], ["Area", "3×3, centred on that crop"], ["Wear", "1 durability per crop harvested"], ...toolFacts]),
        p("Breaking a ripe crop also harvests every ripe crop around it. Unripe crops are left alone, and the sickle won't break one even if you hit it directly. Farmland bonus essence and second seeds work as normal."),
        h2("Recipe"),
        (() => {
          const e = tierItem(toolTier), s = vanilla("minecraft:stick");
          return recipe(sickleItem, 1, [[e, e, null], [null, s, e], [s, null, null]]);
        })(),
      ],
    },
    {
      slug: "essence-hoe", name: hoeItem.name, icon: hoeItem.icon,
      summary: "Right-click a ripe crop to harvest and replant it.",
      blocks: [
        facts([["Use", "Right-click a ripe crop"], ["Wear", "1 durability per crop"], ...toolFacts]),
        p("The crop drops as normal and restarts at its first stage. The replant takes one seed from the drops, so it costs the same as replanting by hand. The hoe doesn't till dirt."),
        h2("Recipe"),
        (() => {
          const e = tierItem(toolTier), s = vanilla("minecraft:stick");
          return recipe(hoeItem, 1, [[e, e, null], [null, s, null], [null, s, null]]);
        })(),
      ],
    },
  ],
};

const cropCategories = cfg.tiers
  .map((t, i) => ({ t, i, crops: cfg.crops.filter((c) => c.tier === i + 1) }))
  .filter((g) => g.crops.length)
  .map(({ t, i, crops }) => ({
    slug: `${slug(t.id)}-crops`, title: `${title(t.id)} crops`, group: "Crops", icon: tierItem(t).icon,
    blurb: `Tier ${i + 1} crops. Their seeds are made with ${tierName(t)}.`,
    entries: crops.map((c) => {
      return {
        slug: slug(c.id), name: `${title(c.id)} Crop`, icon: `img/icons/${c.id}_crop.png`,
        summary: yields(c),
        blocks: [
          facts([["Tier", `${i + 1} · ${tierName(t)}`], ["Best on", `${title(t.id)} Farmland`], ...(c.essenceCrop ? [] : [["Seeds use", c.soul ? jarOf(c.soul).name : anyItem(c.ingredient).name]]), ["Makes", c.essenceCrop ? tierName(t) : yields(c)]]),
          list(stages(c)),
          h2("Seeds"),
          seedsRecipe(c),
          h2("Harvest"),
          list([{ ...(c.essenceCrop ? tierItem(t) : essenceItem(c)), sub: c.essenceCrop ? terraYield : `${harvest} when ripe, ${secondary} to ${matching} chance of a second` }, { ...seedsItem(c), sub: `1, plus a ${secondary} to ${matching} chance of a second` }]),
          ...recipesOf(c).flatMap((r) => [h2(anyItem(r.result).name), essenceRecipe(r)]),
        ],
      };
    }),
  }));

// Vita and each tier share one layout: their ingots, gemstones, nuggets and storage blocks.
const nine = (x) => [[x, x, x], [x, x, x], [x, x, x]];
const plus = (a, b) => [[null, a, null], [a, b, a], [null, a, null]];
const materialEntry = (id, name, makeIngot, makeGem, source, extra = []) => ({
  slug: slug(id), name: `${name} materials`, icon: `img/icons/${id}_ingot.png`,
  summary: `${name} ingots, gemstones and storage blocks.`,
  blocks: [
    p(source),
    ...extra,
    h2(`${name} Ingot`), makeIngot,
    h2(`${name} Gemstone`), makeGem,
    h2("Storage"),
    list([`${id}_nugget`, `${id}_ingot_block`, `${id}_gemstone_block`].map((m) => ({ ...matItem(m), sub: "9 of the smaller item, and back again" }))),
  ],
});
const shapelessGrid = (a, b) => [[a, b, b], [null, null, null], [null, null, null]];
const fertilized = { name: "Fertilized Essence", icon: "img/icons/fertilized_essence.png", href: "wiki/materials/fertilizer" };
const fertilizer = { name: "Essence Fertilizer", icon: "img/icons/essence_fertilizer.png", href: "wiki/materials/fertilizer" };
const materials = {
  slug: "materials", title: "Ores and materials", group: "Getting started", icon: "img/icons/vita_ingot.png",
  blurb: "Ores, ingots, gemstones and fertilizer.",
  entries: [
    {
      slug: "ores", name: "Ores", icon: "img/icons/essence_ore.png",
      summary: "Essence Ore and Vita Ore, in stone and deepslate.",
      blocks: [
        list([
          { name: "Essence Ore", icon: "img/icons/essence_ore.png", sub: `y -32 to 64. Drops ${range(BAL.oreEssence)} Terra Essence` },
          { name: "Deepslate Essence Ore", icon: "img/icons/deepslate_essence_ore.png", sub: "The same, in deepslate" },
          { name: "Vita Ore", icon: "img/icons/vita_ore.png", sub: `y -60 to 24. Drops ${range(BAL.vitaShards)} Vita Shards` },
          { name: "Deepslate Vita Ore", icon: "img/icons/deepslate_vita_ore.png", sub: "The same, in deepslate" },
        ]),
        p("Ore only generates in chunks explored after it was added."),
      ],
    },
    materialEntry("vita", "Vita",
      recipe(matItem("vita_ingot"), 1, plus(matItem("vita_shard"), vanilla("minecraft:iron_ingot"))),
      recipe(matItem("vita_gemstone"), 1, plus(matItem("vita_shard"), vanilla("minecraft:diamond"))),
      "Made from Vita Shards, which drop from Vita Ore or craft from Terra Blocks. Every tier's ingot and gemstone starts from these.",
      [h2("Vita Shard"), recipe(matItem("vita_shard"), 4, plus(matItem("terra_block"), vanilla("minecraft:flint")))]),
    materialEntry("anima", "Anima",
      recipe(matItem("anima_ingot"), 1, shapelessGrid(matItem("vita_ingot"), { name: "Anima Dust", icon: "img/icons/anima_dust.png" }), "Shapeless: any slots"),
      recipe(matItem("anima_gemstone"), 1, shapelessGrid(matItem("vita_gemstone"), { name: "Anima Dust", icon: "img/icons/anima_dust.png" }), "Shapeless: any slots"),
      "Vita materials plus two Anima Dust. Dust comes from Anima Ore in the Nether."),
    ...cfg.tiers.map((t) => materialEntry(t.id, title(t.id),
      recipe(matItem(`${t.id}_ingot`), 1, shapelessGrid(matItem("vita_ingot"), tierItem(t)), "Shapeless: any slots"),
      recipe(matItem(`${t.id}_gemstone`), 1, shapelessGrid(matItem("vita_gemstone"), tierItem(t)), "Shapeless: any slots"),
      `Vita materials plus two ${tierName(t)}. Nine ${tierName(t)} also store in a ${title(t.id)} Block.`)),
    {
      slug: "fertilizer", name: "Fertilizer", icon: fertilizer.icon,
      summary: "Speed up one crop at a time.",
      blocks: [
        list([{ ...fertilized, sub: `${pct(BAL.fertilizedEssenceChance)} chance from ripe crops. Advances a crop a stage or two` }, { ...fertilizer, sub: "Ripens a crop at once" }]),
        h2("Essence Fertilizer"),
        (() => {
          const e = tierItem(cfg.tiers[0]), b = vanilla("minecraft:bone_meal"), d = vanilla("minecraft:diamond");
          return recipe(fertilizer, 4, [[e, b, e], [b, d, b], [e, b, e]]);
        })(),
        h2("Better recipe"),
        (() => {
          const e = tierItem(cfg.tiers[0]), d = vanilla("minecraft:diamond");
          return recipe(fertilizer, 8, [[e, fertilized, e], [fertilized, d, fertilized], [e, fertilized, e]]);
        })(),
      ],
    },
  ],
};

const named = (id) => ({ name: title(id), icon: `img/icons/${id}.png` });
const infusion = {
  slug: "infusion", title: "Infusion and souls", group: "Getting started", icon: "img/icons/infusion_altar.png",
  blurb: "The altar that makes seeds, the bases they start from, and the souls mob seeds need.",
  entries: [
    {
      slug: "infusion-altar", name: "Infusion Altar", icon: "img/icons/infusion_altar.png",
      summary: "An altar and eight pedestals that craft seeds.",
      blocks: [
        facts([["Layout", "8 pedestals at the altar's height: 3 blocks away on each side, 2 away on each diagonal"], ["Place items", "Use an item on the block. Each holds one"], ["Take items", "Use an empty hand"], ["Start", "Use a Wand on the altar, or power it with redstone"], ["Time", `${BAL.altarTicks / 20} seconds`]]),
        p("Pedestal order doesn't matter. Taking an item away stops the craft, and breaking a block drops what it held."),
        h2("Infusion Altar"),
        (() => { const g = vanilla("minecraft:gold_ingot"), c = vanilla("minecraft:red_wool"), s = vanilla("minecraft:stone"); return recipe(named("infusion_altar"), 1, [[g, c, g], [null, s, null], [s, s, s]]); })(),
        h2("Infusion Pedestal"),
        (() => { const g = vanilla("minecraft:gold_ingot"), c = vanilla("minecraft:red_wool"), s = vanilla("minecraft:stone"); return recipe(named("infusion_pedestal"), 1, [[g, c, g], [null, s, null], [null, s, null]]); })(),
        h2("Wand"),
        (() => { const e = tierItem(cfg.tiers[0]); return recipe(named("wand"), 1, [[null, null, e], [null, vanilla("minecraft:stick"), null], [vanilla("minecraft:stone"), null, null]]); })(),
      ],
    },
    {
      slug: "seed-bases", name: "Seed bases", icon: "img/icons/vita_seed_base.png",
      summary: "What goes on the altar to start a seed.",
      blocks: [
        p("Vita Seed Bases make resource seeds, and Anima Seed Bases make mob seeds."),
        h2("Vita Seed Base"),
        recipe(seedBase("vita"), 1, plus(matItem("vita_shard"), vanilla("minecraft:wheat_seeds"))),
        h2("Anima Seed Base"),
        recipe(seedBase("anima"), 1, shapelessGrid(seedBase("vita"), named("anima_dust")), "Shapeless: any slots"),
      ],
    },
    {
      slug: "soulstone", name: "Soulstone and Anima", icon: "img/icons/soulstone.png",
      summary: "Found in the Nether.",
      blocks: [
        list([
          { ...named("soulstone"), sub: "Large veins in the Nether. Mines into Soulstone Cobble" },
          { ...named("anima_ore"), sub: `Inside soulstone. Drops ${range(BAL.animaDust)} Anima Dust` },
          { ...named("soul_dust"), sub: "Smelt soulstone cobble, then soulstone, then smooth soulstone" },
          { ...named("soul_glass"), sub: "4 Soul Dust around glass" },
          { ...named("soulstone_bricks"), sub: "4 soulstone make 4" },
          { ...named("blank_skull"), sub: "4 Soul Dust around a bone block make 4" },
        ]),
        h2("Anima materials"),
        p("Vita Ingots and Gemstones plus two Anima Dust make Anima Ingots and Gemstones."),
      ],
    },
    {
      slug: "soul-jars", name: "Soul Jars", icon: "img/icons/soul_jar.png",
      summary: "Collect mob souls for mob seeds.",
      blocks: [
        p("Kill mobs with an Anima Dagger in your hand and a Soul Jar anywhere in your inventory. Each jar holds one mob type, and souls spill into the next jar when one fills. A jar empties when used at the altar, and you keep it."),
        (() => { const s = named("anima_ingot"), g = named("soul_glass"); return recipe(named("soul_jar"), 1, [[null, s, null], [g, null, g], [null, g, null]]); })(),
        h2("Souls per jar"),
        list(Object.entries(cfg.souls).map(([soul, { need }]) => ({ name: title(soul), icon: "img/icons/soul_jar.png", sub: `${need} souls` }))),
      ],
    },
    {
      slug: "anima-daggers", name: "Anima Daggers", icon: "img/icons/anima_dagger.png",
      summary: "Fill Soul Jars from your kills.",
      blocks: [
        facts([["Anima Dagger", `${BAL.daggerDurability} uses, 1 soul per kill`], ["Passive Anima Dagger", `${BAL.attunedDaggerDurability} uses, ${BAL.attunedSoulMultiplier} souls per passive mob`], ["Hostile Anima Dagger", `${BAL.attunedDaggerDurability} uses, ${BAL.attunedSoulMultiplier} souls per hostile mob`]]),
        (() => { const d = named("anima_dust"), i = named("anima_ingot"); return recipe(named("anima_dagger"), 1, [[null, d, null], [i, vanilla("minecraft:golden_sword"), i], [null, d, null]]); })(),
        h2("Attuning"),
        p("At the Infusion Altar, put an Anima Dagger on the altar. On the pedestals, put 2 Anima Ingots, 2 Anima Gemstones and 4 full Soul Jars. Pig, chicken, cow and sheep jars make a Passive dagger. Zombie, skeleton, creeper and spider jars make a Hostile one."),
      ],
    },
  ],
};

const HV = BAL.harvester;
const machineSide = (i) => (HV.range + (HV.upgrades[i - 1]?.range ?? 0)) * 2 + 1;
const upgradeItem = (t) => ({ name: `${title(t.id)} Machine Upgrade`, icon: `img/icons/${t.id}_machine_upgrade.png` });
const machines = {
  slug: "machines", title: "Machines", group: "Getting started", icon: "img/icons/harvester_front.png",
  blurb: "A machine that harvests and replants your crops.",
  entries: [
    {
      slug: "harvester", name: "Harvester", icon: "img/icons/harvester_front.png",
      summary: "Harvests and replants ripe crops, and stores what they drop.",
      blocks: [
        facts([["Place it", "At the height of your crops, with its front facing them"], ["Open it", "Tap it with an empty hand"], ["Mine it", "Hold a tool, or sneak"], ["Pause it", "Redstone power"], ["Storage", "25 stacks, or a chest or barrel touching its back"]]),
        p("It works on a square of blocks in front of it, one block at a time. A ripe crop is harvested and replanted, using one seed from its drops. Farmland bonus essence and second seeds work as normal. It handles every essence crop, plus wheat, carrots, potatoes and beetroot."),
        p("The first slot of its screen takes fuel and the second takes a Machine Upgrade. Look at the machine to see its upgrade, area and fuel."),
        h2("Recipe"),
        (() => { const i = vanilla("minecraft:iron_ingot"), a = named("anima_ingot"), s = named("essence_sickle"); return recipe({ name: "Harvester", icon: "img/icons/harvester_front.png" }, 1, [[i, a, i], [s, { name: "Machine Frame", icon: "img/icons/machine_frame.png" }, s], [i, a, i]]); })(),
        h2("Machine Frame"),
        (() => { const i = vanilla("minecraft:iron_ingot"), r = vanilla("minecraft:redstone"); return recipe({ name: "Machine Frame", icon: "img/icons/machine_frame.png" }, 1, [[i, r, i], [r, vanilla("minecraft:stone"), r], [i, r, i]]); })(),
        h2("Fuel"),
        p(`Each fuel item fills the machine's tank. Every ${HV.fuelPerHarvest} fuel is one crop harvested with no upgrade, and checking an unripe crop costs ${HV.fuelPerScan}.`),
        list([...Object.entries(HV.fuels).map(([id, ticks]) => ({ ...vanilla(id), sub: `${(ticks * HV.fuelPerBurnTick).toLocaleString("en-US")} fuel` })), { ...vanilla("minecraft:oak_log"), sub: `Logs and planks: ${(HV.woodBurnTicks * HV.fuelPerBurnTick).toLocaleString("en-US")} fuel` }]),
      ],
    },
    {
      slug: "machine-upgrades", name: "Machine Upgrades", icon: `img/icons/${cfg.tiers[0].id}_machine_upgrade.png`,
      summary: "Make a machine wider and faster, for much more fuel.",
      blocks: [
        p("Each upgrade is crafted from the one before, so you keep the cost of the last. Put one in the machine's second slot."),
        list([
          { name: "No upgrade", icon: "img/icons/harvester_front.png", sub: `${machineSide(0)}×${machineSide(0)}, ${HV.operationTicks / 20} s per block, ${HV.fuelPerHarvest} fuel per crop` },
          ...cfg.tiers.map((t, i) => ({ ...upgradeItem(t), sub: `${machineSide(i + 1)}×${machineSide(i + 1)}, ${+((HV.operationTicks * HV.upgrades[i].time) / 20).toFixed(3)} s per block, ${(HV.fuelPerHarvest * HV.upgrades[i].fuel).toLocaleString("en-US")} fuel per crop` })),
        ]),
        h2("Upgrade Base"),
        (() => { const s = named("vita_shard"), v = named("vita_ingot"); return recipe(named("upgrade_base"), 1, [[s, v, s], [v, vanilla("minecraft:diamond"), v], [s, v, s]]); })(),
        h2("Upgrades"),
        ...cfg.tiers.map((t, i) => { const e = tierItem(t), n = named(`${t.id}_ingot`), u = i ? upgradeItem(cfg.tiers[i - 1]) : named("upgrade_base"); return recipe(upgradeItem(t), 1, [[e, n, e], [n, u, n], [e, n, e]]); }),
      ],
    },
  ],
};

const categories = [guide, essence, materials, infusion, farmland, accelerators, tools, machines, ...cropCategories];
for (const c of categories) for (const e of c.entries) e.href = `wiki/${c.slug}/${e.slug}`;

const gallery = [
  { title: "Essence tiers", items: cfg.tiers.map(tierItem) },
  { title: "Crop essence", items: cfg.crops.filter((c) => !c.essenceCrop).map(essenceItem) },
  { title: "Clusters and blanks", items: ["air", "earth", "water", "fire", "nature", "dye", "nether", "coral", "honey", "prismarine", "end"].map((id) => `${id}_cluster`).concat("blank_skull", "blank_record", "experience_droplet").map((id) => ({ name: title(id), icon: `img/icons/${id}.png` })) },
  { title: "Seeds", items: cfg.crops.map(seedsItem) },
  { title: "Ripe crops", items: cfg.crops.map(ripeItem) },
  { title: "Essence farmland", items: cfg.tiers.map(farmlandItem) },
  { title: "Growth accelerators", items: cfg.tiers.map(acceleratorItem) },
  { title: "Ores", items: ["essence_ore", "deepslate_essence_ore", "vita_ore", "deepslate_vita_ore"].map((id) => ({ name: title(id), icon: `img/icons/${id}.png` })) },
  { title: "Materials", items: ["vita", ...cfg.tiers.map((t) => t.id)].flatMap((id) => [`${id}_ingot`, `${id}_gemstone`, `${id}_nugget`, `${id}_ingot_block`, `${id}_gemstone_block`].map(matItem)) },
  { title: "Fertilizer", items: [fertilized, fertilizer] },
  { title: "Infusion and souls", items: ["infusion_altar", "infusion_pedestal", "wand", "vita_seed_base", "anima_seed_base", "soul_jar", "anima_dagger", "passive_anima_dagger", "hostile_anima_dagger", "soul_dust", "anima_dust", "soulstone", "soulstone_cobble", "soulstone_smooth", "soulstone_bricks", "soulstone_cracked_bricks", "soul_glass", "anima_ore"].map((id) => ({ name: title(id), icon: `img/icons/${id}.png` })) },
  { title: "Tools and guide", items: [sickleItem, hoeItem, guideItem] },
  { title: "Machines", items: [{ name: "Harvester", icon: "img/icons/harvester_front.png" }, named("machine_frame"), named("upgrade_base"), ...cfg.tiers.map(upgradeItem)] },
  { title: "Growth stages", items: stages(cfg.crops[0]).slice(0, 3) },
];

const wiki = {
  name: cfg.name,
  release: {
    version, file, minBedrock: MIN_BEDROCK,
    download: `https://github.com/${REPO}/raw/main/addon/${file}`,
    repo: `https://github.com/${REPO}`,
  },
  // items: everything in the pack apart from crop blocks, and retired crops' seeds and essence
  stats: {
    crops: cfg.crops.length, tiers: cfg.tiers.length, recipes: recipes.length,
    items: [...fs.readdirSync(path.join(BP, "items")), ...fs.readdirSync(path.join(BP, "blocks"))].filter((f) => !f.endsWith("_crop.json") && !RETIRED_FILES.has(f)).length,
  },
  categories,
  recipes,
  gallery,
};
fs.mkdirSync(path.join(WWW, "data"), { recursive: true });
fs.writeFileSync(path.join(WWW, "data", "wiki.json"), JSON.stringify(wiki, null, 1));
console.log(`wiki: ${categories.reduce((n, c) => n + c.entries.length, 0)} pages, ${recipes.length} recipes`);
