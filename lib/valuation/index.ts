/**
 * Transparent, league-aware dynasty valuation.
 *
 * value = base(rank) × ageMult × injuryMult × roleMult × positionMult
 *
 * `base` decays exponentially by consensus rank; the multipliers are all tunable
 * in ./config. Positional value is computed FROM the league's scoring settings
 * (never hardcoded) so steals/blocks-heavy scoring correctly lifts guards/bigs.
 */
import type { LeagueHistory } from "../history";
import type { Player } from "../providers/types";
import {
  VALUATION_CONFIG,
  type CanonicalLine,
  type ValuationConfig,
} from "./config";
import { injuryMultiplier, maxInjuryMultiplier } from "./injury";

export { VALUATION_CONFIG } from "./config";
export type { ValuationConfig, InjuryClass } from "./config";
export {
  INJURY_CLASS_LABELS,
  injuryAgeScale,
  injuryAssessment,
  injuryClassOf,
  injuryLabel,
  injuryMultiplier,
  maxInjuryMultiplier,
} from "./injury";
export type { InjuryAssessment, InjuryInput } from "./injury";
export {
  AGE_CURVE_PROVENANCE,
  CURVE_SUPPORTED_MAX,
  CURVE_SUPPORTED_MIN,
  DERIVED_AGE_CURVE,
  firstCliffAge,
} from "./ageCurve";
export type { DerivedAgeRow } from "./ageCurve";

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

/**
 * The true ceiling of `ageMult * injuryMult * roleMult * posMult`, derived from
 * config and this league's live scoring rather than hand-typed.
 *
 * `base(1)` is exactly `maxValue`, so if any multiplier can exceed 1.0 the #1
 * asset can price above the ceiling `maxValue` documents. That happened here:
 * `ageAnchors` peaks at 1.16 for the youngest players, and `positionMultipliers`
 * can also exceed 1.0 for whichever position this league's scoring rewards
 * most - so a young player at the best-scoring position blew straight past
 * maxValue. `injury` and `role` both top out at 1.0 in the current config (the
 * healthy/starter case), so they do not currently contribute to the ceiling,
 * but they are included in this max rather than assumed away, so a future
 * config edit that pushes either above 1.0 is caught automatically instead of
 * silently reopening this bug. `maxInjuryMultiplier` derives injury's own max
 * from the whole class/note/status/age lattice rather than reading a flat
 * table, which is why the injury model could be rebuilt underneath this
 * function without the ceiling moving by a single point.
 *
 * Age's own max is just the largest anchor value: interpolation is linear
 * between two anchors, so it can never produce a value outside the range of
 * its two endpoints, which means the curve's global max is always one of the
 * anchor points themselves.
 */
