/**
 * LIVE STREAKS - the things about your team that are still running.
 *
 * WHY THIS IS NOT SUPERLATIVES, stated here because it is the whole reason the feature
 * is allowed to exist. `lib/superlatives` answers "who won what, over the whole
 * recorded history": 27 categories, ONE winner each, every figure a settled total that
 * cannot move until more history happens. Nothing here is any of those things:
 *
 *   - it is YOURS, not a league ranking - you get your streaks whether or not they
 *     would place anywhere;
 *   - every value is measured TO A GIVEN INSTANT and keeps moving on its own. Four of
 *     the five below change with nothing but the passage of time: a hold gets longer
 *     every day, a quiet stretch gets longer every day, a rolling window drops its own
 *     oldest entries. No new transaction is required for the numbers to be different
 *     on your next visit;
 *   - each one carries what happens NEXT (the rung it is climbing towards, or the
 *     personal record it is chasing), which a settled award has no concept of;
 *   - a streak can be alive, at risk, or broken. An award cannot.
 *
 * That is the line. A "most trades ever" or "longest average hold" figure belongs in
 * Superlatives and must not be restated here as a badge.
 *
 * `now` is always passed in, never read from the clock inside: every value here is a
 * function of an instant, so the instant has to be an argument for any of it to be
 * testable.
 */

import type { LeagueHistory } from "../history";
import { holdingSpans, involves } from "../derive/manager";

const DAY = 86_400_000;

export type StreakState =
  /** Getting longer on its own, with no action needed. */
  | "growing"
  /** Alive, but one more season without action ends it. */
  | "at-risk"
  /** Nothing is currently running. */
  | "idle";

export interface StreakRung {
  /** The value that reaches the next rung. */
  at: number;
  label: string;
  /** 0..1 towards `at`. */
  progress: number;
  /** Plain-language distance, e.g. "18 days away". */
  remaining: string;
}

export interface LiveStreak {
  id: string;
  /** Present tense, always - this is a thing in progress, not a thing achieved. */
  label: string;
  /** The running figure, in `unit`. */
  value: number;
  unit: "days" | "seasons" | "players" | "trades";
  /** `value` rendered for display, e.g. "3y 2m". */
  display: string;
  state: StreakState;
  /** The line under the number: what it is and why it is moving. */
  detail: string;
  /** What it is climbing towards, or chasing. Null when there is nothing next. */
  next: StreakRung | null;
  /** When the streak began, if it has a start instant. */
  since: number | null;
  /**
   * True when the real start is older than the recorded history, so `value` is a
   * floor rather than an exact figure. Surfaced, never quietly rounded away.
   */
  atLeast: boolean;
}

// ---------------------------------------------------------------- formatting

/** Days as years and months, because "1,197 days" means nothing to anybody. */
export function humanDays(days: number): string {
  const d = Math.max(0, Math.floor(days));
  if (d < 31) return `${d}d`;
  const months = Math.floor(d / 30.44);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? `${years}y` : `${years}y ${rem}mo`;
}

/** The rungs a hold climbs. Dynasty-shaped: the interesting ones are in years. */
const HOLD_RUNGS: { days: number; label: string }[] = [
  { days: 182, label: "half a season" },
  { days: 365, label: "one year" },
  { days: 730, label: "two years" },
  { days: 1095, label: "three years" },
  { days: 1461, label: "four years" },
  { days: 1826, label: "five years" },
];

function holdRung(days: number): StreakRung | null {
  const next = HOLD_RUNGS.find((r) => r.days > days);
  if (!next) return null;
  const away = Math.ceil(next.days - days);
  return {
    at: next.days,
    label: next.label,
    progress: Math.min(1, days / next.days),
    remaining: `${away} day${away === 1 ? "" : "s"} to ${next.label}`,
  };
}

// ---------------------------------------------------------------- the streaks

export interface LiveStreaks {
  /**
   * The instant every figure was measured to. Returned rather than left implicit
   * because a number that moves on its own is only meaningful next to the moment it
   * was true - the panel prints this, and the caller must not have to read the clock
   * a second time to get it (a second read would also be a different instant).
   */
  countedAt: number;
  streaks: LiveStreak[];
}

