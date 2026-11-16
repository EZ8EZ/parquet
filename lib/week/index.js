/**
 * THIS WEEK, as pure functions over data already loaded: the lock-in slots, the
 * week's date window, deadlines still ahead and injured starters. The loader that
 * fetches the inputs is ./load.js.
 */
import { injuryLabel } from "../valuation/index.js";

/** NBA game dates are US Eastern; "today" means today there. */
export const LEAGUE_TZ = "America/New_York";

const DAY_MS = 86_400_000;
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
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);

function mondayOf(iso) {
  const ms = toMs(iso);
  const dow = new Date(ms).getUTCDay();
  return ms - ((dow + 6) % 7) * DAY_MS;
}

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
  return a.slice(0, 3) === b.slice(0, 3)
    ? `${a}–${b.slice(4)}`
    : `${a}–${b}`;
}

/** The starting slots, in Sleeper's `roster_positions` order. */
export function slotLabels(rosterPositions) {
  return (rosterPositions ?? []).filter((p) => !NON_STARTING.has(p));
}

/**
 * The week's Monday-to-Sunday window, read off the dates games were actually played.
 * A week with no games yet is placed seven days per week after the latest week that
 * has some. Null when no game dates are known at all.
 */
export function weekWindow(datesByWeek, week, today) {
  if (week == null || !datesByWeek) return null;
  let anchorWeek = null;
  let anchorStart = null;
  const own = datesByWeek.get(week) ?? [];
  if (own.length) {
    anchorWeek = week;
    anchorStart = mondayOf([...own].sort()[0]);
  } else {
    const earlier = [...datesByWeek.entries()]
      .filter(([w, ds]) => w < week && ds.length > 0)
      .sort((a, b) => b[0] - a[0])[0];
    if (!earlier) return null;
    anchorWeek = earlier[0];
    anchorStart = mondayOf([...earlier[1]].sort()[0]);
  }
  const startMs = anchorStart + (week - anchorWeek) * 7 * DAY_MS;
  const start = toIso(startMs);
  const end = toIso(startMs + 6 * DAY_MS);
  let state = null;
  let daysLeft = null;
  if (today) {
    state = today < start ? "upcoming" : today > end ? "ended" : "live";
    daysLeft =
      state === "live" ? Math.round((toMs(end) - toMs(today)) / DAY_MS) : null;
  }
  return { start, end, state, daysLeft, observed: anchorWeek === week };
}

const validId = (id) => typeof id === "string" && id !== "" && id !== "0";

/**
 * One row per starting slot. `points` is what Sleeper's matchup feed shows in that
 * slot now; above zero means a game is banked there. A zero is reported as nothing
 * banked, because the feed does not say whether a slot is locked.
 */
export function weekSlots({ labels, matchup, players, gamesThisWeek } = {}) {
  return (labels ?? []).map((label, i) => {
    const playerId = validId(matchup?.starters?.[i]) ? matchup.starters[i] : null;
    const raw = matchup?.startersPoints?.[i];
    const points = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    const p = playerId ? players?.get?.(playerId) : null;
    const injury = p
      ? injuryLabel(
          {
            status: p.injuryStatus,
            bodyPart: p.injuryBodyPart,
            notes: p.injuryNotes,
          },
          { short: true },
        )
      : null;
    return {
      index: i,
      label,
      playerId,
      name: p?.fullName ?? (playerId ? `Player ${playerId}` : null),
      team: p?.team ?? null,
      points: matchup ? points : null,
      banked: points != null && points > 0,
      injury,
      injuryStatus: injury ? (p?.injuryStatus ?? null) : null,
      gamesPlayed: playerId ? (gamesThisWeek?.get?.(playerId) ?? null) : null,
    };
  });
}

/** "Last day", "3 days left", "Games over, not yet scored", "Final" or a start date. */
export function weekStatus(window, week, lastScoredWeek) {
  if (!window) return null;
  if (window.state === "live")
    return window.daysLeft === 0
      ? "Last day"
      : `${window.daysLeft} ${window.daysLeft === 1 ? "day" : "days"} left`;
  if (window.state === "upcoming") return `Starts ${formatDay(window.start)}`;
  if (window.state === "ended")
    return (lastScoredWeek ?? 0) >= week ? "Final" : "Games over, not yet scored";
  return null;
}

/** Sum of the banked scores. */
export function bankedPoints(slots) {
  const total = (slots ?? []).reduce((s, x) => s + (x.banked ? x.points : 0), 0);
  return Math.round(total * 10) / 10;
}

/** How many slots show a banked score. */
export function bankedCount(slots) {
  return (slots ?? []).filter((s) => s.banked).length;
}

/**
 * Starters carrying an injury tag, with games left this week. That count needs the
 * NBA schedule, which the app does not load, so it is known only once the week has
 * ended (zero) and is null otherwise.
 */
export function injuredStarters(slots, weekState) {
  return (slots ?? [])
    .filter((s) => s.playerId && s.injury)
    .map((s) => ({ ...s, gamesLeft: weekState === "ended" ? 0 : null }));
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

/** Group a player's games (week -> games) into week -> ISO dates, across players. */
export function gameDatesByWeek(seasons) {
  const out = new Map();
  for (const byWeek of seasons?.values?.() ?? []) {
    for (const [week, games] of byWeek) {
      const list = out.get(week) ?? [];
      for (const g of games) if (g.date) list.push(g.date.slice(0, 10));
      out.set(week, list);
    }
  }
  return out;
}