export function theoreticalMaxMultiplier(
  posMults: Record<string, number>,
  cfg: ValuationConfig = VALUATION_CONFIG,
): number {
  const ageMax = Math.max(...cfg.ageAnchors.map(([, m]) => m));
  const injuryMax = maxInjuryMultiplier(cfg);
  const roleMax = Math.max(
    cfg.role.starter,
    cfg.role.secondary,
    cfg.role.bench,
    cfg.role.unknown,
  );
  const posMax = Math.max(...Object.values(posMults));
  return ageMax * injuryMax * roleMax * posMax;
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
  const injuryMult = injuryMultiplier(
    {
      status: player.injuryStatus,
      bodyPart: player.injuryBodyPart,
      notes: player.injuryNotes,
      // For a CURRENT injury, current age IS age-at-injury. Sleeper carries no
      // injury history and no start date, so this is the only age the model can
      // honestly attach to an injury - and for the flags it prices, it is exact.
      age: player.age,
    },
    cfg,
  );
  const roleMult = roleMultiplier(player.depthChartOrder, cfg);
  const mults = posMults ?? positionMultipliers(scoring, cfg);
  const posMult = mults[primaryPosition(player)] ?? 1;
  // Rescale, don't clamp: dividing by the same constant for every player
  // preserves every ratio and every ordering exactly, whereas a clamp would
  // flatten the whole elite tier onto one repeated value right where the
  // ranking's resolution matters most. The constant is this scoring setup's
  // theoretical max multiplier, so `base(1) * ceiling / ceiling == maxValue`
  // and no real player - who cannot be simultaneously youngest, healthiest,
  // a starter, AND at the best-scoring position, all at once - ever reaches it.
  const ceiling = theoreticalMaxMultiplier(mults, cfg);
  const value = Math.round(
    (base * ageMult * injuryMult * roleMult * posMult) / ceiling,
  );
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

/**
 * Memoized `valuePlayers` over the WHOLE corpus, at the default config - which is
 * every production call site (dossiers, timelines, fragility, draft grades, trade
 * value, the trade graph, /values, /web, search all call `valuePlayers([...h.players
 * .values()], h.currentLeague.scoringSettings)` with no third argument). Before this,
 * a single request for the awards page recomputed the full league's value model
 * TWICE on its own (`draftCaptureProfiles` and `tradeValueProfiles` each called
 * `valuePlayers` independently inside `performanceMetrics`), on top of every other
 * page paying for its own copy.
 *
 * KEYED ON THE CORPUS ITSELF, not on a TTL. `getLeagueHistory` builds a fresh
 * wrapper object per request, but the `players` Map inside it is the SAME instance
 * for as long as the corpus cache holds (history.ts hands back the resolved corpus
 * from its single-flight slot untouched, so concurrent cold callers share one
 * `players` Map rather than each minting their own), and a corpus refresh - TTL
 * expiry, `fresh: true`, or
 * `invalidateHistory()` - always allocates a new one. Keying a WeakMap on that Map
 * makes the pairing exact by construction: a value map can never outlive the corpus
 * it was computed from, because the corpus IS its key. (A first cut of this used a
 * parallel 5-minute TTL and a provider/league/size string key; two clocks that
 * merely match still allow a refreshed corpus to be served minutes of stale values,
 * and `players.size` is a weak proxy for content. Identity is not a proxy.)
 *
 * `scoringSettings` needs no spot in the key - it comes off the same corpus, so
 * same players Map implies same scoring. A caller that passes a non-default `cfg`
 * (only tests do) bypasses the cache entirely rather than risk one caller's custom
 * config leaking into another's.
 */
let valuesByCorpus = new WeakMap<
  ReadonlyMap<string, Player>,
  Map<string, ValueBreakdown>
>();

export function cachedValuePlayers(
  h: LeagueHistory,
  cfg: ValuationConfig = VALUATION_CONFIG,
): Map<string, ValueBreakdown> {
  if (cfg !== VALUATION_CONFIG) {
    return valuePlayers([...h.players.values()], h.currentLeague.scoringSettings, cfg);
  }
  const hit = valuesByCorpus.get(h.players);
  if (hit) return hit;
  const value = valuePlayers([...h.players.values()], h.currentLeague.scoringSettings);
  valuesByCorpus.set(h.players, value);
  return value;
}

/** Drop every memoized value map. Test hook, mirroring the other in-process
 *  caches' `invalidateX` convention - production code never needs it, since a
 *  corpus refresh invalidates by identity on its own. */
export function invalidateValuesCache(): void {
  valuesByCorpus = new WeakMap();
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
  /**
   * How many teams make the playoffs. Everyone who misses is lottery-eligible, so
   * this sets the lottery size (teams - playoffTeams). Omit to skip lottery modelling
   * and treat the order as strict reverse standings.
   */
  playoffTeams?: number;
  /** The draft class this pick belongs to, for class-strength adjustment. */
  season?: string;
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
/** Raw value of one specific overall pick slot, before class and time adjustments. */
export function slotValue(
  overall: number,
  cfg: ValuationConfig = VALUATION_CONFIG,
): number {
  const { topPickValue, slotDecay, floor } = cfg.pick;
  return floor + (topPickValue - floor) * Math.exp(-slotDecay * (overall - 1));
}

/**
 * Class-strength multiplier for a given slot.
 *
 * A class can be strong in two different ways and they are NOT interchangeable. A
 * generational talent at the top lifts the 1.01 and almost nothing else; a deep class
 * lifts the middle and late picks while the top is unremarkable. `top` and `depth` are
 * interpolated geometrically by where the pick sits, so a class can be both, neither,
 * or one without the other.
 */
export function classMultiplier(
  overall: number,
  season: string | undefined,
  cfg: ValuationConfig = VALUATION_CONFIG,
): number {
  const cs = season ? cfg.classStrength[season] : undefined;
  const top = cs?.top ?? 1;
  const depth = cs?.depth ?? 1;
  if (top === 1 && depth === 1) return 1;
  const topWeight = Math.exp(-cfg.pick.classShapeDecay * (overall - 1));
  return Math.pow(top, topWeight) * Math.pow(depth, 1 - topWeight);
}

/**
 * Probability distribution over the slots a pick could land in.
 *
 * This is the part naive slot estimation gets wrong. This league runs a LOTTERY: every
 * non-playoff team is eligible, so a bad team's first is not a fixed slot, it is a
 * spread over the lottery range. Because the value curve is convex, the expected VALUE
 * of that spread is higher than the value at the expected slot. Averaging over the
 * distribution captures that; picking one slot does not.
 *
 * Playoff teams draft after the lottery in reverse standings order, champion last.
 */
export function slotDistribution(
  round: number,
  ctx: PickSlotContext = {},
  cfg: ValuationConfig = VALUATION_CONFIG,
): Array<{ slot: number; p: number }> {
  const teams = ctx.teams ?? 12;
  if (ctx.slot != null) {
    return [{ slot: Math.min(teams, Math.max(1, ctx.slot)), p: 1 }];
  }
  const rank = ctx.originalTeamRank;
  if (rank == null) return [{ slot: (teams + 1) / 2, p: 1 }];

  const playoffTeams = ctx.playoffTeams;
  const lotterySize = playoffTeams != null ? teams - playoffTeams : 0;
  const missedPlayoffs = playoffTeams != null && rank > playoffTeams;

  if (missedPlayoffs && lotterySize > 1) {
    // Lottery-eligible: spread across slots 1..lotterySize.
    const w = cfg.pick.lotteryWeighting;
    // Worst team (highest rank number) gets the most weight when weighting > 0.
    const seedFromWorst = teams - rank; // 0 = worst team
    const raw: number[] = [];
    for (let i = 0; i < lotterySize; i++) {
      // Flat when w = 0. As w rises, mass concentrates near the team's own seed.
      const distance = Math.abs(i - seedFromWorst);
      raw.push((1 - w) / lotterySize + w * Math.exp(-distance));
    }
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    return raw.map((r, i) => ({ slot: i + 1, p: r / sum }));
  }

  // Playoff team: deterministic, after the lottery, reverse standings.
  // rank 1 (best/champion) picks last.
  const slot = lotterySize + (playoffTeams != null ? playoffTeams - rank + 1 : teams - rank + 1);
  return [{ slot: Math.min(teams, Math.max(1, slot)), p: 1 }];
}

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

  const teams = ctx.teams ?? 12;
  const offset = (round - 1) * teams;

  // Expected value across the slot distribution, not value at the expected slot.
  const dist = slotDistribution(round, ctx, cfg);
  let expected = 0;
  for (const { slot, p } of dist) {
    const overall = offset + slot;
    expected += p * slotValue(overall, cfg) * classMultiplier(overall, ctx.season, cfg);
  }

  // Regress toward a neutral mid-round pick as the class moves further out, because
  // a team's future finish is progressively unknowable.
  const midOverall = offset + (teams + 1) / 2;
  const neutral =
    slotValue(midOverall, cfg) * classMultiplier(midOverall, ctx.season, cfg);
  const trust = Math.max(
    0,
    1 - cfg.pick.slotUncertaintyPerYear * Math.max(0, seasonsOut),
  );
  const blended = neutral + (expected - neutral) * trust;

  const discount = Math.pow(cfg.pick.discountPerYear, Math.max(0, seasonsOut));
  return Math.round(blended * discount);
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
