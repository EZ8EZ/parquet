/**
 * Loads this week for one roster. The week itself is the lock-in engine's WeekDesk
 * (lib/lockin/source.js); this adds the season context and league deadlines around it.
 * The bottom bar's figure is one matchups request and never loads the desk.
 */
import { seasonPhase } from "../actions/index.js";
import { loadLockDesk, sleeperFetchJson } from "../lockin/source.js";
import { schemas, urls } from "../lockin/load.js";
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

export async function loadWeek(h, rosterId, { now = new Date(), replay = null, assume = null } = {}) {
  const ctx = weekContext(h, now);
  const desk = ctx.offseason || rosterId == null ? null : await loadLockDesk({ rosterId, players: h.players, replay, assume });
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

/**
 * First paint for Home's week: the seven slot scores from the matchup row alone (two
 * uncached requests the engine then reuses from its 30 s share), shown while the full
 * desk with lock states and forecasts loads. Null off the live provider.
 */
export async function loadSlotPreview(h, rosterId) {
  const ctx = weekContext(h);
  if (!ctx.live || ctx.offseason || rosterId == null) return null;
  try {
    const state = await sleeperFetchJson(urls.state(), { schema: schemas.state });
    const week = state?.week ?? ctx.week;
    if (week == null) return null;
    const rows = await sleeperFetchJson(urls.matchups(h.currentLeague.leagueId, week), { schema: schemas.matchups });
    const mine = (rows || []).find((m) => m.roster_id === rosterId);
    if (!mine) return null;
    return { week, slots: ctx.labels.map((label, i) => ({ label, playerId: mine.starters?.[i] && mine.starters[i] !== "0" ? mine.starters[i] : null, banked: mine.starters_points?.[i] ?? null })) };
  } catch {
    return null;
  }
}

/** The bottom bar's one figure: starting slots showing a score, or null. One request. */
export async function loadScoredCount(h, rosterId) {
  const ctx = weekContext(h);
  if (!ctx.live || ctx.week == null || rosterId == null) return null;
  const rows = await sleeperFetchJson(urls.matchups(h.currentLeague.leagueId, ctx.week), { schema: schemas.matchups });
  const m = (rows || []).find((r) => r.roster_id === rosterId) ?? null;
  const c = scoredCount(ctx.labels, m && { starters: m.starters, startersPoints: m.starters_points });
  return c ? { ...c, week: ctx.week } : null;
}
