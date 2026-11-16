// Q3: how predictable is a single game? Picks N / shrinkage for model.js. node model_study.js
const { load } = require('./load.cjs');
const S = require('./stats.cjs');
const D = load();
const rost = D.uni.rostered;
const rows = []; // one per target game
for (const pid of rost) {
  const L = (D.logs[pid] || []).filter(g => g.sp > 0);
  for (let i = 0; i < L.length; i++) {
    const g = L[i]; if (g.season !== '2025' && g.season !== '2026') continue;
    const pg = L.slice(0, i); if (pg.length < 10) continue;
    const prev = L[i - 1];
    const dayGap = Math.round((Date.parse(g.date) - Date.parse(prev.date)) / 864e5);
    rows.push({ pid, g, pg, b2b: dayGap === 1, away: g.away });
  }
}
console.log('target games', rows.length, 'players', new Set(rows.map(r => r.pid)).size);
const m = (a) => S.mean(a);
const lastN = (pg, n) => m(pg.slice(-n).map(x => x.fp));
const prevSeasonMean = (pg, season) => { const a = pg.filter(x => +x.season === +season - 1).map(x => x.fp); return a.length >= 10 ? m(a) : null; };
const ests = {};
for (const n of [3, 5, 10, 15, 20, 30, 50, 82]) ests['last' + n] = (r) => lastN(r.pg, n);
for (const hl of [5, 10, 20]) ests['ewma' + hl] = (r) => { const a = Math.pow(0.5, 1 / hl); let w = 0, s = 0, k = 0; for (let i = r.pg.length - 1; i >= 0 && k < 200; i--, k++) { const ww = Math.pow(a, k); w += ww; s += ww * r.pg[i].fp; } return s / w; };
for (const n of [5, 10, 15, 20]) for (const K of [5, 10, 20, 40]) ests[`shrink_last${n}_K${K}`] = (r) => { const a = r.pg.slice(-n).map(x => x.fp); const lm = m(r.pg.slice(-82).map(x => x.fp)); return (a.length * m(a) + K * lm) / (a.length + K); };
const res = [];
for (const [k, f] of Object.entries(ests)) { let se = 0, ae = 0; for (const r of rows) { const e = r.g.fp - f(r); se += e * e; ae += Math.abs(e); } res.push([k, Math.sqrt(se / rows.length), ae / rows.length]); }
res.sort((a, b) => a[1] - b[1]);
console.log('estimator RMSE MAE (top 10, then naive refs)'); for (const x of res.slice(0, 10)) console.log(x[0], x[1].toFixed(3), x[2].toFixed(3));
for (const x of res.filter(x => ['last3', 'last82', 'ewma10'].includes(x[0]))) console.log('ref', x[0], x[1].toFixed(3), x[2].toFixed(3));
// variance decomposition: share of target-game variance explained by best estimator
const best = ests[res[0][0]];
const y = rows.map(r => r.g.fp), yh = rows.map(r => best(r));
const resid = rows.map((r, i) => y[i] - yh[i]);
const R2 = 1 - S.mean(resid.map(e => e * e)) / (S.sd(y) ** 2);
console.log('best', res[0][0], 'R2', R2.toFixed(3), 'resid SD', S.sd(resid).toFixed(2));
// within-player SD and CV per player-season (>=20 games)
const ps = {}; for (const pid of rost) for (const g of (D.logs[pid] || [])) if (g.sp > 0 && g.season === '2025') (ps[pid] = ps[pid] || []).push(g.fp);
const sds = [], cvs = [], means = [];
for (const a of Object.values(ps)) if (a.length >= 20) { sds.push(S.sd(a)); means.push(S.mean(a)); cvs.push(S.sd(a) / S.mean(a)); }
console.log('2025 player-seasons >=20 g:', sds.length, 'median within-player SD', S.quant(sds, .5).toFixed(2), 'IQR', S.quant(sds, .25).toFixed(2), S.quant(sds, .75).toFixed(2), 'median CV', S.quant(cvs, .5).toFixed(3), 'median mean', S.quant(means, .5).toFixed(1));
console.log('corr(player mean, player SD) spearman', S.spearman(means, sds).toFixed(3));
// lag-1 autocorrelation of residuals within player (consecutive target games)
const byP = {}; rows.forEach((r, i) => (byP[r.pid] = byP[r.pid] || []).push(resid[i]));
const a1 = [], a2 = []; for (const a of Object.values(byP)) for (let i = 1; i < a.length; i++) { a1.push(a[i - 1]); a2.push(a[i]); }
const groupsAC = Object.values(byP).filter(a => a.length > 1).map(a => a.slice(1).map((v, i) => [a[i], v]));
const ac = S.pearson(a1, a2); const acCI = S.clusterBoot(groupsAC, (rs) => S.pearson(rs.map(x => x[0]), rs.map(x => x[1])), 500);
console.log('lag-1 residual autocorr', ac.toFixed(3), 'CI', acCI.map(x => x.toFixed(3)).join('..'), 'n pairs', a1.length);
// home/away and back-to-back: mean residual difference, cluster bootstrap by player
function effect(name, flag) {
  const groups = Object.values(rows.reduce((acc, r, i) => { (acc[r.pid] = acc[r.pid] || []).push({ f: flag(r), e: resid[i], min: r.g.min, mres: r.g.min - m(r.pg.slice(-15).map(x => x.min)) }); return acc; }, {}));
  const st = (rs) => S.mean(rs.filter(x => x.f).map(x => x.e)) - S.mean(rs.filter(x => !x.f).map(x => x.e));
  const stm = (rs) => S.mean(rs.filter(x => x.f).map(x => x.mres)) - S.mean(rs.filter(x => !x.f).map(x => x.mres));
  const all = groups.flat(); const n1 = all.filter(x => x.f).length;
  console.log(name, 'n flagged', n1, 'of', all.length, 'fp resid diff', st(all).toFixed(2), 'CI', S.clusterBoot(groups, st, 500).map(x => x.toFixed(2)).join('..'), '| minutes diff', stm(all).toFixed(2), 'CI', S.clusterBoot(groups, stm, 500).map(x => x.toFixed(2)).join('..'));
}
effect('home-minus-away', r => r.away === false);
effect('b2b-second-night', r => r.b2b);
// minutes trend: last3 min minus last15 min vs residual (Spearman), and partial vs estimator
const mt = rows.map(r => m(r.pg.slice(-3).map(x => x.min)) - m(r.pg.slice(-15).map(x => x.min)));
console.log('minutes trend (last3-last15) vs residual: spearman', S.spearman(mt, resid).toFixed(3), 'n', rows.length);
// does adding minutes trend improve prediction? fit y = yh + b*mt by OLS on 2025, test on 2026
const tr = rows.map((r, i) => i).filter(i => rows[i].g.season === '2025'), te = rows.map((r, i) => i).filter(i => rows[i].g.season === '2026');
const b = tr.reduce((s, i) => s + mt[i] * resid[i], 0) / tr.reduce((s, i) => s + mt[i] ** 2, 0);
const rm = (ix, f) => Math.sqrt(S.mean(ix.map(i => (y[i] - f(i)) ** 2)));
console.log('minutes-trend slope (fp per min, fit 2025)', b.toFixed(3), '2026 RMSE base', rm(te, i => yh[i]).toFixed(3), 'with trend', rm(te, i => yh[i] + b * mt[i]).toFixed(3), 'n test', te.length);
// calibration of model.js predictive distribution (PIT)
const { dist } = require('./model.cjs');
const qs = [0.1, 0.25, 0.5, 0.75, 0.9]; const cover = qs.map(() => 0); let nc = 0;
for (const r of rows) { const d = dist(D.logs[r.pid], r.g.date); if (!d.sample) continue; nc++; qs.forEach((q, k) => { if (r.g.fp <= S.quant(d.sample, q)) cover[k]++; }); }
console.log('model.js PIT coverage (target q -> observed share at or below), n', nc, qs.map((q, k) => q + '->' + (cover[k] / nc).toFixed(3)).join(' '));
// P(Y > mu + c*sd) calibration for c in {0.5,1} using model.js
