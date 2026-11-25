/**
 * Boom/bust profile from a player's own distribution and recent games. Thresholds are
 * league-relative: his forecast mean +- 1.5 x the league's residual SD (7.0 fantasy points,
 * study n=21,757), so a "boom" means the same distance from expectation for every player.
 */
import { quantile, isPlayed } from "./model.js";

export const BOOM = Object.freeze({ residualSd: 7.0, k: 1.5, games: 30 });

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

/** mdl: playerModel output; log: his game log; asOf: only games before this date. */
export function boomBustProfile(mdl, log, asOf) {
  if (!mdl) return null;
  const mean = mdl.dist.mean;
  // MINOR 3 (QA "Bust under 0.0"): the counted comparison is the displayed one, on the shown
  // (rounded) threshold: boom is "X+" (>=), bust is "under X" (<). No bust line when the mean
  // is within 1.5 x 7.0 of zero: "under 0" is not a bust, it is a negative score.
  const boomThreshold = r1(mean + BOOM.k * BOOM.residualSd);
  const rawBust = r1(mean - BOOM.k * BOOM.residualSd);
  const bustThreshold = rawBust != null && rawBust > 0 ? rawBust : null;
  const recent = log.filter((g) => isPlayed(g) && (!asOf || g.date < asOf)).slice(-BOOM.games);
  const n = recent.length;
  return {
    p10: r1(quantile(mdl.dist.sample, 0.1)),
    p50: r1(quantile(mdl.dist.sample, 0.5)),
    p90: r1(quantile(mdl.dist.sample, 0.9)),
    boomRate: n ? Math.round((recent.filter((g) => g.fp >= boomThreshold).length / n) * 1000) / 1000 : null,
    bustRate: n && bustThreshold != null ? Math.round((recent.filter((g) => g.fp < bustThreshold).length / n) * 1000) / 1000 : null,
    boomThreshold,
    bustThreshold,
    n,
    basis: mdl.dist.basis,
  };
}
