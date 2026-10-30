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
const BAL = cfg.balance;
const SLUG = cfg.name.replaceAll("&", "And").replace(/\W/g, "");
const RP = path.join(ROOT, "build", `${SLUG}_RP`);
const WWW = path.join(ROOT, "src", "EssenceWiki", "wwwroot");
const VANILLA = path.join(ROOT, "tools", "vanilla");
const vanillaNames = JSON.parse(fs.readFileSync(path.join(VANILLA, "names.json"), "utf8"));
const version = cfg.version.join(".");
const file = `${SLUG}_v${version}.mcaddon`;

const title = (id) => id.replace(/(^|_)(\w)/g, (_, sep, c) => (sep ? " " : "") + c.toUpperCase());
const slug = (id) => id.replaceAll("_", "-");
const pct = (v) => `${+(v * 100).toFixed(1)}%`;
const range = ([min, max]) => (min === max ? `${min}` : `${min}–${max}`);
const harvest = range(BAL.harvestEssence), oreDrop = range(BAL.oreEssence), secondSeed = pct(BAL.secondSeedChance), boneMeal = pct(BAL.boneMealChance);

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
const oreItem = { name: "Essence Ore", icon: "img/icons/essence_ore.png", href: essenceHref("essence_ore") };
const farmlandItem = (t) => ({ name: `${title(t.id)} Farmland`, icon: `img/icons/${t.id}_farmland_top.png`, href: `wiki/farmland/${slug(`${t.id}_farmland`)}` });
const bonusPct = (i) => pct(BAL.farmlandBonus[i]);
const acceleratorItem = (t) => ({ name: `${title(t.id)} Growth Accelerator`, icon: `img/icons/${t.id}_accelerator.png`, href: `wiki/accelerators/${slug(`${t.id}_accelerator`)}` });
// Average random ticks for a crop to ripen with this many rolls per tick, as in scripts/main.js.
const ripenTicks = (rolls) => {
  let chance = [1]; // chance[k]: one tick advances k stages
  for (let r = rolls; r > 0; r--) {
    const q = BAL.growChance * Math.min(r, 1);
    chance = [...chance, 0].map((v, k) => v * (1 - q) + (chance[k - 1] ?? 0) * q);
  }
  const left = [0]; // left[n]: average ticks with n stages to go
  for (let n = 1; n <= 3; n++) left[n] = (1 + chance.reduce((sum, v, k) => sum + (k ? v * left[Math.max(n - k, 0)] : 0), 0)) / (1 - chance[0]);
  return left[3];
};
const speed = (rolls) => `×${(ripenTicks(1) / ripenTicks(rolls)).toFixed(1)}`;
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
const seedsRecipe = (c) => {
  const e = tierItem(cfg.tiers[c.tier - 1]), r = vanilla(c.ingredient), w = vanilla("minecraft:wheat_seeds");
  return recipe(seedsItem(c), 1, [[e, r, e], [r, w, r], [e, r, e]]);
};
const outputRecipe = (c) => {
  const e = essenceItem(c);
  return recipe({ ...vanilla(c.output) }, c.count, [[e, e, e], [e, null, e], [e, e, e]]);
};
const farmlandRecipe = (t, i) => {
  const b = i ? farmlandItem(cfg.tiers[i - 1]) : vanilla("minecraft:dirt"), e = tierItem(t);
  return recipe(farmlandItem(t), BAL.farmlandYield, [[b, e, b], [e, b, e], [b, e, b]]);
};

const acceleratorRecipe = (t, i) => {
  const b = i ? acceleratorItem(cfg.tiers[i - 1]) : vanilla("minecraft:cobblestone"), e = tierItem(t);
  return recipe(acceleratorItem(t), BAL.acceleratorYield, [[b, e, b], [e, b, e], [b, e, b]]);
};

// ---------- pages ----------

