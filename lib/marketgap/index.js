import { cachedValuePlayers } from "../valuation/index.js";

/**
 * MODEL VS MARKET. Where this model's priced ordinal (`rank`) disagrees with the
 * market ordinal it started from (`marketRank`, Sleeper's dynasty/redraft blend, D116).
 *
 * gap = marketRank - rank. Positive means the model prices him ABOVE where the market
 * ranks him. A measurement of disagreement, never a verdict (D6): nothing here says
 * who is right. Players without a market ordinal are left out rather than given one
 * (D19).
 */
export const MIN_GAP = 5;

/**
 * Why the two ordinals differ, from flags the ValuedPlayer actually carries.
 * `rookiePrior` is not on ValuedPlayer, so a first-year player is read as the rookie
 * prior's case (lib/valuation/market.js only applies it at yearsExp 0).
 * @returns {"production"|"rookie prior"|"model"}
 */
function reasonFor(v, p) {
  if (v.productionBacked) return "production";
  if (p?.yearsExp === 0) return "rookie prior";
  return "model";
}

/**
 * @param {{ players: Map<string, any>, rosters?: any[], currentLeague: { scoringSettings: Record<string, number> } }} h
 * @param {{ rosterIds?: number[]|null, limit?: number, values?: Map<string, any> }} [opts]
 *   `values` lets a caller (or a test) pass an already-computed value map.
 */
/**
 * THE RELEVANT POOL. A disagreement only matters about a player someone could trade
 * for: rostered here, or ranked inside the top RELEVANT_RANK by either side. Without
 * this the list filled with deep free agents (#429 here vs #1,023 market) - real
 * numbers, and nobody's decision.
 */
export const RELEVANT_RANK = 250;
export function marketGaps(h, { rosterIds = null, limit = 8, values } = {}) {
  const vals = values ?? cachedValuePlayers(h);
  const owner = new Map();
  for (const r of h.rosters ?? [])
    for (const id of r.players ?? []) owner.set(id, r.rosterId);
  const scope = rosterIds ? new Set(rosterIds) : null;
  const rows = [];
  for (const v of vals.values()) {
    if (!(v.value > 0) || v.marketRank == null || v.rank == null) continue;
    const gap = v.marketRank - v.rank;
    if (Math.abs(gap) < MIN_GAP) continue;
    const rosteredBy = owner.get(v.playerId) ?? null;
    if (scope && !scope.has(rosteredBy)) continue;
    if (
      rosteredBy == null &&
      Math.min(v.rank, v.marketRank) > RELEVANT_RANK
    )
      continue;
    const p = h.players.get(v.playerId);
    rows.push({
      playerId: v.playerId,
      name: p?.fullName ?? v.playerId,
      team: p?.team ?? null,
      age: p?.age ?? null,
      value: v.value,
      rank: v.rank,
      marketRank: v.marketRank,
      marketSource: v.marketSource,
      gap,
      // RELATIVE disagreement, the sort key: #20 vs #40 is a bigger statement than
      // #300 vs #330, and the log ratio says so where the raw gap cannot.
      ratio: Math.log(v.marketRank / v.rank),
      rosteredBy,
      reason: reasonFor(v, p),
    });
  }
  rows.sort(
    (a, b) => Math.abs(b.ratio) - Math.abs(a.ratio) || b.value - a.value,
  );
  return {
    higher: rows.filter((r) => r.gap > 0).slice(0, limit),
    lower: rows.filter((r) => r.gap < 0).slice(0, limit),
  };
}

/** Which market sources the priced pool actually drew on, counted. */
export function marketSourceCounts(values) {
  const out = { blend: 0, dynasty: 0, redraft: 0 };
  for (const v of values.values())
    if (v.value > 0 && v.marketSource in out) out[v.marketSource] += 1;
  return out;
}
