/**
 * Single-player lock-in model: next-game distribution and optimal stopping.
 * Productionised from the 2026-11-16 lock-in study (scripts/lockin/model.cjs, fitted by scripts/lockin/model_study.cjs);
 * parameters below are that study's, fitted offline, not here.
 *
 * Rules the stopping math encodes (verified in the study, n=120 and n=10):
 * an unlocked starter's score resets at his next tip to that game's score (0 on a
 * DNP); a never-locked starter scores his final team game of the week.
 */

// model_study.js, 2026-11-16, n=21,757 games / 353 players: EWMA half-life 5 had the
// lowest next-game RMSE (6.96, R2 0.42). Shape = last 30 played games' deviations
// widened x1.12 (the one tuned parameter, from the PIT check). League SD 6.7 = median
// within-player SD, 2025, n=312. Play prob: last 40 team-game rows shrunk to 0.8 (weight 10).
export const MODEL = Object.freeze({
  halfLife: 5,
  ewmaMaxGames: 200,
  shapeGames: 30,
  widen: 1.12,
  minShapeGames: 10,
  leagueMean: 15,
  leagueSd: 6.7,
  playWindow: 40,
  playPriorRows: 10,
  playPriorRate: 0.8,
  playFloor: 0.3,
  kMax: 6,
  // lockin-opponent: prior-season games count half in the weighted mean. Tuned on 2025 weeks
  // 1-3 (RMSE 7.003 -> 6.925, n=2,614), tested on 2026 weeks 1-3 (6.902 -> 6.833, n=2,615);
  // 0.25 tied 0.5. The 30-game shape is unchanged.
  priorSeasonWeight: 0.5,
  source: "lock-in study 2026-11-16 (scripts/lockin/model_study.cjs, n=21,757 games)",
});

const Z10 = [-1.64, -1.04, -0.67, -0.39, -0.13, 0.13, 0.39, 0.67, 1.04, 1.64];

const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

