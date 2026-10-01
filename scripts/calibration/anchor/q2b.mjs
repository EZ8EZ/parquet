/* eslint-disable -- frozen research script kept as reference for D116 (see ../README.md), not app source */
// Q2b: horizon-matched age curve. Re-derives the repo's age curve (forward discounted production relative to own current level,
// zero when not qualifying) but truncated to the SAME horizon K as the test target, from baseline seasons 2013-2019 only.
// Then tests gamma in E[T] = exp(a_Y + f(anchor) + gamma*log m_K(age)).  gamma~1 => the (horizon-matched) curve is fully warranted given that anchor.
import * as L from './lib.mjs';
const BASE = [2013, 2014, 2015, 2016, 2017, 2018, 2019];
function curveK(K, d = 0.9, base = BASE) {
  const cells = new Map();
  for (const y of base) for (const [id, r] of L.SEASON[y].rows) {
    if (r.gp < 30 || r.min < 500) continue; const a = L.ageDuringSeason(id, y); if (a == null) continue;
    const c = cells.get(a) ?? { n: 0, s: Array(K).fill(0) }; c.n++;
    for (let j = 1; j < K; j++) c.s[j] += L.nTot(id, y + j) / r.nTot; cells.set(a, c);
  }
  const raw = []; for (let a = 19; a <= 36; a++) { const c = cells.get(a); if (!c || c.n < 15) continue; let m = 1; for (let j = 1; j < K; j++) m += Math.pow(d, j) * c.s[j] / c.n; raw.push({ age: a, n: c.n, v: m }); }
  // PAV decreasing (weighted), as the repo does
  const bl = raw.map((p) => ({ v: p.v, w: p.n, ages: [p.age] })); let i = 0;
  while (i < bl.length - 1) { if (bl[i].v < bl[i + 1].v - 1e-12) { const a = bl[i], b = bl[i + 1]; bl.splice(i, 2, { v: (a.v * a.w + b.v * b.w) / (a.w + b.w), w: a.w + b.w, ages: [...a.ages, ...b.ages] }); if (i > 0) i--; } else i++; }
  const sm = new Map(); for (const b of bl) for (const a of b.ages) sm.set(a, b.v);
  const ages = [...sm.keys()].sort((a, b) => a - b);
  return { f: (age) => (age <= ages[0] ? sm.get(ages[0]) : age >= ages.at(-1) ? sm.get(ages.at(-1)) : sm.get(age) ?? sm.get(Math.floor(age))), table: ages.map((a) => [a, L.r3(sm.get(a)), raw.find((p) => p.age === a).n]) };
}
const out = { note: 'baseline seasons 2013-2019, same method as repo (zero if not qualifying), horizon truncated to K', curves: {}, gamma: {} };
const CK = {}; for (let K = 1; K <= 6; K++) { CK[K] = curveK(K); out.curves[K] = CK[K].table; }
function rowsFor(Y, K, anchors) {
  const rr = [];
  for (const [id, p] of Object.entries(L.PROJ[Y])) {
    if (p.adp_dynasty == null || p.adp_std == null || p.adp_dynasty >= 999 || p.adp_std >= 999) continue;
    const a = L.ageDuringSeason(id, Y); if (a == null) continue;
    rr.push({ id, Y, d: p.adp_dynasty, s: p.adp_std, T: L.weightedTarget(id, Y, K).avg, aS: a });
  }
  return rr;
}
function gamma(rows, anchors, mf, label) {
  const Ys = [...new Set(rows.map((r) => r.Y))];
  const X = rows.map((r) => { const x = [1]; for (const Y of Ys.slice(1)) x.push(r.Y === Y ? 1 : 0); for (const a of anchors) { const l = Math.log(r[a]); x.push(l, l * l); } x.push(Math.log(mf(r.aS))); return x; });
  const fit = L.poisson(X, rows.map((r) => r.T), rows.map((r) => r.id)); const j = X[0].length - 1;
  return { label, n: rows.length, gamma: L.r3(fit.b[j]), se: L.r3(fit.se[j]), ci95: [L.r3(fit.b[j] - 1.96 * fit.se[j]), L.r3(fit.b[j] + 1.96 * fit.se[j])], z_vs_1: L.r3((fit.b[j] - 1) / fit.se[j]), z_vs_0: L.r3(fit.b[j] / fit.se[j]) };
}
const repoM = (a) => L.ageMult(a);
for (const [lab, Ys, K] of [['pooled 2021-23, K=3', [2021, 2022, 2023], 3], ['pooled 2021-24, K=2', [2021, 2022, 2023, 2024], 2], ['pooled 2021-22, K=4', [2021, 2022], 4], ['2021, K=5', [2021], 5], ['2021, K=3', [2021], 3], ['2022, K=3', [2022], 3], ['2023, K=3', [2023], 3], ['pooled 2021-23, K=1', [2021, 2022, 2023], 1]]) {
  const rows = Ys.flatMap((Y) => rowsFor(Y, K));
  out.gamma[lab] = {};
  for (const [an, ak] of [['dyn', ['d']], ['std', ['s']], ['both', ['d', 's']]]) {
    out.gamma[lab][an] = { matched: gamma(rows, ak, CK[K].f, 'matched-horizon curve'), repo5: gamma(rows, ak, repoM, 'repo curve (5-season horizon)') };
  }
}
// also what share of the repo's multiplier SPREAD is warranted: spread of matched curve vs repo curve at K
out.spread = {}; for (let K = 1; K <= 6; K++) out.spread[K] = { m22: L.r3(CK[K].f(22)), m27: L.r3(CK[K].f(27)), m32: L.r3(CK[K].f(32)), ratio22_27: L.r3(CK[K].f(22) / CK[K].f(27)), ratio32_27: L.r3(CK[K].f(32) / CK[K].f(27)) };
out.spread.repo = { m22: L.ageMult(22), m27: L.ageMult(27), m32: L.ageMult(32), ratio22_27: L.r3(L.ageMult(22) / L.ageMult(27)), ratio32_27: L.r3(L.ageMult(32) / L.ageMult(27)) };
L.writeJson('results_q2b.json', out);
console.log(JSON.stringify(out.spread)); console.log(out.curves[3].map((r) => r.join(':')).join(' ')); console.log(out.curves[6].map((r) => r.join(':')).join(' '));
for (const k in out.gamma) { const o = out.gamma[k]; for (const a in o) console.log(k.padEnd(22), a.padEnd(5), 'matched g=', o[a].matched.gamma, '±', o[a].matched.se, 'z1=', o[a].matched.z_vs_1, ' | repo5 g=', o[a].repo5.gamma, '±', o[a].repo5.se, 'n', o[a].matched.n); }
