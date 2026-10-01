/* eslint-disable -- frozen research script kept as reference for D116 (see ../README.md), not app source */
import * as L from './lib.mjs';
const { PROJ, P } = L; const B = 1000;
const HZ = { 2021: 3, 2022: 3, 2023: 3, 2024: 2, 2025: 1 };
const out = { meta: { rookieDef: 'first season with gp>0 in stats blobs (2013+) == Y; ext = no NBA stats before Y (includes never-played / stashed, zeros counted)', projFPPG: 'CONTAMINATED - see results_q3pre.json: in snapshots 2021-25 the per-game line equals the realised season line (corr .99); base scoring on projected per-game line (dd/td/bonus absent in snapshots); snapshots carry NO projected gp (gp field is a stray "1" on a few rows), so FPPG*gp is not constructible', horizons: HZ }, crossCheck: {}, classes: {}, pooled: {} };

// cross-check of first-season derivation
{ let n = 0, agree = 0, dis = []; for (const id of Object.keys(P)) { const f = L.firstSeason(id); if (f == null || f < 2016 || f > 2025) continue; if (L.gpOf(id, 2025) === 0 && L.gpOf(id, 2024) === 0) continue; // still-active only (years_exp frozen for retired)
    n++; const ye = P[id].years_exp; if (ye === 2026 - f) agree++; else if (dis.length < 12) dis.push([L.name(id), f, ye]); }
  const meta = Object.keys(P).filter((i) => P[i].metadata?.rookie_year).map((i) => ({ name: L.name(i), meta: P[i].metadata.rookie_year, first: L.firstSeason(i), ye: P[i].years_exp }));
  out.crossCheck = { activeSince2016_n: n, years_exp_equals_2026_minus_first: agree, share: L.r3(agree / n), examplesDisagree: dis, metadata_rookie_year_present: meta }; }

