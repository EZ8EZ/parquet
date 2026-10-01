/* eslint-disable -- frozen research script kept as reference for D116 (see ../README.md), not app source */
// Q1 sensitivity: longer-horizon targets (2021 snapshot K=1..5; 2022 K=1..4; 2023 K=1..3; 2024 K=1..2), same both-<999 sample.
import * as L from './lib.mjs';
const B = 1000, WGRID = Array.from({ length: 21 }, (_, i) => i / 20); const out = {};
for (const [Y, Kmax] of [[2021, 5], [2022, 4], [2023, 3], [2024, 2]]) {
  out[Y] = {};
  const base = []; for (const [id, p] of Object.entries(L.PROJ[Y])) if (p.adp_dynasty < 999 && p.adp_std < 999 && p.adp_dynasty != null && p.adp_std != null) base.push({ id, d: p.adp_dynasty, s: p.adp_std });
  const D = base.map((r) => -Math.log(r.d)), S = base.map((r) => -Math.log(r.s));
  for (let K = 1; K <= Kmax; K++) {
    const T = base.map((r) => L.weightedTarget(r.id, Y, K).avg); const rT = L.rankAvg(T);
    const best = (idx) => { const t = idx ? L.rankAvg(L.pick(T, idx)) : rT; let bw = 0, br = -2; for (const w of WGRID) { const sc = D.map((v, i) => w * v + (1 - w) * S[i]); const s2 = idx ? L.pick(sc, idx) : sc; const r = L.pearson(t, L.rankAvg(s2)); if (r > br) { br = r; bw = w; } } return { w: bw, rho: br }; };
    const b0 = best(null); const rd = L.spearman(T, D), rs = L.spearman(T, S);
    const bw = L.bootIdx(base.map((r) => r.id), 400, 5 + K).map((ix) => best(ix).w);
    out[Y][K] = { n: base.length, rho_dyn: L.r3(rd), rho_std: L.r3(rs), diff: L.r3(rd - rs), best_w_dyn: b0.w, rho_best: L.r3(b0.rho), w_ci: L.ci(bw).map(L.r2) };
  }
}
L.writeJson('results_q1b.json', out); console.log(JSON.stringify(out));
