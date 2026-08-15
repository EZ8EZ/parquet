/**
 * SLOT PAR - what one lock-in slot has been worth in THIS league.
 *
 * ---------------------------------------------------------------------------------
 * Where this came from
 * ---------------------------------------------------------------------------------
 * This module was rescued out of /lab/startline when that surface was shelved (see
 * SHELVED.md, S1). The start line's nightly board and ten-game log were the parts that
 * went; this was the part four reviewers wanted kept, for a reason worth restating
 * here so nobody re-shelves it by association:
 *
 *   IT IS HISTORY, NOT TONIGHT. Every other thing on that page needed a live week to
 *   mean anything, and this league is out of season for most of the calendar. A
 *   distribution over every slot every manager has ever banked reads the same in
 *   August as it does in January.
 *
 * It lives under /lab/regret because the regret ledger already reads exactly the data
 * it needs - `loadLockInWeek` returns every roster's lineup for a week, and the ledger
 * was already fetching all of them and throwing thirteen fourteenths away. Par costs
 * zero additional requests here.
 *
 * ---------------------------------------------------------------------------------
 * What it refuses to do
 * ---------------------------------------------------------------------------------
 * It tells you where a figure SAT among past slots. It is not a projection, not a
 * probability, and not a pass mark - half of all slots are below the median by
 * construction, so calling the median a threshold would be a grade, and D6 forbids
 * grades. The surface says this in the reader's own words.
 */
/** How wide a bin of the par strip is, in fantasy points. */
export const PAR_BIN_WIDTH = 4;
/**
 * What a lock-in slot has been worth in THIS league.
 *
 * ZEROS ARE EXCLUDED FROM THE DISTRIBUTION AND COUNTED SEPARATELY, which is the one
 * modelling decision in this function. A slot that banked 0.0 is not a low score, it
 * is an absent decision: 10 of the league's 2,254 slots in 2025 held no player at all
 * and 116 more held a player who did not play. Leaving them in drags the median down
 * by half a point and quietly redefines "typical" as "typical, including the weeks
 * nobody was watching". They are reported on their own line instead, where they say
 * something true.
 */
export function buildSlotPar(slots, binWidth = PAR_BIN_WIDTH) {
  const scoring = slots
    .filter((s) => s.playerId != null && s.points > 0)
    .map((s) => s.points);
  const sorted = [...scoring].sort((a, b) => a - b);
  const max = sorted.length ? sorted[sorted.length - 1] : 0;
  const bins = [];
  const binCount = Math.max(1, Math.ceil((max || 1) / binWidth));
  for (let i = 0; i < binCount; i++) {
    bins.push({ from: i * binWidth, to: (i + 1) * binWidth, count: 0 });
  }
  for (const v of sorted) {
    const i = Math.min(binCount - 1, Math.floor(v / binWidth));
    bins[i].count++;
  }
  return {
    n: sorted.length,
    mean: round1(sorted.reduce((s, v) => s + v, 0) / (sorted.length || 1)),
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    max,
    bins,
    deadSlots: slots.filter((s) => s.points === 0).length,
    negativeSlots: slots.filter((s) => s.playerId != null && s.points < 0)
      .length,
    totalSlots: slots.length,
    sorted,
  };
}
/** Linear-interpolated quantile of an ASCENDING array. */
export function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return round1(sorted[lo]);
  return round1(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo));
}
/**
 * Where a figure sits among the league's scoring slots, as a percentage at or below.
 *
 * Returned so a reader can be told "higher than 62% of the slots this league has ever
 * banked" - which is a statement about the past. It is NOT a probability, not a
 * confidence, and the surface never words it as one.
 */
export function parPercentile(par, value) {
  if (par.n === 0) return 0;
  // Read from the raw sorted array, never from the bins: two slots either side of a
  // bin edge are four points apart in the drawing and one point apart in fact, and the
  // printed sentence has to be the fact.
  let lo = 0;
  let hi = par.sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (par.sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return Math.round((lo / par.n) * 100);
}
function round1(n) {
  return Math.round(n * 10) / 10;
}
