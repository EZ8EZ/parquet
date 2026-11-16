/**
 * Loads this week for one roster. The week itself is the lock-in engine's WeekDesk
 * (lib/lockin/source.js); this adds the season context and league deadlines around it.
 * The bottom bar's figure is one matchups request and never loads the desk.
 */
import { seasonPhase } from "../actions/index.js";
import { loadLockInWeek } from "../lab/regret/source.js";
import { loadLockDesk } from "../lockin/source.js";
import { deadlinesAhead, deskHeader, injuredFromDesk, leagueToday, scoredCount, slotLabels } from "./index.js";

const OFFSEASON_STATUSES = new Set(["pre_draft", "drafting", "complete"]);
const DAY_MS = 86_400_000;

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

/** The deadline strip's window, from the desk's dates. */
export function deskWindow(desk) {
  const w = desk?.dateWindow;
  if (!w) return null;
  const t = desk.today;
  const state = t < w.start ? "upcoming" : t > w.end ? "ended" : "live";
  const daysLeft = state === "live" ? Math.round((Date.parse(`${w.end}T00:00:00Z`) - Date.parse(`${t}T00:00:00Z`)) / DAY_MS) : null;
  return { start: w.start, end: w.end, state, daysLeft };
}

export async function loadWeek(h, rosterId, { now = new Date(), replay = null } = {}) {
  const ctx = weekContext(h, now);
  const desk = ctx.offseason || rosterId == null ? null : await loadLockDesk({ rosterId, players: h.players, replay });
  const week = desk?.week ?? ctx.week;
  const window = deskWindow(desk);
  const weekEnded = desk?.status === "between_weeks" || window?.state === "ended";
  return {
    ...ctx,
    week,
    desk,
    header: deskHeader(desk),
    window,
    injured: injuredFromDesk(desk),
    deadlines:
      h.currentLeague?.status === "complete"
        ? []
        : deadlinesAhead(h.currentLeague?.settings, week, { weekEnded }),
  };
}

/** The bottom bar's one figure: starting slots showing a score, or null. One request. */
export async function loadScoredCount(h, rosterId) {
  const ctx = weekContext(h);
  if (!ctx.live || ctx.week == null || rosterId == null) return null;
  const rows = await loadLockInWeek(h.currentLeague.leagueId, ctx.week);
  const mine = rows.find((m) => m.rosterId === rosterId) ?? null;
  const c = scoredCount(ctx.labels, mine);
  return c ? { ...c, week: ctx.week } : null;
}
