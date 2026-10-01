import * as L from './lib.mjs';
const { P } = L; const PR = L.PROJ[2026]; const out = {};
const ranked = Object.keys(P).filter((id) => P[id].search_rank != null && P[id].search_rank < 999).sort((a, b) => P[a].search_rank - P[b].search_rank);
out.search_rank_summary = { n_with_rank_lt_999: ranked.length, n_rank_999: Object.keys(P).filter((id) => P[id].search_rank === 999).length, max_real_rank: P[ranked.at(-1)].search_rank, ties_in_top300: ranked.slice(0, 300).length - new Set(ranked.slice(0, 300).map((i) => P[i].search_rank)).size };
const topN = (N) => ranked.filter((id) => P[id].search_rank <= N);
const cov = (N) => { const ids = topN(N); const line = ids.filter((id) => PR[id] && Object.keys(PR[id]).length); const d = ids.filter((id) => PR[id]?.adp_dynasty != null && PR[id].adp_dynasty < 999); const s = ids.filter((id) => PR[id]?.adp_std != null && PR[id].adp_std < 999); return { n: ids.length, has_projection_row: line.length, adp_dyn_lt999: d.length, adp_std_lt999: s.length, share_dyn: L.r3(d.length / ids.length), share_std: L.r3(s.length / ids.length) }; };
out.coverage = { top50: cov(50), top100: cov(100), top150: cov(150), top200: cov(200), top300: cov(300), top400: cov(400) };
const miss = topN(300).filter((id) => !(PR[id]?.adp_dynasty < 999)).map((id) => ({ rank: P[id].search_rank, name: L.name(id), team: P[id].team, status: P[id].status, active: P[id].active, age: P[id].age, has_row: !!(PR[id] && Object.keys(PR[id]).length), adp_dyn: PR[id]?.adp_dynasty ?? null, adp_std: PR[id]?.adp_std ?? null, gp25: L.gpOf(id, 2025) }));
out.top300_missing_dyn = miss;
// bins of search_rank for coverage
out.coverage_by_rank_bin = [[1, 100], [101, 200], [201, 300], [301, 400], [401, 600]].map(([a, b]) => { const ids = ranked.filter((id) => P[id].search_rank >= a && P[id].search_rank <= b); const d = ids.filter((id) => PR[id]?.adp_dynasty < 999).length; return { bin: `${a}-${b}`, n: ids.length, dyn: d, share: L.r3(d / (ids.length || 1)) }; });
// search_rank vs 2026 adp_std
const both = ranked.filter((id) => PR[id]?.adp_std != null && PR[id].adp_std < 999);
const sr = both.map((id) => P[id].search_rank), as = both.map((id) => PR[id].adp_std);
const diffs = both.map((id) => Math.abs(P[id].search_rank - PR[id].adp_std));
out.search_rank_vs_adp_std_2026 = { n: both.length, spearman: L.r3(L.spearman(sr, as)), pearson: L.r3(L.pearson(sr, as)), median_abs_diff: L.r2(L.quantile(diffs, 0.5)), p90_abs_diff: L.r2(L.quantile(diffs, 0.9)), share_within_1: L.r3(diffs.filter((d) => d <= 1).length / diffs.length), share_within_5: L.r3(diffs.filter((d) => d <= 5).length / diffs.length) };
const top300both = both.filter((id) => P[id].search_rank <= 300); const s3 = top300both.map((id) => P[id].search_rank), a3 = top300both.map((id) => PR[id].adp_std);
out.search_rank_vs_adp_std_2026_top300 = { n: top300both.length, spearman: L.r3(L.spearman(s3, a3)), pearson: L.r3(L.pearson(s3, a3)), median_abs_diff: L.r2(L.quantile(top300both.map((id) => Math.abs(P[id].search_rank - PR[id].adp_std)), 0.5)) };
// vs adp_dynasty
const bd = ranked.filter((id) => PR[id]?.adp_dynasty < 999); out.search_rank_vs_adp_dyn_2026 = { n: bd.length, spearman: L.r3(L.spearman(bd.map((id) => P[id].search_rank), bd.map((id) => PR[id].adp_dynasty))) };
const bt = bd.filter((id) => P[id].search_rank <= 300); out.search_rank_vs_adp_dyn_2026_top300 = { n: bt.length, spearman: L.r3(L.spearman(bt.map((id) => P[id].search_rank), bt.map((id) => PR[id].adp_dynasty))) };
out.examples_top25 = ranked.slice(0, 25).map((id) => ({ rank: P[id].search_rank, name: L.name(id), adp_std: PR[id]?.adp_std ?? null, adp_dyn: PR[id]?.adp_dynasty ?? null, age: P[id].age }));
// biggest disagreements search_rank vs adp_std among top 200
out.biggest_gaps = top300both.map((id) => ({ name: L.name(id), rank: P[id].search_rank, adp_std: PR[id].adp_std, gap: L.r2(PR[id].adp_std - P[id].search_rank) })).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 10);
// dyn vs std divergence: older players have dyn >> std ; young reverse
out.dyn_minus_std_by_age_top300 = [[19, 22], [23, 25], [26, 28], [29, 31], [32, 45]].map(([lo, hi]) => { const ids = bt.filter((id) => P[id].age >= lo && P[id].age <= hi && PR[id].adp_std < 999); const lr = ids.map((id) => Math.log(PR[id].adp_dynasty / PR[id].adp_std)); return { age: `${lo}-${hi}`, n: ids.length, mean_log_ratio_dyn_over_std: L.r3(L.mean(lr)), median_ratio: L.r2(Math.exp(L.quantile(lr, 0.5))) }; });
// raw meaning of fields in 2026 snapshot: how many rows, gp marker
out.proj2026_shape = { rows: Object.keys(PR).length, nonempty: Object.values(PR).filter((o) => Object.keys(o).length).length, dyn_lt999: Object.values(PR).filter((o) => o.adp_dynasty < 999).length, std_lt999: Object.values(PR).filter((o) => o.adp_std < 999).length, gp_field_present: Object.values(PR).filter((o) => o.gp != null).length, gp_values: [...new Set(Object.values(PR).map((o) => o.gp).filter((v) => v != null))], dyn_without_std: Object.values(PR).filter((o) => o.adp_dynasty < 999 && !(o.adp_std < 999)).length };
// ADP value distribution: are adp_dynasty values unique ranks or averages? ties
const dv = Object.values(PR).filter((o) => o.adp_dynasty < 999).map((o) => o.adp_dynasty).sort((a, b) => a - b); out.proj2026_dyn_dist = { min: dv[0], p10: L.quantile(dv, 0.1), median: L.quantile(dv, 0.5), max: dv.at(-1), n: dv.length };

