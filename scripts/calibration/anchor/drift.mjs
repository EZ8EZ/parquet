// Re-fetch a few endpoints and diff against the copies used in the analysis (freshness / frozen-snapshot check).
import fs from 'node:fs';
const B = 'https://api.sleeper.app/v1'; const out = {};
for (const [k, u] of [['proj2026', `${B}/projections/nba/regular/2026`], ['proj2024', `${B}/projections/nba/regular/2024`], ['proj2021', `${B}/projections/nba/regular/2021`], ['stats2025', `${B}/stats/nba/regular/2025`]]) {
  const now = await (await fetch(u)).json(); const old = JSON.parse(fs.readFileSync(`${process.env.CALIB_DATA ?? '../data'}/${k}.json`, 'utf8'));
  let changed = 0, n = 0, adpChanged = 0; for (const id of Object.keys(old)) { n++; if (JSON.stringify(old[id]) !== JSON.stringify(now[id])) changed++; if (old[id]?.adp_dynasty !== now[id]?.adp_dynasty || old[id]?.adp_std !== now[id]?.adp_std) adpChanged++; }
  out[k] = { rows: n, rows_changed: changed, adp_changed: adpChanged, new_rows: Object.keys(now).filter((i) => !(i in old)).length };
}
fs.writeFileSync('results_drift.json', JSON.stringify({ fetched_at: new Date().toISOString(), ...out }, null, 1)); console.log(JSON.stringify(out));
