// When does a manager lock? Every "unknown until next tip" situation in 2022-2026 (a starter
// played game g, his slot was still open, and he has games left): did the manager lock that
// score? Compared with what the engine assumes for an opponent (D137): lock with the league
// share whatever the score, else lock by the reservation rule shifted -1.55.
// node scripts/lockin/lock_propensity.mjs [out.json]
import fs from "node:fs";
import { loadAll, WT } from "./opponent_data2.mjs";
const M = await import(`${WT}/lib/lockin/model.js`);
const { seasons, logOf } = loadAll();
const EPS = 0.011;
const order = ["2022", "2023", "2024", "2025", "2026"];
const mc = new Map();
const modelAt = (pid, date) => { const k = pid + "|" + date; if (!mc.has(k)) mc.set(k, M.playerModel(logOf(pid), date)); return mc.get(k); };
const capK = (k) => Math.min(k, M.MODEL?.kMax ?? 6);
function weekGames(pid, s, w) {
  const L = logOf(pid).filter((g) => g.season === s && g.week === w);
  if (!L.length) return null;
  const team = L[L.length - 1].team;
  const byG = new Map(L.map((g) => [g.gameId, g]));
  const tw = seasons[s].sched.teamWeek.get(`${team}|${w}`) || [];
  const games = tw.filter((g) => g.status === "complete").map((g) => { const r = byG.get(g.gameId); return { date: g.date, played: !!(r && r.sp > 0), fp: r && r.sp > 0 ? r.fp : 0 }; });
  return games.length ? games : null;
}
const rows = [];
const match = {};
for (const s of order) {
  const S = seasons[s];
  for (let w = 1; w <= S.weeks; w++) {
    for (const m of S.matchups[w]) {
      (m.starters || []).forEach((pid, i) => {
        if (!pid || pid === "0") return;
        const banked = m.starters_points?.[i] ?? 0;
        const games = weekGames(pid, s, w);
        if (!games || !games.some((g) => g.played)) return;
        let idx = games.findIndex((g) => g.played && Math.abs(g.fp - banked) < EPS);
        const lastIdx = games.length - 1;
        if (idx < 0 && banked === 0 && !games[lastIdx].played) idx = lastIdx;
        (match[s] = match[s] || [0, 0, 0])[1]++;
        if (idx < 0) { match[s][0]++; return; }
        // a banked score equal to more than one of his games this week is ambiguous
        if (games.filter((g) => g.played && Math.abs(g.fp - banked) < EPS).length > 1) match[s][2]++;
        for (let g = 0; g < lastIdx; g++) {
          if (!games[g].played || idx < g) continue;
          const x = games[g].fp;
          const left = lastIdx - g; // games after this one
          const mdl = modelAt(pid, games[g + 1].date);
          const bar = mdl.r[capK(left)];
          const sd = mdl.dist.sd || 6;
          rows.push({ s, w, owner: S.owner.get(m.roster_id) || "", x, left, bar, sd, mean: mdl.dist.mean, q: mdl.q.value, z: (x - bar) / sd, locked: idx === g ? 1 : 0, dow: (new Date(`${games[g].date}T12:00:00Z`).getUTCDay() + 6) % 7 });
        }
      });
    }
  }
}
const out = process.argv[2];
if (out) fs.writeFileSync(out, JSON.stringify(rows));
for (const [k, [u, t, amb]] of Object.entries(match)) console.log(`${k}: starters ${t}, banked score matches none of his games ${(u / t * 100).toFixed(1)}%, matches two ${(amb / t * 100).toFixed(1)}%`);
const n = rows.length, base = rows.reduce((t, r) => t + r.locked, 0) / n;
console.log(`situations n=${n}, locked share ${base.toFixed(3)}`);
const SHARE = 0.293, SHIFT = -1.55;
const engine = (r) => SHARE + (1 - SHARE) * (r.x >= r.bar + SHIFT ? 1 : 0);
const bins = [-Infinity, -1.5, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 1.5, Infinity];
console.log("z=(x-bar)/sd bin      n    actual  engine");
for (let i = 0; i < bins.length - 1; i++) {
  const b = rows.filter((r) => r.z >= bins[i] && r.z < bins[i + 1]);
  if (!b.length) continue;
  const a = b.reduce((t, r) => t + r.locked, 0) / b.length, e = b.reduce((t, r) => t + engine(r), 0) / b.length;
  console.log(`[${bins[i]}, ${bins[i + 1]})`.padEnd(18), String(b.length).padStart(6), a.toFixed(3).padStart(8), e.toFixed(3).padStart(7));
}
console.log("games left after:");
for (const k of [1, 2, 3, 4]) { const b = rows.filter((r) => (k < 4 ? r.left === k : r.left >= 4)); if (b.length) console.log(` ${k}${k === 4 ? "+" : ""}: n=${b.length} actual ${(b.reduce((t, r) => t + r.locked, 0) / b.length).toFixed(3)} engine ${(b.reduce((t, r) => t + engine(r), 0) / b.length).toFixed(3)}`); }
const brier = (f) => rows.reduce((t, r) => t + (f(r) - r.locked) ** 2, 0) / n;
console.log(`Brier: constant ${brier(() => base).toFixed(4)}  engine ${brier(engine).toFixed(4)}`);
