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
import { cachedValuePlayers, pickValue } from "./valuation";

export interface OwnedPick {
  season: string;
  round: number;
  originalRoster: number;
  acquired: boolean; // owned but not originally ours
  fromName: string | null; // the original team, if acquired
  value: number;
  label: string; // e.g. "2027 1st (via Wire Warriors)"
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

/**
 * Rank every roster by current strength, 1 = strongest.
 *
 * This is what lets a future pick be priced by WHO OWES IT rather than as a generic
 * "a first". A first from the league's worst team is close to a lottery pick; a first
 * from the best team is a late one.
 *
 * > [!warning] Records are useless in the preseason.
 * > Verified on the live league: in `pre_draft` status every roster reads 0-0 with
 * > 0 fpts. Sorting on that is a no-op, which silently left rank == roster_id, so
 * > pick values were being driven by arbitrary league ids. Whenever the current
 * > season has no games played we therefore rank by ROSTER TALENT instead, which is
 * > a real preseason signal and the same thing a human uses to guess draft order.
 *
 * Talent is measured with the same valuation the rest of the app uses, so the two
 * can never disagree. This function does NOT call `analyzeRoster` (that would recurse
 * through `pickCapital` back into here); it values players directly.
 */
export function strengthRanks(h: LeagueHistory): Map<number, number> {
  const played = h.rosters.some(
    (r) => r.settings.wins + r.settings.losses > 0 || r.settings.fpts > 0,
  );

  let ordered: typeof h.rosters;
  if (played) {
    ordered = [...h.rosters].sort((a, b) => {
      const aw = a.settings.wins - a.settings.losses;
      const bw = b.settings.wins - b.settings.losses;
      if (bw !== aw) return bw - aw;
      return b.settings.fpts - a.settings.fpts;
    });
  } else {
    const vals = cachedValuePlayers(h);
    const talent = (rosterId: number) => {
      const roster = h.rostersById.get(rosterId);
      if (!roster) return 0;
      // Top 10 only: a contender is defined by its starters, not by bench filler.
      return roster.players
        .map((pid) => vals.get(pid)?.value ?? 0)
        .sort((a, b) => b - a)
        .slice(0, 10)
        .reduce((s, v) => s + v, 0);
    };
    const scored = h.rosters.map((r) => ({ r, t: talent(r.rosterId) }));
    scored.sort((a, b) => b.t - a.t || a.r.rosterId - b.r.rosterId);
    ordered = scored.map((s) => s.r);
  }

  const m = new Map<number, number>();
  ordered.forEach((r, i) => m.set(r.rosterId, i + 1));
  return m;
}

export function pickCapital(h: LeagueHistory, rosterId: number): PickCapital {
  const cur = h.currentSeasonYear;
  const rounds = h.currentLeague.settings.draft_rounds || 3;
  const teams = h.currentLeague.totalRosters || h.rosters.length;
  const seasons = futureSeasons(h);
  const ranks = strengthRanks(h);

  const picks: OwnedPick[] = [];
  for (const season of seasons) {
    for (let round = 1; round <= rounds; round++) {
      for (let original = 1; original <= teams; original++) {
        if (ownerOf(h, season, round, original) !== rosterId) continue;
        const acquired = original !== rosterId;
        const fromName = acquired ? rosterName(h, original) : null;
        const seasonsOut = parseInt(season, 10) - cur;
        const value = pickValue(round, seasonsOut, {
          originalTeamRank: ranks.get(original),
          teams,
          rounds,
          playoffTeams: h.currentLeague.settings.playoff_teams,
          season,
        });
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
