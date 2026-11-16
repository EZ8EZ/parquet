/**
 * THIS WEEK, around the lock-in engine. The week itself (slots, lock states, games
 * left, decisions) is lib/lockin's WeekDesk, the one source of truth; this module keeps
 * what Home needs beside it: dates, league deadlines, the injured starters read off the
 * desk, and the bottom bar's one cheap figure. The loader is ./load.js.
 */

/** NBA game dates are US Eastern; "today" means today there. */
export const LEAGUE_TZ = "America/New_York";

const NON_STARTING = new Set(["BN", "IR", "TAXI"]);

export function leagueToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LEAGUE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const toMs = (iso) => Date.parse(`${iso}T00:00:00Z`);

/** "Mon Nov 9" - a calendar date, rendered without any timezone shift. */
export function formatDay(iso, { weekday = true } = {}) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...(weekday ? { weekday: "short" } : {}),
    month: "short",
    day: "numeric",
  }).format(new Date(toMs(iso)));
}

/** "Nov 9–15" or "Oct 26–Nov 1". */
export function formatRange(start, end) {
  if (!start || !end) return null;
  const a = formatDay(start, { weekday: false });
  const b = formatDay(end, { weekday: false });
  return a.slice(0, 3) === b.slice(0, 3) ? `${a}–${b.slice(4)}` : `${a}–${b}`;
}

/** The starting slots, in Sleeper's `roster_positions` order. */
export function slotLabels(rosterPositions) {
  return (rosterPositions ?? []).filter((p) => !NON_STARTING.has(p));
}

/**
 * The bottom bar's figure from the matchup row alone: how many starting slots show a
 * score above 0. Deliberately not "banked" or "locked": Sleeper does not expose lock
 * state, and a reset slot can show 0 after its player has played.
 */
export function scoredCount(labels, matchup) {
  if (!matchup) return null;
  const pts = matchup.startersPoints ?? [];
  const of = (labels ?? []).length;
  let scored = 0;
  for (let i = 0; i < of; i++) {
    const id = matchup.starters?.[i];
    if (id && id !== "0" && typeof pts[i] === "number" && pts[i] > 0) scored++;
  }
  return { scored, of };
}

/** Header figures from a WeekDesk: points showing, and slot states counted. */
export function deskHeader(desk) {
  if (!desk || desk.status !== "in_season") return null;
  const s = desk.slotPressure?.summary;
  const points = Math.round(desk.slots.reduce((t, x) => t + (x.banked ?? 0), 0) * 10) / 10;
  return {
    range: desk.dateWindow ? formatRange(desk.dateWindow.start, desk.dateWindow.end) : null,
    points,
    locked: s?.lockedCertain ?? 0,
    open: s ? (s.openMin === s.openMax ? `${s.openMax}` : `${s.openMin}-${s.openMax}`) : null,
    live: desk.cards.filter((c) => c.urgencyRank <= 1).length,
  };
}

/**
 * Starters with an injury tag and games still to play, with games left from the desk's
 * schedule. Those already on a live card (a hazard) are left to that card.
 */
export function injuredFromDesk(desk) {
  return (desk?.cards ?? [])
    .filter((c) => c.role === "starter" && c.injury?.status && c.gamesLeft > 0 && c.urgencyRank > 1)
    .sort((a, b) => (a.slotIndex ?? 99) - (b.slotIndex ?? 99))
    .map((c) => ({
      playerId: c.playerId,
      name: c.name,
      label: c.slotLabel,
      status: c.injury.status,
      bodyPart: c.injury.bodyPart,
      gamesLeft: c.gamesLeft,
      nextDay: c.nextGame?.day ?? null,
    }));
}

const DEADLINES = [
  { id: "taxi", key: "taxi_deadline", label: "Taxi squad closes", at: "end" },
  { id: "trade", key: "trade_deadline", label: "Trade deadline", at: "end" },
  {
    id: "playoffs",
    key: "playoff_week_start",
    label: "Playoffs start",
    at: "start",
  },
];

/**
 * League deadlines that are still ahead of `week`, read from league settings.
 * A deadline at the END of week N is still ahead during week N until that week's
 * games are over. With no current week, nothing can be called ahead, so each one
 * comes back with `weeksAway: null`.
 */
export function deadlinesAhead(settings, week, { weekEnded = false } = {}) {
  const out = [];
  for (const d of DEADLINES) {
    const n = settings?.[d.key];
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) continue;
    if (week == null) {
      out.push({ id: d.id, label: d.label, week: n, at: d.at, weeksAway: null });
      continue;
    }
    const ahead =
      d.at === "end" ? week < n || (week === n && !weekEnded) : week < n;
    if (!ahead) continue;
    out.push({ id: d.id, label: d.label, week: n, at: d.at, weeksAway: n - week });
  }
  return out.sort((a, b) => a.week - b.week);
}
