/* eslint-disable -- frozen research script kept as reference for D116 (see ../README.md), not app source */
// Is the per-game stat line inside each "projection" snapshot a true pre-season projection, or the realised season line (hindsight)?
import * as L from './lib.mjs';
const out = {};
for (let Y = 2021; Y <= 2025; Y++) {
  const a = [], b = [], pa = [], pb = [], prevA = [], prevB = []; let exact = 0, tot = 0; const absd = [];
  for (const [id, p] of Object.entries(L.PROJ[Y])) {
    const pf = L.projFPPG(p); const act = L.SEASON[Y].rows.get(id); if (pf == null || !act || act.gp < 20) continue;
    a.push(pf); b.push(act.pg); absd.push(Math.abs(pf - act.pg)); tot++; if (Math.abs((p.pts ?? -9) - L.STATS[Y][id].pts / L.STATS[Y][id].gp) < 0.06) exact++;
    const prev = L.SEASON[Y - 1]?.rows.get(id); if (prev && prev.gp >= 20) { prevA.push(pf); prevB.push(prev.pg); }
  }
  out[Y] = { n: a.length, corr_proj_vs_actualSameYear: L.r3(L.pearson(a, b)), median_abs_diff: L.r2(L.quantile(absd, 0.5)), pts_matches_actual_within_0p06: L.r3(exact / tot), n_prev: prevA.length, corr_proj_vs_priorYearActual: prevA.length ? L.r3(L.pearson(prevA, prevB)) : null };
}
// 2026 snapshot vs 2025 actual (a genuine projection should correlate with last year but not match exactly)
{ const a = [], b = []; for (const [id, p] of Object.entries(L.PROJ[2026])) { const pf = L.projFPPG(p), act = L.SEASON[2025].rows.get(id); if (pf == null || !act || act.gp < 20) continue; a.push(pf); b.push(act.pg); } out[2026] = { n: a.length, corr_proj2026_vs_actual2025: L.r3(L.pearson(a, b)) }; }
L.writeJson('results_q3pre.json', out); console.log(JSON.stringify(out, null, 1));
