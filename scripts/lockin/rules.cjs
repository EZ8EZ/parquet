// Q1: verify lock-in rules empirically against 2025 + 2026 matchup data. node rules.js
const { load } = require('./load.cjs');
const D = load();
const eq = (a, b) => Math.abs(a - b) < 0.011;
const out = {};
out.scoringSame = JSON.stringify(D.league['2025'].scoring_settings) === JSON.stringify(D.league['2026'].scoring_settings);
// team games per (season, week, team) from schedule (completed only), ordered
const teamGames = {};
for (const s of ['2025', '2026']) for (const g of D.schedule[s]) { if (g.status !== 'complete') continue; for (const side of ['home', 'away']) { const k = `${s}|${g.week}|${g[side].team}`; (teamGames[k] = teamGames[k] || []).push(g); } }
for (const k in teamGames) teamGames[k].sort((a, b) => a.date < b.date ? -1 : 1);
const weekGames = (pid, s, w) => (D.logs[pid] || []).filter(g => g.season === s && g.week === w);
const C = { matchups: 0, pointsEqSum: 0, slots: 0, dup: 0, filled: 0, noGames: 0, eqLast: 0, eqEarlierOnly: 0, eqNone: 0, eqLastAndEarlier: 0, noLog: 0,
  zeroNoGames: 0, lastTeamGameDNP: 0, lastDNP_banked0: 0, lastDNP_bankedEarlier: 0, lastDNP_other: 0, ppStarterEqSP: 0, ppStarterN: 0, benchPPeqLast: 0, benchN: 0, benchNoGamesPP0: 0,
  sp0Entries: 0, outOfWeek: 0, weekFieldMismatch: 0, multiGameWeeks: 0, earlierLockMultiGame: 0 };
const perSeason = {};
for (const s of ['2025', '2026']) {
  const last = s === '2026' ? 3 : 23; // completed weeks only
  for (let w = 1; w <= last; w++) for (const m of D.matchups[s][w]) {
    C.matchups++; const sum = m.starters_points.reduce((a, b) => a + b, 0); if (eq(sum, m.points)) C.pointsEqSum++;
    const seen = new Set();
    m.starters.forEach((pid, i) => {
      C.slots++; if (pid === '0' || !pid) return; C.filled++; if (seen.has(pid)) C.dup++; seen.add(pid);
      const sp = m.starters_points[i];
      C.ppStarterN++; if (eq(m.players_points[pid] ?? NaN, sp)) C.ppStarterEqSP++;
      if (!D.logs[pid]) { C.noLog++; return; }
      const gs = weekGames(pid, s, w).filter(g => g.sp > 0);
      if (!gs.length) { C.noGames++; if (sp === 0) C.zeroNoGames++; return; }
      if (gs.length > 1) C.multiGameWeeks++;
      const lastG = gs[gs.length - 1];
      const mLast = eq(lastG.fp, sp), mEarlier = gs.slice(0, -1).some(g => eq(g.fp, sp));
      if (mLast && mEarlier) C.eqLastAndEarlier++; else if (mLast) C.eqLast++; else if (mEarlier) { C.eqEarlierOnly++; } else C.eqNone++;
      // team's last scheduled game of the week vs player's last played game
      const tg = teamGames[`${s}|${w}|${lastG.team}`] || [];
      const teamLast = tg[tg.length - 1];
      if (teamLast && teamLast.game_id !== lastG.gameId && teamLast.date > lastG.date) {
        C.lastTeamGameDNP++; if (sp === 0) C.lastDNP_banked0++; else if (gs.some(g => eq(g.fp, sp))) C.lastDNP_bankedEarlier++; else C.lastDNP_other++;
      }
      // week window
      const wkDates = D.schedule[s].filter(g => g.week === w).map(g => g.date).sort();
      const banked = gs.filter(g => eq(g.fp, sp));
      for (const g of banked) if (g.date < wkDates[0] || g.date > wkDates[wkDates.length - 1]) C.outOfWeek++;
      for (const g of gs) { const sg = D.games[g.gameId]; if (sg && sg.week !== g.week) C.weekFieldMismatch++; }
    });
    for (const pid of m.players) if (!m.starters.includes(pid) && D.logs[pid]) {
      const gs = weekGames(pid, s, w).filter(g => g.sp > 0); const pp = m.players_points[pid];
      if (!gs.length) { if (pp === 0) C.benchNoGamesPP0++; continue; }
      C.benchN++; if (eq(gs[gs.length - 1].fp, pp)) C.benchPPeqLast++;
    }
  }
}
for (const pid in D.logs) for (const g of D.logs[pid]) if (g.sp === 0 && (g.season === '2025' || g.season === '2026')) C.sp0Entries++;
out.counts = C;
// games in logs not in schedule (e.g. NBA Cup knockout)
let notInSched = 0, inSched = 0; for (const pid of D.uni.rostered) for (const g of D.logs[pid] || []) if (g.season === '2025') { if (D.games[g.gameId]) inSched++; else notInSched++; }
out.logGamesNotInSchedule2025 = { notInSched, inSched };
// Mid-week state: 2026 week 4 (in progress at fetch time)
const W = { starters: 0, filled: 0, eqLatest: 0, eqEarlier: 0, noGameYet: 0, zeroWithGames: 0, other: 0, examples: [] };
for (const m of D.matchups['2026'][4]) m.starters.forEach((pid, i) => {
  W.starters++; if (pid === '0') return; W.filled++;
  const gs = weekGames(pid, '2026', 4).filter(g => g.sp > 0); const sp = m.starters_points[i];
  if (!gs.length) { W.noGameYet++; return; }
  if (eq(gs[gs.length - 1].fp, sp)) W.eqLatest++; else if (gs.some(g => eq(g.fp, sp))) { W.eqEarlier++; if (W.examples.length < 5) W.examples.push({ roster: m.roster_id, pid, sp, games: gs.map(g => [g.date, g.fp]) }); } else if (sp === 0) W.zeroWithGames++; else W.other++;
});
out.week4_2026_midweek = W;
out.latestGameDate2026 = Object.values(D.logs).flat().filter(g => g.season === '2026').map(g => g.date).sort().pop();
console.log(JSON.stringify(out, null, 1));
