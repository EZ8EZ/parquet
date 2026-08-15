import { cachedValuePlayers } from "../valuation";
import { leagueTiers, tierResolver } from "./tiers";
/** Every priced asset in the league, value-descending. */
function leagueValuesDesc(h, cfg) {
  return [...cachedValuePlayers(h, cfg).values()]
    .map((v) => v.value)
    .filter((v) => v > 0)
    .sort((a, b) => b - a);
}
/** The league's tiers, best first. */
export function leagueTiersFor(h, cfg) {
  return leagueTiers(leagueValuesDesc(h, cfg));
}
/**
 * A value -> tier-label function for this league. Values below the last tier resolve
 * to the last tier's label rather than to nothing, exactly as `tierResolver` does.
 */
export function leagueTierLabel(h, cfg) {
  const tiers = leagueTiersFor(h, cfg);
  const resolve = tierResolver(tiers);
  const last = tiers[tiers.length - 1]?.label ?? "Fringe";
  return (value) => resolve(value)?.label ?? last;
}
