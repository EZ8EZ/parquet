// Reads the study's cached Sleeper responses and normalises them through lib/lockin. No network.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
/** Repo root, so lib/lockin is imported from this checkout. */
export const WT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const { indexSchedule, normalizeSeasonLog, mergeLogs } = await import(`${WT}/lib/lockin/normalize.js`);
/** The response cache fetch_all.cjs fills (not committed); outputs land here too. */
export const STUDY = process.env.LOCKIN_CACHE_DIR || fileURLToPath(new URL("./cache", import.meta.url));
const key = (url) => url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);
export const rd = (url) => {
  const f = path.join(STUDY, key(url) + ".json");
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : undefined;
};
export const LG = { 2025: "1240499656799039488", 2026: "1347007735815766016" };
const WEEKS = { 2025: 23, 2026: 4 };
export function loadStudyData() {
  const players = rd("https://api.sleeper.app/v1/players/nba");
  const uni = JSON.parse(fs.readFileSync(path.join(STUDY, "universe.json"), "utf8"));
  const league = rd(`https://api.sleeper.app/v1/league/${LG[2026]}`);
  const scoring = league.scoring_settings;
  const matchups = {};
  const schedRaw = {};
  for (const s of ["2025", "2026"]) {
    matchups[s] = {};
    for (let w = 1; w <= WEEKS[s]; w++) matchups[s][w] = rd(`https://api.sleeper.app/v1/league/${LG[s]}/matchups/${w}`) || [];
    schedRaw[s] = rd(`https://api.sleeper.app/schedule/nba/regular/${s}`) || [];
  }
  const sched = { 2025: indexSchedule(schedRaw["2025"], "2025"), 2026: indexSchedule(schedRaw["2026"], "2026") };
  const isComplete = (row) => {
    const g = sched[row.season]?.games.get(row.gameId);
    if (g) return g.status === "complete";
    return Number(row.season) < 2025;
  };
  const logs = {};
  for (const pid of new Set([...uni.rostered, ...uni.rotation])) {
    const parts = [];
    for (const s of ["2023", "2024", "2025", "2026"]) {
      const raw = rd(`https://api.sleeper.app/stats/nba/player/${pid}?season_type=regular&season=${s}&grouping=week`);
      if (!raw) continue;
      parts.push(normalizeSeasonLog(raw, { playerId: pid, season: s, scoring, isComplete }));
    }
    if (parts.length) logs[pid] = mergeLogs(...parts);
  }
  return { players, uni, league, scoring, matchups, sched, schedRaw, logs };
}
