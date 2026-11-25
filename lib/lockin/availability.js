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

/**
 * lockin-opponent: play probability per team game, logistic on (logit of the 40-row rate,
 * logit of a 3-season recency rate, second night of a back-to-back, missed his last game,
 * missed 3+ of his last 5). Fit on 2025 team games (n=33,023), tested on 2026 (n=6,724):
 * Brier 0.1816 (40-row rate) -> 0.1265. Missed-last-game carries most of it.
 * (scripts/lockin/opponent_avail.mjs, 2026-11-24.) Listings override the next game on top.
 */
export const PLAY_MODEL = Object.freeze({
  beta: [1.589, 0.384, 0.03, -0.164, -2.115, -1.056],
  trainN: 33023,
  testN: 6724,
  brierOld: 0.1816,
  brierNew: 0.1265,
});

const lg = (p) => {
  const q = Math.min(0.995, Math.max(0.005, p));
  return Math.log(q / (1 - q));
};

/**
 * P(plays) for each of `dates` (his remaining team games, ascending), from his completed rows
 * before asOf and his 40-row rate q. Back-to-back from the previous team game (completed or
 * remaining). Recent misses are today's state, applied to every remaining game.
 */
export function playProbabilities({ log, asOf, q, dates }) {
  const prev = log.filter((g) => g.complete === true && g.date < asOf);
  let w = 0;
  let t = 0;
  for (let j = prev.length - 1, k = 0; j >= 0 && k < 250; j--, k++) {
    const ww = Math.pow(0.5, k / 82);
    w += ww;
    t += ww * (prev[j].sp > 0 ? 1 : 0);
  }
  const long = (t + 0.8 * 20) / (w + 20);
  const last = prev[prev.length - 1] || null;
  const missed1 = last && last.sp === 0 ? 1 : 0;
  const missed3of5 = prev.slice(-5).filter((x) => x.sp === 0).length >= 3 ? 1 : 0;
  const b = PLAY_MODEL.beta;
  let before = last ? last.date : null;
  return dates.map((date) => {
    const b2b = before && Date.parse(date) - Date.parse(before) <= 86400000 ? 1 : 0;
    before = date;
    const z = b[0] + b[1] * lg(q) + b[2] * lg(long) + b[3] * b2b + b[4] * missed1 + b[5] * missed3of5;
    return 1 / (1 + Math.exp(-z));
  });
}

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
