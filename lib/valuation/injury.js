/**
 * The injury term of the valuation model.
 *
 *   injuryMult = 1 - penalty
 *   penalty    = classPenalty(bodyPart) × noteScale(notes) × statusScale(status)
 *                                       × ageScale(age, class)
 *
 * WHAT THIS REPLACED. The old term was one lookup on Sleeper's `injury_status`
 * string against a table of NFL words - Questionable, Doubtful, Sus, PUP, NA. Live
 * NBA data contains none of those, ever. It contains DTD (110 players), Out (9) and
 * IR (1), and DTD - the only one that matters by volume - was not in the table, so
 * every genuinely hurt player in the league fell through to a 0.97 fallback. The
 * model had one injury number and it was a default.
 *
 * WHY STATUS BARELY MATTERS HERE. Sleeper's NBA `injury_status` is close to
 * uninformative. Tyrese Haliburton, recovering from Achilles surgery, is "DTD".
 * Damian Lillard, recovering from Achilles surgery at 36, is "DTD". So is a bruised
 * quad. A field that cannot separate a season-ending rupture from a contusion cannot
 * be the severity signal, so it is demoted to a small scale and the work is done by
 * `injury_body_part` and `injury_notes`, which Sleeper populates on all 120 and 78 of
 * those flags respectively and which the old model parsed nowhere at all.
 *
 * WHY A PENALTY RATHER THAN A PRODUCT OF MULTIPLIERS. Composing three sub-terms as
 * `statusMult × severityMult × ageMult` would let an age term above 1.0 push the whole
 * injury multiplier above 1.0 for a mild injury, which quietly raises the ceiling every
 * value in the app is rescaled against (see DECISIONS.md D28, where exactly that class
 * of bug was found and fixed). In penalty form the invariant is structural instead of
 * asserted: penalties are non-negative, so the multiplier is at most 1.0 by
 * construction, and `maxInjuryMultiplier` still derives that from config rather than
 * assuming it, so a future edit that broke it would be caught rather than silently
 * absorbed. It also makes age an INTERACTION on the injury, which is what the model is
 * actually claiming: age does not add its own penalty here (`ageMultiplier` already
 * prices being old), it changes what a given injury MEANS.
 *
 * WHAT THIS STILL CANNOT DO - and this is a real gap, not a rounding error.
 * `injury_start_date` is populated on 0 of 2,106 players. Sleeper carries NO injury
 * history of any kind: no prior injuries, no dates, no games missed. Therefore:
 *
 *   - For a player carrying a CURRENT flag, the age at which he sustained the injury
 *     is his current age. That is exact, and the age interaction below rests on it.
 *   - For a player with NO current flag, this model returns exactly 1.0, and it does
 *     so for a healthy 22-year-old and for a 28-year-old with three back surgeries
 *     behind him alike. Michael Porter Jr. (Sleeper 1988) is the live example:
 *     `injury_status: null`, priced at 1.0.
 *
 * Chronic risk is therefore NOT MODELLED. It is not modelled because it is not
 * derivable: reconstructing past injuries from a feed that contains none of them would
 * mean inventing history, which is the precise failure DECISIONS.md D19 deleted a whole
 * working inference engine to avoid. A hardcoded list of known-fragile players would be
 * the same fabrication with extra steps and a maintenance burden. The honest position
 * is that this model prices the injury a player is carrying today and is blind to the
 * ones he has already recovered from, and the /methodology page says so in those words.
 *
 * `news_updated` is populated on 554 of 588 rostered players and is the only recency
 * signal in the feed. It is deliberately unused: it timestamps the last NEWS ITEM of any
 * kind, not the injury, so on a healthy star it tracks trade rumours and on a hurt one it
 * tracks whatever a beat writer said last. It cannot date an injury, and using it as
 * though it could would be the same fabrication in a smaller font.
 */
import { VALUATION_CONFIG } from "./config.js";
/**
 * @typedef {import('./config.js').ValuationConfig} ValuationConfig
 */
/**
 * @typedef {Object} InjuryInput
 * @property {string|null} [status] Sleeper `injury_status`
 * @property {string|null} [bodyPart] Sleeper `injury_body_part`
 * @property {string|null} [notes] Sleeper `injury_notes`
 * @property {number|null} [age] age at which the CURRENT flag was sustained
 */
/**
 * @typedef {Object} InjuryAssessment
 * @property {boolean} healthy
 * @property {string} injuryClass
 * @property {number} penalty share of dynasty value destroyed, clamped [0, 1]
 * @property {number} multiplier 1 - penalty
 * @property {number} classPenalty
 * @property {number} noteScale
 * @property {number} statusScale
 * @property {number} ageScale
 * @property {boolean} loadManagement
 */
/** Which class a Sleeper body-part string belongs to.
 * @param {string|null|undefined} bodyPart
 * @param {ValuationConfig} [cfg]
 * @returns {string}
 */
export function injuryClassOf(bodyPart, cfg = VALUATION_CONFIG) {
  if (!bodyPart) return cfg.injury.unmappedClass;
  return cfg.injury.bodyPartClass[bodyPart] ?? cfg.injury.unmappedClass;
}
/**
 * How much age amplifies (or discounts) an injury of this class.
 *
 * Linear in decades from the reference age, bounded at both ends. Linear because the
 * evidence supports a direction and a rough magnitude and does not support a curve
 * shape; bounded because an unbounded slope would make a 40-year-old's ankle sprain a
 * franchise event, and because no term in this model should be able to run away on its
 * own.
 * @param {number|null|undefined} age
 * @param {string} injuryClass
 * @param {ValuationConfig} [cfg]
 * @returns {number}
 */