/** Linear-interpolated quantile of an unsorted sample. */
export function quantile(sample, q) {
  const s = [...sample].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

/** NBA season label of a date: Sleeper's "2026" runs October 2026 to June 2027. */
export function seasonOfDate(date) {
  const y = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 8 ? y : y - 1;
}

/** A completed game the player appeared in: sp>0 on a game the schedule marks complete. */
export const isPlayed = (g) => g.complete === true && g.sp > 0;

/** Completed rows strictly before `asOf` (YYYY-MM-DD), sorted by date. */
function completedBefore(log, asOf) {
  return log.filter((g) => g.complete === true && g.date < asOf);
}

/**
 * Next-game distribution from a game log, seeing only games before `asOf`.
 * basis: "own" (>=10 played games: own 30-game shape), "thin" (1-9: EWMA mean, normal
 * shape at league SD), "league-prior" (0 games: league mean and SD; no player data).
 */
export function nextGameDistribution(log, asOf, P = MODEL) {
  const target = seasonOfDate(asOf);
  const played = completedBefore(log, asOf).filter((g) => g.sp > 0);
  const n = played.length;
  if (n === 0) {
    const sample = Z10.map((z) => P.leagueMean + z * P.leagueSd);
    return { mean: P.leagueMean, sd: P.leagueSd, sample, n: 0, shapeN: 0, basis: "league-prior" };
  }
  const a = Math.pow(0.5, 1 / P.halfLife);
  let w = 0;
  let t = 0;
  for (let i = n - 1, k = 0; i >= 0 && k < P.ewmaMaxGames; i--, k++) {
    const ww = Math.pow(a, k) * (seasonOfDate(played[i].date) === target ? 1 : P.priorSeasonWeight ?? 1);
    w += ww;
    t += ww * played[i].fp;
  }
  const mu = t / w;
  const shapeG = played.slice(-P.shapeGames).map((g) => g.fp);
  let sample;
  let basis;
  if (shapeG.length < P.minShapeGames) {
    sample = Z10.map((z) => mu + z * P.leagueSd);
    basis = "thin";
  } else {
    const m = mean(shapeG);
    sample = shapeG.map((x) => mu + P.widen * (x - m));
    basis = "own";
  }
  const sd = Math.sqrt(mean(sample.map((x) => (x - mu) ** 2)));
  return { mean: mu, sd, sample, n, shapeN: basis === "own" ? shapeG.length : 0, basis };
}

/** Share of his last 40 completed team-game rows (DNP rows included) he played, shrunk to 0.8. */
export function playProbability(log, asOf, P = MODEL) {
  const rows = completedBefore(log, asOf).slice(-P.playWindow);
  const played = rows.filter((g) => g.sp > 0).length;
  const raw = (played + P.playPriorRate * P.playPriorRows) / (rows.length + P.playPriorRows);
  return { value: Math.min(1, Math.max(P.playFloor, raw)), nRows: rows.length, played };
}

/**
 * Reservation values under the reset rule, with play probability q per game:
 *   H_0(y) = y;  H_j(y) = q*max(y, r_j) + (1-q)*max(y, H_{j-1}(0));  r_j = E[H_{j-1}(Y)].
 * r[k] is the expected value of holding with k games left when he plays the next one.
 */
export function reservationValues(sample, q, kMax = MODEL.kMax) {
  const r = [NaN];
  const H = (j, y) =>
    j === 0 ? y : q * Math.max(y, r[j]) + (1 - q) * Math.max(y, H(j - 1, 0));
  for (let j = 1; j <= kMax; j++) r[j] = mean(sample.map((y) => H(j - 1, y)));
  return { r, H };
}

/** Bundle the model for one player at one date; reused by the policy and the cards. */
export function playerModel(log, asOf, P = MODEL) {
  const dist = nextGameDistribution(log, asOf, P);
  const q = playProbability(log, asOf, P);
  const { r, H } = reservationValues(dist.sample, q.value, P.kMax);
  return { dist, q, r, H, asOf };
}

const capK = (k) => Math.min(k, MODEL.kMax);

/**
 * Expected value of NOT locking with k team games left (the next included).
 * playsNext: true -> r_k; false (ruled out) -> H_{k-1}(0); null -> availability-weighted.
 * k=0 returns null: the final game's score stands, there is no decision.
 */
export function holdValue(m, k, playsNext) {
  if (!(k >= 1)) return null;
  const ifPlays = m.r[capK(k)];
  const ifOut = Math.max(0, m.H(capK(k - 1), 0));
  if (playsNext === true) return ifPlays;
  if (playsNext === false) return ifOut;
  return m.q.value * ifPlays + (1 - m.q.value) * ifOut;
}

/** P(at least one of the next k games is played and beats x), each played with prob q. */
export function probLaterBeats(sample, x, k, q) {
  if (!(k >= 1)) return null;
  const p1 = sample.filter((y) => y > x).length / sample.length;
  return 1 - Math.pow(1 - q * p1, k);
}

/** 10th-90th percentile of the next game. */
export function nextGameRange(dist) {
  return { p10: quantile(dist.sample, 0.1), p90: quantile(dist.sample, 0.9) };
}

/**
 * Everything the card shows about one score x with k games left. Null fields when k=0.
 * playsNext as in holdValue; both branches are always reported.
 */
export function stoppingView(m, x, k, playsNext = null) {
  const range = nextGameRange(m.dist);
  const base = {
    x,
    k,
    mean: m.dist.mean,
    sd: m.dist.sd,
    range,
    n: m.dist.n,
    shapeN: m.dist.shapeN,
    basis: m.dist.basis,
    q: m.q,
  };
  if (!(k >= 1)) {
    return { ...base, decision: false, expectedIfHeld: null, expectedIfHeldPlays: null, expectedIfHeldOut: null, pLaterBeats: null };
  }
  return {
    ...base,
    decision: true,
    expectedIfHeld: holdValue(m, k, playsNext),
    expectedIfHeldPlays: holdValue(m, k, true),
    expectedIfHeldOut: holdValue(m, k, false),
    pLaterBeats: probLaterBeats(m.dist.sample, x, k, m.q.value),
  };
}

/** Per-player rule at the lock deadline: lock iff x >= hold value given availability. */
export function perPlayerRuleLocks(m, x, k, playsNext) {
  const h = holdValue(m, k, playsNext);
  return h == null ? null : x >= h;
}
