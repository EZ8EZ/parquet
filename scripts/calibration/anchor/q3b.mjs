// Q3 sensitivity: rookies, longer horizons (2021 class K=1..5, 2022 K=1..4, 2023 K=1..3), common sample with both ADPs.
import * as L from './lib.mjs';
const out = {};
for (const [Y, Kmax] of [[2021, 5], [2022, 4], [2023, 3], [2024, 2]]) {
  out[Y] = {};
  const base = []; for (const [id, p] of Object.entries(L.PROJ[Y])) if (L.firstSeason(id) === Y && p.adp_dynasty < 999 && p.adp_std < 999) base.push({ id, d: p.adp_dynasty, s: p.adp_std });
  for (let K = 1; K <= Kmax; K++) { const T = base.map((r) => L.weightedTarget(r.id, Y, K).avg); const D = base.map((r) => -r.d), S = base.map((r) => -r.s);
    out[Y][K] = { n: base.length, rho_dyn: L.r3(L.spearman(T, D)), rho_std: L.r3(L.spearman(T, S)), partial_dyn_given_std: L.r3(L.partialSpearman(T, D, S)), partial_std_given_dyn: L.r3(L.partialSpearman(T, S, D)) }; }
}
// pooled 2021+2022 classes at K=4 and 2021-2023 at K=3 for comparison
const pool = (Ys, K) => Ys.flatMap((Y) => { const r = []; for (const [id, p] of Object.entries(L.PROJ[Y])) if (L.firstSeason(id) === Y && p.adp_dynasty < 999 && p.adp_std < 999) r.push({ id, d: p.adp_dynasty, s: p.adp_std, T: L.weightedTarget(id, Y, K).avg }); return r; });
const pr = (rows, label) => { const T = rows.map((r) => r.T), D = rows.map((r) => -r.d), S = rows.map((r) => -r.s); const idx = L.bootIdx(rows.map((r) => r.id), 1000, 3); const diffs = idx.map((ix) => L.spearman(L.pick(T, ix), L.pick(D, ix)) - L.spearman(L.pick(T, ix), L.pick(S, ix))); return { label, n: rows.length, rho_dyn: L.r3(L.spearman(T, D)), rho_std: L.r3(L.spearman(T, S)), diff: L.r3(L.spearman(T, D) - L.spearman(T, S)), diff_ci: L.ci(diffs).map(L.r3) }; };
out.pooled = [pr(pool([2021, 2022], 4), 'classes 2021-22, K=4'), pr(pool([2021, 2022, 2023], 3), 'classes 2021-23, K=3'), pr(pool([2021, 2022, 2023, 2024], 2), 'classes 2021-24, K=2'), pr(pool([2021, 2022, 2023, 2024], 1), 'classes 2021-24, K=1')];
L.writeJson('results_q3b.json', out); console.log(JSON.stringify(out));
