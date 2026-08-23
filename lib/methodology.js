import { VALUATION_CONFIG } from "./valuation/index.js";
/**
 * DATA FOR THE /methodology WALKTHROUGH's pinned chart - the value model drawn once,
 * with one real asset's numbers riding through every term (VISION.md M9).
 *
 * Everything here is either the model's own config (`baseOfRank`, `baseCurveSamples`
 * re-state the exact exponential `valuePlayer` prices with) or a deterministic CHOICE
 * of which already-computed `ValuedPlayer` to use as the worked example. Nothing is
 * computed here that the model did not already compute (D19): the picker only sorts
 * and counts fields `cachedValuePlayers` has published.
 */
/**
 * base(rank), exactly as `valuePlayer` computes it - same constants, same rounding.
 * Restated here (rather than exported from valuation/index.js) only to give the
 * walkthrough's curve a pure function of rank; the constants are read live off the
 * config, so the two cannot drift apart without `rankDecay`/`maxValue` themselves
 * moving - which is the same event.
 * @param {number} rank
 * @param {import('./valuation/config.js').ValuationConfig} [cfg]
 * @returns {number}
 */
export function baseOfRank(rank, cfg = VALUATION_CONFIG) {
  return Math.round(
    cfg.maxValue * Math.exp(-cfg.rankDecay * Math.max(0, rank - 1)),
  );
}
/**
 * Samples of the base-value decay for the pinned chart's curve. Dense enough that the
 * exponential reads as a curve rather than a polyline at 320 user units, sparse enough
 * that the serialized prop stays small. Always includes rank 1 and `maxRank`.
 * @param {number} [maxRank]
 * @param {number} [step]
 * @param {import('./valuation/config.js').ValuationConfig} [cfg]
 * @returns {{ rank: number, base: number }[]}
 */
export function baseCurveSamples(maxRank = 260, step = 8, cfg = VALUATION_CONFIG) {
  const out = [];
  for (let r = 1; r <= maxRank; r += step) {
    out.push({ rank: r, base: baseOfRank(r, cfg) });
  }
  if (out[out.length - 1].rank !== maxRank) {
    out.push({ rank: maxRank, base: baseOfRank(maxRank, cfg) });
  }
  return out;
}
/**
 * The example pool: the top of the board a reader actually looks at. 40 rather than
 * the full 260 because the example has to sit high enough on the decay curve that its
 * base value is visibly not zero - a #200 asset's dot lies flat on the axis and
 * teaches nothing about the exponential.
 */
export const EXAMPLE_POOL = 40;
/**
 * Which real asset rides through the pinned chart.
 *
 * THE RULE, STATED BECAUSE IT IS A CHOICE: among the top `EXAMPLE_POOL` prices on the
 * board, take the player whose price exercises the MOST of the model's terms - each of
 * the four multipliers sitting off exactly 1.0 counts one, a production-backed rank
 * counts one - and break ties toward the higher price. An example whose every term is
 * a no-op would light four steps of the walkthrough with "×1.00, nothing happened",
 * which is a true sentence and a useless illustration. The numbers themselves are
 * never touched: whoever wins, every figure drawn is `cachedValuePlayers`' own output
 * for him. The page prints this rule next to the chart, so the reader knows the
 * example was chosen and how.
 *
 * @param {Map<string, import('./valuation/index.js').ValuedPlayer>} valued
 * @param {Map<string, import('./providers/types.js').Player>} players
 * @returns {(import('./valuation/index.js').ValuedPlayer & {
 *   name: string, position: string|null, age: number|null })|null}
 */
export function pickWalkthroughExample(valued, players) {
  const pool = [...valued.values()]
    .filter((v) => v.value > 0 && v.searchRank != null)
    .sort((a, b) => b.value - a.value)
    .slice(0, EXAMPLE_POOL);
  let best = null;
  let bestScore = -1;
  for (const v of pool) {
    const score =
      (v.ageMultiplier !== 1 ? 1 : 0) +
      (v.injuryMultiplier !== 1 ? 1 : 0) +
      (v.roleMultiplier !== 1 ? 1 : 0) +
      (v.positionMultiplier !== 1 ? 1 : 0) +
      (v.productionBacked ? 1 : 0);
    // Strictly greater: the pool is value-sorted, so ties resolve to the higher price
    // by construction (Array.prototype.sort is stable and the filter preserved order).
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  if (!best) return null;
  const p = players.get(best.playerId);
  return {
    ...best,
    name: p?.fullName ?? best.playerId,
    position: p?.position ?? p?.fantasyPositions?.[0] ?? null,
    age: p?.age ?? null,
    // `best.base` is already priced off the PRODUCTION-BLENDED rank (`best.rank`) - the
    // walkthrough's curve step needs the consensus dot too, so the gap between the two
    // dots can BE the production term (see MethodologyWalkthrough.jsx). Restated here
    // with the module's own `baseOfRank`, same constants, so the two dots and the
    // curve they sit on can never disagree.
    consensusBase: baseOfRank(best.searchRank ?? best.rank),
  };
}
