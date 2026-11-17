// Builds an in-memory dataset from ./cache (run fetch_all.js first). No network.
const fs = require('fs'), path = require('path');
const { key, DIR } = require('./fetch.cjs');
const rd = (url) => { const f = path.join(DIR, key(url) + '.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : undefined; };
const LG = { '2025': '1240499656799039488', '2026': '1347007735815766016' };
const WEEKS = { '2025': 23, '2026': 4 };
// Same as lib/lab/regret/index.js scoreGame (league scoring incl. bonuses), reproduced, not imported (repo is ESM .js with zod).
function scoreGame(stats, scoring) { let t = 0; for (const [k, w] of Object.entries(scoring)) { const v = stats[k]; if (typeof v === 'number') t += w * v; } return Math.round(t * 100) / 100; }
let _cache;
function load() {
  if (_cache) return _cache;
  const players = rd('https://api.sleeper.app/v1/players/nba');
  const uni = JSON.parse(fs.readFileSync(path.join(DIR, 'universe.json'), 'utf8'));
  const league = {}, matchups = {}, rosters = {}, users = {}, schedule = {};
  for (const s of ['2025', '2026']) {
    league[s] = rd(`https://api.sleeper.app/v1/league/${LG[s]}`);
    rosters[s] = rd(`https://api.sleeper.app/v1/league/${LG[s]}/rosters`);
    users[s] = rd(`https://api.sleeper.app/v1/league/${LG[s]}/users`);
    matchups[s] = {};
    for (let w = 1; w <= WEEKS[s]; w++) matchups[s][w] = rd(`https://api.sleeper.app/v1/league/${LG[s]}/matchups/${w}`) || [];
    schedule[s] = rd(`https://api.sleeper.app/schedule/nba/regular/${s}`) || [];
  }
  const scoring = league['2026'].scoring_settings; // identical across 2025/2026 (checked in rules.js)
  // game logs: logs[pid] = array of games sorted by date across seasons 2023..2026
  const logs = {};
  const all = new Set([...uni.rostered, ...uni.rotation]);
  for (const pid of all) {
    const arr = [];
    for (const s of ['2023', '2024', '2025', '2026']) {
      const raw = rd(`https://api.sleeper.app/stats/nba/player/${pid}?season_type=regular&season=${s}&grouping=week`);
      if (!raw || Array.isArray(raw)) continue;
      for (const [wk, games] of Object.entries(raw)) for (const g of games) {
        const st = g.stats || {};
        arr.push({ pid, season: s, week: +wk, date: g.date, gameId: g.game_id, team: g.team, opp: g.opponent, away: g.is_away_team,
          sp: st.sp || 0, min: (st.sp || 0) / 60, fp: scoreGame(st, scoring), ot: (st.ot_sp || 0) > 0, updatedAt: g.updated_at, stats: st });
      }
    }
    arr.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    logs[pid] = arr;
  }
  const games = {}; // gameId -> schedule game
  for (const s of ['2025', '2026']) for (const g of schedule[s]) games[g.game_id] = { ...g, season: s };
  _cache = { players, uni, league, matchups, rosters, users, schedule, games, logs, scoring, scoreGame, WEEKS };
  return _cache;
}
module.exports = { load, scoreGame };