/**
 * Every streak currently running for one roster, longest-lived first.
 *
 * `now` is injectable and the clock is only read here, matching `lib/commissioner`'s
 * `opts.now` convention - the whole module is otherwise a pure function of an instant,
 * which is what makes any of it testable.
 *
 * Costs one pass over the roster's own transactions plus the shared holding walk -
 * cheap enough for a page that already prices the whole league.
 */
export function liveStreaks(
  h: LeagueHistory,
  rosterId: number,
  opts: { now?: number } = {},
): LiveStreaks {
  const now = opts.now ?? Date.now();
  const roster = h.rostersById.get(rosterId);
  if (!roster) return { countedAt: now, streaks: [] };

  const out: LiveStreak[] = [];
  const { openSince } = holdingSpans(h, rosterId);
  const nameOf = (pid: string) => h.players.get(pid)?.fullName ?? `Player ${pid}`;

  // The floor for a hold nobody recorded the start of. A player sitting on the roster
  // today with no add of their own inside the record was there for all of it - the
  // startup draft, or before this history begins. Reporting the record's own start as
  // their start understates the truth, which is why every such streak is flagged
  // `atLeast` and printed with a "+".
  const recordStart = h.transactions[0]?.created ?? null;

  const holds = roster.players
    .map((pid) => {
      const exact = openSince.get(pid);
      const since = exact ?? recordStart;
      if (since == null) return null;
      return {
        pid,
        since,
        days: Math.max(0, (now - since) / DAY),
        atLeast: exact == null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    // Longest first, and an unknown start wins a tie. A hold with no recorded
    // acquisition is measured from the record's own first day, so its figure is a
    // FLOOR - it ties numerically with a hold that genuinely began that day while
    // actually being older. Without this tie-break, the player you have held longest
    // of all can lose the "longest hold" row to someone you acquired later.
    .sort(
      (a, b) =>
        b.days - a.days || (a.atLeast === b.atLeast ? 0 : a.atLeast ? -1 : 1),
    );

  // 1. The single longest hold still running.
  const longest = holds[0];
  if (longest) {
    out.push({
      id: "longest-hold",
      label: "Longest hold still running",
      value: Math.floor(longest.days),
      unit: "days",
      display: `${humanDays(longest.days)}${longest.atLeast ? "+" : ""}`,
      state: "growing",
      detail: `${nameOf(longest.pid)}, still on your roster${longest.atLeast ? " since before the record begins" : ""}.`,
      next: longest.atLeast ? null : holdRung(longest.days),
      since: longest.since,
      atLeast: longest.atLeast,
    });
  }

  // 2. How many current players have crossed two years - and who crosses next. The
  //    "next" here is the genuinely live part: it names a date this count changes on
  //    its own, with nobody doing anything.
  const TWO_YEARS = 730;
  const matured = holds.filter((x) => x.days >= TWO_YEARS);
  const nextToMature = [...holds]
    .filter((x) => x.days < TWO_YEARS)
    .sort((a, b) => b.days - a.days)[0];
  if (holds.length > 0) {
    const away = nextToMature ? Math.ceil(TWO_YEARS - nextToMature.days) : 0;
    out.push({
      id: "two-year-club",
      label: "Held two years or more",
      value: matured.length,
      unit: "players",
      display: `${matured.length}`,
      state: nextToMature ? "growing" : "idle",
      detail: matured.length
        ? `${matured
            .slice(0, 3)
            .map((x) => nameOf(x.pid))
            .join(", ")}${matured.length > 3 ? ` and ${matured.length - 3} more` : ""}.`
        : "Nobody on the roster has reached two years yet.",
      next: nextToMature
        ? {
            at: matured.length + 1,
            label: nameOf(nextToMature.pid),
            progress: Math.min(1, nextToMature.days / TWO_YEARS),
            remaining: `${nameOf(nextToMature.pid)} joins in ${away} day${away === 1 ? "" : "s"}`,
          }
        : null,
      since: null,
      // Only a floor if an unknown start could still be on the WRONG side of two
      // years. Once the record itself is more than two years old, every
      // before-the-record hold has certainly crossed, so the count is exact and
      // flagging it would be false modesty.
      atLeast: holds.some((x) => x.atLeast && x.days < TWO_YEARS),
    });
  }

  // ------------------------------------------------------------ trade cadence

  const myTrades = h.transactions
    .filter((t) => t.type === "trade" && involves(t, rosterId))
    .map((t) => t.created)
    .sort((a, b) => a - b);

  // 3. The current quiet stretch, against your own longest. A personal record being
  //    chased is the clearest "in progress" shape there is: it moves every day, and
  //    the thing it is measured against is your own history rather than a league rank.
  if (myTrades.length > 0) {
    const last = myTrades[myTrades.length - 1];
    const quiet = Math.max(0, (now - last) / DAY);
    let longestGap = 0;
    for (let i = 1; i < myTrades.length; i++) {
      longestGap = Math.max(longestGap, (myTrades[i] - myTrades[i - 1]) / DAY);
    }
    const beatsRecord = quiet >= longestGap;
    out.push({
      id: "quiet-stretch",
      label: "Quiet at the trade desk",
      value: Math.floor(quiet),
      unit: "days",
      display: humanDays(quiet),
      state: "growing",
      detail: beatsRecord
        ? "Your longest quiet stretch on record, and it is still going."
        : `Your longest on record is ${humanDays(longestGap)}.`,
      next: beatsRecord
        ? null
        : {
            at: Math.floor(longestGap),
            label: "your own record",
            progress: longestGap > 0 ? Math.min(1, quiet / longestGap) : 0,
            remaining: `${Math.ceil(longestGap - quiet)} days off your own record`,
          },
      since: last,
      atLeast: false,
    });
  }

  // 4. Consecutive seasons with at least one trade. The one streak here that can
  //    actually BREAK, which is why it reports at-risk rather than growing: the
  //    current season having no trade yet does not end it, but the season closing
  //    without one does.
  const seasons = h.chain.map((l) => l.season);
  const tradedIn = new Set(
    h.transactions
      .filter((t) => t.type === "trade" && involves(t, rosterId))
      .map((t) => t.season),
  );
  const currentSeason = seasons[seasons.length - 1];
  let run = 0;
  for (let i = seasons.length - 1; i >= 0; i--) {
    if (tradedIn.has(seasons[i])) run++;
    else if (seasons[i] === currentSeason) continue; // still open, not yet a miss
    else break;
  }
  if (run > 0) {
    const liveThisSeason = tradedIn.has(currentSeason);
    out.push({
      id: "season-run",
      label: "Seasons in a row with a trade",
      value: run,
      unit: "seasons",
      display: `${run}`,
      state: liveThisSeason ? "growing" : "at-risk",
      detail: liveThisSeason
        ? `Including ${currentSeason}. Extend it with one more deal.`
        : `Through ${seasons[seasons.length - 2] ?? currentSeason}. One trade in ${currentSeason} keeps it alive.`,
      next: {
        at: run + 1,
        label: `${run + 1} straight`,
        progress: liveThisSeason ? 1 : 0,
        remaining: liveThisSeason
          ? `Alive - next season carries it to ${run + 1}`
          : `Needs a trade in ${currentSeason}`,
      },
      since: null,
      atLeast: false,
    });
  }

  // 5. A rolling 90-day window. Included because it is the clearest demonstration of
  //    the mechanic: this number falls on its own as old deals age out of the window,
  //    with nobody trading anything.
  const WINDOW = 90;
  const cutoff = now - WINDOW * DAY;
  const recent = myTrades.filter((t) => t >= cutoff);
  const oldestInWindow = recent[0];
  out.push({
    id: "rolling-90",
    label: "Trades in the last 90 days",
    value: recent.length,
    unit: "trades",
    display: `${recent.length}`,
    state: recent.length > 0 ? "growing" : "idle",
    detail: oldestInWindow
      ? `The oldest of them leaves this window in ${Math.ceil((oldestInWindow - cutoff) / DAY)} days.`
      : "A rolling window, counted back from today.",
    next: null,
    since: null,
    atLeast: false,
  });

  return { countedAt: now, streaks: out };
}
