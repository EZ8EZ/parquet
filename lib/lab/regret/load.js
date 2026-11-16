import { buildRegretLedger } from "./index.js";
import { buildSlotPar } from "./slotPar.js";
import { loadLockInWeek, loadPlayerSeasons } from "./source.js";
import { gapFrom, setAuxGaps } from "../../util/gaps.js";
/**
 * Seasons that have lock-in weeks to read, newest first.
 *
 * `last_scored_leg` is the league's own statement about how far it got, so a season
 * that has not tipped off (the current one sits in `pre_draft` for most of a dynasty
 * calendar) reports 0 and is offered as unplayed rather than as an empty ledger.
 */
export function regretSeasons(h) {
  return h.chain
    .map((c) => ({
      season: c.season,
      leagueId: c.leagueId,
      lastScoredWeek: c.settings.last_scored_leg ?? 0,
      playoffWeekStart:
        c.settings.playoff_week_start ?? Number.MAX_SAFE_INTEGER,
      scoring: c.scoringSettings,
      slotLabels: c.rosterPositions.filter((p) => p !== "BN"),
      lockIn: c.settings.game_mode === 1,
      // The season is over: its lineups and game logs are cached forever.
      complete: c.status === "complete",
    }))
    .sort((a, b) => b.season.localeCompare(a.season));
}
/**
 * Read one manager's lock-in season.
 *
 * Cost, measured on the real league: 23 lineup requests plus one per player who spent
 * a week on the roster (30 to 60), and ~1.9s wall clock for four rosters' worth of
 * players at a fan-out of 8 when nothing is cached. Every request goes through the
 * shared Sleeper client and its fetch-cache lifetimes, so a second manager (or a second
 * instance) pays only for players nobody has read yet. Failed requests are returned in
 * `gaps` and published to the layout's banner.
 */
export async function loadRegretLedger(h, rosterId, option) {
  const slotLabels = option.slotLabels;
  const weeks = Array.from({ length: option.lastScoredWeek }, (_, i) => i + 1);
  const complete = !!option.complete;
  const gaps = [];
  const perWeek = await Promise.all(
    weeks.map(async (week) => {
      try {
        return await loadLockInWeek(option.leagueId, week, { complete });
      } catch (err) {
        gaps.push(
          gapFrom(err, {
            endpoint: "matchups",
            season: option.season,
            week,
            id: option.leagueId,
          }),
        );
        // A single unreachable week drops out of the ledger rather than sinking it,
        // and narrows par rather than voiding it. The surface prints the slot count
        // par was actually built from, so a short read is visible instead of silent.
        return [];
      }
    }),
  );
  const matchups = perWeek
    .map((all) => all.find((m) => m.rosterId === rosterId) ?? null)
    .filter((m) => m !== null);
  // Every roster's every slot, this season. Zeros and negatives are classified inside
  // `buildSlotPar`, not filtered here - see that file for why they are not low scores.
  const par = buildSlotPar(
    perWeek.flatMap((week) =>
      week.flatMap((m) =>
        m.starters.map((pid, i) => ({
          playerId: pid && pid !== "0" ? pid : null,
          points: m.startersPoints[i] ?? 0,
        })),
      ),
    ),
  );
  const playerIds = new Set();
  for (const m of matchups) for (const pid of m.players) playerIds.add(pid);
  const games = await loadPlayerSeasons([...playerIds], option.season, 8, {
    complete,
    gaps,
  });
  setAuxGaps("regret", gaps);
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
      playerNames: new Map([...h.players].map(([id, p]) => [id, p.fullName])),
      playoffWeekStart: option.playoffWeekStart,
    }),
    par,
    playersFetched: playerIds.size,
    weeksRead: matchups.length,
    gaps,
    slotLabels,
  };
}
