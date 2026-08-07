/**
 * SCHEDULE LUCK — the third leg alongside fpts and ppts.
 *
 * `ppts` (see skill.ts) answers "did you start the right guys." This answers a
 * different question: "did the schedule flatter your record, or bury it." Two
 * managers who score identically over a season can finish 12-8 and 8-12 purely
 * because of who they happened to play each week - that gap is real and it is not
 * skill, so a league that only ever shows W-L is quietly crediting the schedule.
 *
 * TWO METHODS, PICKED PER SEASON BY WHAT DATA ACTUALLY EXISTS:
 *
 *   ALL-PLAY (`method: "all-play"`) is the honest way to answer this: replay every
 *   week against every other roster in the league, not just the one you were
 *   actually paired against, and see how many of those games you'd have won. It
 *   needs the week-by-week matchup data. `lib/history.ts` documents that matchups
 *   are loaded FIXTURE-ONLY - fetching them live costs ~110 requests / 15s per the
 *   comment on `loadMatchups`, and that bill was already judged not worth paying
 *   once this round (the "tilt" signal). This module does not re-litigate that: it
 *   uses `h.matchups` exactly as the corpus already provides it, which means
 *   all-play is available for the fixture demo and NOT for the live Sleeper league.
 *
 *   AGGREGATE (`method: "aggregate"`) is the fallback, and it is what actually runs
 *   for the live league: a Pythagorean-style expected win rate from the season
 *   totals the platform already computes and the corpus already loads for free -
 *   `RosterSettings.fpts` / `fptsAgainst`. It is a real, standard sports-analytics
 *   technique (used exactly this way - as a stand-in for a true schedule-neutral
 *   record when only points-for/against are known - across the NFL/NBA/MLB
 *   analytics literature), not an invented number, but it is a coarser instrument
 *   than all-play: it can't see WHICH weeks were unlucky, only that the season's
 *   scoring and its record disagree. Every value this module returns carries its
 *   `method` so callers can (and should) say which one they're showing.
 *
 * Both methods produce the same shape (`SeasonScheduleLuck`) so career folding and
 * display code never have to branch on which one ran.
 */
import type { LeagueHistory, HistoryMatchup } from "../history";
import type { RosterSettings } from "../providers/types";
import { loadSeasonRosters } from "./skill";
import type { PrincipalIndex } from "../principals";

export interface SeasonScheduleLuck {
  season: string;
  method: "all-play" | "aggregate";
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  /** (wins + 0.5*ties) / gamesPlayed. */
  actualWinPct: number;
  /** All-play or Pythagorean win rate, 0..1 — "what your schedule owed you." */
  expectedWinPct: number;
  /** expectedWinPct * gamesPlayed, in the same units as `wins`. */
  expectedWins: number;
  /**
   * actualWinPct*gamesPlayed - expectedWins. Positive = the schedule (or the
   * scoreboard's coin flips) gave this manager more wins than their output earned;
   * negative = it took wins away. Named "luck" rather than "skill" on purpose -
   * see the module comment.
   */
  luckWins: number;
}

export interface ScheduleLuckProfile {
  ownerId: string;
  /** The last roster this manager held. Display/link only. */
  rosterId: number;
  /** Seasons with a computable number, oldest first. */
  seasons: SeasonScheduleLuck[];
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  actualWinPct: number;
  expectedWinPct: number;
  expectedWins: number;
  /** Summed across seasons — see `foldScheduleLuck` for why summing beats averaging. */
  luckWins: number;
  /** True only if every folded season used all-play. False for any live-league career. */
  allPlay: boolean;
  luckiest: SeasonScheduleLuck | null;
  unluckiest: SeasonScheduleLuck | null;
}

function pct(wins: number, ties: number, games: number): number {
  return games > 0 ? (wins + 0.5 * ties) / games : 0;
}

// ================================================================== all-play

