/**
 * Valuation configuration — EVERY weight is here and nowhere else.
 *
 * Transparency is the differentiator, not accuracy (DECISIONS.md D5). The
 * /methodology page renders these constants directly, and the whole model is a
 * handful of multipliers over a consensus-rank base. Tune here; the UI updates.
 *
 * TWO EXCEPTIONS to "every weight is here", and they are the same exception twice: the
 * age anchors are imported from `./ageCurve.js` and the production weight from
 * `./production.js`, rather than typed out, because neither is a tuning decision. They
 * are measurements - a forward-production curve and a standardized OLS coefficient -
 * and hand-editing a measurement is how a measurement stops being one. Both are still
 * rendered by /methodology from here, so the transparency contract is unchanged.
 */
import {
  DERIVED_AGE_CURVE,
  STAR_AGE_ADJUSTMENT,
  STAR_SEARCH_RANK_CUTOFF,
} from "./ageCurve.js";
import { PRODUCTION_WEIGHT } from "./production.js";
/**
 * @typedef {Object} InjuryConfig
 * @property {Record<string, string>} bodyPartClass Sleeper body-part string -> injury class
 * @property {string} unmappedClass
 * @property {Record<string, number>} classPenalty injury class -> share of dynasty value destroyed
 * @property {Record<string, number>} classAgeSlope injury class -> how much age amplifies it
 * @property {Record<string, number>} noteScale Sleeper `injury_notes` -> severity scale
 * @property {number} noteMissingScale scale used when there is a body part but no note
 * @property {number} noteUnknownScale scale used when the note isn't in `noteScale`
 * @property {Record<string, number>} statusScale Sleeper `injury_status` -> small modifier
 * @property {number} statusDefaultScale
 * @property {number} ageReference the age `ageAnchors` treats as neutral (1.0)
 * @property {number} ageScaleMin
 * @property {number} ageScaleMax
 * @property {number} unknownAge fallback age when a player's age is unknown
 */
/**
 * @typedef {Object} CanonicalLine
 * @property {number} pts
 * @property {number} reb
 * @property {number} ast
 * @property {number} stl
 * @property {number} blk
 * @property {number} to
 * @property {number} tpm
 */
/**
 * @typedef {Object} PickConfig
 * @property {number} topPickValue
 * @property {number} slotDecay
 * @property {number} floor
 * @property {number} discountPerYear
 * @property {number} slotUncertaintyPerYear
 * @property {number} lotteryWeighting
 * @property {number} classShapeDecay
 */
/**
 * Every weight the valuation model uses. See this file's own header for why
 * transparency, not accuracy, is the differentiator (D5).
 * @typedef {Object} ValuationConfig
 * @property {number} maxValue
 * @property {number} rankDecay
 * @property {number[][]} ageAnchors [age, multiplier] pairs, one per year 19-36
 * @property {{ age: number, ratio: number, cohort: number, thinnestCell: number }[]} starAgeAdjustment
 * @property {number} starSearchRankCutoff
 * @property {number} productionWeight
 * @property {InjuryConfig} injury
 * @property {{ starter: number, secondary: number, bench: number, unknown: number }} role
 * @property {Record<string, CanonicalLine>} canonicalLines position -> canonical per-game line
 * @property {number} positionDampen
 * @property {PickConfig} pick
 * @property {Record<number, { top: number, depth: number }>} classStrength draft season -> class-strength multipliers
 */
