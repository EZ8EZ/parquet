/**
 * The league's tier labels, resolved from the league's own value distribution.
 *
 * WHY THIS EXISTS. Until the age-curve recalibration there were two tier systems in
 * this app and they happened to agree. `computeTiers` reads the breaks off the live
 * distribution (/values, /roster, /deals, /lineage, search, the ranking board);
 * `tierOf` in lib/valuation carried six hardcoded literals (7000 = Franchise, 4500 =
 * Cornerstone, ...) and was used by the trade evaluator and the analyst export.
 *
 * The literals were not arbitrary when they were written - they had been fitted to
 * where the distribution cliffed at the time, and 7000 sat cleanly below a real break
 * at 7133. The recalibration moved the break to 7605 and left the literal at 7000, so
 * the same two players (Alperen Şengün at 7,179 and Luka Dončić at 7,112) rendered
 * "Franchise" on a trade receipt and "Cornerstone" on /values, on the same afternoon.
 * Nothing threw. That is the whole failure mode: a threshold that was right at one
 * distribution and silently wrong at the next.
 *
 * The fix is not a better literal - a better literal has the same expiry date. It is
 * to delete the second system, so a tier label can only ever come from the
 * distribution it is describing.
 */
import type { LeagueHistory } from "../history";
import { cachedValuePlayers } from "../valuation";
import type { ValuationConfig } from "../valuation/config";
import { leagueTiers, tierResolver, type Tier } from "./tiers";

/** Every priced asset in the league, value-descending. */
function leagueValuesDesc(h: LeagueHistory, cfg?: ValuationConfig): number[] {
  return [...cachedValuePlayers(h, cfg).values()]
    .map((v) => v.value)
    .filter((v) => v > 0)
    .sort((a, b) => b - a);
}

/** The league's tiers, best first. */
export function leagueTiersFor(h: LeagueHistory, cfg?: ValuationConfig): Tier[] {
  return leagueTiers(leagueValuesDesc(h, cfg));
}

/**
 * A value -> tier-label function for this league. Values below the last tier resolve
 * to the last tier's label rather than to nothing, exactly as `tierResolver` does.
 */
export function leagueTierLabel(
  h: LeagueHistory,
  cfg?: ValuationConfig,
): (value: number) => string {
  const tiers = leagueTiersFor(h, cfg);
  const resolve = tierResolver(tiers);
  const last = tiers[tiers.length - 1]?.label ?? "Fringe";
  return (value: number) => resolve(value)?.label ?? last;
}