export function injuryAgeScale(age, injuryClass, cfg = VALUATION_CONFIG) {
  const i = cfg.injury;
  const a = age ?? i.unknownAge;
  const slope = i.classAgeSlope[injuryClass] ?? 0;
  const scale = 1 + (slope * (a - i.ageReference)) / 10;
  return Math.min(i.ageScaleMax, Math.max(i.ageScaleMin, scale));
}
/** The full working, so the UI can show it and tests can pin each part separately.
 * @param {InjuryInput} input
 * @param {ValuationConfig} [cfg]
 * @returns {InjuryAssessment}
 */
export function injuryAssessment(input, cfg = VALUATION_CONFIG) {
  const i = cfg.injury;
  // No flag at all is the ONLY healthy state we can observe. It is not a claim that
  // the player has never been hurt; see the gap documented at the top of this file.
  if (!input.status && !input.bodyPart) {
    return {
      healthy: true,
      injuryClass: "load",
      penalty: 0,
      multiplier: 1,
      classPenalty: 0,
      noteScale: 0,
      statusScale: 1,
      ageScale: 1,
      loadManagement: false,
    };
  }
  const injuryClass = injuryClassOf(input.bodyPart, cfg);
  const classPenalty =
    i.classPenalty[injuryClass] ?? i.classPenalty[i.unmappedClass];
  const noteScale = input.notes
    ? (i.noteScale[input.notes] ?? i.noteUnknownScale)
    : i.noteMissingScale;
  const statusScale = input.status
    ? (i.statusScale[input.status] ?? i.statusDefaultScale)
    : i.statusDefaultScale;
  const ageScale = injuryAgeScale(input.age, injuryClass, cfg);
  // Clamped to [0, 1] so a hostile config can never produce a negative value or a
  // multiplier above the ceiling the rest of the model is rescaled against.
  const penalty = Math.min(
    1,
    Math.max(0, classPenalty * noteScale * statusScale * ageScale),
  );
  return {
    healthy: false,
    injuryClass,
    penalty,
    multiplier: 1 - penalty,
    classPenalty,
    noteScale,
    statusScale,
    ageScale,
    loadManagement: injuryClass === "load",
  };
}
/** The injury term itself.
 * @param {InjuryInput} input
 * @param {ValuationConfig} [cfg]
 * @returns {number}
 */
export function injuryMultiplier(input, cfg = VALUATION_CONFIG) {
  return injuryAssessment(input, cfg).multiplier;
}
/**
 * The largest value `injuryMultiplier` can return under this config.
 *
 * DERIVED, never assumed to be 1.0, for the reason `theoreticalMaxMultiplier` gives:
 * the valuation ceiling is built from each term's own max, so nothing here may quietly
 * disagree with what the function can actually return. In the shipped config every
 * penalty is non-negative and the `load` class is exactly zero, so this returns exactly
 * 1.0 - but it returns it because the arithmetic says so.
 *
 * It mirrors `injuryAssessment`'s own [0, 1] clamp deliberately. That clamp is what
 * makes the ceiling STRUCTURAL rather than merely calibrated: even a config that wrote
 * a negative penalty (a "healthy bonus", the exact shape of edit that opened D28's bug)
 * cannot lift the ceiling, and this function reports the same 1.0 the model would
 * actually produce rather than a hypothetical the model would never reach.
 */
/**
 * @param {ValuationConfig} [cfg]
 * @returns {number}
 */
export function maxInjuryMultiplier(cfg = VALUATION_CONFIG) {
  const i = cfg.injury;
  const noteMin = Math.min(
    i.noteMissingScale,
    i.noteUnknownScale,
    ...Object.values(i.noteScale),
  );
  const statusMin = Math.min(
    i.statusDefaultScale,
    ...Object.values(i.statusScale),
  );
  const scales = [
    noteMin * statusMin * i.ageScaleMin,
    noteMin * statusMin * i.ageScaleMax,
  ];
  // A healthy player is always available and always scores exactly 1.0.
  let best = 1;
  for (const penalty of Object.values(i.classPenalty)) {
    for (const s of scales) {
      best = Math.max(best, 1 - Math.min(1, Math.max(0, penalty * s)));
    }
  }
  return best;
}
/**
 * Short human label for an injury, e.g. "Knee · Surgery".
 *
 * Returns null when there is nothing worth badging: a healthy player, or a load
 * management flag, which is not an injury and must not be rendered as one.
 */
/**
 * @param {InjuryInput} input
 * @param {{ short?: boolean }} [opts]
 * @param {ValuationConfig} [cfg]
 * @returns {string|null}
 */
export function injuryLabel(input, opts = {}, cfg = VALUATION_CONFIG) {
  const a = injuryAssessment(input, cfg);
  if (a.healthy || a.loadManagement) return null;
  const parts = [input.bodyPart, input.notes].filter(
    (p) => typeof p === "string" && p.length > 0,
  );
  if (parts.length === 0) return input.status ?? null;
  // `short` drops the note. The rankings board packs a drag handle, a rank, an avatar,
  // a name and a value into 390px, and "Quadriceps · Bruise" does not fit next to a
  // name without eating it.
  return opts.short ? parts[0] : parts.join(" · ");
}
/** Display name for a class, used on /methodology and nowhere else. */
export const INJURY_CLASS_LABELS = {
  achilles: "Achilles",
  majorJoint: "Major joint",
  axial: "Back & hip",
  recurrentSoft: "Recurrent soft tissue",
  lowerExtremity: "Ankle & foot",
  upperLimb: "Upper limb",
  minor: "Peripheral",
  illness: "Illness",
  load: "Rest / load management",
  unknown: "Undisclosed",
};
