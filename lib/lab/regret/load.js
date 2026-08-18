import { buildRegretLedger } from "./index.js";
import { buildSlotPar } from "./slotPar.js";
import { loadLockInWeek, loadPlayerSeasons } from "./source.js";
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
    }))
    .sort((a, b) => b.season.localeCompare(a.season));
}
/**
 * Read one manager's lock-in season.
 *
 * Cost, measured on the real league: 23 lineup requests plus one per player who spent
 * a week on the roster (30 to 60), and ~1.9s wall clock for four rosters' worth of
 * players at a fan-out of 8. Everything is memoized for 30 minutes in-process, so a
 * second manager in the same season pays only for players the first did not hold.
 */
export async function loadRegretLedger(h, rosterId, option) {
  const slotLabels = option.slotLabels;
  const weeks = Array.from({ length: option.lastScoredWeek }, (_, i) => i + 1);
  const perWeek = await Promise.all(
    weeks.map(async (week) => {
      try {
        return await loadLockInWeek(option.leagueId, week);
      } catch {
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
      playerNames: new Map([...h.players].map(([id, p]) => [id, p.fullName])),
      playoffWeekStart: option.playoffWeekStart,
    }),
    par,
    playersFetched: playerIds.size,
    weeksRead: matchups.length,
    slotLabels,
  };
}
