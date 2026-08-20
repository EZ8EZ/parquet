/**
 * THE ROSTER-CLASSIFICATION VOCABULARIES, DECLARED IN ONE PLACE.
 *
 * ---------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------
 * Two independent classifiers answered two different questions in the SAME WORDS, and
 * `/league` printed both on the same row:
 *
 *   - `analyzeRoster().window`  - core-age quartile over the top 8 players by value.
 *     Values: `rebuilding` / `balanced` / `win-now`.
 *   - `getTimelineProfile().posture` - payoff-timing quartile (Macaulay duration over
 *     players AND picks) plus a coherence floor.
 *     Values: `contending` / `ascending` / `rebuilding` / `straddling`.
 *
 * They shared "rebuilding" and "balanced" while measuring different things. Measured on
 * the live 14-roster league before this module existed: the two labels were different
 * strings on 11 of 14 rosters, the census tiles at the top of `/league` said
 * "3 REBUILDING" while that same page's board printed the word "rebuilding" against
 * four rosters, and one row (Old Man Ball) read `balanced ... TCI 71 - RFI 74 -
 * rebuilding` - two words for one roster, three inches apart, with nothing on the page
 * saying they were answers to different questions.
 *
 * This is the failure `tierOf()` was deleted for (SHELVED S6): two systems, one
 * vocabulary, no test comparing them, and nothing throwing when they drifted.
 *
 * ---------------------------------------------------------------------------------
 * WHY BOTH SURVIVE, AND WHY THE WORDS DID NOT
 * ---------------------------------------------------------------------------------
 * `tierOf` was deleted because it was a SECOND ANSWER TO ONE QUESTION. These are two
 * different questions, and both are worth asking:
 *
 *   "How old is this roster's core?"      - a fact about the players on it today.
 *   "When does this roster's value pay off?" - duration over players and picks.
 *
 * So the bug is not that two classifiers exist. The bug is that the age one was
 * borrowing the timing one's strategy words, which made it assert something it cannot
 * see: an old core is not evidence that anyone has chosen to win now, and a young core
 * is not evidence that anyone has chosen to rebuild (D19 - the app does not infer
 * intent). "win-now" and "rebuilding" are strategies; core age is an age. The age axis
 * therefore now says what it measures and nothing more, in words that cannot be
 * mistaken for the timing axis's:
 *
 *   young core / mixed-age core / veteran core
 *
 * Zero overlap with the timing vocabulary - and `axes.test.js` fails if that stops
 * being true, whichever side introduces the collision.
 *
 * ---------------------------------------------------------------------------------
 * THE THIRD LIST IS NOT A THIRD AXIS
 * ---------------------------------------------------------------------------------
 * `/plan` prints a recommended direction - contend / ascend / rebuild / retool. It is a
 * PRESCRIPTION, not a reading: imperative mood, captioned "recommended direction", and
 * it deliberately can differ from the timing read. It used to be derived from the
 * CORE-AGE axis while wearing the timing axis's verbs, which is why /plan's own
 * timeline check fired on 8 of 14 rosters on the live league and told the reader "one
 * of them is wrong" when nothing was wrong except the instrument. `stanceOf` below
 * takes the POSTURE, so the prescription and the reading are on the same axis, and a
 * disagreement now means something (the standing/star override fired) instead of
 * meaning the two were never comparable.
 */
/**
 * @typedef {Object} Axis
 * @property {string} key
 * @property {string} question the question this axis answers, in one line
 * @property {string[]} words the complete vocabulary, in canonical reading order
 * @property {string} unit what the words describe, for a caption
 * @property {string} source the ONE function allowed to produce these words
 */
/**
 * WHEN a roster's value pays off. Produced by `classify` in lib/metrics/duration.js and
 * reached through `getTimelineProfile` / `leagueTimelines`; nothing else may produce
 * these words.
 * @type {Axis}
 */
export const TIMELINE_AXIS = {
  key: "posture",
  question: "When does this roster's value pay off?",
  words: ["contending", "ascending", "rebuilding", "straddling"],
  unit: "payoff timing",
  source: "lib/metrics/duration.js classify()",
};
/**
 * The absence of a reading, which is not a fifth posture.
 *
 * IT HAS A PRODUCER NOW, AND FOR TWO ROUNDS IT DID NOT. This constant was declared here
 * and consumed in lib/agency/index.js (`POSTURE_ORDER`, and the `?? POSTURE_UNREAD`
 * fallbacks), but the only function that can produce the condition -
 * `getTimelineProfile` in lib/metrics/duration.js - returned the literal word
 * "straddling" for a roster with no priced asset at all. So the one state the register
 * was opened for was unreachable, and every posture tally in the app quietly counted
 * "we cannot read this" into the strongest negative reading the vocabulary has. It is
 * emitted properly now; duration.js's own comment on that branch has the detail.
 *
 * It stays OUT of `TIMELINE_AXIS.words` deliberately. The axis is the vocabulary a
 * classifier may produce; this is what is printed when the classifier had nothing to
 * classify, and a surface that treats it as a fifth category (a glyph, a census tile, a
 * colour) is asserting a reading that was refused.
 */
export const POSTURE_UNREAD = "unread";
/**
 * HOW OLD the roster's core is. Produced by `coreAgeBandOf` below and reached through
 * `analyzeRoster().coreAgeBand` / `leagueValueRanking`.
 * @type {Axis}
 */
