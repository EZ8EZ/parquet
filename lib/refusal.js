/**
 * THE REFUSAL REGISTER - the closed set of reasons this app declines to publish a number.
 *
 * ---------------------------------------------------------------------------------
 * WHY A CODE AND NOT A GLYPH
 * ---------------------------------------------------------------------------------
 * `components/RefusalMark.jsx` already solves the DRAWN half of a refusal, and solves
 * it well - read its docstring before touching either file. What it cannot solve is
 * everything that happens to a refusal after it leaves the screen. A refusal that
 * exists only as a mark - a dash, a hatch, a faint colour - survives exactly one
 * medium. Copy the row into a group chat, hand the table to a screen reader, grep the
 * derivation for "which rosters could not be read", serialize the object to JSON: in
 * every one of those the mark is gone and what remains is an EMPTY CELL. An empty cell
 * reads as zero, and zero is a claim. That is strictly worse than saying nothing,
 * because the app has now asserted a number it explicitly refused to assert.
 *
 * So a refusal in this app is a piece of DATA first and a drawing second. Every
 * refusal carries a code from the closed list below in the object the derivation
 * returns, which means it is testable, greppable, serializable, and readable aloud;
 * the mark is a secondary rendering of something that already exists without it.
 *
 * ---------------------------------------------------------------------------------
 * WHAT MAKES THE LIST CLOSED, AND WHY THAT MATTERS MORE THAN THE LIST
 * ---------------------------------------------------------------------------------
 * Six codes, and adding a seventh means editing this file. A refusal site may not
 * mint its own reason string: it picks a code and supplies the NUMBERS that condition
 * turned on. Before this file, four surfaces each hand-wrote their own sentence for
 * "not enough to say" and no two of them agreed on the words, which meant a reader who
 * learned one did not recognise the next - and nothing downstream could count them.
 *
 * The `condition` on each entry is the contract. It states the arithmetic that
 * produces the code, in the terms the producing module uses, so a site cannot quietly
 * widen a code to cover a case it was not written for. If your condition is not one of
 * these six, that is a decision to make here, not a string to invent at the call site.
 *
 * ---------------------------------------------------------------------------------
 * TWO RULES THE WORDING OBEYS
 * ---------------------------------------------------------------------------------
 * D6: a code is a fact about DATA SUFFICIENCY and never a judgment on the roster or
 * the manager. `INSUFFICIENT_SAMPLE` says the app cannot read this roster; it does not
 * say the roster is thin, badly built, or in any state at all. Nothing here grades.
 *
 * D19: a code may not sound more certain than the thing underneath it. The labels are
 * deliberately flat and slightly boring. `SPLIT_ROSTER` is not "conflicted roster" or
 * "incoherent roster" - both of those smuggle in a finding about the roster from a
 * fact about two quartiles.
 *
 * ---------------------------------------------------------------------------------
 * THE FIELD IS DETERMINISTIC
 * ---------------------------------------------------------------------------------
 * None of these six is a transient failure, and nothing in this app should ever offer
 * a retry beside one. Every condition is a standing fact about a record that already
 * arrived in full: the trades that exist, the assets on the roster, the entries the
 * source published. Waiting does not change any of them; the league playing more
 * seasons might, which is a different sentence and one `deriveExitWindow` says
 * explicitly. `refusalSentence` therefore never hedges toward "yet" unless the
 * producing module supplies a falsifiable bar in its own `because`.
 */

/**
 * @typedef {object} RefusalCode
 * @property {string} code the stable string. Appears in data, accessible names, exports.
 * @property {string} label a short human-readable name for the condition.
 * @property {string} condition the exact arithmetic that produces it. The contract.
 */

/**
 * @typedef {object} Withheld
 * @property {string} label what the number would have been called had it been published.
 * @property {string} value the number itself, already formatted for printing.
 */

/**
 * @typedef {object} Refusal
 * @property {string} code one of `REFUSAL_CODES`.
 * @property {string} label the code's human-readable label.
 * @property {string} because one line of proof, built by the module that owns the numbers.
 * @property {Withheld|null} withheld the number declined, printed beside the proof.
 */

/**
 * The six. Each key is its own `code`, so a lookup miss is a thrown error rather than
 * an `undefined` that renders as a blank - which is the failure mode this file exists
 * to prevent, and it would be embarrassing to reintroduce it here.
 *
 * @type {Readonly<Record<string, RefusalCode>>}
 */
