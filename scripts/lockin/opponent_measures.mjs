// (E) player-spread calibration by tercile, (4a) "a later game beats it" on real lock situations with
// a season-split recalibration, (G) prior-season weight across the season boundary.
// node measures.mjs -> measures.txt, recal.json
import fs from "node:fs";
import path from "node:path";
import { loadAll, WT } from "./opponent_data2.mjs";
const M = await import(`${WT}/lib/lockin/model.js`);
const D = process.env.LOCKIN_CACHE_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), "cache");
const { seasons, logOf } = loadAll();
const { universe } = JSON.parse(fs.readFileSync(path.join(D, "chain.json"), "utf8"));
const lines = [];
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const mc = new Map();
const modelAt = (pid, date) => { const k = pid + "|" + date; if (!mc.has(k)) mc.set(k, M.playerModel(logOf(pid), date)); return mc.get(k); };

// ---- (E) own spread vs common spread, 2026 games
{
  const rows = [];
  for (const pid of universe) for (const g of logOf(pid)) {
    if (g.season !== "2026" || !M.isPlayed(g)) continue;
    const m = modelAt(pid, g.date);
    if (m.dist.n < 10) continue;
    const own = [M.quantile(m.dist.sample, 0.1), M.quantile(m.dist.sample, 0.9)];
    const sdC = 6.7 * 1.12;
    const com = [m.dist.mean - 1.2816 * sdC, m.dist.mean + 1.2816 * sdC];
    rows.push({ sd: m.dist.sd, y: g.fp, own, com });
  }
  const sds = rows.map((r) => r.sd).sort((a, b) => a - b);
  const t1 = sds[Math.floor(sds.length / 3)], t2 = sds[Math.floor((2 * sds.length) / 3)];
  lines.push(`(E) Next-game 10th-90th band, own 30-game shape vs a common spread (league SD 6.7 x 1.12), 2026 games, n=${rows.length}`);
  lines.push("| player-spread tercile | n | own: inside band | own: width | common: inside band | common: width |");
  for (const [name, f] of [["low", (r) => r.sd < t1], ["middle", (r) => r.sd >= t1 && r.sd < t2], ["high", (r) => r.sd >= t2], ["all", () => true]]) {
    const a = rows.filter(f);
    const inside = (k) => a.filter((r) => r.y >= r[k][0] && r.y <= r[k][1]).length / a.length;
    const width = (k) => mean(a.map((r) => r[k][1] - r[k][0]));
    lines.push(`| ${name} (sd ${name === "low" ? `<${t1.toFixed(1)}` : name === "middle" ? `${t1.toFixed(1)}-${t2.toFixed(1)}` : name === "high" ? `>=${t2.toFixed(1)}` : "all"}) | ${a.length} | ${inside("own").toFixed(3)} | ${width("own").toFixed(1)} | ${inside("com").toFixed(3)} | ${width("com").toFixed(1)} |`);
  }
}

