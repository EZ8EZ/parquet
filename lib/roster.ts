/**
 * Roster & league analysis: value a roster, read its age curve, pick capital, and
 * contend/rebuild window. Provider-agnostic (works off history.players + rosters).
 */
import type { LeagueHistory } from "./history";
import type { Roster } from "./providers/types";
import { cachedValuePlayers, injuryLabel, type ValueBreakdown } from "./valuation";
import { leagueTiers, tierResolver } from "./rankings/tiers";
import { pickCapital, type PickCapital } from "./picks";
import { loadSeasonRosters } from "./metrics/skill";

export interface ValuedPlayer {
  playerId: string;
  name: string;
  team: string | null;
  position: string | null;
  age: number | null;
  /**
   * What is wrong, from `injuryLabel()`. Null when healthy and null for load
   * management, which is a flag but not an injury. Deliberately not the raw
   * `injury_status`: that word is "DTD" for 110 of the 120 live flags, including
   * season-ending ones, so it carried no information worth showing.
   *
   * Two forms because the badge and the detail have different budgets: `injury` is
   * the body part alone ("Knee") for a badge sharing a 390px row with a name, and
   * `injuryDetail` is the full "Knee · Surgery" for the expanded row.
   */
  injury: string | null;
  injuryDetail: string | null;
  value: number;
  tier: string;
  espnId: string | null;
  /** Sleeper's consensus rank. A fact about the player, not a model output. */
  consensusRank: number | null;
  /** The multiplier chain behind `value`, so rows can explain their own number
   *  without callers re-running the whole valuation pass. */
  breakdown: {
    base: number;
    age: number;
    injury: number;
    role: number;
    position: number;
  };
}

export interface RosterAnalysis {
  rosterId: number;
  ownerName: string;
  teamName: string | null;
  valued: ValuedPlayer[];
  /** Players + picks. */
  totalValue: number;
  playerValue: number;
  picks: PickCapital;
  coreAge: number | null;
  byPosition: { pos: string; count: number; value: number }[];
  window: "rebuilding" | "balanced" | "win-now";
  record: { wins: number; losses: number };
}

const POS_ORDER = ["PG", "SG", "SF", "PF", "C"];

/**
 * Window is inherently a relative read, and the absolute thresholds below failed the
 * same way posture's did before it was fixed: with this league's core ages topping out
 * at 28.2, a fixed >=28.5 cutoff crowned zero win-now teams out of 14, even with a team
 * that had just gone 18-2 sitting right there. Classify against the league's own
 * core-age distribution instead - top quartile oldest core = win-now, bottom quartile
 * youngest = rebuilding - and only fall back to the absolute cutoffs when there is no
 * league context to compare against (a standalone `analyzeRoster` call).
 */
function relativeWindow(
  coreAge: number | null,
  leagueCoreAges?: number[],
): RosterAnalysis["window"] {
  if (coreAge == null) return "balanced";
  if (!leagueCoreAges || leagueCoreAges.length < 4) {
    if (coreAge <= 25.5) return "rebuilding";
    if (coreAge >= 28.5) return "win-now";
    return "balanced";
  }
  const pct = leagueCoreAges.filter((a) => a <= coreAge).length / leagueCoreAges.length;
  if (pct >= 0.75) return "win-now";
  if (pct <= 0.25) return "rebuilding";
  return "balanced";
}

export function analyzeRoster(h: LeagueHistory, rosterId: number): RosterAnalysis {
  const roster = h.rostersById.get(rosterId);
  // Cached: this is called once PER ROSTER by leagueValueRanking below, and every
  // call needs the identical league-wide value map - see cachedValuePlayers for why
  // recomputing it 14 times over was the single biggest cold-start cost found.
  const valuesMap: Map<string, ValueBreakdown> = cachedValuePlayers(h);
  // Tiers break at natural cliffs in the LEAGUE-WIDE value distribution (not at
  // hardcoded thresholds, and not per-roster - a "Franchise" label has to mean the
  // same thing on every team's page). The floor (10% of the top asset) bounds the
  // cliff search to assets anyone actually tiers; same recipe as /values, so the
  // labels agree everywhere.
  const leagueValuesDesc = [...valuesMap.values()]
    .map((v) => v.value)
    .filter((v) => v > 0)
    .sort((a, b) => b - a);
  const tierFor = tierResolver(
    leagueTiers(leagueValuesDesc),
  );
  const valued: ValuedPlayer[] = (roster?.players ?? [])
    .map((pid) => {
      const p = h.players.get(pid);
      if (!p) return null;
      const v = valuesMap.get(pid)!;
      return {
        playerId: pid,
        name: p.fullName,
        team: p.team,
        position: p.position,
        age: p.age,
        injury: injuryLabel(
          {
            status: p.injuryStatus,
            bodyPart: p.injuryBodyPart,
            notes: p.injuryNotes,
          },
          { short: true },
        ),
        injuryDetail: injuryLabel({
          status: p.injuryStatus,
          bodyPart: p.injuryBodyPart,
          notes: p.injuryNotes,
        }),
        value: v.value,
        tier: tierFor(v.value)?.label ?? "Fringe",
        espnId: p.espnId,
        consensusRank: p.searchRank,
        breakdown: {
          base: v.base,
          age: v.ageMultiplier,
          injury: v.injuryMultiplier,
          role: v.roleMultiplier,
          position: v.positionMultiplier,
        },
      };
    })
    .filter(Boolean) as ValuedPlayer[];
  valued.sort((a, b) => b.value - a.value);

  const playerValue = valued.reduce((s, v) => s + v.value, 0);
  const picks = pickCapital(h, rosterId);
  const totalValue = playerValue + picks.total;

  // Core age: value-weighted average of the top 8 by value.
  const top = valued.slice(0, 8).filter((v) => v.age != null);
  const wsum = top.reduce((s, v) => s + v.value, 0);
  const coreAge = wsum
    ? Math.round((top.reduce((s, v) => s + v.age! * v.value, 0) / wsum) * 10) / 10
    : null;

  // Positional strength.
  const posMap = new Map<string, { count: number; value: number }>();
  for (const v of valued) {
    const pos = v.position ?? "?";
    const cur = posMap.get(pos) ?? { count: 0, value: 0 };
    cur.count++;
    cur.value += v.value;
    posMap.set(pos, cur);
  }
  const byPosition = POS_ORDER.filter((p) => posMap.has(p)).map((pos) => ({
    pos,
    count: posMap.get(pos)!.count,
    value: posMap.get(pos)!.value,
  }));

  // Window read. Absolute thresholds here are a fallback for a standalone call with no
  // league context - `leagueValueRanking` below overrides this with the league-relative
  // version, which is the one every page should actually be showing.
  const window = relativeWindow(coreAge);

  const user = roster?.ownerId ? h.usersById.get(roster.ownerId) : undefined;

  return {
    rosterId,
    ownerName: user?.displayName ?? `Roster ${rosterId}`,
    teamName: user?.teamName ?? null,
    valued,
    totalValue,
    playerValue,
    picks,
    coreAge,
    byPosition,
    window,
    record: { wins: roster?.settings.wins ?? 0, losses: roster?.settings.losses ?? 0 },
  };
}

