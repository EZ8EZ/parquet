/**
 * Loads this week for one roster: Sleeper's matchup row (the seven slots) and the
 * starters' game logs (dates and games played). Both loaders are memoized for 30
 * minutes in lib/lab/regret/source.js. Only the live Sleeper provider has real
 * league ids, so every other provider gets `available: false` without a request.
 */
import { seasonPhase } from "../actions/index.js";
import { loadLockInWeek, loadPlayerSeasons } from "../lab/regret/source.js";
import {
  bankedCount,
  bankedPoints,
  deadlinesAhead,
  gameDatesByWeek,
  injuredStarters,
  leagueToday,
  slotLabels,
  weekSlots,
  weekStatus,
  weekWindow,
} from "./index.js";

const OFFSEASON_STATUSES = new Set(["pre_draft", "drafting", "complete"]);

export function weekContext(h, now = new Date()) {
  const sp = seasonPhase(h);
  const league = h.currentLeague ?? {};
  const offseason =
    sp.phase === "preseason" || OFFSEASON_STATUSES.has(league.status);
  return {
    week: offseason ? null : sp.week,
    phase: offseason ? "offseason" : sp.phase,
    offseason,
    season: league.season ?? null,
    today: leagueToday(now),
    labels: slotLabels(league.rosterPositions),
    lockIn: league.settings?.game_mode === 1,
    live: h.provider === "sleeper",
  };
}

async function myMatchup(h, ctx, rosterId) {
  if (!ctx.live || ctx.week == null || rosterId == null) return null;
  try {
    const rows = await loadLockInWeek(h.currentLeague.leagueId, ctx.week);
    return rows.find((m) => m.rosterId === rosterId) ?? null;
  } catch {
    return null;
  }
}

function unavailableReason(ctx, matchup) {
  if (ctx.offseason) return "offseason";
  if (!ctx.live) return "provider";
  if (ctx.week == null) return "no-week";
  if (!matchup) return "no-matchup";
  return null;
}

export async function loadWeek(h, rosterId, { now = new Date() } = {}) {
  const ctx = weekContext(h, now);
  const matchup = await myMatchup(h, ctx, rosterId);
  const starters = (matchup?.starters ?? []).filter((id) => id && id !== "0");
  let seasons = new Map();
  if (starters.length && ctx.season) {
    seasons = await loadPlayerSeasons(starters, ctx.season).catch(
      () => new Map(),
    );
  }
  const gamesThisWeek = new Map(
    [...seasons].map(([id, byWeek]) => [
      id,
      (byWeek.get(ctx.week) ?? []).filter((g) => g.secondsPlayed > 0).length,
    ]),
  );
  const window = weekWindow(gameDatesByWeek(seasons), ctx.week, ctx.today);
  const slots = weekSlots({
    labels: ctx.labels,
    matchup,
    players: h.players,
    gamesThisWeek,
  });
  return {
    ...ctx,
    available: matchup != null,
    reason: unavailableReason(ctx, matchup),
    window,
    slots,
    banked: bankedCount(slots),
    points: bankedPoints(slots),
    status: weekStatus(
      window,
      ctx.week,
      h.currentLeague?.settings?.last_scored_leg,
    ),
    injured: injuredStarters(slots, window?.state),
    deadlines:
      h.currentLeague?.status === "complete"
        ? []
        : deadlinesAhead(h.currentLeague?.settings, ctx.week, {
            weekEnded: window?.state === "ended",
          }),
  };
}

/** The bottom bar's one figure: slots banked this week, or null. One request. */
export async function loadBankedCount(h, rosterId) {
  const ctx = weekContext(h);
  const matchup = await myMatchup(h, ctx, rosterId);
  if (!matchup) return null;
  const slots = weekSlots({ labels: ctx.labels, matchup });
  return { banked: bankedCount(slots), of: slots.length, week: ctx.week };
}