function classRows(Y, ext) {
  const rows = [];
  for (const [id, p] of Object.entries(PROJ[Y])) {
    if (!Object.keys(p).length) continue;
    const f = L.firstSeason(id); let isRook;
    if (ext) { isRook = (f == null || f >= Y) && !(L.careerGames(id, Y - 1) > 0) && L.careerGames(id, 2012) === 0; isRook = isRook && (p.adp_dynasty < 999 || p.adp_std < 999); }
    else isRook = f === Y;
    if (!isRook) continue;
    const t = L.weightedTarget(id, Y, HZ[Y]);
    rows.push({ id, Y, d: p.adp_dynasty != null && p.adp_dynasty < 999 ? p.adp_dynasty : null, s: p.adp_std != null && p.adp_std < 999 ? p.adp_std : null, ppg: L.projFPPG(p), T: t.avg, played: f === Y, g1: L.gpOf(id, Y), fppg_actual: L.SEASON[Y]?.rows.get(id)?.pg });
  }
  return rows;
}
const pct = (v) => L.rankAvg(v).map((x) => x / v.length);
function block(rows, label) {
  const o = { label, n_total: rows.length };
  const cnt = { d: rows.filter((r) => r.d != null).length, s: rows.filter((r) => r.s != null).length, ppg: rows.filter((r) => r.ppg != null).length };
  o.coverage = cnt;
  const single = {};
  for (const [k, f] of [['adp_dyn', (r) => r.d == null ? null : -r.d], ['adp_std', (r) => r.s == null ? null : -r.s], ['proj_fppg', (r) => r.ppg]]) { const rr = rows.filter((r) => f(r) != null); single[k] = { n: rr.length, rho: rr.length > 5 ? L.r3(L.spearman(rr.map((r) => r.T), rr.map(f))) : null }; }
  o.single = single;
  // common sample with all three
  const c = rows.filter((r) => r.d != null && r.s != null && r.ppg != null); o.common_n = c.length;
  if (c.length >= 12) {
    const T = c.map((r) => r.T), D = c.map((r) => -r.d), S = c.map((r) => -r.s), G = c.map((r) => r.ppg);
    o.common = { rho_dyn: L.r3(L.spearman(T, D)), rho_std: L.r3(L.spearman(T, S)), rho_ppg: L.r3(L.spearman(T, G)), partial_ppg_given_dyn: L.r3(L.partialSpearman(T, G, D)), partial_dyn_given_ppg: L.r3(L.partialSpearman(T, D, G)), partial_std_given_dyn: L.r3(L.partialSpearman(T, S, D)), partial_dyn_given_std: L.r3(L.partialSpearman(T, D, S)) };
    const idxs = L.bootIdx(c.map((r) => r.id), B, 3 + c.length); const bd = [], bs = [], bg = [];
    for (const ix of idxs) { const t = L.pick(T, ix); bd.push(L.spearman(t, L.pick(D, ix))); bs.push(L.spearman(t, L.pick(S, ix))); bg.push(L.spearman(t, L.pick(G, ix))); }
    o.common.ci = { dyn: L.ci(bd).map(L.r3), std: L.ci(bs).map(L.r3), ppg: L.ci(bg).map(L.r3) };
  }
  return o;
}
// simplex grid blends on within-class percentiles of (-log adp_dyn, -log adp_std, proj_fppg) over the common sample; pooled across classes
function simplexBlend(rows, label, doBoot = true) {
  const c = rows.filter((r) => r.d != null && r.s != null && r.ppg != null); if (c.length < 20) return { label, n: c.length };
  const byY = new Map(); c.forEach((r, i) => { if (!byY.has(r.Y)) byY.set(r.Y, []); byY.get(r.Y).push(i); });
  const Dp = Array(c.length), Sp = Array(c.length), Gp = Array(c.length), Tp = Array(c.length);
  for (const idx of byY.values()) { const sub = idx.map((i) => c[i]); const a = pct(sub.map((r) => -r.d)), b = pct(sub.map((r) => -r.s)), g = pct(sub.map((r) => r.ppg)), t = pct(sub.map((r) => r.T)); idx.forEach((i, j) => { Dp[i] = a[j]; Sp[i] = b[j]; Gp[i] = g[j]; Tp[i] = t[j]; }); }
  const grid = []; for (let a = 0; a <= 20; a++) for (let b = 0; a + b <= 20; b++) grid.push([a / 20, b / 20, (20 - a - b) / 20]);
  const run = (ix) => { const t = L.rankAvg(L.pick(Tp, ix)), d = L.pick(Dp, ix), s = L.pick(Sp, ix), g = L.pick(Gp, ix); let best = [-2, null]; const rho = {}; for (const [wd, ws, wg] of grid) { const sc = d.map((v, i) => wd * v + ws * s[i] + wg * g[i]); const r = L.pearson(t, L.rankAvg(sc)); if (r > best[0]) best = [r, [wd, ws, wg]]; } return best; };
  const all = c.map((_, i) => i); const [rb, wb] = run(all);
  const pure = (w) => { const sc = c.map((_, i) => w[0] * Dp[i] + w[1] * Sp[i] + w[2] * Gp[i]); return L.r3(L.pearson(L.rankAvg(Tp), L.rankAvg(sc))); };
  const o = { label, n: c.length, best_weights: { dyn: wb[0], std: wb[1], proj_fppg: wb[2] }, rho_best: L.r3(rb), rho_dyn_only: pure([1, 0, 0]), rho_std_only: pure([0, 1, 0]), rho_ppg_only: pure([0, 0, 1]), rho_eq_thirds: pure([1 / 3, 1 / 3, 1 / 3]), rho_dyn_ppg_50_50: pure([0.5, 0, 0.5]), rho_std_ppg_50_50: pure([0, 0.5, 0.5]), rho_dyn_std_50_50: pure([0.5, 0.5, 0]) };
  if (doBoot) { const bw = L.bootIdx(c.map((r) => r.id), 300, 9).map((ix) => run(ix)[1]); o.boot = { dyn: L.ci(bw.map((w) => w[0])).map(L.r2), std: L.ci(bw.map((w) => w[1])).map(L.r2), proj_fppg: L.ci(bw.map((w) => w[2])).map(L.r2), mean: { dyn: L.r2(L.mean(bw.map((w) => w[0]))), std: L.r2(L.mean(bw.map((w) => w[1]))), proj_fppg: L.r2(L.mean(bw.map((w) => w[2]))) } }; }
  return o;
}