/**
 * True all-play luck for one roster in one season, from the corpus's own matchup
 * rows. Pure: no fetch, no provider — just the rows it's handed.
 *
 * Grouped by WEEK first, deliberately. `matchupId` is only unique within a week (a
 * fresh pairing is drawn every week), so pairing on it alone would silently merge
 * two different weeks' games — and would make a manager who plays the same
 * opponent twice in a season (a real schedule shape, e.g. a rematch) look like a
 * single game instead of two. Scoping every lookup to `(season, week)` is what
 * keeps repeat opponents counted correctly.
 *
 * A week only counts if this roster has exactly one matchup partner that week
 * (a normal paired matchup). Byes, one-team "matchups", and anything with more
 * than two rosters sharing a `matchupId` are skipped for BOTH the actual and the
 * all-play tally, so the two stay computed over the identical set of weeks and
 * `expectedWins` is comparable to `wins`.
 */
export function allPlaySeasonLuck(
  rows: HistoryMatchup[],
  rosterId: number,
  season: string,
): SeasonScheduleLuck | null {
  const byWeek = new Map<number, HistoryMatchup[]>();
  for (const r of rows) {
    if (r.season !== season) continue;
    const list = byWeek.get(r.week) ?? [];
    list.push(r);
    byWeek.set(r.week, list);
  }

  let wins = 0,
    losses = 0,
    ties = 0,
    games = 0;
  let apWins = 0,
    apTies = 0,
    apOpponents = 0;

  for (const weekRows of byWeek.values()) {
    const mine = weekRows.find((r) => r.rosterId === rosterId);
    if (!mine) continue; // bye, or this roster has no row this week
    const others = weekRows.filter((r) => r.rosterId !== rosterId);
    if (others.length === 0) continue; // nothing to play against, actual or all-play

    const opponents = others.filter(
      (o) => mine.matchupId != null && o.matchupId === mine.matchupId,
    );
    if (opponents.length !== 1) continue; // no clean pairing this week — skip it entirely
    const opp = opponents[0];

    games++;
    if (mine.points > opp.points) wins++;
    else if (mine.points < opp.points) losses++;
    else ties++;

    // All-play: this roster's score against EVERY other roster that same week, not
    // just the one it was actually paired against.
    apWins += others.filter((o) => o.points < mine.points).length;
    apTies += others.filter((o) => o.points === mine.points).length;
    apOpponents += others.length;
  }

  if (games === 0 || apOpponents === 0) return null; // no games this season for this roster

  const actualWinPct = pct(wins, ties, games);
  const expectedWinPct = pct(apWins, apTies, apOpponents);
  const expectedWins = expectedWinPct * games;
  return {
    season,
    method: "all-play",
    gamesPlayed: games,
    wins,
    losses,
    ties,
    actualWinPct,
    expectedWinPct,
    expectedWins,
    luckWins: actualWinPct * games - expectedWins,
  };
}

// ================================================================== aggregate

/**
 * Pythagorean-style expected win rate from season point totals alone.
 *
 * `expectedWinPct = fpts^2 / (fpts^2 + fptsAgainst^2)` is the classic form (Bill
 * James' original baseball exponent, before anyone had the data to tune it sport-
 * specific). We don't tune the exponent for this league either — tuning it needs
 * the week-by-week score variance, which is exactly the data this fallback exists
 * because we don't have. Stated as what it is (a standard, untuned proxy) rather
 * than dressed up as a precise number — see DECISIONS.md D4/D6 on transparency
 * over false precision.
 */
export function aggregateSeasonLuck(
  season: string,
  settings: Pick<RosterSettings, "wins" | "losses" | "ties" | "fpts" | "fptsAgainst">,
): SeasonScheduleLuck | null {
  const games = settings.wins + settings.losses + settings.ties;
  if (games <= 0) return null; // no games played this season
  const denom = settings.fpts ** 2 + settings.fptsAgainst ** 2;
  if (!(denom > 0)) return null; // no points recorded (e.g. a season that hasn't started)

  const actualWinPct = pct(settings.wins, settings.ties, games);
  const expectedWinPct = settings.fpts ** 2 / denom;
  const expectedWins = expectedWinPct * games;
  return {
    season,
    method: "aggregate",
    gamesPlayed: games,
    wins: settings.wins,
    losses: settings.losses,
    ties: settings.ties,
    actualWinPct,
    expectedWinPct,
    expectedWins,
    luckWins: actualWinPct * games - expectedWins,
  };
}

/**
 * The one season-level number the app shows: all-play where the corpus already
 * has the week-by-week rows for free (today, the fixture demo only), aggregate
 * everywhere else. Never fetches — both inputs are already in the corpus.
 */
