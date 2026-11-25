/**
 * How likely a manager is to lock a score, from how real managers in this league did (D140).
 * RESEARCH ONLY: measured, not adopted by the app (see D140 for why).
 *
 * At a deadline (after a game, before his next one) the score x is compared with what holding
 * is worth, the reservation value r_k for the k games he has left, in units of his forecast's
 * spread: z = (x - r_k) / sd. P(lock) = logistic(b . [1, z, (z+0.5)+, z+, (z-0.5)+, (z-1)+,
 * k>=2, k>=3]), a piecewise-linear curve in z: about 2% far below the bar, 30% at it, levelling
 * off near 70% well above it (managers often hold even a score they should bank).
 *
 * Fitted on every "unknown until next tip" situation in the league's lock-in seasons 2022, 2023,
 * 2024 and 2026 (n=12,131; scripts/lockin/lock_propensity.mjs and lock_propensity_fit.mjs).
 * Held out a season at a time, Brier 0.143 against 0.215 for a constant share and 0.292 for
 * what the engine assumed before (share 0.293 on top of the shifted reservation rule).
 * 2025 is left out: its lock labels barely depend on the score (16% of far-below-the-bar
 * scores "locked", against 2% in every other season), which fits Sleeper's re-served
 * past-week versions (D134, D137) better than a one-season change of behaviour.
 */
import { MODEL } from "../../lib/lockin/model.js";

export const LOCK_PROPENSITY = Object.freeze({
  knots: [-0.5, 0, 0.5, 1],
  b: [-1.866, 1.851, 2.051, -1.647, -1.265, -1.033, 0.388, 0.177],
  n: 12131,
  source: "scripts/lockin/lock_propensity.mjs + lock_propensity_fit.mjs, 2022-2024 + 2026 (D140)",
});

const sdCache = new WeakMap();
/** Spread of a forecast sample (cached per sample array). */
function sdOf(sample) {
  if (!sample || !sample.length) return 6;
  let v = sdCache.get(sample);
  if (v != null) return v;
  let m = 0;
  for (const x of sample) m += x;
  m /= sample.length;
  let s = 0;
  for (const x of sample) s += (x - m) ** 2;
  v = Math.sqrt(s / sample.length) || 6;
  sdCache.set(sample, v);
  return v;
}

/** P(the manager locks x now), with `left` games still to come; p: { sample, r }. */
export function lockProbability(x, left, p, P = LOCK_PROPENSITY) {
  if (x == null || !(left >= 1) || !p?.r) return 0;
  const k = Math.min(left, MODEL.kMax);
  const z = (x - p.r[k]) / sdOf(p.sample);
  const f = [1, z, ...P.knots.map((c) => Math.max(0, z - c)), left >= 2 ? 1 : 0, left >= 3 ? 1 : 0];
  let t = 0;
  for (let i = 0; i < f.length; i++) t += f[i] * P.b[i];
  return 1 / (1 + Math.exp(-t));
}