// ---- (4a) real situations: a starter holding a score with games left, not yet locked
const sit = [];
{
  const EPS = 0.011;
  for (const s of ["2023", "2024", "2025", "2026"]) {
    const S = seasons[s];
    for (let w = 1; w <= S.weeks; w++) for (const m of S.matchups[w]) (m.starters || []).forEach((pid, i) => {
      if (!pid || pid === "0") return;
      const L = logOf(pid).filter((g) => g.season === s && g.week === w);
      if (!L.length) return;
      const team = L[L.length - 1].team;
      const byG = new Map(L.map((g) => [g.gameId, g]));
      const games = (S.sched.teamWeek.get(`${team}|${w}`) || []).filter((g) => g.status === "complete").map((g) => { const r = byG.get(g.gameId); return { date: g.date, played: !!(r && r.sp > 0), fp: r && r.sp > 0 ? r.fp : 0 }; });
      const banked = m.starters_points?.[i] ?? 0;
      const idx = games.findIndex((g) => g.played && Math.abs(g.fp - banked) < EPS);
      for (let g = 0; g < games.length - 1; g++) {
        if (!games[g].played) continue;
        if (idx >= 0 && idx < g) break; // already locked
        const k = games.length - 1 - g;
        const md = modelAt(pid, games[g + 1].date);
        if (md.dist.n < 10) continue;
        const x = games[g].fp;
        const p = M.probLaterBeats(md.dist.sample, x, k, md.q.value);
        const later = games.slice(g + 1);
        const obs = later.some((h) => h.played && h.fp > x) ? 1 : 0;
        sit.push({ s, p, obs, k, z: (x - md.dist.mean) / md.dist.sd, locked: idx === g ? 1 : 0 });
      }
    });
  }
  const table = (rows, title) => {
    lines.push(`\n${title} (n=${rows.length})`);
    lines.push("| predicted bin | n | mean predicted | observed | predicted minus observed |");
    for (let b = 0; b < 10; b++) {
      const a = rows.filter((r) => r.p >= b / 10 && (b === 9 ? r.p <= 1 : r.p < (b + 1) / 10));
      if (!a.length) continue;
      lines.push(`| ${b / 10}-${(b + 1) / 10} | ${a.length} | ${mean(a.map((r) => r.p)).toFixed(3)} | ${mean(a.map((r) => r.obs)).toFixed(3)} | ${((mean(a.map((r) => r.p)) - mean(a.map((r) => r.obs))) * 100).toFixed(1)} pts |`);
    }
  };
  table(sit, "(4a) P(a later game is played and beats the score he holds), real unlocked situations of league starters, 2023-2026");
  // by banked score relative to forecast and games left
  lines.push("\n| score vs forecast (SDs) | games left | n | predicted | observed | managers locked here |");
  for (const [zl, zh] of [[-9, -0.5], [-0.5, 0.5], [0.5, 1.5], [1.5, 9]]) for (const [kl, kh] of [[1, 1], [2, 2], [3, 9]]) {
    const a = sit.filter((r) => r.z >= zl && r.z < zh && r.k >= kl && r.k <= kh);
    if (a.length < 30) continue;
    lines.push(`| ${zl === -9 ? "<-0.5" : zh === 9 ? ">=1.5" : `${zl} to ${zh}`} | ${kl === kh ? kl : `${kl}+`} | ${a.length} | ${mean(a.map((r) => r.p)).toFixed(3)} | ${mean(a.map((r) => r.obs)).toFixed(3)} | ${mean(a.map((r) => r.locked)).toFixed(2)} |`);
  }
  // recalibration: logistic on logit(p), fit 2023-2025, test 2026
  const lg = (p) => Math.log(Math.min(0.999, Math.max(0.001, p)) / (1 - Math.min(0.999, Math.max(0.001, p))));
  const train = sit.filter((r) => r.s !== "2026");
  const test = sit.filter((r) => r.s === "2026");
  let a = 0, b = 1;
  for (let it = 0; it < 300; it++) {
    let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
    for (const r of train) { const x = lg(r.p); const q = 1 / (1 + Math.exp(-(a + b * x))); const e = q - r.obs; ga += e; gb += e * x; const wv = q * (1 - q); haa += wv; hab += wv * x; hbb += wv * x * x; }
    const det = haa * hbb - hab * hab;
    a -= (hbb * ga - hab * gb) / det;
    b -= (haa * gb - hab * ga) / det;
  }
  const brier = (rows, f) => mean(rows.map((r) => (f(r.p) - r.obs) ** 2));
  const recal = (p) => 1 / (1 + Math.exp(-(a + b * lg(p))));
  lines.push(`\nRecalibration logit(p') = ${a.toFixed(3)} + ${b.toFixed(3)} x logit(p), fit on 2023-2025 (n=${train.length}); 2026 out of sample (n=${test.length}): Brier ${brier(test, (p) => p).toFixed(4)} raw -> ${brier(test, recal).toFixed(4)} recalibrated`);
  table(test.map((r) => ({ ...r, p: recal(r.p) })), "2026 after recalibration");
  table(test, "2026 raw");
  fs.writeFileSync(path.join(D, "recal.json"), JSON.stringify({ a, b, trainN: train.length, testN: test.length, brierRaw: brier(test, (p) => p), brierRecal: brier(test, recal) }));
}

// ---- (G) prior-season weight in the EWMA mean, early weeks
{
  const evalSeason = (season, f) => {
    let se = 0, n = 0;
    for (const pid of universe) {
      const L = logOf(pid);
      for (const g of L) {
        if (g.season !== season || g.week > 3 || !M.isPlayed(g)) continue;
        const prior = L.filter((x) => x.date < g.date && M.isPlayed(x));
        if (prior.length < 10) continue;
        const a = Math.pow(0.5, 1 / M.MODEL.halfLife);
        let w = 0, t = 0;
        for (let i = prior.length - 1, k = 0; i >= 0 && k < 200; i--, k++) { const ww = Math.pow(a, k) * (prior[i].season === season ? 1 : f); w += ww; t += ww * prior[i].fp; }
        se += (t / w - g.fp) ** 2; n++;
      }
    }
    return { rmse: Math.sqrt(se / n), n };
  };
  lines.push("\n(G) Weight on prior-season games in the weighted mean, weeks 1-3: RMSE of the next-game mean");
  lines.push("| factor on prior-season games | 2025 weeks 1-3 (tune) | 2026 weeks 1-3 (test) |");
  for (const f of [0.25, 0.5, 1, 1.5, 2]) {
    const a = evalSeason("2025", f), b = evalSeason("2026", f);
    lines.push(`| ${f} | ${a.rmse.toFixed(3)} (n=${a.n}) | ${b.rmse.toFixed(3)} (n=${b.n}) |`);
  }
}
fs.writeFileSync(path.join(D, "measures.txt"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
