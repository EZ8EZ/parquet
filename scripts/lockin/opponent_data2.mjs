import { fileURLToPath } from "node:url";
// All lock-in seasons (2022-2026) from ./cache through lib/lockin's normalizer. No network.
import fs from "node:fs";
import path from "node:path";
export const WT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const N = await import(`${WT}/lib/lockin/normalize.js`);
const D = process.env.LOCKIN_CACHE_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), "cache");
const C = path.join(D, "opponent_responses");
const STUDY = C;
const key = (u) => u.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);
export const rd = (url) => {
  for (const dir of [C, STUDY]) {
    const f = path.join(dir, key(url) + ".json");
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  }
  return undefined;
};
const V1 = "https://api.sleeper.app/v1";
export function loadAll() {
  const { chain } = JSON.parse(fs.readFileSync(path.join(D, "chain.json"), "utf8"));
  const seasons = {};
  for (const c of chain.filter((x) => x.game_mode === 1)) {
    const league = rd(`${V1}/league/${c.id}`);
    const weeks = c.season === "2026" ? 5 : 23;
    const matchups = {};
    for (let w = 1; w <= weeks; w++) matchups[w] = rd(`${V1}/league/${c.id}/matchups/${w}`) || [];
    const sched = N.indexSchedule(rd(`https://api.sleeper.app/schedule/nba/regular/${c.season}`) || [], c.season);
    const tips = new Map();
    for (let w = 1; w <= weeks; w++) for (const g of rd(`https://api.sleeper.app/scores/nba/regular/${c.season}/${w}`) || []) if (typeof g.start_time === "number") tips.set(g.game_id, g.start_time);
    const rosters = rd(`${V1}/league/${c.id}/rosters`) || [];
    seasons[c.season] = { id: c.id, season: c.season, league, scoring: league.scoring_settings, matchups, weeks, sched, tips, owner: new Map(rosters.map((r) => [r.roster_id, r.owner_id])), rosters, users: rd(`${V1}/league/${c.id}/users`) || [] };
  }
  const players = rd(`${V1}/players/nba`) || {};
  const logCache = new Map();
  // full multi-season log for a player (2022-2026 where cached), each season scored with 2026 scoring
  const scoring = seasons["2026"].scoring;
  function logOf(pid) {
    if (logCache.has(pid)) return logCache.get(pid);
    const parts = [];
    for (const s of ["2021", "2022", "2023", "2024", "2025", "2026"]) {
      const raw = rd(`https://api.sleeper.app/stats/nba/player/${pid}?season_type=regular&season=${s}&grouping=week`);
      if (!raw) continue;
      const sc = seasons[s]?.sched;
      parts.push(N.normalizeSeasonLog(raw, { playerId: pid, season: s, scoring, isComplete: (row) => { const g = sc?.games.get(row.gameId); return g ? g.status === "complete" : Number(s) < 2026; } }));
    }
    const log = N.mergeLogs(...parts);
    logCache.set(pid, log);
    return log;
  }
  return { seasons, players, logOf };
}
