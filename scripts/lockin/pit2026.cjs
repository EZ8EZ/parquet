// Out-of-sample calibration check: model.js PIT on 2026 games only (WIDEN was tuned on 2025+2026 pooled). node pit2026.js
const { load } = require('./load.cjs'); const { dist, reservation, playProb } = require('./model.cjs'); const S = require('./stats.cjs'); const D = load();
const qs = [0.1, 0.25, 0.5, 0.75, 0.9]; const cov = qs.map(() => 0); let n = 0; const pb = []; 
for (const pid of D.uni.rostered) { const L = D.logs[pid] || []; for (const g of L) { if (g.season !== '2026' || g.sp <= 0 || !D.games[g.gameId] || D.games[g.gameId].status !== 'complete') continue; const d = dist(L, g.date); if (!d.sample || d.n < 10) continue; n++; qs.forEach((q, k) => { if (g.fp <= S.quant(d.sample, q)) cov[k]++; });
  // calibration of P(next game > x) at a random x = player's previous game score
  const prev = L.filter(x => x.date < g.date && x.sp > 0).pop(); if (prev) { const p = d.sample.filter(y => y > prev.fp).length / d.sample.length; pb.push([p, g.fp > prev.fp ? 1 : 0]); } } }
console.log('2026 PIT n', n, qs.map((q, k) => q + '->' + (cov[k] / n).toFixed(3)).join(' '));
const bins = [[0, .2], [.2, .4], [.4, .6], [.6, .8], [.8, 1.01]]; for (const [a, b] of bins) { const s = pb.filter(x => x[0] >= a && x[0] < b); console.log(`P(beat prev) bin ${a}-${b}: n ${s.length}, mean predicted ${S.mean(s.map(x => x[0])).toFixed(3)}, observed ${S.mean(s.map(x => x[1])).toFixed(3)}`); }
