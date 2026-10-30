// Downloads the exaroton server's world into backups/<world>_<date>.zip (git-ignored).
// While the server is online, saving is paused (`save hold`) during the download so the files are consistent.
// Needs EXAROTON_TOKEN; EXAROTON_SERVER overrides the server id.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const TOKEN = process.env.EXAROTON_TOKEN;
const SERVER = process.env.EXAROTON_SERVER ?? "SatD6B8dfWNFe5T0";
const WORLD = process.argv[2] ?? "world";
const API = `https://api.exaroton.com/v1/servers/${SERVER}`;
if (!TOKEN) throw new Error("Set EXAROTON_TOKEN first");

async function api(route, init = {}) {
  const res = await fetch(API + route, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, ...init.headers } });
  if (!res.ok) throw new Error(`${route}: HTTP ${res.status} ${await res.text()}`);
  return res;
}
const command = (cmd) =>
  api("/command/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: cmd }) });

const server = (await (await api("/")).json()).data;
const online = server.status === 1;
const stamp = new Date().toLocaleString("sv").slice(0, 16).replace(" ", "_").replace(":", ""); // local time, 2026-10-29_2136
const out = path.join(ROOT, "backups", `${WORLD}_${stamp}.zip`);

if (online) {
  await command("save hold");
  await new Promise((r) => setTimeout(r, 5000)); // ponytail: fixed wait for the save to flush; poll `save query` via the log if backups ever come out corrupt
}
try {
  const zip = Buffer.from(await (await api(`/files/data/worlds/${WORLD}`)).arrayBuffer());
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, zip);
  console.log(`saved ${path.relative(ROOT, out)} (${(zip.length / 1e6).toFixed(1)} MB) from ${server.name}${online ? "" : " (offline)"}`);
} finally {
  if (online) await command("save resume");
}
