/**
 * The start line's orchestration: which season, which week, and the four reads it
 * takes to answer "what is in front of me tonight".
 *
 * Kept apart from ./index (pure, tested without a socket) for the reason
 * lib/lab/regret/load.ts is: the arithmetic and the fetching are separately
 * reviewable. This file is the only place the two meet, and it is reached ONLY from
 * /lab/startline. `assembleCorpus()` cannot see it and must never be able to (D25).
 *
 * ---------------------------------------------------------------------------------
 * COST, measured on the real league
 * ---------------------------------------------------------------------------------
 *   Slot par        `lastScoredWeek` lineup requests (23 for 2025) - the distribution
 *                   is this league's own history, so it has to be read.
 *   Week board      1 schedule request (~1.05MB, ~174ms), shared with the game log.
 *   Game log        1 player stats request (~90KB), for the one player being read.
 *
 * 25 requests cold for a full 2025 season, 0 warm inside the 30-minute memo. The
 * lineup reads are the same memo slots /lab/regret fills, so a manager who has just
 * come from the ledger pays for the schedule and nothing else.
 *
 * SLOT PAR ALONE IS ONE REQUEST once the season's lineups are warm, and on a live
 * week it is genuinely one: the current week's lineups are all a live reader needs
 * beyond a distribution that stops changing the moment the season ends.
 */
import type { LeagueHistory } from "../../history";
import {
  loadLockInWeek,
  loadPlayerSeason,
  loadSeasonSchedule,
  type ScheduleGame,
} from "../regret/source";
import {
  buildGameLog,
  buildSlotPar,
  buildWeekBoard,
  type GameLogRow,
  type SlotPar,
  type WeekBoard,
} from "./index";

export interface StartLineSeason {
  season: string;
  leagueId: string;
  /** The last week the platform scored. 0 for a season that has not been played. */
  lastScoredWeek: number;
  /** The week the league says it is currently on. */
  currentWeek: number;
  playoffWeekStart: number;
  /** THAT season's scoring, not today's. */
  scoring: Record<string, number>;
  slotLabels: string[];
  lockIn: boolean;
  /** The league's own status, e.g. "in_season", "complete", "pre_draft". */
  status: string;
}

/**
 * Every season in the chain, newest first.
 *
 * `leg` is the league's own cursor on the week it is playing; `last_scored_leg` is how
 * far it got. For a season that has finished they agree, and for a season that has not
 * tipped off `leg` reads 1 while nothing has been scored - which is why the surface
 * gates on `lastScoredWeek` and not on `leg`.
 */
export function startLineSeasons(h: LeagueHistory): StartLineSeason[] {
  return h.chain
    .map((c) => ({
      season: c.season,
      leagueId: c.leagueId,
      lastScoredWeek: c.settings.last_scored_leg ?? 0,
      currentWeek: c.settings.leg ?? 1,
      playoffWeekStart: c.settings.playoff_week_start ?? Number.MAX_SAFE_INTEGER,
      scoring: c.scoringSettings,
      slotLabels: c.rosterPositions.filter((p) => p !== "BN"),
      lockIn: c.settings.game_mode === 1,
      status: c.status,
    }))
    .sort((a, b) => b.season.localeCompare(a.season));
}

export interface LoadedStartLine {
  season: StartLineSeason;
  /** The week the board and the log are about. */
  week: number;
  /**
   * TRUE when the week is still being played, i.e. the league is in season and the
   * week in view is the one it is on. Everything on the surface that says "left" or
   * "still to play" is only true in this state, and the copy changes when it is false
   * rather than quietly printing zeros as if they were news.
   */
  live: boolean;
  par: SlotPar;
  board: WeekBoard;
  /** The player whose log is open, when one is. */
  logPlayerId: string | null;
  logPlayerName: string | null;
  log: GameLogRow[];
  /** Every rostered player, for the log picker. Slotted first, then the rest. */
  logChoices: { playerId: string; name: string; slotted: boolean }[];
  /** Requests this render actually issued, before the memo. For the cost note. */
  requests: number;
  /** Server time the reads finished. This surface is stale in ten minutes. */
  asOf: number;
  /** True when the season carries no schedule at all, e.g. a pre-draft season. */
  scheduleEmpty: boolean;
}

