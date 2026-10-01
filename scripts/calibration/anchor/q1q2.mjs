/* eslint-disable -- frozen research script kept as reference for D116 (see ../README.md), not app source */
import * as L from './lib.mjs';
const { PROJ, P } = L;
const B = 1000;
const HORIZON = { 2021: 3, 2022: 3, 2023: 3, 2024: 2, 2025: 1 };
const PRIMARY = [2021, 2022, 2023, 2024];

function snapshotRows(Y, K) {
  const rows = [];
  for (const [id, p] of Object.entries(PROJ[Y])) {
    if (p.adp_dynasty == null || p.adp_std == null || p.adp_dynasty >= 999 || p.adp_std >= 999) continue;
    const t = L.weightedTarget(id, Y, K);
    const age = L.ageAtSnapshot(id, Y);
    const aSeason = L.ageDuringSeason(id, Y);
    rows.push({ id, Y, d: p.adp_dynasty, s: p.adp_std, T: t.avg, Tsum: t.sum, age, aSeason, m: aSeason == null ? null : L.ageMult(aSeason), ppg: L.projFPPG(p) });
  }
  return rows;
}
const F = {
  log: (r, k) => -Math.log(r[k]),
  value: (r, k) => Math.exp(-0.021 * (r[k] - 1)),
};
function pctScore(rows, k) { const rk = L.rankAvg(rows.map((r) => -r[k])); return rk.map((v) => v / rows.length); }
const WGRID = Array.from({ length: 21 }, (_, i) => i / 20);

// score vectors for blending in a given space (pct is within-year, computed per year then concatenated)
function scores(rows, space) {
  const byY = new Map(); rows.forEach((r, i) => { if (!byY.has(r.Y)) byY.set(r.Y, []); byY.get(r.Y).push(i); });
  const D = Array(rows.length), S = Array(rows.length);
  if (space === 'pct') {
    for (const idx of byY.values()) { const sub = idx.map((i) => rows[i]); const pd = pctScore(sub, 'd'), ps = pctScore(sub, 's'); idx.forEach((i, j) => { D[i] = pd[j]; S[i] = ps[j]; }); }
  } else rows.forEach((r, i) => { D[i] = F[space](r, 'd'); S[i] = F[space](r, 's'); });
  return { D, S };
}
function bestW(Tv, D, S) {
  const rT = L.rankAvg(Tv); let best = -2, bw = 0; const curve = [];
  for (const w of WGRID) { const sc = D.map((v, i) => w * v + (1 - w) * S[i]); const rho = L.pearson(rT, L.rankAvg(sc)); curve.push(rho); if (rho > best) { best = rho; bw = w; } }
  return { w: bw, rho: best, curve };
}
// For blends in log space the two scales are comparable (both -log adp). For 'value' space the scales are too.
function analyseSet(rows, label, space = 'log', doBoot = true) {
  const n = rows.length;
  const T = rows.map((r) => r.T), D = rows.map((r) => -r.d), S = rows.map((r) => -r.s);
  const rhoD = L.spearman(T, D), rhoS = L.spearman(T, S);
  const pD_S = L.partialSpearman(T, D, S), pS_D = L.partialSpearman(T, S, D);
  const sc = scores(rows, space); const bw = bestW(T, sc.D, sc.S);
  const out = { label, n, rho_dyn: L.r3(rhoD), rho_std: L.r3(rhoS), rho_dyn_minus_std: L.r3(rhoD - rhoS), partial_dyn_given_std: L.r3(pD_S), partial_std_given_dyn: L.r3(pS_D), corr_dyn_std: L.r3(L.spearman(D, S)),
    blend: { space, best_w_dyn: bw.w, rho_at_best: L.r3(bw.rho), rho_w0: L.r3(bw.curve[0]), rho_w05: L.r3(bw.curve[10]), rho_w1: L.r3(bw.curve[20]), curve: bw.curve.map(L.r3) } };
  if (doBoot) {
    const idxs = L.bootIdx(rows.map((r) => r.id), B, 11 + n);
    const bd = [], bs = [], bdiff = [], bpd = [], bps = [], bw_ = [];
    for (const ix of idxs) {
      const t = L.pick(T, ix), d = L.pick(D, ix), s = L.pick(S, ix);
      const a = L.spearman(t, d), b = L.spearman(t, s); bd.push(a); bs.push(b); bdiff.push(a - b);
      bpd.push(L.partialSpearman(t, d, s)); bps.push(L.partialSpearman(t, s, d));
      bw_.push(bestW(t, L.pick(sc.D, ix), L.pick(sc.S, ix)).w);
    }
    out.ci = { rho_dyn: L.ci(bd).map(L.r3), rho_std: L.ci(bs).map(L.r3), diff: L.ci(bdiff).map(L.r3), partial_dyn_given_std: L.ci(bpd).map(L.r3), partial_std_given_dyn: L.ci(bps).map(L.r3), best_w: L.ci(bw_).map(L.r2), best_w_median: L.quantile(bw_, 0.5), best_w_sd: L.r3(L.sd(bw_)), P_dyn_better: L.r3(bdiff.filter((v) => v > 0).length / B) };
  }
  return out;
}