export function seasonScheduleLuck(
  matchups: HistoryMatchup[],
  rosterId: number,
  season: string,
  settings: Pick<RosterSettings, "wins" | "losses" | "ties" | "fpts" | "fptsAgainst">,
): SeasonScheduleLuck | null {
  return (
    allPlaySeasonLuck(matchups, rosterId, season) ??
    aggregateSeasonLuck(season, settings)
  );
}

// ======================================================================= fold

/**
 * Fold per-season luck rows into one career profile. Pure.
 *
 * Sums wins/games/expectedWins before dividing, same reasoning as
 * `foldStartRate`: a 20-week season should outweigh a shortened one, and it keeps
 * `luckWins` additive with the per-season numbers shown alongside it.
 */
export function foldScheduleLuck(
  ownerId: string,
  rosterId: number,
  rows: SeasonScheduleLuck[],
): ScheduleLuckProfile {
  const seasons = [...rows].sort((a, b) => a.season.localeCompare(b.season));
  const gamesPlayed = seasons.reduce((s, r) => s + r.gamesPlayed, 0);
  const wins = seasons.reduce((s, r) => s + r.wins, 0);
  const losses = seasons.reduce((s, r) => s + r.losses, 0);
  const ties = seasons.reduce((s, r) => s + r.ties, 0);
  const expectedWins = seasons.reduce((s, r) => s + r.expectedWins, 0);
  const actualWinPct = pct(wins, ties, gamesPlayed);
  const byLuck = [...seasons].sort((a, b) => b.luckWins - a.luckWins);
  return {
    ownerId,
    rosterId,
    seasons,
    gamesPlayed,
    wins,
    losses,
    ties,
    actualWinPct,
    expectedWinPct: gamesPlayed > 0 ? expectedWins / gamesPlayed : 0,
    expectedWins,
    luckWins: actualWinPct * gamesPlayed - expectedWins,
    allPlay: seasons.length > 0 && seasons.every((s) => s.method === "all-play"),
    luckiest: byLuck[0] ?? null,
    unluckiest: byLuck.length > 1 ? byLuck[byLuck.length - 1] : null,
  };
}

// =================================================================== orchestrator

/**
 * Schedule luck per PRINCIPAL, keyed by owner id — same join as `startRateProfiles`
 * and for the same reason: a roster that changed hands carries two managers'
 * seasons, and crediting one with the other's record would misattribute exactly
 * the thing this module is trying to correct for.
 *
 * Costs nothing beyond `loadSeasonRosters` (already memoized, already paid for by
 * the start-rate pass) — no new fetch. `h.matchups` is read as-is; this module
 * never triggers the live-provider matchup load itself.
 */
export async function scheduleLuckProfiles(
  h: LeagueHistory,
  principals: PrincipalIndex,
): Promise<Map<string, ScheduleLuckProfile>> {
  const bySeason = await loadSeasonRosters(h);

  const rowsByOwner = new Map<string, SeasonScheduleLuck[]>();
  for (const [season, rosters] of bySeason) {
    for (const r of rosters) {
      if (!r.ownerId) continue;
      const row = seasonScheduleLuck(h.matchups, r.rosterId, season, r.settings);
      if (!row) continue;
      const list = rowsByOwner.get(r.ownerId) ?? [];
      list.push(row);
      rowsByOwner.set(r.ownerId, list);
    }
  }

  const out = new Map<string, ScheduleLuckProfile>();
  for (const p of principals.principals) {
    const rows = rowsByOwner.get(p.ownerId);
    if (!rows?.length) continue;
    out.set(p.ownerId, foldScheduleLuck(p.ownerId, p.lastRosterId, rows));
  }
  return out;
}

/** One manager's profile, resolved from whichever roster they hold today. Convenience
 *  wrapper for pages that only need a single team, not the whole league's map. */
export async function scheduleLuckForRoster(
  h: LeagueHistory,
  principals: PrincipalIndex,
  rosterId: number,
): Promise<ScheduleLuckProfile | null> {
  const roster = h.rostersById.get(rosterId);
  if (!roster?.ownerId) return null;
  const all = await scheduleLuckProfiles(h, principals);
  return all.get(roster.ownerId) ?? null;
}
