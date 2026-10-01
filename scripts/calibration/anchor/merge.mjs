import fs from 'node:fs';
const g = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const q12 = g('results_q1q2.json');
const out = {
  meta: {
    generated: new Date().toISOString(), scripts: ['fetch.mjs', 'q1q2.mjs', 'q2b.mjs', 'q1b.mjs', 'q3pre.mjs', 'q3.mjs', 'q3b.mjs', 'q4.mjs', 'q5.mjs', 'drift.mjs', 'merge.mjs'],
    data_notes: {
      season_convention: 'Sleeper season Y = NBA season Y-(Y+1). stats2025 = 2025-26 complete; stats2026 empty (preseason as of 2026-10-01).',
      scoring_used: 'pts .5, reb 1, ast 1, stl 2, blk 2, to -1, tpm .5, dd 1, td 2, tf -2, ff -2. bonus_pt_40p/50p EXCLUDED: ~80% of players (incl. a 107-pt season) carry a 1 => data artefact.',
      stats_blob_has_TEAM_pseudo_ids: 'ids like TEAM_BOS (30/season, gp populated) are in /stats; excluded (non-numeric ids).',
      era_normalisation: 'season total FP / mean season total FP over qualifiers (gp>=30 & >=500 min); absent seasons = 0.',
      projection_snapshots: 'Seasons 2021-25 stat lines in /projections are the REALISED per-game lines (corr .99 with actual, see Q3pre) - hindsight; ADPs look pre-season. 2026 is a genuine (live) projection.',
      projected_gp: 'not present in snapshots (the `gp` key is a stray 1 on a few rows) -> FPPG*gp not constructible.',
    },
  },
  Q1: { ...q12.Q1, horizon_sensitivity: g('results_q1b.json') },
  Q2: { ...q12.Q2, horizon_matched_curve: g('results_q2b.json') },
  Q3: { ...g('results_q3.json'), horizon_sensitivity: g('results_q3b.json'), projection_hindsight_check: g('results_q3pre.json') },
  Q4: g('results_q4.json'),
  Q5: g('results_q5.json'),
  drift_check: g('results_drift.json'),
};
fs.writeFileSync('results.json', JSON.stringify(out, null, 1)); console.log('results.json', fs.statSync('results.json').size);