export const REFUSAL_CODES = Object.freeze({
  NO_RECORD: Object.freeze({
    code: "NO_RECORD",
    label: "no record to read",
    condition:
      "The record this derivation reads is empty for this subject - zero valued " +
      "assets, zero priced acquisitions, zero appearances. Nothing was computed from " +
      "a thin sample; nothing was computed at all.",
  }),
  INSUFFICIENT_SAMPLE: Object.freeze({
    code: "INSUFFICIENT_SAMPLE",
    label: "too few records to separate",
    condition:
      "Records exist and are fewer than the statistic needs to resolve. The count is " +
      "below a stated floor (`MIN_ASSETS_FOR_WINDOW`, `SUFFICIENCY.minAcquisitions`), " +
      "so the figure it would produce is an artefact of the count rather than a " +
      "reading of the data.",
  }),
  CONCENTRATED_SAMPLE: Object.freeze({
    code: "CONCENTRATED_SAMPLE",
    label: "one record carries the sample",
    condition:
      "Enough records to clear the floor, but a single one carries more of the total " +
      "than the effect being measured (`SUFFICIENCY.maxConcentration`). The aggregate " +
      "is that one record wearing a sample's clothes, so its movement is the record's " +
      "and not the effect's.",
  }),
  SPLIT_ROSTER: Object.freeze({
    code: "SPLIT_ROSTER",
    label: "the parts do not agree",
    condition:
      "Every part is known and they disagree too widely to summarise as one figure - " +
      "a straddling posture, quartiles spread across a span too wide to call a window. " +
      "The parts are published; the single number is not, because averaging a " +
      "disagreement invents the agreement.",
  }),
  SOURCE_GAP: Object.freeze({
    code: "SOURCE_GAP",
    label: "absent from the source",
    condition:
      "The upstream provider publishes this surface but has no entry for this subject. " +
      "The gap belongs to the source and says nothing about the subject; the app will " +
      "not fill it by inference.",
  }),
  UNSCHEDULED: Object.freeze({
    code: "UNSCHEDULED",
    label: "no date exists yet",
    condition:
      "The event this depends on has not been scheduled by anyone, so there is no " +
      "date to state - a future draft, an unplayed game. Distinct from `SOURCE_GAP`: " +
      "nobody is missing this, it does not exist.",
  }),
});

/** Every code string, for tests and for anything that has to enumerate the register. */
export const REFUSAL_CODE_LIST = Object.freeze(Object.keys(REFUSAL_CODES));

/**
 * Build one refusal.
 *
 * Throws on an unknown code, deliberately and loudly. The whole value of a closed
 * register is that a typo cannot become a seventh code by accident, and a thrown error
 * in a derivation is far cheaper to find than a refusal that renders as nothing.
 *
 * @param {string} code one of `REFUSAL_CODES`
 * @param {string} because one line of proof, in the producing module's own numbers
 * @param {Withheld|null} [withheld] the number declined, if one was computable
 * @returns {Refusal}
 */
export function refusal(code, because, withheld = null) {
  const entry = REFUSAL_CODES[code];
  if (!entry) throw new Error(`refusal: unknown code ${code}`);
  return { code: entry.code, label: entry.label, because, withheld };
}

/**
 * The refusal as one printable line, code first.
 *
 * CODE FIRST IS THE POINT. This string is what reaches `RefusalMark`'s `children`,
 * which is also its accessible name (the glyph is `aria-hidden`), which is also what a
 * reader copies out of the page. Leading with the code means the same four surfaces
 * that used to say four different things now open with the same token, and a reader who
 * has met `SPLIT_ROSTER` once recognises it everywhere - including in a table cell too
 * narrow for a sentence, where `refusalShort` prints the code alone.
 *
 * THE WITHHELD NUMBER SITS BESIDE ITS OWN DISPROOF. Where the producing module could
 * compute the figure it declined to publish, it is printed here, immediately followed
 * by the one line explaining why publishing it would have been dishonest. Printing the
 * number without the proof would be the dishonesty; printing neither would leave a
 * reader to assume the app simply had nothing, which on a refused surface is exactly
 * the wrong inference (the app has the parts and is declining the whole).
 *
 * @param {Refusal} r
 * @returns {string}
 */
export function refusalSentence(r) {
  const head = r.withheld
    ? `${r.withheld.label} would read ${r.withheld.value}, and is not published. `
    : "";
  // The LABEL leads the sentence, not the CODE. The code's whole job (this file's
  // header) is to survive serialization, tests, and grep - and it still does, on the
  // refusal OBJECT every derivation returns. What it was never meant to do is speak:
  // a reader shown "SPLIT_ROSTER:" is being made to read the app's internals
  // (VISION.md's kill-list called this the single most "not designed" moment in the
  // UI). The register already carries a human label for every code; the sentence now
  // uses it, and nothing downstream loses the code.
  const label = r.label.charAt(0).toUpperCase() + r.label.slice(1);
  return `${label}: ${head}${r.because}`;
}

/**
 * The code alone, for a cell with no room for a sentence.
 *
 * This is what replaced the bare "-" in the mono line on /league and in the finder's
 * window column. A dash there was the exact bug in this file's header: it survives the
 * screen and nothing else, and in a column of seasons it reads as a missing value
 * rather than as a stated refusal.
 *
 * @param {Refusal} r
 * @returns {string}
 */
export function refusalShort(r) {
  // Label, not code, for the same reason as `refusalSentence` above: the short form
  // exists so a refusal never renders as a dash-that-reads-as-zero, and a human
  // phrase does that job without making the reader parse an internal constant.
  return r.label;
}
