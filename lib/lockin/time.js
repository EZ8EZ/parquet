/**
 * ONE TIME ZONE FOR THE WHOLE APP. Every clock time on a lock-in surface is printed in
 * the board's display zone (desk.displayTz, from the engine; Eastern until it lands),
 * without a zone suffix. The zone is named once, in the board's top bar next to the
 * refresh time ("as of 4:55 PM ET"). Server and client format the same string, so there
 * is no hydration swap and no device-zone drift.
 */
export const DEFAULT_TZ = "America/New_York";

/** The display zone for a board: desk.displayTz when it is a zone Intl knows, else Eastern. */
export function displayTz(desk) {
  const tz = desk?.displayTz;
  if (typeof tz !== "string" || !tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

const toDate = (iso) => {
  if (iso == null) return null;
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? null : t;
};

/** "7:00 PM" in `tz`, or null. */
export function clockText(iso, tz = DEFAULT_TZ) {
  const t = toDate(iso);
  if (!t) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(t);
}

/** "Wed 7:30 PM" in `tz`, or null. */
export function dayClockText(iso, tz = DEFAULT_TZ) {
  const t = toDate(iso);
  if (!t) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(t).replace(",", "");
}

/** "Wed 7:30 PM", or "7:30 PM" when it falls on `today` (YYYY-MM-DD in `tz`). */
export function deadlineText(iso, tz = DEFAULT_TZ, today = null) {
  const t = toDate(iso);
  if (!t) return null;
  if (today && dateIn(t, tz) === today) return clockText(t, tz);
  return dayClockText(t, tz);
}

/** YYYY-MM-DD of `iso` in `tz`. */
export function dateIn(iso, tz = DEFAULT_TZ) {
  const t = toDate(iso);
  if (!t) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
}

/** Compact tip time for a slot tile: "7p", "10:30p". */
export function tipShort(iso, tz = DEFAULT_TZ) {
  const s = clockText(iso, tz);
  if (!s) return null;
  return s.replace(":00", "").replace(/\s?([AP])M$/, (_, a) => a.toLowerCase());
}

/** The zone's short name at that moment: "ET" for the US zones (no EST/EDT churn), else Intl's. */
export function zoneLabel(tz = DEFAULT_TZ, at = new Date()) {
  const us = { "America/New_York": "ET", "America/Chicago": "CT", "America/Denver": "MT", "America/Phoenix": "MT", "America/Los_Angeles": "PT" };
  if (us[tz]) return us[tz];
  const t = toDate(at) ?? new Date();
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(t).find((p) => p.type === "timeZoneName");
  return part?.value ?? tz;
}

const ZONE_AFTER_CLOCK = /(\d{1,2}(?::\d{2})?\s*[AP]M)\s+(?:E[SD]?T|C[SD]?T|M[SD]?T|P[SD]?T|UTC|GMT[+-]?\d*)\b/g;

/** Engine text with the zone after a clock time removed ("before 8:00 PM ET" -> "before 8:00 PM"). */
export function stripZone(text) {
  return typeof text === "string" ? text.replace(ZONE_AFTER_CLOCK, "$1") : text;
}

/**
 * Minutes before a listed tip that the app asks you to act by. A lock (or a swap) has
 * to be in before the listed start, so the time a person acts on must come first.
 * Lineups and inactives land about 30 minutes before tip, so a 10-minute buffer gives up
 * little information and leaves time to act in Sleeper. The owner can change it.
 * Display only: the engine's deadlines, sequencing and swap thresholds stay at the tip.
 */
export const DECIDE_BUFFER_MIN = 10;

/** "7:30" (no AM/PM): the hard tip beside a decide-by time that already says PM. */
export function shortClock(iso, tz = DEFAULT_TZ) {
  const s = clockText(iso, tz);
  return s ? s.replace(/\s?[AP]M$/, "") : null;
}

/**
 * The decide-by time for a listed tip: { tip, by, byText, tipText, passed, tipPassed }.
 * `by` is DECIDE_BUFFER_MIN before the tip; byText carries the day unless it is `today`
 * ("7:20 PM" / "Wed 7:20 PM"); tipText is the bare clock ("7:30"). `passed`: the
 * decide-by time has gone but the tip has not (then the call reads "Decide now").
 */
export function decideBy(iso, tz = DEFAULT_TZ, { today = null, nowMs = Date.now(), bufferMin = DECIDE_BUFFER_MIN } = {}) {
  const t = toDate(iso);
  if (!t) return null;
  const tip = t.getTime();
  const by = tip - bufferMin * 60_000;
  const byIso = new Date(by).toISOString();
  return {
    tip: t.toISOString(),
    by: byIso,
    byText: deadlineText(byIso, tz, today),
    byClock: clockText(byIso, tz),
    tipText: shortClock(t, tz),
    passed: Number.isFinite(nowMs) && nowMs >= by && nowMs < tip,
    tipPassed: Number.isFinite(nowMs) && nowMs >= tip,
  };
}
