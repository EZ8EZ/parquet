/**
 * Ranking TIERS derived from natural cliffs in the value distribution.
 *
 * Why this exists: `tierOf()` in lib/valuation used to map value to a tier name with
 * hardcoded thresholds (7000 = Franchise, 4500 = Cornerstone, ...). That is arbitrary. It
 * says two players 10 points apart are in different tiers if they happen to straddle
 * 4500, while two players 1500 apart share a tier if they sit inside a band. It is also
 * perishable, which is how it eventually failed: the literals had been fitted to where
 * the distribution cliffed, the age-curve recalibration moved the cliffs, and the two
 * systems began printing different labels for the same player without erroring. `tierOf`
 * is deleted; `lib/rankings/leagueTiers.ts` is the one way a surface asks for a label.
 *
 * Good dynasty rankings tier at the CLIFFS: the point of a tier is "everyone in here
 * is close enough that you should not agonise over the ordering, and the gap to the
 * next group is real." So we find the largest relative gaps in the sorted values and
 * break there.
 *
 * Method: a 1-D variant of Jenks/head-tail breaks. Walk the sorted values, score each
 * adjacent pair by its RELATIVE drop, and cut at the biggest drops subject to a
 * minimum tier size so we do not emit tiers of one. Deterministic, no randomness, no
 * dependency, and cheap at a few hundred assets.
 */
/**
 * Editorial tier names. Deliberately dynasty-native language rather than
 * "Tier 1 / Tier 2", because a prosumer reads "Cornerstone" faster than a number.
 * Falls back to numbered tiers if more tiers are requested than there are names.
 */
export const TIER_LABELS = [
  "Franchise",
  "Cornerstone",
  "Core Starter",
  "Starter",
  "High-End Rotation",
  "Rotation",
  "Depth",
  "Fringe",
];
function labelFor(tier) {
  return TIER_LABELS[tier - 1] ?? `Tier ${tier}`;
}
/**
 * The floor, as a fraction of the top asset, that bounds the cliff search.
 *
 * Named rather than repeated, because six surfaces used to spell out
 * `computeTiers(desc, { floor: (desc[0] ?? 0) * 0.1 })` by hand and a seventh
 * (`tierOf`) used a different scheme entirely. See `leagueTiers` below.
 */
export const TIER_FLOOR_FRACTION = 0.1;
/**
 * THE league tiering, and the only one any surface should call.
 *
 * A "Cornerstone" has to mean the same thing on /values, on a roster page, on a deal
 * receipt, in a provenance rail and in search - so the recipe lives in exactly one
 * function rather than being copied into each of them. Pure and dependency-free, so a
 * client component can call it with the values it already holds.
 */
export function leagueTiers(valuesDesc) {
  return computeTiers(valuesDesc, {
    floor: (valuesDesc[0] ?? 0) * TIER_FLOOR_FRACTION,
  });
}
/**
 * Compute tier breaks over values sorted DESCENDING.
 * Returns tiers in order, best first. Safe on empty and tiny inputs.
 */
export function computeTiers(valuesDesc, opts = {}) {
  const tierCount = Math.max(1, opts.tierCount ?? 8);
  const minTierSize = Math.max(1, opts.minTierSize ?? 2);
  // The floor bounds the population the cliffs are searched in. Without it the
  // deep tail dominates: relative drops between two junk values (300 -> 240) score
  // higher than the genuine gap under the elite tier, and every break lands among
  // assets nobody tiers by hand. Below-floor values still resolve - tierResolver
  // sends anything under the last tier's minValue to the final tier.
  const pool =
    opts.floor != null ? valuesDesc.filter((v) => v >= opts.floor) : valuesDesc;
  const values = pool.length > 0 ? pool : valuesDesc;
  const n = values.length;
  if (n === 0) return [];
  if (n <= tierCount) {
    // Too few assets to tier meaningfully: one tier each, in order.
    return values.map((v, i) => ({
      tier: i + 1,
      label: labelFor(i + 1),
      startIndex: i,
      endIndex: i,
      minValue: v,
      maxValue: v,
      count: 1,
    }));
  }
  // Score every candidate break by RELATIVE drop, so a 500-point fall near the top
  // does not automatically outrank a proportionally larger fall further down.
  const candidates = [];
  for (let i = 1; i < n; i++) {
    const above = values[i - 1];
    const below = values[i];
    const denom = Math.max(1, below);
    candidates.push({ index: i, score: (above - below) / denom });
  }
  candidates.sort((a, b) => b.score - a.score);
  // Greedily accept the biggest drops that respect the minimum tier size.
  const breaks = [];
  const wanted = tierCount - 1;
  for (const c of candidates) {
    if (breaks.length >= wanted) break;
    const ok =
      c.index >= minTierSize &&
      n - c.index >= minTierSize &&
      breaks.every((b) => Math.abs(b - c.index) >= minTierSize);
    if (ok) breaks.push(c.index);
  }
  breaks.sort((a, b) => a - b);
  const bounds = [0, ...breaks, n];
  const tiers = [];
  for (let t = 0; t < bounds.length - 1; t++) {
    const start = bounds[t];
    const end = bounds[t + 1] - 1;
    if (end < start) continue;
    tiers.push({
      tier: t + 1,
      label: labelFor(t + 1),
      startIndex: start,
      endIndex: end,
      minValue: values[end],
      maxValue: values[start],
      count: end - start + 1,
    });
  }
  return tiers;
}
/**
 * Build a fast value -> tier lookup from computed tiers.
 * Values at a boundary resolve to the better (lower-numbered) tier.
 */
export function tierResolver(tiers) {
  if (tiers.length === 0) return () => null;
  return (value) => {
    for (const t of tiers) {
      if (value >= t.minValue) return t;
    }
    return tiers[tiers.length - 1];
  };
}
