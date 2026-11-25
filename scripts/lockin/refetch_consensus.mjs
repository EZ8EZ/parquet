// Re-read past lock-in weeks from Sleeper twice, past its CDN cache (?_=), and keep a week only
// when the two reads agree (D134's consensus rule, applied to the study caches). Compares each
// agreed week with the cached copies and writes it over them; weeks whose reads disagree are
// listed in cache/unreliable_weeks.json for studies to leave out. Old files go to a backup dir.
// node scripts/lockin/refetch_consensus.mjs 2024 2025 [--backup DIR]
import fs from "node:fs";
import path from "node:path";
const HERE = path.dirname(new URL(import.meta.url).pathname);
const D = process.env.LOCKIN_CACHE_DIR || path.join(HERE, "cache");
const OPP = path.join(D, "opponent_responses");
const args = process.argv.slice(2);
const bi = args.indexOf("--backup");
const BACKUP = bi >= 0 ? args.splice(bi, 2)[1] : path.join(D, `backup-${Date.now()}`);
const seasons = args.length ? args : ["2024", "2025"];
const { chain } = JSON.parse(fs.readFileSync(path.join(D, "chain.json"), "utf8"));
const key = (u) => u.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function read(url) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(`${url}?_=${Date.now()}${Math.random().toString(36).slice(2, 6)}`);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(500 * 2 ** a);
  }
  throw new Error(`failed ${url}`);
}
// what a lock study uses from a matchup row
const sig = (rows) => JSON.stringify((rows || []).map((m) => [m.roster_id, m.matchup_id, m.points, m.starters, m.starters_points]).sort((a, b) => a[0] - b[0]));
const rosterDiff = (a, b) => { const A = new Map((a || []).map((m) => [m.roster_id, m])); let n = 0; for (const m of b || []) { const o = A.get(m.roster_id); if (!o || JSON.stringify([o.points, o.starters, o.starters_points]) !== JSON.stringify([m.points, m.starters, m.starters_points])) n++; } return n; };
const unreliablePath = path.join(D, "unreliable_weeks.json");
const unreliable = fs.existsSync(unreliablePath) ? JSON.parse(fs.readFileSync(unreliablePath, "utf8")) : {};
fs.mkdirSync(BACKUP, { recursive: true });
for (const s of seasons) {
  const lg = chain.find((c) => c.season === s);
  if (!lg) { console.log(`${s}: not in chain.json`); continue; }
  unreliable[s] = [];
  let changedWeeks = 0, changedRosters = 0;
  for (let w = 1; w <= 23; w++) {
    const url = `https://api.sleeper.app/v1/league/${lg.id}/matchups/${w}`;
    const a = await read(url);
    await sleep(1500);
    const b = await read(url);
    if (sig(a) !== sig(b)) { unreliable[s].push(w); console.log(`${s} w${w}: the two reads DISAGREE (${rosterDiff(a, b)} rosters); left out`); continue; }
    const files = [path.join(OPP, key(url) + ".json"), path.join(D, key(url) + ".json")].filter((f) => fs.existsSync(f));
    const diffs = files.map((f) => rosterDiff(JSON.parse(fs.readFileSync(f, "utf8")), a));
    for (const f of files) {
      fs.copyFileSync(f, path.join(BACKUP, path.basename(path.dirname(f)) + "__" + path.basename(f)));
      fs.writeFileSync(f, JSON.stringify(a));
    }
    if (!files.length) fs.writeFileSync(path.join(OPP, key(url) + ".json"), JSON.stringify(a));
    const d = Math.max(0, ...diffs);
    if (d) { changedWeeks++; changedRosters += d; }
    console.log(`${s} w${w}: agree; vs cached copies ${diffs.length ? diffs.map((x) => `${x} rosters differ`).join(", ") : "none cached"}`);
  }
  console.log(`${s}: ${changedWeeks} weeks changed against the cache (${changedRosters} roster-weeks); ${unreliable[s].length} weeks left out`);
}
fs.writeFileSync(unreliablePath, JSON.stringify(unreliable, null, 1));
console.log(`backup: ${BACKUP}`);
