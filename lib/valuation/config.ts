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
  /** Rookie-pick valuation. */
  pick: {
    /** Value of a next-season pick by round (1-indexed). */
    baseByRound: Record<number, number>;
    /** Present-value discount applied per season into the future. */
    discountPerYear: number;
  };
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
    baseByRound: { 1: 3200, 2: 1100, 3: 450 },
    discountPerYear: 0.85,
  },
};