// ---- strict top-N (exactly N players; search_rank has duplicates so "rank<=N" returns more than N players) + team / production views
const has = (id) => PR[id]?.adp_dynasty != null && PR[id].adp_dynasty < 999;
const sorted = [...ranked].sort((a, b) => P[a].search_rank - P[b].search_rank || (PR[a]?.adp_std ?? 999) - (PR[b]?.adp_std ?? 999));
out.strict_topN = Object.fromEntries([100, 150, 200, 250, 300, 400].map((N) => { const s = sorted.slice(0, N); const miss = s.filter((id) => !has(id)); return [N, { n: N, max_rank_in_set: P[s.at(-1)].search_rank, adp_dyn_lt999: N - miss.length, share: L.r3(1 - miss.length / N), missing_all_FA_no_team: miss.every((id) => !P[id].team), missing_n: miss.length, missing_names: miss.slice(0, 15).map((id) => `${L.name(id)}#${P[id].search_rank}`) }]; }));
{ const tr = ranked.filter((id) => P[id].search_rank <= 300 && P[id].team); out.rank_le300_on_nba_team = { n: tr.length, dyn: tr.filter(has).length }; }
{ const q = [...L.SEASON[2025].rows.entries()].filter(([, r]) => r.gp >= 30 && r.min >= 500).sort((a, b) => b[1].tot - a[1].tot).map(([id]) => id);
  out.top300_by_2025_total_FP = { n: Math.min(300, q.length), dyn: q.slice(0, 300).filter(has).length, std: q.slice(0, 300).filter((id) => PR[id]?.adp_std < 999).length, missing: q.slice(0, 300).filter((id) => !has(id)).map((id) => `${L.name(id)} (fp-rank ${q.indexOf(id) + 1}, std ${PR[id]?.adp_std ?? 'none'}, team ${P[id]?.team ?? 'none'}, age ${P[id]?.age})`) };
  out.top150_by_2025_total_FP = { dyn: q.slice(0, 150).filter(has).length, n: 150 }; }
{ const off = both.filter((id) => Math.abs(P[id].search_rank - PR[id].adp_std) > 5); out.search_rank_mismatch_gt5 = { n: off.length, share_of_all: L.r3(off.length / both.length), share_no_team: L.r3(off.filter((id) => !P[id].team).length / (off.length || 1)), share_played_2025: L.r3(off.filter((id) => L.gpOf(id, 2025) > 0).length / (off.length || 1)), with_team: off.filter((id) => P[id].team).map((id) => `${L.name(id)} sr${P[id].search_rank} std${PR[id].adp_std}`) };
  const tm = both.filter((id) => P[id].team); out.search_rank_vs_adp_std_2026_on_team = { n: tm.length, spearman: L.r3(L.spearman(tm.map((id) => P[id].search_rank), tm.map((id) => PR[id].adp_std))), median_abs_diff: L.r2(L.quantile(tm.map((id) => Math.abs(P[id].search_rank - PR[id].adp_std)), 0.5)), share_within_1: L.r3(tm.filter((id) => Math.abs(P[id].search_rank - PR[id].adp_std) <= 1).length / tm.length) };
  out.search_rank_exact_vs_rounded = { n: both.length, exact_equal: both.filter((id) => P[id].search_rank === PR[id].adp_std).length, within_floor_ceil: both.filter((id) => [Math.floor(PR[id].adp_std), Math.ceil(PR[id].adp_std), Math.round(PR[id].adp_std)].includes(P[id].search_rank)).length }; }
out.search_rank_dup = { distinct_values: new Set(ranked.map((i) => P[i].search_rank)).size, players: ranked.length };
L.writeJson('results_q5.json', out); for (const k of ['strict_topN','rank_le300_on_nba_team','top300_by_2025_total_FP','top150_by_2025_total_FP','search_rank_mismatch_gt5','search_rank_vs_adp_std_2026_on_team','search_rank_exact_vs_rounded','search_rank_dup']) console.log(k, JSON.stringify(out[k]));
