/**
 * Recalibration of "chance a later game beats this score", measured on real unlocked lock
 * situations of league starters (scripts/lockin/opponent_measures.mjs, 2026-11-24): the raw
 * figure ran 2-9 points LOW in the middle bins (n=12,111, 2023-2026). Logistic map fitted on
 * 2023-2025 (n=11,223), checked on 2026 (n=888): Brier 0.1787 raw -> 0.1698. The 2026 middle
 * bins were still 9-15 points low after it, so the UI should keep its stated tolerance.
 */
export const BEAT_RECAL = Object.freeze({ a: 0.278, b: 1.009, trainN: 11223, testN: 888, brierRaw: 0.1787, brierRecal: 0.1698 });

const logit = (p) => {
  const q = Math.min(0.999, Math.max(0.001, p));
  return Math.log(q / (1 - q));
};

/** p -> recalibrated p; null stays null. */
export function recalibrateBeat(p, R = BEAT_RECAL) {
  if (p == null || !Number.isFinite(p)) return null;
  if (p <= 0) return 0;
  return 1 / (1 + Math.exp(-(R.a + R.b * logit(p))));
}