/** Total roster value for every team, for league-wide ranking. */
export function leagueValueRanking(h: LeagueHistory): RosterAnalysis[] {
  const analyses = h.rosters.map((r) => analyzeRoster(h, r.rosterId));
  const leagueCoreAges = analyses
    .map((a) => a.coreAge)
    .filter((a): a is number => a != null);
  return analyses
    .map((a) => ({ ...a, window: relativeWindow(a.coreAge, leagueCoreAges) }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

// ---------------------------------------------------------------- current form

/**
 * A team's most recent COMPLETED-ENOUGH standing, as distinct from the live season.
 *
 * `h.rosters` is always the current league's snapshot, and for most of a dynasty
 * league's calendar the current league is sitting in `pre_draft` with every record at
 * 0-0 - the season hasn't tipped off yet. Reading only the live snapshot means the app
 * has no way to say "this team just went 15-5 and is clearly playing to win" for
 * months at a time, which is a real gap: dynasty POSTURE (below) is a multi-season
 * asset-duration read and deliberately does not track wins and losses, so nothing else
 * in the app surfaces recent competitive form at all.
 *
 * The fix is the same "has this season actually been played" check `strengthRanks` in
 * lib/picks.ts already uses for the pick-order fallback: walk the chain from the
 * newest season backward and use the newest one where somebody has a real record. On a
 * fixture or a league with no completed season yet, this returns nothing rather than
 * fabricate a number, and callers fall back to their existing zero-record display.
 */
export interface CurrentForm {
  season: string;
  /** False when this is a fallback to the last COMPLETED season, not the live one. */
  isLive: boolean;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  /** 1 = best record in the league that season. */
  rank: number;
  teams: number;
}

/**
 * Standings for ONE season's roster snapshot: win differential first, then points as
 * the tiebreak. Pulled out of `currentFormByRoster` so any caller that already knows
 * which season it wants (rather than "whichever one was last played") can get the
 * identical ranking instead of re-deriving it - e.g. a season recap, which needs the
 * last COMPLETE season specifically, a stricter bar than "played at all".
 */
export function rankSeasonRosters(
  rosters: Roster[],
  season: string,
  isLive: boolean,
): Map<number, CurrentForm> {
  const ranked = [...rosters].sort((a, b) => {
    const aw = a.settings.wins - a.settings.losses;
    const bw = b.settings.wins - b.settings.losses;
    if (bw !== aw) return bw - aw;
    return b.settings.fpts - a.settings.fpts;
  });

  const out = new Map<number, CurrentForm>();
  ranked.forEach((r, i) => {
    out.set(r.rosterId, {
      season,
      isLive,
      wins: r.settings.wins,
      losses: r.settings.losses,
      ties: r.settings.ties,
      fpts: r.settings.fpts,
      rank: i + 1,
      teams: ranked.length,
    });
  });
  return out;
}

export async function currentFormByRoster(
  h: LeagueHistory,
): Promise<Map<number, CurrentForm>> {
  const bySeason = await loadSeasonRosters(h);
  const seasonsDesc = [...bySeason.keys()].sort((a, b) => b.localeCompare(a));

  for (const season of seasonsDesc) {
    const rosters = bySeason.get(season)!;
    const played = rosters.some(
      (r) => r.settings.wins + r.settings.losses > 0 || r.settings.fpts > 0,
    );
    if (!played) continue;
    return rankSeasonRosters(rosters, season, season === h.currentLeague.season);
  }
  return new Map();
}