const p = (html) => ({ t: "p", html });
const h2 = (text) => ({ t: "h2", text });
const facts = (rows) => ({ t: "facts", facts: rows });
const list = (items) => ({ t: "items", items });
const grassDrops = list([
  { ...vanilla("minecraft:short_grass"), sub: `Grass and ferns: ${pct(BAL.grassEssenceChance)} chance` },
  { ...vanilla("minecraft:wheat"), sub: `Ripe wheat, carrots, potatoes, beetroot: ${pct(BAL.cropEssenceChance)} chance` },
]);

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
        p(`Mine <a href="${oreItem.href}">Essence Ore</a> underground, between y −48 and 48 in newly explored chunks. Terra Essence also drops now and then from grass and ripe vanilla crops, so you can start in an old world.`),
        list([{ ...oreItem, sub: `${oreDrop} Terra Essence per ore` }, ...grassDrops.items]),
        h2("2. Upgrade it"),
        p(`Four essence of one tier craft one of the next: ${cfg.tiers.map((t) => `<a href="${essenceHref(`${t.id}_essence`)}">${title(t.id)}</a>`).join(" → ")}. Each crop needs the essence of its tier.`),
        h2("3. Craft seeds and plant them"),
        p(`Surround wheat seeds with four tier essence and four of the resource. Plant the seeds on essence farmland and wait. Bone meal can help: each use has a ${boneMeal} chance to advance a stage.`),
        h2("4. Harvest and craft"),
        p(`A ripe crop drops ${harvest} of its essence and its seed back. Eight essence in a ring craft the resource.`),
      ],
    },
    {
      slug: "growing-crops", name: "Growing crops", icon: "img/icons/crop_2.png",
      summary: "Planting, growth stages, bone meal and harvesting.",
      blocks: [
        facts([["Plant on", "Essence farmland only"], ["Growth", `4 stages, about ${pct(BAL.growChance)} chance per random tick`], ["Bone meal", `${boneMeal} chance to advance one stage per use`], ["Ripe drops", `${harvest} essence, 1 seed, ${secondSeed} chance of a second seed`], ["Unripe drops", "The seed back"]]),
        list(stages(cfg.crops.find((c) => c.id === "iron") ?? cfg.crops[0])),
        h2("Plant on essence farmland"),
        p(`Seeds won't plant on vanilla farmland. Every crop needs <a href="wiki/farmland">essence farmland</a>, of any tier, so each plot in your garden has to be crafted. It never dries out and can't be trampled.`),
        h2("Essence farmland"),
        p("Ripe crops on essence farmland can drop an extra essence. The higher the farmland's tier, the better the chance."),
        list(cfg.tiers.map((t, i) => ({ ...farmlandItem(t), sub: `${bonusPct(i)} chance of +1 essence` }))),
        h2("Growth accelerators"),
        p(`Stack up to ${BAL.maxAccelerators} <a href="wiki/accelerators">growth accelerators</a> directly under the farmland to make the crop above grow faster. Each one adds growth rolls, tiers can be mixed, and a gap ends the stack.`),
      ],
    },
  ],
};

const essence = {
  slug: "essence", title: "Essence", group: "Getting started", icon: tierItem(cfg.tiers[2]).icon,
  blurb: "Essence Ore and the five essence tiers every crop is made from.",
  entries: [
    {
      slug: "essence-ore", name: "Essence Ore", icon: oreItem.icon,
      summary: "The main source of Terra Essence.",
      blocks: [
        facts([["Found", "Overworld, y −48 to 48"], ["Drops", `${oreDrop} Terra Essence`], ["Tool", "Any; mining takes about 3 seconds by hand"]]),
        p("Essence Ore only generates in chunks that are explored after the add-on is installed. In an older world, travel somewhere new or collect Terra Essence from grass and crops."),
        list([{ ...tierItem(cfg.tiers[0]), sub: `${oreDrop} per ore` }]),
      ],
    },
    ...cfg.tiers.map((t, i) => {
      const crops = cfg.crops.filter((c) => c.tier === i + 1);
      return {
        slug: slug(`${t.id}_essence`), name: tierName(t), icon: tierItem(t).icon,
        summary: `Tier ${i + 1}. ${crops.length} crops use it.`,
        blocks: [
          facts([["Tier", `${i + 1} of ${cfg.tiers.length}`], ["Crops", `${crops.length}`]]),
          h2("How to get it"),
          ...(i === 0 ? [list([{ ...oreItem, sub: `${oreDrop} per ore` }, ...grassDrops.items])] : [upgrade(t, i)]),
          h2("Seeds that need it"),
          crops.length ? list(crops.map((c) => ({ ...seedsItem(c), sub: `8 essence → ${c.count} × ${vanilla(c.output).name}` }))) : p("No crops use this tier yet."),
        ],
      };
    }),
  ],
};

const farmland = {
  slug: "farmland", title: "Essence farmland", group: "Getting started", icon: farmlandItem(cfg.tiers[0]).icon,
  blurb: "Farmland that never dries out and gives ripe crops a chance of extra essence.",
  entries: cfg.tiers.map((t, i) => ({
    slug: slug(`${t.id}_farmland`), name: `${title(t.id)} Farmland`, icon: farmlandItem(t).icon,
    summary: `${bonusPct(i)} chance of +1 essence from ripe crops.`,
    blocks: [
      facts([["Tier", `${i + 1} of ${cfg.tiers.length}`], ["Bonus", `${bonusPct(i)} chance of 1 extra essence per ripe harvest`], ["Water", "Not needed; never dries out"], ["Grows", "Every crop"]]),
      list([{ ...farmlandItem(t), name: "Top", sub: "" }, { name: "Side", icon: `img/icons/${t.id}_farmland_side.png` }]),
      h2("Recipe"),
      p(`${i ? `Five ${title(cfg.tiers[i - 1].id)} Farmland and four ${tierName(t)}` : "Five dirt and four Terra Essence"} make ${BAL.farmlandYield}.`),
      farmlandRecipe(t, i),
    ],
  })),
};