export const CORE_AGE_AXIS = {
  key: "coreAgeBand",
  question: "How old is this roster's core?",
  words: ["young core", "mixed-age core", "veteran core"],
  unit: "core age",
  source: "lib/metrics/axes.js coreAgeBandOf()",
};
/** Both reading axes, for the guard test and for any surface that glosses them. */
export const ROSTER_AXES = [TIMELINE_AXIS, CORE_AGE_AXIS];
/**
 * The prescriptions. Derived from the timeline axis by `stanceOf`, never measured.
 * @type {("contend"|"ascend"|"rebuild"|"retool")[]}
 */
export const PLAN_STANCES = ["contend", "ascend", "rebuild", "retool"];
/**
 * The stance a posture points at on its own, before standing is considered.
 *
 * `straddling -> retool` is the exact match the old age-derived version could only
 * approximate: duration.js's own straddling copy says "pick a direction and make the
 * timeline agree with it", which is what retool means.
 */
export const STANCE_FROM_POSTURE = {
  contending: "contend",
  ascending: "ascend",
  rebuilding: "rebuild",
  straddling: "retool",
};
/**
 * Core age as a league-relative band.
 *
 * RELATIVE, for the reason the old `relativeWindow` gave and which still holds: an
 * absolute cutoff on a distribution that moves whenever the valuation model moves will
 * band zero teams or nine teams for reasons that have nothing to do with any roster
 * getting older. Top quartile oldest = veteran core, bottom quartile youngest = young
 * core. The absolute fallback is only for a standalone `analyzeRoster` call with no
 * league to compare against; `leagueValueRanking` always overrides it.
 *
 * @param {number|null|undefined} coreAge
 * @param {number[]} [leagueCoreAges]
 * @returns {string} one of `CORE_AGE_AXIS.words`
 */
export function coreAgeBandOf(coreAge, leagueCoreAges) {
  const [young, mixed, veteran] = CORE_AGE_AXIS.words;
  if (coreAge == null) return mixed;
  if (!leagueCoreAges || leagueCoreAges.length < 4) {
    if (coreAge <= 25.5) return young;
    if (coreAge >= 28.5) return veteran;
    return mixed;
  }
  const pct =
    leagueCoreAges.filter((a) => a <= coreAge).length / leagueCoreAges.length;
  if (pct >= 0.75) return veteran;
  if (pct <= 0.25) return young;
  return mixed;
}
/**
 * THE ONE STANCE IMPLEMENTATION.
 *
 * It used to exist twice - `diagnose` in lib/gameplan and `stanceOf` in lib/tradefinder
 * - with a test asserting the two agreed on every roster. That test is the tell: a
 * second implementation kept in step by a test is one recalibration away from the
 * `tierOf` failure, and the fix for two implementations is one implementation, not a
 * better comparison. Both callers now call this.
 *
 * Inputs are passed in rather than derived here so this stays pure and so neither
 * caller pays for a league walk it has already done.
 *
 * @param {Object} input
 * @param {string|null} input.posture the roster's timeline read (`TIMELINE_AXIS`)
 * @param {number|null|undefined} input.coreAge
 * @param {number} input.stars cornerstone-or-better assets
 * @param {number} input.valueRank 1-based rank by total asset value
 * @param {number} input.teams
 * @returns {{ stance: string, basis: "posture"|"standing"|"unread", note: string }}
 */
export function stanceOf({ posture, coreAge, stars, valueRank, teams }) {
  const topHalf = valueRank > 0 && valueRank <= Math.ceil(teams / 2);
  const natural = posture ? STANCE_FROM_POSTURE[posture] : undefined;
  // A roster whose own assets disagree about when they pay off is the retool case by
  // construction, and no amount of standing changes that: telling it to push would be
  // telling it to widen the spread that is the actual problem.
  if (posture === "straddling")
    return {
      stance: "retool",
      basis: "posture",
      note: "Your assets do not agree about when you win, so the direction is to make them agree.",
    };
  // Aging AND already good: the standing is the argument, not the timeline. This is the
  // one override, and it is the only way the plan and the timeline read can now differ.
  if (topHalf && stars >= 2 && (coreAge ?? 26) >= 26.5 && natural !== "contend")
    return {
      stance: "contend",
      basis: "standing",
      note: `You rank ${valueRank} of ${teams} with ${stars} cornerstone-or-better assets and a core averaging ${coreAge}, so the standing argues for pushing now even though your value is dated like ${posture ? `${/^[aeiou]/.test(posture) ? "an" : "a"} ${posture} roster` : "a roster with no timeline read"}.`,
    };
  if (natural === "contend")
    return {
      stance: "contend",
      basis: "posture",
      note: "Your value is dated to pay off now.",
    };
  // Young or mid-dated: whether that is "ascend" or "rebuild" is a question about
  // ASSETS, not timing, so standing is what separates them. A coherent long timeline on
  // a bottom-half roster is still a rebuild; the same timeline on a top-half roster is
  // the ahead-of-schedule case, and telling it to tear down would burn the very assets
  // that make it good.
  if (natural === "ascend" || natural === "rebuild")
    return topHalf
      ? {
          stance: "ascend",
          basis: "posture",
          note: `Your value is dated like ${natural === "ascend" ? "an ascending" : "a rebuilding"} roster and you are already ${valueRank} of ${teams} by asset value.`,
        }
      : {
          stance: "rebuild",
          basis: "posture",
          note: `Your value is dated later than most of the league and you are ${valueRank} of ${teams} by asset value.`,
        };
  return {
    stance: "retool",
    basis: "unread",
    note: "No timeline read for this roster, so nothing here points a direction.",
  };
}
