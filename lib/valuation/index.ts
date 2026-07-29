/**
 * Transparent, league-aware dynasty valuation.
 *
 * value = base(rank) × ageMult × injuryMult × roleMult × positionMult
 *
 * `base` decays exponentially by consensus rank; the multipliers are all tunable
 * in ./config. Positional value is computed FROM the league's scoring settings
 * (never hardcoded) so steals/blocks-heavy scoring correctly lifts guards/bigs.
 */
import type { Player } from "../providers/types";
import {
  VALUATION_CONFIG,
  type CanonicalLine,
  type ValuationConfig,
} from "./config";

export { VALUATION_CONFIG } from "./config";
export type { ValuationConfig } from "./config";

export interface ValueBreakdown {
  playerId: string;
  base: number;
  ageMultiplier: number;
  injuryMultiplier: number;
  roleMultiplier: number;
  positionMultiplier: number;
  value: number;
}

/** Linear interpolation across the age anchors. */
export function ageMultiplier(
  age: number | null,
  cfg: ValuationConfig = VALUATION_CONFIG,
): number {
  if (age == null) return 1.0;
  const a = cfg.ageAnchors;
  if (age <= a[0][0]) return a[0][1];
  if (age >= a[a.length - 1][0]) return a[a.length - 1][1];
  for (let i = 0; i < a.length - 1; i++) {
    const [x0, y0] = a[i];
    const [x1, y1] = a[i + 1];
    if (age >= x0 && age <= x1) {
      const t = (age - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return 1.0;
}

export function injuryMultiplier(
  status: string | null,
  cfg: ValuationConfig = VALUATION_CONFIG,
): number {
  if (!status) return 1.0;
  return cfg.injury[status] ?? cfg.injuryDefault;
}

export function roleMultiplier(
  depthChartOrder: number | null,
  cfg: ValuationConfig = VALUATION_CONFIG,
): number {
  if (depthChartOrder == null) return cfg.role.unknown;
  if (depthChartOrder <= 1) return cfg.role.starter;
  if (depthChartOrder === 2) return cfg.role.secondary;
  return cfg.role.bench;
}

/** Fantasy points a canonical line scores under the given scoring settings. */
export function lineFantasyPoints(
  line: CanonicalLine,
  scoring: Record<string, number>,
): number {
  return (
    (scoring.pts ?? 0) * line.pts +
    (scoring.reb ?? 0) * line.reb +
    (scoring.ast ?? 0) * line.ast +
    (scoring.stl ?? 0) * line.stl +
    (scoring.blk ?? 0) * line.blk +
    (scoring.to ?? 0) * line.to +
    (scoring.tpm ?? 0) * line.tpm
  );
}

/**
 * Position multipliers derived from the league scoring. A position that scores
 * above the league-average canonical output gets a multiplier > 1, dampened by
 * config.positionDampen so it nudges rather than dominates.
 */
export function positionMultipliers(
  scoring: Record<string, number>,
  cfg: ValuationConfig = VALUATION_CONFIG,
): Record<string, number> {
  const positions = Object.keys(cfg.canonicalLines);
  const fp = positions.map((p) =>
    lineFantasyPoints(cfg.canonicalLines[p], scoring),
  );
  const mean = fp.reduce((s, v) => s + v, 0) / (fp.length || 1);
  const out: Record<string, number> = {};
  positions.forEach((p, i) => {
    const rel = mean > 0 ? fp[i] / mean : 1;
    out[p] = 1 + cfg.positionDampen * (rel - 1);
  });
  return out;
}

function primaryPosition(player: Player): string {
  return player.position ?? player.fantasyPositions[0] ?? "SF";
}

export function valuePlayer(
  player: Player,
  scoring: Record<string, number>,
  cfg: ValuationConfig = VALUATION_CONFIG,
  posMults?: Record<string, number>,
): ValueBreakdown {
  const rank = player.searchRank ?? 260;
  const base = cfg.maxValue * Math.exp(-cfg.rankDecay * Math.max(0, rank - 1));
  const ageMult = ageMultiplier(player.age, cfg);
  const injuryMult = injuryMultiplier(player.injuryStatus, cfg);
  const roleMult = roleMultiplier(player.depthChartOrder, cfg);
  const mults = posMults ?? positionMultipliers(scoring, cfg);
  const posMult = mults[primaryPosition(player)] ?? 1;
  const value = Math.round(base * ageMult * injuryMult * roleMult * posMult);
  return {
    playerId: player.playerId,
    base: Math.round(base),
    ageMultiplier: round2(ageMult),
    injuryMultiplier: round2(injuryMult),
    roleMultiplier: round2(roleMult),
    positionMultiplier: round2(posMult),
    value: Math.max(0, value),
  };
}

/** Value every player, returning a Map keyed by playerId. */
export function valuePlayers(
  players: Player[],
  scoring: Record<string, number>,
  cfg: ValuationConfig = VALUATION_CONFIG,
): Map<string, ValueBreakdown> {
  const posMults = positionMultipliers(scoring, cfg);
  const out = new Map<string, ValueBreakdown>();
  for (const p of players) out.set(p.playerId, valuePlayer(p, scoring, cfg, posMults));
  return out;
}

/** What we know about which slot a pick will land in. */
export interface PickSlotContext {
  /**
   * Known slot within the round (1 = earliest). Use when the draft order is set.
   * Takes precedence over `originalTeamRank`.
   */
  slot?: number;
  /**
   * Strength rank of the team the pick ORIGINALLY belongs to, 1 = best team.
   * A pick from a weak team lands early, which is what makes it valuable. This is
   * how a future pick gets priced by who owes it rather than treated as generic.
   */
  originalTeamRank?: number;
  /** Teams in the league. Defaults to 12 if unknown. */
  teams?: number;
  /** Rounds in the rookie draft. Defaults to 3. */
  rounds?: number;
}

/**
 * Estimate the overall pick number (1-based across the whole rookie draft).
 *
 * With a known slot, exact. With only the original team's strength, we invert the
 * standings (worst team picks first) and then regress that estimate toward the league
 * midpoint as the pick moves further into the future, because next season's order is
 * roughly guessable and 2029's is not.
 */
export function estimateOverallPick(
  round: number,
  seasonsOut: number,
  ctx: PickSlotContext = {},
  cfg: ValuationConfig = VALUATION_CONFIG,
): number {
  const teams = ctx.teams ?? 12;
  const mid = (teams + 1) / 2;

  let slot: number;
  if (ctx.slot != null) {
    slot = ctx.slot;
  } else if (ctx.originalTeamRank != null) {
    // Best team (rank 1) picks last; worst team (rank = teams) picks first.
    const impliedSlot = teams - ctx.originalTeamRank + 1;
    // Regress toward the midpoint with distance into the future.
    const trust = Math.max(
      0,
      1 - cfg.pick.slotUncertaintyPerYear * Math.max(0, seasonsOut),
    );
    slot = mid + (impliedSlot - mid) * trust;
  } else {
    slot = mid;
  }
  slot = Math.min(teams, Math.max(1, slot));
  return (round - 1) * teams + slot;
}

/**
 * Value a draft pick, slot-aware and present-valued.
 *
 * `seasonsOut` = pick.season - currentSeason (0 = this year's rookie draft).
 * Pass `ctx` to price by slot (known) or by who owes the pick (estimated). Without
 * `ctx` it falls back to the middle of the round, which is the honest answer when
 * nothing is known about the order.
 */
export function pickValue(
  round: number,
  seasonsOut: number,
  ctxOrCfg?: PickSlotContext | ValuationConfig,
  maybeCfg?: ValuationConfig,
): number {
  // Back-compatible: the third arg used to be the config.
  const isCfg = (v: unknown): v is ValuationConfig =>
    !!v && typeof v === "object" && "maxValue" in (v as object);
  const cfg = maybeCfg ?? (isCfg(ctxOrCfg) ? ctxOrCfg : VALUATION_CONFIG);
  const ctx: PickSlotContext = isCfg(ctxOrCfg) ? {} : (ctxOrCfg ?? {});

  const { topPickValue, slotDecay, floor, discountPerYear } = cfg.pick;
  const overall = estimateOverallPick(round, seasonsOut, ctx, cfg);
  const slotted =
    floor + (topPickValue - floor) * Math.exp(-slotDecay * (overall - 1));
  const discount = Math.pow(discountPerYear, Math.max(0, seasonsOut));
  return Math.round(slotted * discount);
}

/** Coarse display tier from a value. */
export function tierOf(value: number): string {
  if (value >= 7000) return "Franchise";
  if (value >= 4500) return "Cornerstone";
  if (value >= 2800) return "Core Starter";
  if (value >= 1500) return "Starter";
  if (value >= 700) return "Rotation";
  if (value >= 250) return "Depth";
  return "Fringe";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
