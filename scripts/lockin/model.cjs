// Single-player predictive distribution + optimal-stopping reservation values.
// Parameters (N, shrinkage) are set from model_study.js results; see study-lockin.md section 3.
// Chosen from model_study.js (n=21,757 target games): EWMA half-life 5 games had the lowest RMSE (6.96);
// shape = last 30 played games' deviations, widened x1.12 to fix under-dispersed tails in the PIT check.
const PARAMS = { HALF_LIFE: 5, N_SHAPE: 30, WIDEN: 1.12, MIN_GAMES: 1, LEAGUE_MEAN: 15, LEAGUE_SD: 6.7 };
// played games strictly before `date` (sp>0). logs sorted by date.
function prior(logs, date) { const out = []; for (const g of logs) { if (g.date >= date) break; if (g.sp > 0) out.push(g); } return out; }
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
// Predictive distribution: shrunk mean + empirical residual shape.
function dist(logs, date, P = PARAMS) {
  const pg = prior(logs, date);
  if (pg.length < P.MIN_GAMES) return { mu: P.LEAGUE_MEAN, sample: null, sd: P.LEAGUE_SD, n: 0 };
  const a = Math.pow(0.5, 1 / P.HALF_LIFE); let w = 0, t = 0;
  for (let i = pg.length - 1, k = 0; i >= 0 && k < 200; i--, k++) { const ww = Math.pow(a, k); w += ww; t += ww * pg[i].fp; }
  const mu = t / w;
  const shapeG = pg.slice(-P.N_SHAPE).map(g => g.fp);
  const m = mean(shapeG);
  let sample = shapeG.map(x => mu + P.WIDEN * (x - m));
  if (shapeG.length < 10) { // too few games for a shape: normal-ish with league SD, scaled
    const z = [-1.64, -1.04, -0.67, -0.39, -0.13, 0.13, 0.39, 0.67, 1.04, 1.64];
    sample = z.map(q => mu + q * P.LEAGUE_SD);
  }
  const sd = Math.sqrt(mean(sample.map(x => (x - mu) ** 2)));
  return { mu, sample, sd, n: pg.length };
}
const Emax = (sample, c) => mean(sample.map(y => Math.max(y, c)));
// Reservation values. Rule confirmed in data (rules.js/rules2.js): an UNLOCKED starter's score resets at his next
// team game's tip and becomes that game's score (0 if he does not play). So with current score y and j team games
// left, availability of the next game unknown (play prob q):
//   H_j(y) = q*max(y, r_j) + (1-q)*max(y, H_{j-1}(0)),  H_0(y) = y,  r_j = E[H_{j-1}(Y)]
// At the lock deadline (next tip) availability IS known: if he plays, lock iff x >= r_j; if he is out, lock iff x >= H_{j-1}(0).
function reservation(sample, q, jmax = 6) {
  const r = [NaN];
  const H = (j, y) => j === 0 ? y : q * Math.max(y, r[j]) + (1 - q) * Math.max(y, H(j - 1, 0));
  for (let j = 1; j <= jmax; j++) r[j] = mean(sample.map(y => H(j - 1, y)));
  return { r, H };
}
// P(at least one of the next j played games beats x), assuming each remaining game played w.p. q
function pBeat(sample, x, j, q) { const p1 = sample.filter(y => y > x).length / sample.length; return 1 - Math.pow(1 - q * p1, j); }
// Play probability for a future game: share of his last 40 team-game rows (DNP rows included) he played,
// shrunk toward 0.8 with weight 10 rows. (League-wide rostered share in 2025 was 0.70, n=27,341 rows, incl. deep bench.)
function playProb(logs, date) { const r = logs.filter(g => g.date < date).slice(-40); const p = r.filter(g => g.sp > 0).length; return Math.min(1, Math.max(0.3, (p + 8) / (r.length + 10))); }
module.exports = { playProb, PARAMS, prior, dist, reservation, pBeat, Emax, mean };
