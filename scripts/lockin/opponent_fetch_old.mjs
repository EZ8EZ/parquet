// 2022 and 2023 logs for players who appear in those seasons' matchups. node fetch_old.mjs
import fs from "node:fs";
import path from "node:path";
import { get } from "./opponent_fetch_data.mjs";
const D = process.env.LOCKIN_CACHE_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), "cache");
const { chain } = JSON.parse(fs.readFileSync(path.join(D, "chain.json"), "utf8"));
let n = 0;
for (const c of chain.filter((x) => x.season === "2022" || x.season === "2023")) {
  const ids = new Set();
  for (let w = 1; w <= 23; w++) for (const m of (await get(`https://api.sleeper.app/v1/league/${c.id}/matchups/${w}`)) || []) for (const p of m.players || []) ids.add(p);
  for (const pid of ids) {
    try {
      await get(`https://api.sleeper.app/stats/nba/player/${pid}?season_type=regular&season=${c.season}&grouping=week`);
    } catch (e) {
      console.log("fail", pid, c.season, e.message);
    }
    n++;
  }
  console.log(c.season, ids.size);
}
console.log("done", n);
