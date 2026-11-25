#!/usr/bin/env node
/**
 * Record locks seen in the Sleeper app, which its public API does not expose (D139).
 *
 *   node scripts/lockin/mark-locks.mjs --me 6 McDaniels Turner      # opponent's slots
 *   node scripts/lockin/mark-locks.mjs --me 6 --mine Reid           # your own slots
 *   node scripts/lockin/mark-locks.mjs --me 6 --list                # this week's slots + what's recorded
 *   node scripts/lockin/mark-locks.mjs --me 6 --unmark McDaniels    # drop an entry
 *
 * Names match a starter by case-insensitive substring (or an exact player id). Each entry
 * stores the slot's banked score now; lib/lockin/knownLocks.js applies it only while the
 * banked score still equals it. Entries from earlier weeks are pruned on every write.
 * Rewrites lib/lockin/knownLocks.data.js; commit and push it for the deployed app.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = path.join(ROOT, "lib/lockin/knownLocks.data.js");
const { buildWeekDesk } = await import(path.join(ROOT, "lib/lockin/index.js"));
const { KNOWN_LOCKS } = await import(DATA);

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const has = (f) => { const i = args.indexOf(f); if (i < 0) return false; args.splice(i, 1); return true; };
const me = Number(flag("--me") ?? process.env.PARQUET_ROSTER_ID ?? NaN);
const leagueId = flag("--league") ?? process.env.SLEEPER_LEAGUE_ID ?? "1347007735815766016";
const mine = has("--mine");
const list = has("--list");
const unmark = has("--unmark");
if (!Number.isFinite(me)) {
  console.error("Pass --me <your roster id> (or set PARQUET_ROSTER_ID).");
  process.exit(2);
}

const fetchJson = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};
const desk = await buildWeekDesk({ rosterId: me, leagueId, fetchJson, now: new Date() });
if (desk.status !== "in_season" || !desk.opponent) {
  console.error(`No live matchup for roster ${me}: ${desk.status} ${desk.message || ""}`);
  process.exit(1);
}
const week = desk.week;
const season = desk.season;
const sides = {
  mine: { rosterId: desk.rosterId, slots: desk.slots },
  theirs: { rosterId: desk.opponent.rosterId, slots: desk.opponent.slots },
};
const fmt = (x) => (x == null ? "-" : (Math.round(x * 10) / 10).toFixed(1));
const keyOf = (e) => `${e.leagueId}|${e.season}|${e.week}|${e.rosterId}|${e.playerId}`;
// keep only this week's entries
let entries = KNOWN_LOCKS.filter((e) => e.leagueId === leagueId && e.season === season && e.week === week);

if (list) {
  for (const [side, { rosterId, slots }] of Object.entries(sides)) {
    console.log(`${side} (roster ${rosterId}), week ${week}:`);
    for (const s of slots) {
      const rec = entries.find((e) => e.rosterId === rosterId && e.playerId === s.playerId);
      console.log(`  ${s.label.padEnd(5)} ${(s.name ?? "empty").padEnd(24)} ${fmt(s.banked).padStart(5)}  ${s.lockState ?? "-"}${s.lockCertain ? " (certain)" : ""}${rec ? `  recorded at ${fmt(rec.score)}` : ""}`);
    }
  }
  process.exit(0);
}

const side = mine ? sides.mine : sides.theirs;
if (!args.length) {
  console.error("Name at least one player (or use --list).");
  process.exit(2);
}
const now = new Date().toISOString();
for (const q of args) {
  const hits = side.slots.filter((s) => s.playerId && (s.playerId === q || (s.name || "").toLowerCase().includes(q.toLowerCase())));
  if (hits.length !== 1) {
    console.error(`"${q}": ${hits.length ? `ambiguous (${hits.map((h) => h.name).join(", ")})` : "no starter matches"}; skipped.`);
    continue;
  }
  const s = hits[0];
  const e = { leagueId, season, week, rosterId: side.rosterId, playerId: s.playerId, name: s.name, score: s.banked, recordedAt: now };
  entries = entries.filter((x) => keyOf(x) !== keyOf(e));
  if (unmark) console.log(`unmarked ${s.name}`);
  else {
    entries.push(e);
    console.log(`${s.name} (${s.label}) locked at ${fmt(s.banked)}`);
  }
}
const body = `// Locks Sleeper's public API does not expose, recorded by hand. Written by
// scripts/lockin/mark-locks.mjs; see lib/lockin/knownLocks.js and D139.
// Each entry: { leagueId, season, week, rosterId, playerId, name, score, recordedAt }.
export const KNOWN_LOCKS = ${JSON.stringify(entries, null, 2)};
`;
fs.writeFileSync(DATA, body);
console.log(`${entries.length} recorded for week ${week}. Wrote ${path.relative(ROOT, DATA)}.`);
