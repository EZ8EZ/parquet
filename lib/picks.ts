/**
 * Draft-pick capital as first-class assets.
 *
 * Sleeper's traded_picks endpoint only lists picks whose owner != original team.
 * A team's FULL pick holdings = its own picks (one per round per future season)
 * with trades applied on top. We reconstruct that, value each pick, and expose it
 * so picks count toward roster value and show up as tradeable assets — a rebuild
 * stockpile is otherwise invisible in a roster's value.
 */
import type { LeagueHistory } from "./history";
import { ordinal, rosterName } from "./derive/describe";
import { pickValue } from "./valuation";

export interface OwnedPick {
  season: string;
  round: number;
  originalRoster: number;
  acquired: boolean; // owned but not originally ours
  fromName: string | null; // the original team, if acquired
  value: number;
  label: string; // e.g. "2027 1st (via Citadel)"
}

export interface PickCapital {
  picks: OwnedPick[]; // sorted by value desc
  total: number;
  firsts: number; // first-round picks currently owned
  extraFirsts: number; // owned firsts minus the 1-per-season baseline
  seasons: string[];
}

/** Which future seasons the league currently tracks tradeable picks for. */
function futureSeasons(h: LeagueHistory): string[] {
  const cur = h.currentSeasonYear;
  const set = new Set<number>();
  for (const tp of h.tradedPicks) {
    const y = parseInt(tp.season, 10);
    if (y >= cur) set.add(y);
  }
  if (set.size === 0) set.add(cur);
  return [...set].sort((a, b) => a - b).map(String);
}

function ownerOf(
  h: LeagueHistory,
  season: string,
  round: number,
  original: number,
): number {
  const tp = h.tradedPicks.find(
    (p) => p.season === season && p.round === round && p.rosterId === original,
  );
  return tp ? tp.ownerId : original;
}

/**
 * Pick movements that NO transaction explains.
 *
 * Commissioner-executed trades always carry `draft_picks: []` (verified — see
 * API_NOTES). So when a commissioner processes a multi-team deal by hand, the pick
 * component leaves no transaction record at all; the only evidence is the
 * traded_picks snapshot. We diff the snapshot against every pick movement the
 * transaction log DOES record, and surface the remainder so those picks are still
 * counted as real, attributable movement rather than silently lost.
 */
export interface UnrecordedPickMove {
  season: string;
  round: number;
  originalRoster: number;
  fromRoster: number;
  toRoster: number;
  label: string;
}

export function unrecordedPickMoves(h: LeagueHistory): UnrecordedPickMove[] {
  // Every (season, round, originalRoster) the transaction log accounts for.
  const explained = new Set<string>();
  for (const t of h.transactions) {
    for (const dp of t.draftPicks) {
      explained.add(`${dp.season}|${dp.round}|${dp.rosterId}`);
    }
  }
  const out: UnrecordedPickMove[] = [];
  for (const tp of h.tradedPicks) {
    if (tp.ownerId === tp.rosterId) continue; // still with its original team
    const key = `${tp.season}|${tp.round}|${tp.rosterId}`;
    if (explained.has(key)) continue;
    out.push({
      season: tp.season,
      round: tp.round,
      originalRoster: tp.rosterId,
      fromRoster: tp.previousOwnerId,
      toRoster: tp.ownerId,
      label: `${tp.season} ${ordinal(tp.round)} (orig. ${rosterName(h, tp.rosterId)})`,
    });
  }
  return out;
}

/** Unrecorded pick moves that involve a given roster (either side). */
export function unrecordedPickMovesFor(
  h: LeagueHistory,
  rosterId: number,
): UnrecordedPickMove[] {
  return unrecordedPickMoves(h).filter(
    (m) => m.toRoster === rosterId || m.fromRoster === rosterId,
  );
}

export function pickCapital(h: LeagueHistory, rosterId: number): PickCapital {
  const cur = h.currentSeasonYear;
  const rounds = h.currentLeague.settings.draft_rounds || 3;
  const teams = h.currentLeague.totalRosters || h.rosters.length;
  const seasons = futureSeasons(h);

  const picks: OwnedPick[] = [];
  for (const season of seasons) {
    for (let round = 1; round <= rounds; round++) {
      for (let original = 1; original <= teams; original++) {
        if (ownerOf(h, season, round, original) !== rosterId) continue;
        const acquired = original !== rosterId;
        const fromName = acquired ? rosterName(h, original) : null;
        const value = pickValue(round, parseInt(season, 10) - cur);
        picks.push({
          season,
          round,
          originalRoster: original,
          acquired,
          fromName,
          value,
          label: `${season} ${ordinal(round)}${fromName ? ` (via ${fromName})` : ""}`,
        });
      }
    }
  }
  picks.sort((a, b) => b.value - a.value);
  const firsts = picks.filter((p) => p.round === 1).length;
  return {
    picks,
    total: picks.reduce((s, p) => s + p.value, 0),
    firsts,
    extraFirsts: firsts - seasons.length, // baseline = own 1 first per season
    seasons,
  };
}
