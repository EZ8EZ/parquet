/**
 * Week resolution and dates. The schedule has game dates (US calendar) but no tip
 * times, so every deadline is "before his next game on <day>". Weeks run Monday to
 * Sunday by the schedule's `week` field (study section 1, n=2,298 banked games).
 */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** YYYY-MM-DD for `now` on the US Eastern calendar, the calendar schedule dates use. */
export function easternDate(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function dayLabel(date) {
  return DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

/** Deadline wording for a decision tied to a game date. */
export function deadlineText(date, today) {
  if (!date) return null;
  const when = date === today ? "tonight" : `on ${dayLabel(date)}`;
  return `before his next game ${when}`;
}

function weekGames(scheduleIdx, week) {
  return [...scheduleIdx.games.values()].filter((g) => g.week === week);
}

export function dateWindow(scheduleIdx, week) {
  const ds = weekGames(scheduleIdx, week).map((g) => g.date).sort();
  return ds.length ? { start: ds[0], end: ds[ds.length - 1], games: ds.length } : null;
}

/**
 * Which fantasy week the desk shows.
 * -> { kind: "week", week, source } | { kind: "between_weeks", ... } | { kind: "offseason", reason }
 * Rollover: when the state week's games are all final and the next week's first game is
 * today or earlier, the next week is shown (/state/nba flip time is unmeasured).
 * @param {{ state: any, league: any, scheduleIdx: any, today: string, weekOverride?: number|null }} a */
export function resolveWeek({ state, league, scheduleIdx, today, weekOverride }) {
  if (weekOverride != null) return { kind: "week", week: weekOverride, source: "override" };
  if (!league || league.status !== "in_season")
    return { kind: "offseason", reason: `league status ${league?.status ?? "unknown"}` };
  if (!state || state.season_type !== "regular")
    return { kind: "offseason", reason: `NBA season type ${state?.season_type ?? "unknown"}` };
  if (String(state.season) !== String(league.season))
    return { kind: "offseason", reason: `NBA season ${state.season} is not league season ${league.season}` };
  const w = Number(state.week);
  const games = weekGames(scheduleIdx, w);
  const nextStart = (from) => {
    const later = [...scheduleIdx.games.values()].filter((g) => g.week > from).sort((a, b) => (a.date < b.date ? -1 : 1));
    return later.length ? { week: later[0].week, date: later[0].date } : null;
  };
  if (!games.length) {
    const nx = nextStart(w);
    if (!nx) return { kind: "offseason", reason: "no remaining games on the schedule" };
    return { kind: "between_weeks", completedWeek: w - 1, nextWeek: nx.week, nextWeekStart: nx.date };
  }
  if (games.every((g) => g.status === "complete" || g.status === "canceled")) {
    const nx = nextStart(w);
    if (!nx) return { kind: "offseason", reason: "final week complete" };
    if (nx.date <= today) return { kind: "week", week: nx.week, source: "schedule_rollover" };
    return { kind: "between_weeks", completedWeek: w, nextWeek: nx.week, nextWeekStart: nx.date };
  }
  return { kind: "week", week: w, source: "state" };
}

// lockin-fixes: one display zone for every time the desk returns. Listed starts and deadlines
// are ISO strings carrying this zone's offset, e.g. 2026-11-26T19:00:00-05:00.
export const DISPLAY_TZ = "America/New_York";

/** ISO time with the offset of `tz` at that instant. */
export function isoInZone(ms, tz = DISPLAY_TZ) {
  if (ms == null || !Number.isFinite(ms)) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const off = Math.round((local - Math.floor(ms / 1000) * 1000) / 60000);
  const sign = off < 0 ? "-" : "+";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const mm = String(Math.abs(off) % 60).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${hh}:${mm}`;
}