const accelerators = {
  slug: "accelerators", title: "Growth accelerators", group: "Getting started", icon: acceleratorItem(cfg.tiers[0]).icon,
  blurb: "Blocks that go under essence farmland and make the crop above grow faster.",
  entries: cfg.tiers.map((t, i) => ({
    slug: slug(`${t.id}_accelerator`), name: `${title(t.id)} Growth Accelerator`, icon: acceleratorItem(t).icon,
    summary: `Up to ${speed(1 + BAL.acceleratorRolls[i] * BAL.maxAccelerators)} crop speed with a full stack.`,
    blocks: [
      facts([["Tier", `${i + 1} of ${cfg.tiers.length}`], ["Speed with 1", speed(1 + BAL.acceleratorRolls[i])], [`Speed with ${BAL.maxAccelerators}`, speed(1 + BAL.acceleratorRolls[i] * BAL.maxAccelerators)], ["Growth rolls", `+${BAL.acceleratorRolls[i]} per random tick`], ["Place", `Directly under essence farmland, up to ${BAL.maxAccelerators} deep, with no gaps`]]),
      list([acceleratorItem(t)]),
      p("Tiers can be mixed in one stack, in any order. Each block adds its own rolls, and extra rolls help less as a crop nears the fastest it can grow."),
      h2("Recipe"),
      p(`${i ? `Five ${title(cfg.tiers[i - 1].id)} Growth Accelerators and four ${tierName(t)}` : "Five cobblestone and four Terra Essence"} make ${BAL.acceleratorYield}.`),
      acceleratorRecipe(t, i),
    ],
  })),
};

const cropCategories = cfg.tiers
  .map((t, i) => ({ t, i, crops: cfg.crops.filter((c) => c.tier === i + 1) }))
  .filter((g) => g.crops.length)
  .map(({ t, i, crops }) => ({
    slug: `${slug(t.id)}-crops`, title: `${title(t.id)} crops`, group: "Crops", icon: tierItem(t).icon,
    blurb: `Tier ${i + 1} crops. Their seeds are made with ${tierName(t)}.`,
    entries: crops.map((c) => {
      const out = vanilla(c.output);
      return {
        slug: slug(c.id), name: `${title(c.id)} Crop`, icon: `img/icons/${c.id}_crop.png`,
        summary: `8 essence → ${c.count} × ${out.name}`,
        blocks: [
          facts([["Tier", `${i + 1} · ${tierName(t)}`], ["Seeds use", vanilla(c.ingredient).name], ["Makes", `${c.count} × ${out.name} per 8 essence`]]),
          list(stages(c)),
          h2("Seeds"),
          seedsRecipe(c),
          h2("Harvest"),
          list([{ ...essenceItem(c), sub: `${harvest} when ripe` }, { ...seedsItem(c), sub: `1, plus a ${secondSeed} chance of a second` }]),
          h2(out.name),
          outputRecipe(c),
        ],
      };
    }),
  }));

const categories = [guide, essence, farmland, accelerators, ...cropCategories];
for (const c of categories) for (const e of c.entries) e.href = `wiki/${c.slug}/${e.slug}`;

const gallery = [
  { title: "Essence tiers", items: cfg.tiers.map(tierItem) },
  { title: "Crop essence", items: cfg.crops.map(essenceItem) },
  { title: "Seeds", items: cfg.crops.map(seedsItem) },
  { title: "Ripe crops", items: cfg.crops.map(ripeItem) },
  { title: "Essence farmland", items: cfg.tiers.map(farmlandItem) },
  { title: "Growth accelerators", items: cfg.tiers.map(acceleratorItem) },
  { title: "Growth stages and ore", items: [...stages(cfg.crops[0]).slice(0, 3), oreItem] },
];

const wiki = {
  name: cfg.name,
  release: {
    version, file, minBedrock: MIN_BEDROCK,
    download: `https://github.com/${REPO}/raw/main/addon/${file}`,
    repo: `https://github.com/${REPO}`,
  },
  // items: essence + farmland + accelerator per tier, seeds + essence per crop, and the ore
  stats: { crops: cfg.crops.length, tiers: cfg.tiers.length, items: cfg.tiers.length * 3 + cfg.crops.length * 2 + 1, recipes: recipes.length },
  categories,
  recipes,
  gallery,
};
fs.mkdirSync(path.join(WWW, "data"), { recursive: true });
fs.writeFileSync(path.join(WWW, "data", "wiki.json"), JSON.stringify(wiki, null, 1));
console.log(`wiki: ${categories.reduce((n, c) => n + c.entries.length, 0)} pages, ${recipes.length} recipes`);
