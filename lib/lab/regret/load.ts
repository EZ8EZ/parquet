/**
 * The regret ledger's orchestration: which season, which weeks, which players.
 *
 * Kept apart from ./index (pure, fully tested) and ./source (network, memoized) so
 * the arithmetic can be exercised without a socket and the fetching can be reasoned
 * about on its own. This file is the only place the two meet, and it is reached ONLY
 * from /lab/regret - never from `assembleCorpus()`.
 */
import type { LeagueHistory } from "../../history";
import { buildRegretLedger, type RegretLedger } from "./index";
import { loadLockInWeek, loadPlayerSeasons } from "./source";

export interface SeasonOption {
  season: string;
  leagueId: string;
  /** The last week the platform scored. 0 for a season that has not been played. */
  lastScoredWeek: number;
  playoffWeekStart: number;
  /**
   * THAT season's scoring and starting slots, not today's. Both are league settings
   * that can be changed between seasons, and grading a 2023 lineup under a 2026
   * scoring line would be the same class of error as applying today's position
   * eligibility to a past week.
   */
  scoring: Record<string, number>;
  slotLabels: string[];
  /** True when the league is scored in lock-in mode (`game_mode: 1`). */
  lockIn: boolean;
}

/**
 * Seasons that have lock-in weeks to read, newest first.
 *
 * `last_scored_leg` is the league's own statement about how far it got, so a season
 * that has not tipped off (the current one sits in `pre_draft` for most of a dynasty
 * calendar) reports 0 and is offered as unplayed rather than as an empty ledger.
 */
export function regretSeasons(h: LeagueHistory): SeasonOption[] {
  return h.chain
    .map((c) => ({
      season: c.season,
      leagueId: c.leagueId,
      lastScoredWeek: c.settings.last_scored_leg ?? 0,
      playoffWeekStart: c.settings.playoff_week_start ?? Number.MAX_SAFE_INTEGER,
      scoring: c.scoringSettings,
      slotLabels: c.rosterPositions.filter((p) => p !== "BN"),
      lockIn: c.settings.game_mode === 1,
    }))
    .sort((a, b) => b.season.localeCompare(a.season));
}

export interface LoadedLedger {
  ledger: RegretLedger;
  /** Distinct players whose box scores were requested. The dominant request cost. */
  playersFetched: number;
  /** Weeks of lineups read. One request each. */
  weeksRead: number;
  /** The starting slots, from `roster_positions`. Seven here. */
  slotLabels: string[];
}

/**
 * Read one manager's lock-in season.
 *
 * Cost, measured on the real league: 23 lineup requests plus one per player who spent
 * a week on the roster (30 to 60), and ~1.9s wall clock for four rosters' worth of
 * players at a fan-out of 8. Everything is memoized for 30 minutes in-process, so a
 * second manager in the same season pays only for players the first did not hold.
 */
export async function loadRegretLedger(
  h: LeagueHistory,
  rosterId: number,
  option: SeasonOption,
): Promise<LoadedLedger> {
  const slotLabels = option.slotLabels;
  const weeks = Array.from({ length: option.lastScoredWeek }, (_, i) => i + 1);

  const perWeek = await Promise.all(
    weeks.map(async (week) => {
      try {
        const all = await loadLockInWeek(option.leagueId, week);
        return all.find((m) => m.rosterId === rosterId) ?? null;
      } catch {
        // A single unreachable week drops out of the ledger rather than sinking it.
        return null;
      }
    }),
  );
  const matchups = perWeek.filter((m) => m !== null);

  const playerIds = new Set<string>();
  for (const m of matchups) for (const pid of m.players) playerIds.add(pid);

  const games = await loadPlayerSeasons([...playerIds], option.season);

  return {
    ledger: buildRegretLedger({
      season: option.season,
      rosterId,
      matchups: matchups.map((m) => ({
        week: m.week,
        starters: m.starters,
        startersPoints: m.startersPoints,
        players: m.players,
      })),
      games,
      scoring: option.scoring,
      slotLabels,
      playerNames: new Map(
        [...h.players].map(([id, p]) => [id, p.fullName] as [string, string]),
      ),
      playoffWeekStart: option.playoffWeekStart,
    }),
    playersFetched: playerIds.size,
    weeksRead: matchups.length,
    slotLabels,
  };
}