const res = { meta: { description: 'Q1/Q2: dynasty vs redraft ADP as anchors of era-normalised discounted fantasy points', horizons: HORIZON, B, target: 'avg of d^k*normFP(Y+k), d=0.9, zero for seasons not played; normFP = season total FP / mean total FP of qualifiers (30gp,500min)' } };

// ---------- Q1
res.Q1 = { perYear: {}, pooled: {}, perYearAlt: {}, singleAnchorFullSets: {} };
const allRows = {}; for (const Y of [...PRIMARY, 2025]) allRows[Y] = snapshotRows(Y, HORIZON[Y]);
for (const Y of [...PRIMARY, 2025]) {
  res.Q1.perYear[Y] = analyseSet(allRows[Y], `snapshot ${Y}, ${HORIZON[Y]}-season target`, 'log');
  res.Q1.perYearAlt[Y] = { pct: analyseSet(allRows[Y], '', 'pct', false).blend, value: analyseSet(allRows[Y], '', 'value', false).blend };
}
const pool = (Ys) => Ys.flatMap((Y) => allRows[Y]);
for (const [key, Ys] of [['pooled_3season_2021_2023', [2021, 2022, 2023]], ['pooled_all_2021_2024', PRIMARY]]) {
  const rows = pool(Ys);
  res.Q1.pooled[key] = analyseSet(rows, key, 'log');
  res.Q1.pooled[key + '_pct'] = analyseSet(rows, key, 'pct');
  res.Q1.pooled[key + '_value'] = analyseSet(rows, key, 'value', false);
}
// single-anchor on the full available set per anchor (no 999 on either side required)
for (const Y of PRIMARY) {
  const K = HORIZON[Y], o = {};
  for (const [k, f] of [['adp_dynasty', 'dyn'], ['adp_std', 'std']]) {
    const rr = []; for (const [id, p] of Object.entries(PROJ[Y])) if (p[k] != null && p[k] < 999) rr.push({ a: -p[k], T: L.weightedTarget(id, Y, K).avg });
    o[f] = { n: rr.length, rho: L.r3(L.spearman(rr.map((r) => r.T), rr.map((r) => r.a))) };
  }
  res.Q1.singleAnchorFullSets[Y] = o;
}

