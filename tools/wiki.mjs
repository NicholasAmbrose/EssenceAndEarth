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
cfg.crops = cfg.crops.filter((c) => !c.retired);
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
const harvest = range(BAL.harvestEssence), secondary = pct(BAL.secondaryChance), matching = pct(BAL.secondaryChance + BAL.matchingFarmlandChance);
const SHAPE_NAMES = { ring: "Ring of 8", full: "Full grid of 9", row: "Row of 3, in any row", square: "Square of 4, in any corner" };
const cost = (o) => cfg.shapes[o.shape ?? "ring"].join("").replaceAll(" ", "").length;
const shapeNote = (o) => SHAPE_NAMES[o.shape ?? "ring"];

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
const seedsRecipe = (c) => {
  const e = tierItem(cfg.tiers[c.tier - 1]), r = vanilla(c.ingredient), w = vanilla("minecraft:wheat_seeds");
  return recipe(seedsItem(c), 1, [[e, r, e], [r, w, r], [e, r, e]]);
};
// o is a crop or its alt: its shape, padded to the 3×3 grid and filled with the crop's essence.
const essenceRecipe = (c, o) => {
  const e = essenceItem(c);
  const rows = [0, 1, 2].map((y) => [0, 1, 2].map((x) => (cfg.shapes[o.shape ?? "ring"][y]?.[x] === "E" ? e : null)));
  return recipe({ ...vanilla(o.output) }, o.count, rows, shapeNote(o));
};
const makesOne = (o) => `${cost(o)} essence → ${o.count} × ${vanilla(o.output).name}`;
const yields = (c) => (c.essenceCrop ? `Drops ${tierName(cfg.tiers[c.tier - 1])} directly` : [c, c.alt].filter(Boolean).map(makesOne).join(", or "));
const farmlandRecipe = (t) => recipe(farmlandItem(t), BAL.farmlandYield, [[vanilla("minecraft:dirt"), tierItem(t), null], [null, null, null], [null, null, null]], "Shapeless: any slots");

const acceleratorRecipe = (t, i) => {
  const b = i ? acceleratorItem(cfg.tiers[i - 1]) : vanilla("minecraft:cobblestone"), e = tierItem(t);
  return recipe(acceleratorItem(t), BAL.acceleratorYield, [[b, e, b], [e, b, e], [b, e, b]]);
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
        p(`Terra Essence drops now and then from grass and ripe vanilla crops. Once you have a little, the <a href="${cropHref(terraCrop)}">Terra crop</a> gives you a steady supply.`),
        list([...grassDrops.items, terraCropDrop]),
        h2("2. Upgrade it"),
        p(`Four essence of one tier craft one of the next: ${cfg.tiers.map((t) => `<a href="${essenceHref(`${t.id}_essence`)}">${title(t.id)}</a>`).join(" → ")}. Each crop needs the essence of its tier.`),
        h2("3. Craft seeds and plant them"),
        p(`Surround wheat seeds with four tier essence and four of the resource. Plant the seeds on any farmland and wait. <a href="wiki/farmland">Essence farmland</a> gives extra drops, and <a href="wiki/accelerators">growth accelerators</a> speed them up.`),
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
        facts([["Use", "Hold it and press use to open the menu"], ["Topics", "Getting started, seeds and harvest, farmland, accelerators, tools, crops by tier"], ["Free copy", "Every player gets one, once, when they join"]]),
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
      p(`${i ? `Five ${title(cfg.tiers[i - 1].id)} Growth Accelerators and four ${tierName(t)}` : "Five cobblestone and four Terra Essence"} make ${BAL.acceleratorYield}.`),
      acceleratorRecipe(t, i),
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
          facts([["Tier", `${i + 1} · ${tierName(t)}`], ["Best on", `${title(t.id)} Farmland`], ["Seeds use", vanilla(c.ingredient).name], ["Makes", c.essenceCrop ? tierName(t) : yields(c)]]),
          list(stages(c)),
          h2("Seeds"),
          seedsRecipe(c),
          h2("Harvest"),
          list([{ ...(c.essenceCrop ? tierItem(t) : essenceItem(c)), sub: c.essenceCrop ? terraYield : `${harvest} when ripe, ${secondary} to ${matching} chance of a second` }, { ...seedsItem(c), sub: `1, plus a ${secondary} to ${matching} chance of a second` }]),
          ...(c.essenceCrop ? [] : [h2(vanilla(c.output).name), essenceRecipe(c, c)]),
          ...(c.alt ? [h2(vanilla(c.alt.output).name), essenceRecipe(c, c.alt)] : []),
        ],
      };
    }),
  }));

const categories = [guide, essence, farmland, accelerators, tools, ...cropCategories];
for (const c of categories) for (const e of c.entries) e.href = `wiki/${c.slug}/${e.slug}`;

const gallery = [
  { title: "Essence tiers", items: cfg.tiers.map(tierItem) },
  { title: "Crop essence", items: cfg.crops.filter((c) => !c.essenceCrop).map(essenceItem) },
  { title: "Seeds", items: cfg.crops.map(seedsItem) },
  { title: "Ripe crops", items: cfg.crops.map(ripeItem) },
  { title: "Essence farmland", items: cfg.tiers.map(farmlandItem) },
  { title: "Growth accelerators", items: cfg.tiers.map(acceleratorItem) },
  { title: "Tools and guide", items: [sickleItem, hoeItem, guideItem] },
  { title: "Growth stages", items: stages(cfg.crops[0]).slice(0, 3) },
];

const wiki = {
  name: cfg.name,
  release: {
    version, file, minBedrock: MIN_BEDROCK,
    download: `https://github.com/${REPO}/raw/main/addon/${file}`,
    repo: `https://github.com/${REPO}`,
  },
  // items: essence + farmland + accelerator per tier, seeds + essence per crop (essence crops share their tier's essence), 2 tools and the guide
  stats: { crops: cfg.crops.length, tiers: cfg.tiers.length, items: cfg.tiers.length * 3 + cfg.crops.length * 2 - cfg.crops.filter((c) => c.essenceCrop).length + 3, recipes: recipes.length },
  categories,
  recipes,
  gallery,
};
fs.mkdirSync(path.join(WWW, "data"), { recursive: true });
fs.writeFileSync(path.join(WWW, "data", "wiki.json"), JSON.stringify(wiki, null, 1));
console.log(`wiki: ${categories.reduce((n, c) => n + c.entries.length, 0)} pages, ${recipes.length} recipes`);
