/**
 * Valuation configuration — EVERY weight is here and nowhere else.
 *
 * Transparency is the differentiator, not accuracy (DECISIONS.md D5). The
 * /methodology page renders these constants directly, and the whole model is a
 * handful of multipliers over a consensus-rank base. Tune here; the UI updates.
 *
 * ONE EXCEPTION to "every weight is here": the age anchors are imported from
 * `./ageCurve.ts` rather than typed out, because they are no longer a tuning
 * decision. They are a measurement, and hand-editing a measurement is how a
 * measurement stops being one.
 */
import { DERIVED_AGE_CURVE } from "./ageCurve";

export interface ValuationConfig {
  /**
   * The scale's ceiling. `base(rank)` anchors here at rank 1, and
   * `theoreticalMaxMultiplier()` in index.ts rescales every player's full
   * multiplier stack so this ceiling is exactly what a hypothetical player who
   * is simultaneously the youngest, healthiest, a starter, and at whichever
   * position this league's scoring rewards most, would be worth at rank 1. No
   * real player is all of those at once, so this is a reachable ceiling, not
   * an assigned value: an actual #1 overall player prices at or below it,
   * never above (see DECISIONS.md D28).
   */
  maxValue: number;
  /** Exponential decay of value by consensus rank (higher = steeper drop-off). */
  rankDecay: number;
  /**
   * Dynasty age curve. Anchors are [age, multiplier]; values between anchors are
   * linearly interpolated. Youth carries a premium; production is discounted as
   * a player ages out of a dynasty window.
   *
   * MEASURED, not hand-set: every anchor is a row of `./ageCurve.ts`, derived from
   * 4,587 real NBA player-seasons scored under this league's own settings.
   */
  ageAnchors: Array<[number, number]>;
  /** Injury model. See `./injury.ts` for the derivation and every calibration note. */
  injury: InjuryConfig;
  /** Depth-chart-order role multipliers. */
  role: { starter: number; secondary: number; bench: number; unknown: number };
  /**
   * Canonical per-game stat lines by position. Fantasy points computed from
   * these under the LEAGUE's scoring settings drive positional scarcity — so the
   * model is league-aware, never hardcoded to a scoring assumption.
   */
  canonicalLines: Record<string, CanonicalLine>;
  /** How strongly positional value bends the multiplier (0 = ignore, 1 = full). */
  positionDampen: number;
  /**
   * Rookie-pick valuation. SLOT-AWARE, not round-only.
   *
   * Round-only pricing was the model's worst flaw: it priced the 1.01 and the 1.14
   * identically. In a 14-team league those are wildly different assets. Measured
   * across this league's three rookie classes, the mean value of what slot 1 became
   * was roughly 60x what slot 14 became. Published dynasty pick charts describe the
   * same shape: an elite tier at the very top, a second tier just below, then a long
   * flattening tail, with the single biggest gap between the first and second pick.
   *
   * Value decays exponentially over the OVERALL pick number, toward a floor:
   *   value = floor + (topPickValue - floor) * exp(-slotDecay * (overall - 1))
   *
   * Deliberately conservative at the top: observed slot-1 outcomes in this league
   * averaged ~7000, but that sample is three picks and includes two generational
   * talents. `topPickValue` is set well below the observed mean on purpose, because
   * calibrating to realized outcomes overfits to draft-class strength and to how well
   * one manager happened to draft, neither of which you are buying when you trade for
   * a pick. You are buying the slot.
   */
  pick: {
    /** Value of the 1.01. Anchors the curve. */
    topPickValue: number;
    /** Exponential decay per pick slot. Higher = steeper drop-off. */
    slotDecay: number;
    /** Asymptotic floor: even a late third has lottery-ticket value. */
    floor: number;
    /** Present-value discount per season into the future. */
    discountPerYear: number;
    /**
     * How fast an estimated slot regresses to the league midpoint per season out.
     * You can guess next year's draft order from current strength; you cannot guess
     * 2029's. At 1.0 the estimate is fully discarded after one season.
     */
    slotUncertaintyPerYear: number;
    /**
     * Lottery odds shape for non-playoff teams, 0..1.
     * 0 = flat odds (every lottery team equally likely to land any lottery slot).
     * 1 = fully weighted by record (worst team most likely to pick first).
     * OPEN QUESTION for the owner (QUESTIONS.md): this league's exact odds are
     * unconfirmed, so it defaults to flat, which is the assumption that adds the
     * least unearned precision.
     */
    lotteryWeighting: number;
    /**
     * How quickly a class's `top` premium gives way to its `depth` effect across the
     * board. Higher = the premium is concentrated in the first few picks only.
     */
    classShapeDecay: number;
  };
  /** Per-season class strength. Missing seasons are neutral (1.0 / 1.0). */
  classStrength: Record<string, { top?: number; depth?: number }>;
}

/**
 * The injury classes. Body parts are grouped by what the injury MEANS OVER A DYNASTY
 * HORIZON, which is a different grouping than anatomy would give you: a knee and an
 * Achilles are both "lower body" and could hardly be less alike, while a finger and a
 * nose are anatomically unrelated and identical in dynasty terms (nothing).
 */
export type InjuryClass =
  | "achilles"
  | "majorJoint"
  | "axial"
  | "recurrentSoft"
  | "lowerExtremity"
  | "upperLimb"
  | "minor"
  | "illness"
  | "load"
  | "unknown";

export interface InjuryConfig {
  /** Sleeper `injury_body_part` string -> class. Exhaustive over live NBA values. */
  bodyPartClass: Record<string, InjuryClass>;
  /** Class for a body part we have never seen, and for a flag with no body part at all. */
  unmappedClass: InjuryClass;
  /** Share of dynasty value a full-severity event in this class costs, at the reference age. */
  classPenalty: Record<InjuryClass, number>;
  /** How much that penalty grows per decade of age past the reference age. */
  classAgeSlope: Record<InjuryClass, number>;
  /** Sleeper `injury_notes` string -> how severe an event of that kind is, relative to surgery. */
  noteScale: Record<string, number>;
  /** Applied when Sleeper reports a body part but no note. Deliberately the midpoint. */
  noteMissingScale: number;
  /** Applied to a note string we have never seen. */
  noteUnknownScale: number;
  /** Sleeper `injury_status` string -> a mild scale on the penalty. */
  statusScale: Record<string, number>;
  /** Applied to a status string we have never seen. */
  statusDefaultScale: number;
  /** The age at which `classPenalty` is stated as written. */
  ageReference: number;
  /** Bounds on the age scale, so no single term can run away. */
  ageScaleMin: number;
  ageScaleMax: number;
  /** Age assumed when a flagged player has no age on file. */
  unknownAge: number;
}

export interface CanonicalLine {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  tpm: number;
}

export const VALUATION_CONFIG: ValuationConfig = {
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
  ageAnchors: DERIVED_AGE_CURVE.map(
    (r) => [r.age, r.multiplier] as [number, number],
  ),
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
    "2026": { top: 1.0, depth: 1.15 },
  },
};
