/**
 * Ranking TIERS derived from natural cliffs in the value distribution.
 *
 * Why this exists: the old `tierOf()` mapped value to a tier name with hardcoded
 * thresholds (7000 = Franchise, 4500 = Cornerstone, ...). That is arbitrary. It says
 * two players 10 points apart are in different tiers if they happen to straddle 4500,
 * while two players 1500 apart share a tier if they sit inside a band.
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

export interface Tier {
  /** 1-based tier number, 1 = best. */
  tier: number;
  label: string;
  /** Indices into the sorted-desc value array. */
  startIndex: number;
  endIndex: number;
  minValue: number;
  maxValue: number;
  count: number;
}

export interface TierOptions {
  /** How many tiers to produce. Default 8. */
  tierCount?: number;
  /** Never cut a tier smaller than this, except the last. Default 2. */
  minTierSize?: number;
  /** Ignore assets below this value entirely (they land in the final tier). */
  floor?: number;
}

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
] as const;

function labelFor(tier: number): string {
  return TIER_LABELS[tier - 1] ?? `Tier ${tier}`;
}

/**
 * Compute tier breaks over values sorted DESCENDING.
 * Returns tiers in order, best first. Safe on empty and tiny inputs.
 */
export function computeTiers(
  valuesDesc: number[],
  opts: TierOptions = {},
): Tier[] {
  const tierCount = Math.max(1, opts.tierCount ?? 8);
  const minTierSize = Math.max(1, opts.minTierSize ?? 2);
  const n = valuesDesc.length;
  if (n === 0) return [];
  if (n <= tierCount) {
    // Too few assets to tier meaningfully: one tier each, in order.
    return valuesDesc.map((v, i) => ({
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
  const candidates: Array<{ index: number; score: number }> = [];
  for (let i = 1; i < n; i++) {
    const above = valuesDesc[i - 1];
    const below = valuesDesc[i];
    const denom = Math.max(1, below);
    candidates.push({ index: i, score: (above - below) / denom });
  }
  candidates.sort((a, b) => b.score - a.score);

  // Greedily accept the biggest drops that respect the minimum tier size.
  const breaks: number[] = [];
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
  const tiers: Tier[] = [];
  for (let t = 0; t < bounds.length - 1; t++) {
    const start = bounds[t];
    const end = bounds[t + 1] - 1;
    if (end < start) continue;
    tiers.push({
      tier: t + 1,
      label: labelFor(t + 1),
      startIndex: start,
      endIndex: end,
      minValue: valuesDesc[end],
      maxValue: valuesDesc[start],
      count: end - start + 1,
    });
  }
  return tiers;
}

/**
 * Build a fast value -> tier lookup from computed tiers.
 * Values at a boundary resolve to the better (lower-numbered) tier.
 */
export function tierResolver(tiers: Tier[]): (value: number) => Tier | null {
  if (tiers.length === 0) return () => null;
  return (value: number) => {
    for (const t of tiers) {
      if (value >= t.minValue) return t;
    }
    return tiers[tiers.length - 1];
  };
}
