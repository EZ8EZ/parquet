/* eslint-disable -- frozen research script kept as reference for D116 (see ../README.md), not app source */
// Red-team follow-ups: (2) convex/right-tail estimands + young/rookie subsets, (3) snapshot-level dependence of age gamma, (4) coverage by age/years_exp.
import * as L from './lib.mjs';
const { PROJ, P } = L; const HZ = { 2021: 3, 2022: 3, 2023: 3, 2024: 2 }; const out = {};
const val = (r) => 10000 * Math.exp(-0.021 * (r - 1));
function rows(Y, K) { const r = []; for (const [id, p] of Object.entries(PROJ[Y])) { if (p.adp_dynasty == null || p.adp_std == null || p.adp_dynasty >= 999 || p.adp_std >= 999) continue; const f = L.firstSeason(id); r.push({ id, Y, d: p.adp_dynasty, s: p.adp_std, T: L.weightedTarget(id, Y, K).avg, age: L.ageAtSnapshot(id, Y), rook: f === Y }); } return r; }
// top-N hit rate: share of anchor's top-N picks that land in the realised top-N (by T) of the sample; plus value-space corr and value-weighted abs error
function metrics(rs, N) {
  const T = rs.map((r) => r.T); const rkT = L.rankAvg(T.map((v) => -v)); // 1 = best
  const o = {};
  for (const [k, key] of [['dyn', 'd'], ['std', 's']]) {
    const rk = L.rankAvg(rs.map((r) => r[key]));
    const topA = new Set(rk.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).slice(0, N).map((x) => x[1]));
    const topT = new Set(rkT.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).slice(0, N).map((x) => x[1]));
    let hit = 0; for (const i of topA) if (topT.has(i)) hit++;
    // value-space: realised value = val(rank by T), predicted value = val(anchor rank within sample); pearson and MAE (value-weighted by realised value)
    const pv = rk.map(val), rv = rkT.map(val);
    o[k] = { hit_topN: L.r3(hit / N), value_pearson: L.r3(L.pearson(pv, rv)), value_mae_pct_of_mean: L.r3(L.mean(pv.map((v, i) => Math.abs(v - rv[i]))) / L.mean(rv)), spearman: L.r3(L.spearman(T, rs.map((r) => -r[key]))) };
  }
  // blend 0.45
  const bl = rs.map((r) => Math.exp(0.45 * Math.log(r.d) + 0.55 * Math.log(r.s))); const rk = L.rankAvg(bl); const topA = new Set(rk.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).slice(0, N).map((x) => x[1])); const topT = new Set(rkT.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).slice(0, N).map((x) => x[1])); let hit = 0; for (const i of topA) if (topT.has(i)) hit++;
  const pv = rk.map(val), rv = rkT.map(val); o.blend45 = { hit_topN: L.r3(hit / N), value_pearson: L.r3(L.pearson(pv, rv)), value_mae_pct_of_mean: L.r3(L.mean(pv.map((v, i) => Math.abs(v - rv[i]))) / L.mean(rv)), spearman: L.r3(L.spearman(T, rs.map((r) => -Math.log(r.d) * 0.45 - Math.log(r.s) * 0.55))) };
  return o;
}
// pooled bootstrap CI of (dyn - std) for a metric over a pooled sample with per-snapshot metrics averaged
function pooledDiff(sets, N, B = 500) {
  const f = (S) => { const a = S.map((s) => metrics(s, Math.min(N, Math.floor(s.length / 3)))); const m = (k, key) => L.mean(a.map((x) => x[k][key])); return { hit: m('dyn', 'hit_topN') - m('std', 'hit_topN'), vp: m('dyn', 'value_pearson') - m('std', 'value_pearson'), mae: m('dyn', 'value_mae_pct_of_mean') - m('std', 'value_mae_pct_of_mean'), sp: m('dyn', 'spearman') - m('std', 'spearman'), dyn: a.map((x) => x.dyn.hit_topN), std: a.map((x) => x.std.hit_topN) }; };
  const pt = f(sets); const R = L.rng(7); const bs = [];
  const ids = sets.map((s) => [...new Set(s.map((r) => r.id))]);
  const allIds = [...new Set(sets.flatMap((s) => s.map((r) => r.id)))];
  for (let b = 0; b < B; b++) { const pickIds = new Map(); for (let i = 0; i < allIds.length; i++) { const id = allIds[Math.floor(R() * allIds.length)]; pickIds.set(id, (pickIds.get(id) ?? 0) + 1); } const S = sets.map((s) => { const o = []; for (const r of s) { const c = pickIds.get(r.id) ?? 0; for (let k = 0; k < c; k++) o.push(r); } return o; }); bs.push(f(S)); }
  const ci = (k) => L.ci(bs.map((x) => x[k])).map(L.r3);
  return { point: { hit_diff: L.r3(pt.hit), value_pearson_diff: L.r3(pt.vp), value_mae_diff: L.r3(pt.mae), spearman_diff: L.r3(pt.sp), dyn_hit_by_snapshot: pt.dyn, std_hit_by_snapshot: pt.std }, ci: { hit_diff: ci('hit'), value_pearson_diff: ci('vp'), value_mae_diff: ci('mae'), spearman_diff: ci('sp') } };
}
out.estimands = {};
const subsets = { all: () => true, young_le22: (r) => r.age != null && r.age < 22.5, young_le24: (r) => r.age != null && r.age < 24.5, rookies: (r) => r.rook, age_ge28: (r) => r.age >= 28 };
for (const [K3, Ys] of [['K3_2021_23', [2021, 2022, 2023]], ['K2_2024', [2024]], ['K5_2021', [2021]], ['K4_2021_22', [2021, 2022]]]) {
  const Kmap = K3 === 'K3_2021_23' ? 3 : K3 === 'K2_2024' ? 2 : K3 === 'K5_2021' ? 5 : 4;
  out.estimands[K3] = {};
  for (const [sn, f] of Object.entries(subsets)) for (const N of [20, 40]) {
    const sets = Ys.map((Y) => rows(Y, Kmap).filter(f)).filter((s) => s.length >= 24);
    if (!sets.length) continue; const n = sets.reduce((a, s) => a + s.length, 0);
    out.estimands[K3][`${sn}_top${N}`] = { n, ...pooledDiff(sets, N, 300) };
  }
}
// ---- (3) snapshot-level dependence for the age gamma: leave-one-snapshot-out and per-snapshot values (matched curve, K=3)
{ const b = JSON.parse(fs.readFileSync ? '{}' : '{}'); }
import fs from 'node:fs';
const q2b = JSON.parse(fs.readFileSync('results_q2b.json', 'utf8')); out.gamma_by_snapshot_K3_matched = Object.fromEntries(['2021, K=3', '2022, K=3', '2023, K=3'].map((k) => [k, { dyn: q2b.gamma[k].dyn.matched.gamma, std: q2b.gamma[k].std.matched.gamma, dyn_se: q2b.gamma[k].dyn.matched.se, std_se: q2b.gamma[k].std.matched.se }]));
// snapshot-clustered inference is impossible with 3 snapshots; give the between-snapshot SD of gamma_dyn-gamma_std difference
{ const d = ['2021, K=3', '2022, K=3', '2023, K=3'].map((k) => q2b.gamma[k].std.matched.gamma - q2b.gamma[k].dyn.matched.gamma); out.gamma_std_minus_dyn_by_snapshot = d.map(L.r3); out.gamma_std_minus_dyn_mean_sd = [L.r3(L.mean(d)), L.r3(L.sd(d))]; }
// ---- (4) coverage by age / years_exp in 2026 snapshot and by class in historic snapshots
{ const PR = PROJ[2026]; const has = (id) => PR[id]?.adp_dynasty != null && PR[id].adp_dynasty < 999; const hs = (id) => PR[id]?.adp_std != null && PR[id].adp_std < 999;
  const rk = Object.keys(P).filter((i) => P[i].search_rank != null && P[i].search_rank < 999 && P[i].team);
  const by = (fn, labels) => labels.map(([l, f]) => { const ids = rk.filter((i) => f(fn(i))); return { group: l, n: ids.length, dyn: ids.filter(has).length, std: ids.filter(hs).length, share_dyn: L.r3(ids.filter(has).length / (ids.length || 1)) }; });
  out.coverage_2026_onteam_ranked_by_years_exp = by((i) => P[i].years_exp, [['0 (2026 rookies)', (v) => v === 0], ['1', (v) => v === 1], ['2', (v) => v === 2], ['3-4', (v) => v >= 3 && v <= 4], ['5-9', (v) => v >= 5 && v <= 9], ['10+', (v) => v >= 10]]);
  out.coverage_2026_onteam_ranked_by_age = by((i) => P[i].age, [['<=21', (v) => v <= 21], ['22-24', (v) => v >= 22 && v <= 24], ['25-28', (v) => v >= 25 && v <= 28], ['29-32', (v) => v >= 29 && v <= 32], ['33+', (v) => v >= 33]]);
  const all = Object.keys(P).filter((i) => P[i].team && P[i].years_exp === 0); out.rookies_2026_all_on_team = { n: all.length, has_row: all.filter((i) => PR[i] && Object.keys(PR[i]).length).length, dyn: all.filter(has).length, std: all.filter(hs).length, no_row_names: all.filter((i) => !(PR[i] && Object.keys(PR[i]).length)).slice(0, 15).map((i) => L.name(i)), ranked_n: all.filter((i) => P[i].search_rank < 999).length };
  // players on a team with NO usable ADP at all (these would price off rank 999 -> ~0 value)
  const tm = Object.keys(P).filter((i) => P[i].team); out.on_team_players = { n: tm.length, search_rank_lt999: tm.filter((i) => P[i].search_rank < 999).length, search_rank_999_or_null: tm.filter((i) => !(P[i].search_rank < 999)).length, of_those_with_2025_gp_ge_10: tm.filter((i) => !(P[i].search_rank < 999) && L.gpOf(i, 2025) >= 10).length, examples: tm.filter((i) => !(P[i].search_rank < 999) && L.gpOf(i, 2025) >= 10).slice(0, 10).map((i) => `${L.name(i)} (${L.gpOf(i, 2025)}gp)`) };
  // historic: for each snapshot Y, rookies of class Y that eventually played >=30 games in Y: share with any ADP
  out.historic_class_coverage = {}; for (const Y of [2021, 2022, 2023, 2024, 2025]) { const ids = Object.keys(L.STATS[Y]).filter((i) => /^\d+$/.test(i) && L.firstSeason(i) === Y && L.gpOf(i, Y) >= 30); const p = PROJ[Y]; out.historic_class_coverage[Y] = { rookies_ge30gp: ids.length, dyn: ids.filter((i) => p[i]?.adp_dynasty < 999).length, std: ids.filter((i) => p[i]?.adp_std < 999).length, either: ids.filter((i) => p[i]?.adp_dynasty < 999 || p[i]?.adp_std < 999).length, neither_mean_fp_pg: L.r2(L.mean(ids.filter((i) => !(p[i]?.adp_dynasty < 999 || p[i]?.adp_std < 999)).map((i) => L.SEASON[Y].rows.get(i).pg))) }; }
}
L.writeJson('results_q6.json', out); console.log(JSON.stringify(out, null, 0));