export async function loadStartLine(
  h: LeagueHistory,
  rosterId: number,
  season: StartLineSeason,
  opts: { week?: number; playerId?: string } = {},
): Promise<LoadedStartLine> {
  const weeks = Array.from({ length: season.lastScoredWeek }, (_, i) => i + 1);
  const inSeason = season.status === "in_season";
  const week = clampWeek(
    opts.week ?? (inSeason ? season.currentWeek : season.lastScoredWeek),
    season,
  );
  const live = inSeason && week === season.currentWeek;

  let requests = 0;

  // ------------------------------------------------------- par + the week's lineups
  const perWeek = await Promise.all(
    weeks.map(async (w) => {
      requests++;
      try {
        return await loadLockInWeek(season.leagueId, w);
      } catch {
        // One unreachable week narrows the distribution rather than sinking it. The
        // surface prints the slot count the par was actually built from, so a short
        // read is visible instead of silent.
        return [];
      }
    }),
  );

  const par = buildSlotPar(
    perWeek.flatMap((wk) =>
      wk.flatMap((m) =>
        m.starters.map((pid, i) => ({
          playerId: pid && pid !== "0" ? pid : null,
          points: m.startersPoints[i] ?? 0,
        })),
      ),
    ),
  );

  const mine = perWeek[week - 1]?.find((m) => m.rosterId === rosterId) ?? null;

  // ------------------------------------------------------------------- the schedule
  requests++;
  let schedule: ScheduleGame[] = [];
  try {
    schedule = await loadSeasonSchedule(season.season);
  } catch {
    // The board degrades to its seven chips. It never guesses at a calendar.
  }

  const playerNames = new Map(
    [...h.players].map(([id, p]) => [id, p.fullName] as [string, string]),
  );
  const playerTeams = new Map(
    [...h.players].map(([id, p]) => [id, p.team] as [string, string | null]),
  );

  const board = buildWeekBoard({
    week,
    starters: mine?.starters ?? [],
    startersPoints: mine?.startersPoints ?? [],
    slotLabels: season.slotLabels,
    players: mine?.players ?? [],
    playerNames,
    playerTeams,
    schedule,
  });

  // -------------------------------------------------------------------- the log
  const slottedIds = new Set(board.slots.map((s) => s.playerId).filter((x) => x != null));
  const logChoices = [...new Set(mine?.players ?? [])]
    .map((pid) => ({
      playerId: pid,
      name: playerNames.get(pid) ?? `Player ${pid}`,
      slotted: slottedIds.has(pid),
    }))
    .sort(
      (a, b) =>
        Number(b.slotted) - Number(a.slotted) || a.name.localeCompare(b.name),
    );

  const logPlayerId =
    opts.playerId && logChoices.some((c) => c.playerId === opts.playerId)
      ? opts.playerId
      : null;

  let log: GameLogRow[] = [];
  if (logPlayerId) {
    requests++;
    try {
      const byWeek = await loadPlayerSeason(logPlayerId, season.season);
      const games = [...byWeek.entries()]
        .sort((a, b) => a[0] - b[0])
        .flatMap(([, g]) => g);
      log = buildGameLog({
        playerId: logPlayerId,
        games,
        schedule: new Map(schedule.map((g) => [g.gameId, g])),
        scoring: season.scoring,
      });
    } catch {
      // An unreadable player leaves the log empty and says so on the surface.
    }
  }

  return {
    season,
    week,
    live,
    par,
    board,
    logPlayerId,
    logPlayerName: logPlayerId
      ? (playerNames.get(logPlayerId) ?? `Player ${logPlayerId}`)
      : null,
    log,
    logChoices,
    requests,
    asOf: Date.now(),
    scheduleEmpty: schedule.length === 0,
  };
}

function clampWeek(week: number, season: StartLineSeason): number {
  if (!Number.isFinite(week)) return season.lastScoredWeek;
  return Math.min(Math.max(1, Math.trunc(week)), Math.max(1, season.lastScoredWeek));
}
