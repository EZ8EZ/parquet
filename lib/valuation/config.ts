/**
 * Valuation configuration — EVERY weight is here and nowhere else.
 *
 * Transparency is the differentiator, not accuracy (DECISIONS.md D5). The
 * /methodology page renders these constants directly, and the whole model is a
 * handful of multipliers over a consensus-rank base. Tune here; the UI updates.
 */

export interface ValuationConfig {
  /** Value assigned to the #1 asset; the whole scale is anchored here. */
  maxValue: number;
  /** Exponential decay of value by consensus rank (higher = steeper drop-off). */
  rankDecay: number;
  /**
   * Dynasty age curve. Anchors are [age, multiplier]; values between anchors are
   * linearly interpolated. Youth carries a premium; production is discounted as
   * a player ages out of a dynasty window.
   */
  ageAnchors: Array<[number, number]>;
  /** Injury-status multipliers (Sleeper injury_status strings). */
  injury: Record<string, number>;
  injuryDefault: number;
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
  ageAnchors: [
    [19, 1.16],
    [21, 1.14],
    [23, 1.08],
    [25, 1.02],
    [27, 1.0],
    [29, 0.9],
    [31, 0.78],
    [33, 0.62],
    [35, 0.45],
    [38, 0.3],
  ],
  injury: {
    Questionable: 0.98,
    Doubtful: 0.93,
    Out: 0.9,
    IR: 0.82,
    Sus: 0.85,
    PUP: 0.85,
    NA: 0.85,
  },
  injuryDefault: 0.97,
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
