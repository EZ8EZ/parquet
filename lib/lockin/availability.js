/**
 * Next-game availability from the injury listing. Sleeper's NBA feed uses Out, IR, GTD
 * (game-time decision) and DTD (day-to-day); in this league's snapshots of 2026-11-16 no
 * player was listed Questionable or Doubtful (n=105 listed at 23:16 UTC, n=103 at 01:04 UTC),
 * so those words are handled only for completeness.
 * Uncertain listings replace the player's own play history for his NEXT game with the
 * share of uncertain-listed players who played (LISTED_PLAY_RATE, measured).
 */
export const OUT_RE = /^(out|ir|suspension|suspended|inactive)$/i;
export const UNCERTAIN_RE = /^(gtd|dtd|questionable|doubtful|day[- ]to[- ]day|game[- ]time decision)$/i;

// scratchpad lockin-sequence/injury_outcomes.mjs: listed players whose team's next game started
// after the snapshot and is final; the latest listing before the game counts once.
export const LISTED_PLAY_RATE = Object.freeze({
  value: null,
  n: 0,
  source: "not yet measured",
});

/** -> { assumed, playsNext, rate } for a listing; rate only for uncertain listings. */
export function availabilityOf(status, rate = LISTED_PLAY_RATE) {
  const s = (status || "").trim();
  if (OUT_RE.test(s)) return { assumed: "listed_out", playsNext: false, rate: null };
  if (UNCERTAIN_RE.test(s)) return { assumed: "listed_uncertain", playsNext: null, rate: rate.value != null ? { value: rate.value, n: rate.n } : null };
  return { assumed: "not_listed_out", playsNext: true, rate: null };
}

/**
 * Expected value if held under the listing. Uncertain with a measured rate: rate x plays +
 * (1 - rate) x ruled out. Uncertain without one: the plays branch, flagged by `assumed`.
 */
export function heldValueFor(expectedIfHeldPlays, expectedIfHeldOut, av) {
  if (expectedIfHeldPlays == null) return null;
  if (av.assumed === "listed_out") return expectedIfHeldOut;
  if (av.assumed === "listed_uncertain" && av.rate) return av.rate.value * expectedIfHeldPlays + (1 - av.rate.value) * expectedIfHeldOut;
  return expectedIfHeldPlays;
}