// ---------- Q2: age given anchor
function ageTests(rows, label, doBoot = true) {
  const rr = rows.filter((r) => r.age != null);
  const T = rr.map((r) => r.T), D = rr.map((r) => -r.d), S = rr.map((r) => -r.s), A = rr.map((r) => -r.age), M = rr.map((r) => r.m);
  const o = { label, n: rr.length, rho_T_age: L.r3(L.spearman(T, A)), // sign: -age so positive = younger does better
    partial_youth_given_dyn: L.r3(L.partialSpearman(T, A, D)), partial_youth_given_std: L.r3(L.partialSpearman(T, A, S)),
    partial_mult_given_dyn: L.r3(L.partialSpearman(T, M, D)), partial_mult_given_std: L.r3(L.partialSpearman(T, M, S)),
    rho_age_vs_dynADP_better: L.r3(L.spearman(A, D)), rho_age_vs_stdADP_better: L.r3(L.spearman(A, S)) };
  // blend 50/50 log space
  const bl = rr.map((r) => -0.5 * Math.log(r.d) - 0.5 * Math.log(r.s));
  o.partial_youth_given_blend50 = L.r3(L.partialSpearman(T, A, bl));
  if (doBoot) {
    const idxs = L.bootIdx(rr.map((r) => r.id), B, 77 + rr.length); const a1 = [], a2 = [], a3 = [];
    for (const ix of idxs) { const t = L.pick(T, ix), a = L.pick(A, ix); a1.push(L.partialSpearman(t, a, L.pick(D, ix))); a2.push(L.partialSpearman(t, a, L.pick(S, ix))); a3.push(a1.at(-1) - a2.at(-1)); }
    o.ci = { partial_youth_given_dyn: L.ci(a1).map(L.r3), partial_youth_given_std: L.ci(a2).map(L.r3), diff_dyn_minus_std: L.ci(a3).map(L.r3) };
  }
  return o;
}
// age-bucket mean residual of rank(T) (as percentile) after OLS on anchor rank
const BUCKETS = [[0, 21.5], [21.5, 23.5], [23.5, 25.5], [25.5, 27.5], [27.5, 29.5], [29.5, 31.5], [31.5, 60]];
function bucketResid(rows, key) {
  const rr = rows.filter((r) => r.age != null);
  // within-year percentile of T and of anchor rank, residual of T-pct on anchor-pct (linear)
  const out = []; const resAll = Array(rr.length);
  const byY = new Map(); rr.forEach((r, i) => { if (!byY.has(r.Y)) byY.set(r.Y, []); byY.get(r.Y).push(i); });
  for (const idx of byY.values()) { const sub = idx.map((i) => rr[i]); const pT = L.rankAvg(sub.map((r) => r.T)).map((v) => v / sub.length); const pA = L.rankAvg(sub.map((r) => -r[key])).map((v) => v / sub.length); const e = L.resid(pT, pA); idx.forEach((i, j) => { resAll[i] = e[j]; }); }
  for (const [lo, hi] of BUCKETS) { const e = rr.map((r, i) => [r, resAll[i]]).filter(([r]) => r.age >= lo && r.age < hi).map(([, v]) => v); out.push({ age: `${lo === 0 ? '<' + hi : hi === 60 ? '>=' + lo : lo + '-' + hi}`, n: e.length, mean_resid_pct: L.r3(L.mean(e)), se: L.r3(L.sd(e) / Math.sqrt(e.length)) }); }
  return out;
}
res.Q2 = { perYear: {}, pooled: {}, buckets: {}, horizonSweep: {}, glm: {} };
for (const Y of PRIMARY) res.Q2.perYear[Y] = ageTests(allRows[Y], `snapshot ${Y}`);
res.Q2.pooled.p3 = ageTests(pool([2021, 2022, 2023]), 'pooled 2021-23 (3-season)');
res.Q2.pooled.all = ageTests(pool(PRIMARY), 'pooled 2021-24');
res.Q2.buckets.dyn = bucketResid(pool([2021, 2022, 2023]), 'd'); res.Q2.buckets.std = bucketResid(pool([2021, 2022, 2023]), 's');
// horizon sweep: partial rho of youth given anchor by target horizon K (truncation bias), per snapshot
for (const Y of [2021, 2022, 2023, 2024]) {
  res.Q2.horizonSweep[Y] = {};
  for (let K = 1; K <= Math.min(5, 2025 - Y + 1); K++) {
    const rows = snapshotRows(Y, K); const t = ageTests(rows, '', false);
    // also the GLM elasticity for this K
    res.Q2.horizonSweep[Y][K] = { n: t.n, partial_youth_given_dyn: t.partial_youth_given_dyn, partial_youth_given_std: t.partial_youth_given_std, partial_mult_given_dyn: t.partial_mult_given_dyn, partial_mult_given_std: t.partial_mult_given_std };
  }
}
// Poisson elasticity: E[T] = exp(a_Y + b1*log(adp) + b2*log(adp)^2 + g*log(mult))  ; g=1 -> repo age multiplier fully warranted, g=0 -> none
function glmElasticity(rows, anchors, label, extra = null) {
  const rr = rows.filter((r) => r.m != null); const Ys = [...new Set(rr.map((r) => r.Y))];
  const X = rr.map((r) => { const x = [1]; for (const Y of Ys.slice(1)) x.push(r.Y === Y ? 1 : 0); for (const a of anchors) { const l = Math.log(r[a]); x.push(l, l * l); } x.push(Math.log(r.m)); return x; });
  const y = rr.map((r) => r.T); const fit = L.poisson(X, y, rr.map((r) => r.id)); const j = X[0].length - 1;
  const o = { label, n: rr.length, gamma: L.r3(fit.b[j]), se: L.r3(fit.se[j]), ci95: [L.r3(fit.b[j] - 1.96 * fit.se[j]), L.r3(fit.b[j] + 1.96 * fit.se[j])], z_vs_1: L.r3((fit.b[j] - 1) / fit.se[j]), z_vs_0: L.r3(fit.b[j] / fit.se[j]) };
  return o;
}
const p3 = pool([2021, 2022, 2023]);
res.Q2.glm.pooled3_dyn_only = glmElasticity(p3, ['d'], 'gamma | adp_dynasty, 3-season');
res.Q2.glm.pooled3_std_only = glmElasticity(p3, ['s'], 'gamma | adp_std, 3-season');
res.Q2.glm.pooled3_both = glmElasticity(p3, ['d', 's'], 'gamma | adp_dynasty+adp_std, 3-season');
res.Q2.glm.pooled4_dyn_only = glmElasticity(pool(PRIMARY), ['d'], 'gamma | adp_dynasty, 2021-24 (2-3 season)');
res.Q2.glm.pooled4_std_only = glmElasticity(pool(PRIMARY), ['s'], 'gamma | adp_std, 2021-24');
// horizon sweep of gamma, 2021 snapshot (K=1..5) and pooled 2021+2022 (K=1..4)
res.Q2.glm.byHorizon_2021 = {}; res.Q2.glm.byHorizon_2021_2022_2023_K12 = {};
for (let K = 1; K <= 5; K++) { const r = snapshotRows(2021, K); res.Q2.glm.byHorizon_2021[K] = { dyn: glmElasticity(r, ['d'], `2021 K=${K} dyn`), std: glmElasticity(r, ['s'], `2021 K=${K} std`) }; }
for (let K = 1; K <= 2; K++) { const r = [2021, 2022, 2023].flatMap((Y) => snapshotRows(Y, K)); res.Q2.glm.byHorizon_2021_2022_2023_K12[K] = { dyn: glmElasticity(r, ['d'], `pooled K=${K} dyn`), std: glmElasticity(r, ['s'], `pooled K=${K} std`) }; }
// pooled K=3 for 2021,2022 + K=3 2023; and 2021+2022 K=4
{ const r = [2021, 2022].flatMap((Y) => snapshotRows(Y, 4)); res.Q2.glm.pooled_2021_2022_K4 = { dyn: glmElasticity(r, ['d'], '2021+22 K=4 dyn'), std: glmElasticity(r, ['s'], '2021+22 K=4 std') }; }
// by-age-group gamma: young (<=24) vs prime/old split — does attenuation differ?
for (const [nm, f] of [['young_le24', (r) => r.aSeason <= 24], ['mid_25_29', (r) => r.aSeason >= 25 && r.aSeason <= 29], ['old_ge30', (r) => r.aSeason >= 30]]) {
  const sub = p3.filter(f); res.Q2.glm['group_' + nm] = { n: sub.length, dyn: glmElasticity(sub, ['d'], nm + ' dyn'), std: glmElasticity(sub, ['s'], nm + ' std') };
}
L.writeJson('results_q1q2.json', res);
console.log(JSON.stringify(res, (k, v) => (k === 'curve' ? undefined : v), 1));