/** @type {ValuationConfig} */
export const VALUATION_CONFIG = {
  maxValue: 10000,
  rankDecay: 0.021,
  /**
   * AGE. Every anchor is a measured row of `./ageCurve.ts` - one per year from 19 to
   * 36, so linear interpolation has nothing to interpolate and the curve in the model
   * IS the curve in the table. The old ten hand-set anchors were replaced wholesale.
   *
   * Three things changed materially, all in the same direction: the model had been
   * punishing age harder than the games do. 33 moves from 0.62 to 0.671, 35 from 0.45
   * to 0.570, and the old 38 anchor of 0.30 is gone entirely. The young end moved the
   * other way - 21 falls from 1.14 to 1.071 - because the old curve had youth's
   * premium spread across the early twenties, and the data puts almost all of it
   * before 21.
   *
   * THE PEAK IS UNCHANGED AT EXACTLY 1.16, and that is not a coincidence, it is D28.
   * `theoreticalMaxMultiplier()` folds the largest age anchor into the constant every
   * value in this app is divided by, so a moved peak would rescale every price in the
   * product and quietly change where the league's tier breaks land. The derivation
   * therefore scales its whole curve to the peak the hand-set anchors already had.
   * Only the SHAPE is recalibrated - and shape is the entire content of an age curve,
   * because the level divides out.
   *
   * BELOW 19 AND ABOVE 36 the sample thins out (at 37 the thinnest horizon cell holds
   * 15 careers, at 39 it holds 7), so there is no anchor past 36 and `ageMultiplier`
   * holds flat at the last one instead. That is the honest shape of the ignorance: a
   * 40-year-old who is still producing is priced like a 36-year-old who is still
   * producing, which is generous, and it is stated rather than dressed up as a
   * measured decline. This is the one part of the curve asserted rather than measured.
   */
  ageAnchors: DERIVED_AGE_CURVE.map((r) => [r.age, r.multiplier]),
  /**
   * STAR-TIER ADJUSTMENT (D74). A second, narrower measurement layered ON TOP of
   * `ageAnchors` for players Sleeper's own live consensus ranks in the top decile
   * (`starSearchRankCutoff`) - see `./ageCurve.ts`'s own header for the full
   * derivation, why it starts at 27 rather than 21, and why it is a multiplier onto
   * the ordinary age term rather than a rewrite of it. A non-star player's price is
   * completely unaffected: `starAgeAdjustment` returns exactly 1.0 for anyone not
   * flagged, and for a star below the applied floor.
   */
  starAgeAdjustment: STAR_AGE_ADJUSTMENT,
  starSearchRankCutoff: STAR_SEARCH_RANK_CUTOFF,
  /**
   * IN-LEAGUE PRODUCTION. How much of a player's rank prior is decided by what he has
   * actually produced in THIS league rather than by Sleeper's redraft popularity
   * ordinal - see `./production.js` for the derivation, the coverage, and the run that
   * first said this weight should be zero.
   *
   * Note what this weight does NOT do. It cannot move any price LEVEL: production is
   * blended in rank-percentile space and the result is read back off the blended pool's
   * own sorted search ranks, so the collection of base values in the league is
   * identical whatever this number is. Set it to 0 and every value in the app returns
   * bit-for-bit to what it was before production existed, which is also how the tests
   * pin the old behaviour.
   */
  productionWeight: PRODUCTION_WEIGHT,
  /**
   * INJURY. Read `./injury.ts` first: it carries the model, the arithmetic, and the
   * argument for every number below. The short version of the calibration:
   *
   * - Penalties are stated as a SHARE OF DYNASTY VALUE DESTROYED by a full-severity
   *   (surgical) event in that class, suffered at `ageReference`. "An Achilles rupture
   *   at 27 costs 30% of a player's dynasty value" is a claim you can argue with, which
   *   is the point. A multiplier of 0.7 is the same claim wearing a disguise.
   * - `ageReference` is 27 because that is where `ageAnchors` sits at exactly 1.0: the
   *   age this model already treats as neutral. Reusing it means the injury term and the
   *   age term agree about where "neutral" is instead of each having a private opinion.
   * - Note scales are stated relative to Surgery = 1.0, because surgery is the single
   *   highest-evidence signal in the feed that a problem is structural rather than
   *   nagging, and it is also the most common note (43 of 78 live).
   * - Status scales sit near 1.0 ON PURPOSE. See `./injury.ts`; Sleeper's NBA
   *   `injury_status` is almost pure noise and must not drive this.
   */
  injury: {
    bodyPartClass: {
      // Catastrophic soft tissue. In a class of one because nothing else in the feed
      // behaves like it: the recovery is long, the return is rarely to the same
      // athlete, and how much is lost depends on age more than on anything else.
      Achilles: "achilles",
      // Major weight-bearing joint. ACL, meniscus, cartilage. Long absence, real
      // structural change, and the injury most likely to recur in the same knee.
      Knee: "majorJoint",
      // Degenerative axial. Back and hip problems are managed, not cured: they come
      // back, they cost load management for whatever career is left, and they are the
      // most common quiet reason a productive player stops being available.
      Back: "axial",
      Hip: "axial",
      // Recurrent soft tissue. The defining feature is not the first tear, it is that
      // the first tear is the best predictor of the second one, and the gap between
      // them shortens with age.
      Hamstring: "recurrentSoft",
      Calf: "recurrentSoft",
      Groin: "recurrentSoft",
      Quadriceps: "recurrentSoft",
      // Ankle and foot. Mostly trivial (a rolled ankle) but occasionally career-shaping
      // (a navicular or Jones fracture, or a big man's chronic foot). The NOTE does the
      // discriminating here, which is exactly why the note term exists.
      Ankle: "lowerExtremity",
      Foot: "lowerExtremity",
      Heel: "lowerExtremity",
      "Lower Leg": "lowerExtremity",
      Shin: "lowerExtremity",
      // Upper limb. Costs games and can cost a jump shot for a season, but it does not
      // touch the lower-body athleticism that decides how a career ends.
      Shoulder: "upperLimb",
      Elbow: "upperLimb",
      Wrist: "upperLimb",
      Arm: "upperLimb",
      // Peripheral. A jammed finger is not a dynasty event even on a 33-year-old, and
      // the old model charged one 3% for it.
      Finger: "minor",
      Thumb: "minor",
      Hand: "minor",
      Toe: "minor",
      Nose: "minor",
      Eye: "minor",
      Face: "minor",
      Jaw: "minor",
      Ribs: "minor",
      Illness: "illness",
      // NOT INJURIES. "Rest" is 11 live players, every one of them 19 to 25 and flagged
      // DTD: this is load management and two-way shuttling, not a body breaking down.
      // The old model charged all eleven a 3% injury tax for being young and idle.
      Rest: "load",
      "Not Injury Related": "load",
      Personal: "load",
      // Sleeper's own "we are not saying". Distinct from load: it IS an injury, we just
      // do not know which one, so it takes the unknown class rather than a free pass.
      Undisclosed: "unknown",
    },
    unmappedClass: "unknown",
    classPenalty: {
      achilles: 0.3,
      majorJoint: 0.22,
      axial: 0.18,
      recurrentSoft: 0.12,
      lowerExtremity: 0.1,
      upperLimb: 0.07,
      minor: 0.02,
      illness: 0.01,
      // Exactly zero, and it has to be exactly zero rather than merely small: a rested
      // rookie is not carrying risk, so pricing him below a healthy player would be an
      // outright error, not a conservative one.
      load: 0,
      // A flagged player we know nothing else about. Lands at roughly 0.96 after the
      // missing-note midpoint, which is deliberately close to the 0.97 the old model
      // applied to EVERY flag. That was the right number for total ignorance; the bug
      // was that total ignorance was the only state the old model could represent.
      unknown: 0.08,
    },
    classAgeSlope: {
      // Steepest slope in the model, and the one the owner named. Durant ruptured at 30
      // and returned an All-NBA scorer; the same injury past the mid-thirties has
      // repeatedly ended careers outright. A rupture at 23 is a lost season and little
      // more.
      achilles: 1.0,
      majorJoint: 0.7,
      // Recurrence risk, not first-event severity, is what climbs with age, and it
      // climbs steeply. A 23-year-old's hamstring strain is an absence; a 36-year-old's
      // is the first of several.
      recurrentSoft: 0.85,
      lowerExtremity: 0.5,
      // NEARLY FLAT, and this is the one number here most likely to be argued with.
      // Two real effects oppose each other: an older player has less career left for a
      // degenerative problem to compound over (which argues for a low penalty), while a
      // younger player is buying a decade of managed load and elevated recurrence
      // (which argues for a high one). A near-flat slope is what it looks like when
      // those cancel, and it means a 20-year-old with back surgery is NOT let off the
      // hook. That is the intended behaviour.
      axial: 0.15,
      upperLimb: 0.2,
      minor: 0,
      illness: 0,
      load: 0,
      unknown: 0.4,
    },
    noteScale: {
      // The reference. Someone opened the joint.
      Surgery: 1.0,
      // Heals completely, but it is a long absence and a genuine structural event.
      Fracture: 0.85,
      // A torn muscle. Matters mostly through what it predicts, which is why the
      // recurrentSoft age slope carries more of this than the note does.
      Strain: 0.55,
      // Tendinopathy. Nagging and recurrent, so it outranks a sprain despite sounding
      // milder: sprains resolve, inflammation comes back.
      Inflammation: 0.45,
      Sprain: 0.4,
      // Mostly noise, but not zero: "knee soreness" on a 33-year-old is sometimes the
      // leading edge of the thing that ends him, and we cannot tell which is which.
      Soreness: 0.25,
      // A contusion. Transient by definition.
      Bruise: 0.15,
    },
    // 40 of the 120 live flags carry a body part and no note. The midpoint is a
    // decision, not a fallthrough: absent a note we do not know whether the knee was
    // bruised or reconstructed, and assuming the benign end would systematically
    // underprice risk on exactly the players the feed is least forthcoming about.
    noteMissingScale: 0.5,
    noteUnknownScale: 0.5,
    /**
     * DELIBERATELY NEAR 1.0. Sleeper's NBA `injury_status` does not mean what its
     * vocabulary suggests: 110 of 120 live flags are "DTD", and that bucket contains
     * both a bruised quad and Tyrese Haliburton's ruptured Achilles. A field that calls
     * a season-ending rupture "day to day" cannot be allowed to drive severity. It is
     * kept as a small modifier rather than dropped because the two rare values do carry
     * real information: nine "Out" and one "IR" against a hundred and ten "DTD" means
     * those ten were worth someone's trouble to mark differently.
     */
    statusScale: {
      IR: 1.25,
      Out: 1.15,
      DTD: 1.0,
    },
    statusDefaultScale: 1.0,
    ageReference: 27,
    ageScaleMin: 0.4,
    ageScaleMax: 1.8,
    // Same value fragility.ts and duration.ts assume for an unknown age, for the same
    // reason: it is the median age of a rostered player in this league.
    unknownAge: 25,
  },
  role: { starter: 1.0, secondary: 0.96, bench: 0.9, unknown: 1.0 },
  canonicalLines: {
    PG: { pts: 18, reb: 4, ast: 7, stl: 1.3, blk: 0.3, to: 2.6, tpm: 2.2 },
    SG: { pts: 19, reb: 4, ast: 3.5, stl: 1.1, blk: 0.4, to: 2.0, tpm: 2.6 },
    SF: { pts: 18, reb: 6, ast: 3.5, stl: 1.1, blk: 0.6, to: 1.9, tpm: 2.0 },
    PF: { pts: 18, reb: 8, ast: 3.0, stl: 0.9, blk: 1.0, to: 1.9, tpm: 1.3 },
    C: { pts: 16, reb: 10, ast: 2.5, stl: 0.8, blk: 1.6, to: 1.8, tpm: 0.6 },
  },
  positionDampen: 0.5,
  pick: {
    topPickValue: 5000,
    slotDecay: 0.155,
    floor: 70,
    discountPerYear: 0.9,
    slotUncertaintyPerYear: 0.45,
    lotteryWeighting: 0,
    classShapeDecay: 0.2,
  },
  /**
   * Per-class strength. `top` scales the very top of a class, `depth` scales the
   * tail. Both default to 1.0 (a neutral class) for any season not listed.
   *
   * These are SUBJECTIVE and that is the point: converting consensus opinion about a
   * draft class into value is a real part of dynasty pick trading, and pretending
   * otherwise would make the model quietly wrong every single year. They are exposed
   * here so they can be argued with rather than buried.
   */
  classStrength: {
    // 2026 is regarded as a deeper class, so value extends further down the board
    // without an outlier at the very top.
    2026: { top: 1.0, depth: 1.15 },
  },
};
