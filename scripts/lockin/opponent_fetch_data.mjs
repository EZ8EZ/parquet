// Data for the opponent work: the league chain (game_mode per season), every lock-in season's
// matchups, rosters and users, 2026 weeks 1-5 final matchups, 2026 logs for every rostered player,
// and scores feeds (listed starts). Cached under ./cache; reuses the study's cache when present.
import fs from "node:fs";
import path from "node:path";
const D = process.env.LOCKIN_CACHE_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), "cache");
const C = path.join(D, "opponent_responses");
const STUDY = C;
fs.mkdirSync(C, { recursive: true });
const key = (u) => u.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);
let fetched = 0;
let last = 0;
export async function get(url, { refresh = false } = {}) {
  const f = path.join(C, key(url) + ".json");
  if (!refresh && fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  const sf = path.join(STUDY, key(url) + ".json");
  if (!refresh && fs.existsSync(sf)) return JSON.parse(fs.readFileSync(sf, "utf8"));
  const wait = last + 200 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const txt = await res.text();
  fetched++;
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  fs.writeFileSync(f, txt);
  return JSON.parse(txt);
}
const V1 = "https://api.sleeper.app/v1";
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const chain = [];
  let id = "1347007735815766016";
  while (id && id !== "0") {
    const l = await get(`${V1}/league/${id}`, { refresh: id === "1347007735815766016" });
    chain.push({ id, season: l.season, status: l.status, game_mode: l.settings?.game_mode ?? null, playoff_week_start: l.settings?.playoff_week_start, previous: l.previous_league_id });
    id = l.previous_league_id;
  }
  console.log(JSON.stringify(chain, null, 1));
  const lockin = chain.filter((c) => c.game_mode === 1);
  const universe = new Set();
  for (const c of lockin) {
    const weeks = c.season === "2026" ? 5 : 23;
    await get(`${V1}/league/${c.id}/rosters`, { refresh: c.season === "2026" });
    await get(`${V1}/league/${c.id}/users`, { refresh: c.season === "2026" });
    for (let w = 1; w <= weeks; w++) {
      const m = await get(`${V1}/league/${c.id}/matchups/${w}`, { refresh: c.season === "2026" && w >= 3 });
      for (const x of m || []) for (const p of x.players || []) universe.add(p);
      await get(`https://api.sleeper.app/scores/nba/regular/${c.season}/${w}`, { refresh: c.season === "2026" && w >= 4 });
    }
    await get(`https://api.sleeper.app/schedule/nba/regular/${c.season}`, { refresh: c.season === "2026" });
  }
  fs.writeFileSync(path.join(D, "chain.json"), JSON.stringify({ chain, universe: [...universe] }));
  let n = 0;
  for (const pid of universe) {
    for (const s of ["2026", "2025", "2024"]) {
      try {
        await get(`https://api.sleeper.app/stats/nba/player/${pid}?season_type=regular&season=${s}&grouping=week`, { refresh: s === "2026" });
      } catch (e) {
        console.log("fail", pid, s, e.message);
      }
    }
    if (++n % 100 === 0) console.log(n, "/", universe.size, "fetched", fetched);
  }
  console.log("done; universe", universe.size, "requests made", fetched);
}