const WG = Array.from({ length: 21 }, (_, i) => i / 20);
function twoWay(rows, label, doBoot = true) {
  const c = rows.filter((r) => r.d != null && r.s != null); if (c.length < 15) return { label, n: c.length };
  const byY = new Map(); c.forEach((r, i) => { if (!byY.has(r.Y)) byY.set(r.Y, []); byY.get(r.Y).push(i); });
  const Dl = c.map((r) => -Math.log(r.d)), Sl = c.map((r) => -Math.log(r.s)); const Dp = Array(c.length), Sp = Array(c.length), Tp = Array(c.length);
  for (const idx of byY.values()) { const sub = idx.map((i) => c[i]); const a = pct(sub.map((r) => -r.d)), b = pct(sub.map((r) => -r.s)), t = pct(sub.map((r) => r.T)); idx.forEach((i, j) => { Dp[i] = a[j]; Sp[i] = b[j]; Tp[i] = t[j]; }); }
  const run = (ix, D, S) => { const t = L.rankAvg(L.pick(Tp, ix)); const d = L.pick(D, ix), s = L.pick(S, ix); let bw = 0, br = -2; const curve = []; for (const w of WG) { const r = L.pearson(t, L.rankAvg(d.map((v, i) => w * v + (1 - w) * s[i]))); curve.push(r); if (r > br) { br = r; bw = w; } } return { w: bw, rho: br, curve }; };
  const all = c.map((_, i) => i); const lg = run(all, Dl, Sl), pc = run(all, Dp, Sp);
  const o = { label, n: c.length, log: { best_w_dyn: lg.w, rho_best: L.r3(lg.rho), rho_w0_std_only: L.r3(lg.curve[0]), rho_w1_dyn_only: L.r3(lg.curve[20]), rho_w05: L.r3(lg.curve[10]) }, pct: { best_w_dyn: pc.w, rho_best: L.r3(pc.rho), rho_w0_std_only: L.r3(pc.curve[0]), rho_w1_dyn_only: L.r3(pc.curve[20]), rho_w05: L.r3(pc.curve[10]) } };
  if (doBoot) { const bl = [], bp = []; for (const ix of L.bootIdx(c.map((r) => r.id), 500, 21)) { bl.push(run(ix, Dl, Sl).w); bp.push(run(ix, Dp, Sp).w); } o.log.w_ci = L.ci(bl).map(L.r2); o.pct.w_ci = L.ci(bp).map(L.r2); o.log.w_mean = L.r2(L.mean(bl)); o.pct.w_mean = L.r2(L.mean(bp)); }
  return o;
}

for (const ext of [false, true]) {
  const key = ext ? 'ext' : 'played'; const pooled = [];
  for (const Y of [2021, 2022, 2023, 2024, 2025]) { const rows = classRows(Y, ext); pooled.push(...(Y <= 2024 ? rows : [])); out.classes[`${key}_${Y}`] = { ...block(rows, `${key} rookies ${Y}, ${HZ[Y]}-season target`), blend2: twoWay(rows, `${key} ${Y}`, false), blend3_CONTAMINATED: simplexBlend(rows, `${key} ${Y}`, false) }; }
  out.pooled[`${key}_2021_2024`] = { ...block(pooled, `${key} pooled 2021-24 (mixed horizon 3/3/3/2)`), blend2: twoWay(pooled, `${key} pooled`), blend3_CONTAMINATED: simplexBlend(pooled, `${key} pooled`) };
  out.pooled[`${key}_2021_2023`] = { ...block(pooled.filter((r) => r.Y <= 2023), `${key} pooled 2021-23 (3-season)`), blend2: twoWay(pooled.filter((r) => r.Y <= 2023), `${key} pooled 21-23`), blend3_CONTAMINATED: simplexBlend(pooled.filter((r) => r.Y <= 2023), `${key} pooled 21-23`) };
}
// rookies with actual rookie-year FPPG vs. what snapshot predicted: how good is projected FPPG at all? (played rookies)
L.writeJson('results_q3.json', out);
console.log(JSON.stringify(out.crossCheck));
for (const k in out.classes) { const c = out.classes[k]; console.log(k, 'N', c.n_total, 'cov', JSON.stringify(c.coverage), 'single', JSON.stringify(c.single), 'common', c.common_n, JSON.stringify(c.common && {d:c.common.rho_dyn,s:c.common.rho_std,ci:c.common.ci, pdS:c.common.partial_dyn_given_std,psD:c.common.partial_std_given_dyn}), 'blend2', JSON.stringify(c.blend2)); }
for (const k in out.pooled) { const c = out.pooled[k]; console.log('POOLED', k, 'N', c.n_total, 'cov', JSON.stringify(c.coverage), 'single', JSON.stringify(c.single), 'common', c.common_n, JSON.stringify(c.common), 'blend2', JSON.stringify(c.blend2)); }
