// Q4: graduation curve. Blend s(w) = (1-w)*z(prior) + w*z(obs), z standardised within cohort-group; target = within-group percentile of
// discounted next-2-season normalised fantasy points (zero if not played). Choose w by bin of games played; fit w = g/(g+K).
import * as L from './lib.mjs';
const B = 500; const { PROJ } = L;
const WG = Array.from({ length: 21 }, (_, i) => i / 20);
const KS = [1, 2, 3, 5, 8, 12, 16, 20, 25, 30, 40, 50, 65, 80, 100, 130, 160, 200, 300, 400, 600, 1000, 2000, 5000];
const BINS = [[0, 20], [21, 50], [51, 100], [101, 100000]];
const binOf = (g) => BINS.findIndex(([lo, hi]) => g >= lo && g <= hi);
const lab = (i) => (i === 3 ? '101+' : `${BINS[i][0]}-${BINS[i][1]}`);
const zs = (a) => { const m = L.mean(a), s = L.sd(a); return a.map((v) => (v - m) / s); };
const pctile = (a) => L.rankAvg(a).map((v) => v / a.length);

function build(design, tList, targetK) {
  const rows = [];
  for (const t of tList) {
    for (const id of Object.keys(L.STATS[t])) {
      const cur = L.SEASON[t].rows.get(id); if (!cur) continue; const f = L.firstSeason(id); if (f == null || f < t - 1 || f > t || f < 2014) continue;
      let priorSnap, obsPg, gnew = cur.gp, gcar = L.careerGames(id, t);
      if (design === 'A') priorSnap = t; else if (design === 'B') priorSnap = t + 1; else if (design === 'C') priorSnap = f; // C: pre-debut snapshot, cumulative obs
      const p = PROJ[priorSnap]?.[id]; if (!p || p.adp_dynasty == null || p.adp_dynasty >= 999) continue;
      if (design === 'C') { let num = 0, den = 0; for (let y = f; y <= t; y++) { const r = L.SEASON[y].rows.get(id); if (r) { num += r.nPg * r.gp; den += r.gp; } } obsPg = num / den; } else obsPg = cur.nPg;
      const T = L.weightedTarget(id, t + 1, targetK); // seasons t+1 .. t+targetK
      // per-game target: games-weighted normalised FPPG over t+1..t+K among seasons played
      let pn = 0, pd = 0; for (let k = 1; k <= targetK; k++) { const r = L.SEASON[t + k]?.rows.get(id); if (r) { pn += Math.pow(0.9, k - 1) * r.nPg; pd += Math.pow(0.9, k - 1); } }
      rows.push({ id, t, f, e: t - f + 1, grp: `${design}${t}`, prior: -Math.log(p.adp_dynasty), adp: p.adp_dynasty, obsPg: Math.log(Math.max(obsPg, 0.05)), obsTot: Math.log(cur.nTot + 0.05), T: T.avg, Tpg: pd > 0 ? pn / pd : null, gcar, gnew });
    }
  }
  // within-group standardisation
  const byG = new Map(); rows.forEach((r, i) => { if (!byG.has(r.grp)) byG.set(r.grp, []); byG.get(r.grp).push(i); });
  for (const idx of byG.values()) { const sub = idx.map((i) => rows[i]); const zp = zs(sub.map((r) => r.prior)), zo = zs(sub.map((r) => r.obsPg)), zt = zs(sub.map((r) => r.obsTot)), pt = pctile(sub.map((r) => r.T)); idx.forEach((i, j) => { rows[i].zp = zp[j]; rows[i].zo = zo[j]; rows[i].zt = zt[j]; rows[i].Tp = pt[j]; }); }
  return rows;
}
function analyse(rows, gKey, obsKey = 'zo', Tkey = 'Tp', label = '') {
  const n = rows.length; const out = { label, n };
  const rho = (ws, ix) => { const t = ix ? L.pick(rows.map((r) => r[Tkey]), ix) : rows.map((r) => r[Tkey]); const R = ix ? ix.map((i) => rows[i]) : rows; const sc = R.map((r, i) => (1 - ws[i]) * r.zp + ws[i] * r[obsKey]); return L.pearson(L.rankAvg(t), L.rankAvg(sc)); };
  const constW = (w) => (ix) => rho(Array((ix ?? rows).length).fill(w), ix);
  // per-bin best w
  out.bins = [];
  for (let b = 0; b < BINS.length; b++) {
    const idx = rows.map((r, i) => i).filter((i) => binOf(rows[i][gKey]) === b); if (idx.length < 15) { out.bins.push({ bin: lab(b), n: idx.length }); continue; }
    const sub = idx.map((i) => rows[i]);
    const best = (ix) => { const R = ix.map((i) => sub[i]); const t = L.rankAvg(R.map((r) => r[Tkey])); let bw = 0, br = -2; const curve = []; for (const w of WG) { const r = L.pearson(t, L.rankAvg(R.map((x) => (1 - w) * x.zp + w * x[obsKey]))); curve.push(r); if (r > br) { br = r; bw = w; } } return { w: bw, rho: br, curve }; };
    const all = sub.map((_, i) => i); const bb = best(all);
    const bw = L.bootIdx(sub.map((r) => r.id), B, 31 + b).map((ix) => best(ix).w);
    out.bins.push({ bin: lab(b), n: sub.length, mean_g: L.r2(L.mean(sub.map((r) => r[gKey]))), best_w_obs: bb.w, w_ci: L.ci(bw).map(L.r2), w_boot_mean: L.r2(L.mean(bw)), rho_prior_only: L.r3(bb.curve[0]), rho_obs_only: L.r3(bb.curve[20]), rho_best: L.r3(bb.rho), rho_w50: L.r3(bb.curve[10]) });
  }
  // K fit: w_i = g/(g+K)
  const kObj = (K, ix) => { const R = ix ? ix.map((i) => rows[i]) : rows; const t = L.rankAvg(R.map((r) => r[Tkey])); return L.pearson(t, L.rankAvg(R.map((r) => { const w = r[gKey] / (r[gKey] + K); return (1 - w) * r.zp + w * r[obsKey]; }))); };
  const fitK = (ix) => { let bk = KS[0], br = -2; for (const K of KS) { const r = kObj(K, ix); if (r > br) { br = r; bk = K; } } return { K: bk, rho: br }; };
  const fk = fitK(null);
  const bootK = L.bootIdx(rows.map((r) => r.id), B, 99).map((ix) => fitK(ix).K);
  out.K = { best: fk.K, rho_at_best: L.r3(fk.rho), ci: L.ci(bootK), median_boot: L.quantile(bootK, 0.5), rho_by_K: Object.fromEntries([1, 5, 12, 20, 30, 50, 100, 200, 500, 5000].map((K) => [K, L.r3(kObj(K, null))])), rho_prior_only: L.r3(kObj(1e12, null)), rho_obs_only: L.r3(kObj(1e-9, null)) };
  // overall unconstrained single w
  let bw = 0, br = -2; for (const w of WG) { const r = constW(w)(null); if (r > br) { br = r; bw = w; } } const sw = L.bootIdx(rows.map((r) => r.id), B, 55).map((ix) => { let b_ = 0, r_ = -2; for (const w of WG) { const r = constW(w)(ix); if (r > r_) { r_ = r; b_ = w; } } return b_; }); out.single_w = { best: bw, rho: L.r3(br), ci: L.ci(sw).map(L.r2) };
  return out;
}
const out = { meta: { note: 'z-blend of standardised prior (-log adp_dynasty) and standardised log normalised FPPG; target within-group percentile of discounted (1,0.9) normalised total FP in seasons t+1,t+2; players with first NBA season in {t-1,t}', B } };
// Primary tList: t where 2-season target is complete: t+2<=2025 -> t<=2023
const specs = [
  ['A_stalePrior_snapshot_t__newGames', 'A', [2021, 2022, 2023], 'gnew'],
  ['A_stalePrior_snapshot_t__careerGames', 'A', [2021, 2022, 2023], 'gcar'],
  ['B_currentMarket_snapshot_t1__careerGames', 'B', [2021, 2022, 2023], 'gcar'],
  ['C_predebutPrior_cumulativeObs__careerGames', 'C', [2021, 2022, 2023], 'gcar'],
];
for (const [key, d, tl, gk] of specs) {
  const rows = build(d, tl, 2);
  out[key] = { pooled_pg: analyse(rows, gk, 'zo', 'Tp', 'obs=per-game FP; target=total FP'), pooled_tot: analyse(rows, gk, 'zt', 'Tp', 'obs=total FP in t (availability-incl); target=total FP') };
  // per-game target secondary (players with games in target seasons only)
  const rp = rows.filter((r) => r.Tpg != null); const byG = new Map(); rp.forEach((r) => { (byG.get(r.grp) ?? byG.set(r.grp, []).get(r.grp)).push(r); }); for (const sub of byG.values()) { const pt = pctile(sub.map((r) => r.Tpg)); sub.forEach((r, j) => { r.Tpg_p = pt[j]; }); }
  out[key].pooled_pg_target_pg = analyse(rp, gk, 'zo', 'Tpg_p', 'obs=per-game FP; target=per-game FP (conditional on playing)');
  // by experience year
  for (const e of [1, 2]) out[key]['e' + e] = analyse(rows.filter((r) => r.e === e), gk, 'zo', 'Tp', `season-${e} players only`);
  // sensitivity: add t=2024 with 1-season target (A,B only valid for t=2024 if proj{t+1} exists (B yes 2025))
  const rows24 = build(d, [2021, 2022, 2023, 2024], 1); out[key].sens_incl_2024_1season_target = analyse(rows24, gk, 'zo', 'Tp', 'incl t=2024, 1-season target for ALL');
}
L.writeJson('results_q4.json', out);
for (const k of Object.keys(out)) { if (k === 'meta') continue; for (const v of Object.keys(out[k])) { const o = out[k][v]; console.log('\n', k, v, o.label, 'n', o.n); console.log('  K', JSON.stringify(o.K && { best: o.K.best, ci: o.K.ci, rho: o.K.rho_at_best, prior: o.K.rho_prior_only, obs: o.K.rho_obs_only }), 'singleW', JSON.stringify(o.single_w)); for (const b of o.bins) console.log('  ', JSON.stringify(b)); } }
