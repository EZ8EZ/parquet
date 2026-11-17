// Q3 worked example: three real 2026 week-3 starters, decision after their first game. node worked.js
const { load } = require('./load.cjs'); const { dist, reservation, pBeat, playProb } = require('./model.cjs'); const S = require('./stats.cjs'); const D = load();
const s = '2026', w = 3; const cands = [];
for (const m of D.matchups[s][w]) m.starters.forEach((pid, i) => { const L = D.logs[pid]; const gs = L.filter(g => g.season === s && g.week === w); const pl = gs.filter(g => g.sp > 0); if (gs.length < 3 || pl.length < 3 || gs[0].sp === 0) return;
  const d = dist(L, gs[1].date); cands.push({ pid, roster: m.roster_id, banked: m.starters_points[i], gs, d }); });
cands.sort((a, b) => b.d.mu - a.d.mu);
const pickIdx = [0, Math.floor(cands.length / 2), cands.length - 1];
const rowsQ = (L, date) => { const r = L.filter(g => g.date < date).slice(-20); return Math.min(1, Math.max(0.3, r.filter(g => g.sp > 0).length / r.length)); };
for (const k of pickIdx) { const c = cands[k]; const L = D.logs[c.pid]; const x = c.gs[0].fp; const q = playProb(L, c.gs[1].date); const { r, H } = reservation(c.d.sample, q);
  const left = c.gs.length - 1; const name = D.players[c.pid].full_name;
  console.log(`\n${name} (roster ${c.roster}) week ${w}: games ${c.gs.map(g => g.date.slice(5) + ' ' + (g.sp > 0 ? g.fp : 'DNP')).join(', ')}; manager banked ${c.banked}`);
  console.log(`  model before game 2: mean ${c.d.mu.toFixed(1)}, sd ${c.d.sd.toFixed(1)}, prior played games ${c.d.n}, play prob q ${q.toFixed(2)}`);
  console.log('  k games left | reservation r_k | P(a later game beats ' + x + ')');
  for (let j = 1; j <= 4; j++) console.log(`  ${j} | ${r[j].toFixed(1)} | ${(100 * pBeat(c.d.sample, x, j, q)).toFixed(0)}%`);
  console.log(`  tonight's score ${x}, ${left} left -> lock iff ${x} >= ${r[left].toFixed(1)}: ${x >= r[left] ? 'rule locks' : 'rule holds'}; best game that week ${Math.max(...c.gs.filter(g => g.sp > 0).map(g => g.fp))}`);
}
