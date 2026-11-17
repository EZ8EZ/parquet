// Fetches (cached) everything the study needs. Re-runnable; second run hits cache only.
// node fetch_all.js   (env REFRESH_CURRENT=1 re-fetches the in-progress 2026 week + 2026 logs)
const { get, DIR } = require('./fetch.cjs');
const fs = require('fs');
const L26 = '1347007735815766016', L25 = '1240499656799039488';
const V1 = 'https://api.sleeper.app/v1';
const R = !!process.env.REFRESH_CURRENT;
(async () => {
  const out = { leagues: {}, matchups: {}, rosters: {}, users: {} };
  for (const [season, id, weeks] of [['2025', L25, 23], ['2026', L26, 4]]) {
    out.leagues[season] = await get(`${V1}/league/${id}`, { refresh: R && season === '2026' });
    out.rosters[season] = await get(`${V1}/league/${id}/rosters`, { refresh: R && season === '2026' });
    out.users[season] = await get(`${V1}/league/${id}/users`);
    out.matchups[season] = {};
    for (let w = 1; w <= weeks; w++) out.matchups[season][w] = await get(`${V1}/league/${id}/matchups/${w}`, { refresh: R && season === '2026' && w >= 3 });
  }
  const players = await get('https://api.sleeper.app/v1/players/nba');
  for (const s of ['2025', '2026']) await get(`https://api.sleeper.app/schedule/nba/regular/${s}`, { refresh: R && s === '2026' });
  const tot25 = await get('https://api.sleeper.app/v1/stats/nba/regular/2025');
  // universe A: every player on any roster in any matchup week (2025, 2026) + current rosters
  const rostered = new Set();
  for (const s of ['2025', '2026']) {
    for (const w of Object.values(out.matchups[s])) for (const m of (w || [])) for (const p of (m.players || [])) rostered.add(p);
    for (const r of out.rosters[s]) for (const p of [...(r.players || []), ...(r.reserve || []), ...(r.taxi || [])]) rostered.add(p);
  }
  // universe B: rotation players league-wide (2025 gp>=10 and >=12 min/g) for teammate-absence coverage
  const rotation = new Set(Object.entries(tot25).filter(([k, v]) => /^\d+$/.test(k) && v && v.gp >= 10 && v.sp / v.gp >= 720).map(([k]) => k));
  const both = new Set([...rostered, ...rotation]);
  console.log('rostered', rostered.size, 'rotation', rotation.size, 'union', both.size);
  fs.writeFileSync(require('path').join(DIR, 'universe.json'), JSON.stringify({ rostered: [...rostered], rotation: [...rotation] }));
  const url = (p, s) => `https://api.sleeper.app/stats/nba/player/${p}?season_type=regular&season=${s}&grouping=week`;
  let n = 0, fail = 0;
  const jobs = [];
  for (const p of both) { jobs.push([p, '2025']); jobs.push([p, '2026']); }
  for (const p of rostered) { jobs.push([p, '2024']); jobs.push([p, '2023']); }
  for (const [p, s] of jobs) {
    try { await get(url(p, s), { refresh: R && s === '2026' }); } catch (e) { fail++; }
    if (++n % 200 === 0) console.log(n, '/', jobs.length, 'fail', fail);
  }
  console.log('done', n, 'fail', fail);
})();
