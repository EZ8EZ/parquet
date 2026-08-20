import { VALUATION_CONFIG } from "./config.js";
import { injuryMultiplier, maxInjuryMultiplier } from "./injury.js";
import { isStarTier, starAgeAdjustment } from "./ageCurve.js";
import { effectiveRanks } from "./production.js";
export { VALUATION_CONFIG } from "./config.js";
export {
  DERIVED_PRODUCTION,
  effectiveRanks,
  MIN_BLEND_POOL,
  PRODUCTION_BY_PLAYER,
  PRODUCTION_PROVENANCE,
  PRODUCTION_WEIGHT,
  productionOf,
} from "./production.js";
export {
  INJURY_CLASS_LABELS,
  injuryAgeScale,
  injuryAssessment,
  injuryClassOf,
  injuryLabel,
  injuryMultiplier,
  maxInjuryMultiplier,
} from "./injury.js";
export {
  AGE_CURVE_PROVENANCE,
  CURVE_SUPPORTED_MAX,
  CURVE_SUPPORTED_MIN,
  DERIVED_AGE_CURVE,
  firstCliffAge,
  isStarTier,
  STAR_AGE_ADJUSTMENT,
  STAR_AGE_ADJUSTMENT_PROVENANCE,
  STAR_SEARCH_RANK_CUTOFF,
  starAgeAdjustment,
} from "./ageCurve.js";
/**
 * @typedef {import('./config.js').ValuationConfig} ValuationConfig
 * @typedef {import('../providers/types.js').Player} Player
 */
/**
 * @typedef {Object} ValuedPlayer
 * @property {string} playerId
 * @property {number} base
 * @property {number} ageMultiplier
 * @property {number} injuryMultiplier
 * @property {number} roleMultiplier
 * @property {number} positionMultiplier
 * @property {boolean} starTier whether the D74 star-tier age adjustment was applied
 * @property {number|null} searchRank Sleeper's own redraft ordinal, unblended
 * @property {number} rank the rank this price was actually computed from
 * @property {number|null} productionIndex measured in-league production, or null
 * @property {boolean} productionBacked whether real production moved this rank at all
 * @property {number} value
 */
/**
 * Linear interpolation across the age anchors, optionally layering the D74 star-tier
 * adjustment on top for a player Sleeper's live consensus ranks in the top decile.
 * `opts.star` is opt-in and defaults to false, so every existing caller that does not
 * pass it (the /methodology curve illustrations, `lib/metrics/duration.ts`'s generic
 * payout-profile math) keeps reading the plain population curve unchanged.
 * @param {number|null|undefined} age
 * @param {ValuationConfig} [cfg]
 * @param {{ star?: boolean }} [opts]
 * @returns {number}
 */
export function ageMultiplier(age, cfg = VALUATION_CONFIG, opts = {}) {
  if (age == null) return 1.0;
  const a = cfg.ageAnchors;
  let m;
  if (age <= a[0][0]) m = a[0][1];
  else if (age >= a[a.length - 1][0]) m = a[a.length - 1][1];
  else {
    m = 1.0;
    for (let i = 0; i < a.length - 1; i++) {
      const [x0, y0] = a[i];
      const [x1, y1] = a[i + 1];
      if (age >= x0 && age <= x1) {
        const t = (age - x0) / (x1 - x0);
        m = y0 + t * (y1 - y0);
        break;
      }
    }
  }
  if (opts.star) m *= starAgeAdjustment(age, cfg.starAgeAdjustment);
  return m;
}
/**
 * @param {number|null|undefined} depthChartOrder
 * @param {ValuationConfig} [cfg]
 * @returns {number}
 */
export function roleMultiplier(depthChartOrder, cfg = VALUATION_CONFIG) {
  if (depthChartOrder == null) return cfg.role.unknown;
  if (depthChartOrder <= 1) return cfg.role.starter;
  if (depthChartOrder === 2) return cfg.role.secondary;
  return cfg.role.bench;
}
/** Fantasy points a canonical line scores under the given scoring settings.
 * @param {import('./config.js').CanonicalLine} line
 * @param {Record<string, number>} scoring
 * @returns {number}
 */
export function lineFantasyPoints(line, scoring) {
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
 * @param {Record<string, number>} scoring
 * @param {ValuationConfig} [cfg]
 * @returns {Record<string, number>} position -> multiplier
 */
export function positionMultipliers(scoring, cfg = VALUATION_CONFIG) {
  const positions = Object.keys(cfg.canonicalLines);
  const fp = positions.map((p) =>
    lineFantasyPoints(cfg.canonicalLines[p], scoring),
  );
  const mean = fp.reduce((s, v) => s + v, 0) / (fp.length || 1);
  /** @type {Record<string, number>} */
  const out = {};
  positions.forEach((p, i) => {
    const rel = mean > 0 ? fp[i] / mean : 1;
    out[p] = 1 + cfg.positionDampen * (rel - 1);
  });
  return out;
}
/**
 * @param {Player} player
 * @returns {string}
 */
function primaryPosition(player) {
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
 *
 * D74's star-tier adjustment does NOT need a term here, and that is checked rather
 * than assumed (`lib/valuation/valuation.test.js`, "star-tier adjustment never lifts
 * a player above the population ceiling"): it only applies from age 27 on, where
 * `ageAnchors` has already fallen from its 1.16 peak to 0.902 or lower, and even the
 * largest measured adjustment (1.264 at 31) only brings the product back up to
 * 1.067 - comfortably under the peak the young end of `ageAnchors` already sets. A
 * future change to either table that breaks this invariant would need this comment
 * (and its test) updated, exactly the discipline `theoreticalMaxMultiplier` already
 * enforces for injury/role/position.
 */
/**
 * @param {Record<string, number>} posMults
 * @param {ValuationConfig} [cfg]
 * @returns {number}
 */
export function theoreticalMaxMultiplier(posMults, cfg = VALUATION_CONFIG) {
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
/**
 * @param {Player} player
 * @param {Record<string, number>} scoring
 * @param {ValuationConfig} [cfg]
 * @param {Record<string, number>} [posMults]
 * @param {import('./production.js').EffectiveRank|null} [effective] this player's
 *   production-blended rank, from `effectiveRanks()` over the WHOLE pool. Omitted, the
 *   player is priced on his raw `searchRank` exactly as before production existed -
 *   which is the correct fallback for a player the league has never rostered, and the
 *   WRONG thing to rely on for a player it has. Every production call site now reaches
 *   `cachedValuePlayers`, so a single-player price can no longer disagree with the page
 *   it came from; that disagreement is the `tierOf` failure of D55 in another costume.
 * @returns {ValuedPlayer}
 */
export function valuePlayer(
  player,
  scoring,
  cfg = VALUATION_CONFIG,
  posMults,
  effective,
) {
  const eff = effective ?? null;
  const rank = eff?.rank ?? player.searchRank ?? 260;
  const base = cfg.maxValue * Math.exp(-cfg.rankDecay * Math.max(0, rank - 1));
  // D74: a top-decile-consensus player is charged the STAR-TIER age adjustment on
  // top of the ordinary curve (a no-op for anyone else, and a no-op below the
  // adjustment's own applied floor - see ageCurve.ts).
  //
  // ON `player.searchRank` AND NOT `rank`, DELIBERATELY. D74's cohort was measured as a
  // season's top decile by era-relative PRODUCTION, with the consensus ordinal standing
  // in for it at runtime because no production input existed - so pointing this at the
  // production-blended rank is arguably what D74 wanted all along. It is still not done
  // here: it would change which players the adjustment selects without re-measuring the
  // adjustment against the changed cohort, and it would put two effects into one diff so
  // that neither could be attributed. See production.js, "deliberately not done".
  const isStar = isStarTier(player.searchRank, cfg.starSearchRankCutoff);
  const ageMult = ageMultiplier(player.age, cfg, { star: isStar });
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
    // Whether the D74 star-tier adjustment was applied - so a caller replaying the
    // age curve forward (app/roster's valueTrajectory) can reproduce the SAME curve
    // this value was actually priced on, not silently fall back to the population one.
    starTier: isStar,
    // BOTH ranks, always, so a reader can see the disagreement rather than only its
    // result: `searchRank` is what the market thinks, `rank` is what this price was
    // actually computed from, and the gap between them IS the production term.
    searchRank: player.searchRank ?? null,
    rank,
    productionIndex: eff?.index ?? null,
    // D19. False means "priced on the consensus ordinal alone, because this league has
    // no eight-week record of him" - a stated fallback, never a fabricated number.
    productionBacked: eff != null,
    value: Math.max(0, value),
  };
}
/** Value every player, returning a Map keyed by playerId.
 * @param {Player[]} players
 * @param {Record<string, number>} scoring
 * @param {ValuationConfig} [cfg]
 * @returns {Map<string, ValuedPlayer>}
 */
export function valuePlayers(players, scoring, cfg = VALUATION_CONFIG) {
  const posMults = positionMultipliers(scoring, cfg);
  // ONCE, over the whole pool, because the production blend is a PERMUTATION of the
  // pool's own search ranks and a permutation is not something a per-player function
  // can compute. Everything downstream of this is per-player again.
  const effective = effectiveRanks(players, cfg.productionWeight);
  const out = new Map();
  for (const p of players)
    out.set(
      p.playerId,
      valuePlayer(p, scoring, cfg, posMults, effective.get(p.playerId)),
    );
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
let valuesByCorpus = new WeakMap();
/**
 * @param {{ players: Map<string, Player>, currentLeague: { scoringSettings: Record<string, number> } }} h
 * @param {ValuationConfig} [cfg]
 * @returns {Map<string, ValuedPlayer>}
 */
export function cachedValuePlayers(h, cfg = VALUATION_CONFIG) {
  if (cfg !== VALUATION_CONFIG) {
    return valuePlayers(
      [...h.players.values()],
      h.currentLeague.scoringSettings,
      cfg,
    );
  }
  const hit = valuesByCorpus.get(h.players);
  if (hit) return hit;
  const value = valuePlayers(
    [...h.players.values()],
    h.currentLeague.scoringSettings,
  );
  valuesByCorpus.set(h.players, value);
  return value;
}
let noProductionByCorpus = new WeakMap();
/**
 * THE SAME MODEL WITH THE PRODUCTION WEIGHT AT ZERO - the counterfactual, run rather
 * than derived.
 *
 * WHY THIS EXISTS AT ALL, given `/methodology` already had a one-line shortcut for it.
 * Every multiplier is identical either way (the star-tier flag reads the RAW search rank
 * on purpose), so two values differ by exactly the ratio of their bases, which is one
 * exponential - and the page computed the counterfactual that way, with no second pass.
 * The algebra is correct. It is also NOT what the model outputs, because `value` is
 * already rounded before the exponential multiplies it and the product is rounded again.
 *
 * MEASURED, on the live league: the shortcut matched the model exactly for 178 of 246
 * backed rostered players and differed by at most 2 points for the other 68. That is
 * comfortably invisible in a sentence like "4,006 to 2,089", which is all the shortcut
 * was ever asked to support. It stops being invisible the moment the two numbers become
 * the two ends of a DRAWN MARK: a dumbbell is an assertion that its dots sit where the
 * model puts them, and "within two points of where the model puts them" is a different
 * and weaker claim. The ordering of the largest movers is unaffected either way - the
 * top ten come out in the same order - so nothing about the page's conclusions changes.
 * What changes is that the drawn dots are now the model's own output.
 *
 * The cost is one extra pass over the corpus on one page, memoized on the same corpus
 * identity `cachedValuePlayers` keys on (see its header for why identity and not a TTL).
 * @param {{ players: Map<string, Player>, currentLeague: { scoringSettings: Record<string, number> } }} h
 * @returns {Map<string, ValuedPlayer>}
 */
export function cachedNoProductionValuePlayers(h) {
  const hit = noProductionByCorpus.get(h.players);
  if (hit) return hit;
  const value = valuePlayers(
    [...h.players.values()],
    h.currentLeague.scoringSettings,
    { ...VALUATION_CONFIG, productionWeight: 0 },
  );
  noProductionByCorpus.set(h.players, value);
  return value;
}
/** Drop every memoized value map. Test hook, mirroring the other in-process
 *  caches' `invalidateX` convention - production code never needs it, since a
 *  corpus refresh invalidates by identity on its own. */
export function invalidateValuesCache() {
  valuesByCorpus = new WeakMap();
  noProductionByCorpus = new WeakMap();
}
/**
 * Estimate the overall pick number (1-based across the whole rookie draft).
 *
 * With a known slot, exact. With only the original team's strength, we invert the
 * standings (worst team picks first) and then regress that estimate toward the league
 * midpoint as the pick moves further into the future, because next season's order is
 * roughly guessable and 2029's is not.
 */
/**
 * @typedef {Object} PickCtx
 * @property {number} [teams]
 * @property {number} [slot] known slot, if any
 * @property {number} [originalTeamRank] 1 = best team, `teams` = worst
 * @property {number} [playoffTeams]
 * @property {string|number} [season]
 */
/**
 * @param {number} round
 * @param {number} seasonsOut
 * @param {PickCtx} [ctx]
 * @param {ValuationConfig} [cfg]
 * @returns {number}
 */
export function estimateOverallPick(
  round,
  seasonsOut,
  ctx = {},
  cfg = VALUATION_CONFIG,
) {
  const teams = ctx.teams ?? 12;
  const mid = (teams + 1) / 2;
  let slot;
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
/**
 * @param {number} overall
 * @param {ValuationConfig} [cfg]
 * @returns {number}
 */
export function slotValue(overall, cfg = VALUATION_CONFIG) {
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
/**
 * @param {number} overall
 * @param {string|number|undefined} season
 * @param {ValuationConfig} [cfg]
 * @returns {number}
 */
export function classMultiplier(overall, season, cfg = VALUATION_CONFIG) {
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
/**
 * @param {number} round
 * @param {PickCtx} [ctx]
 * @param {ValuationConfig} [cfg]
 * @returns {{ slot: number, p: number }[]}
 */
export function slotDistribution(round, ctx = {}, cfg = VALUATION_CONFIG) {
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
    const raw = [];
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
  const slot =
    lotterySize +
    (playoffTeams != null ? playoffTeams - rank + 1 : teams - rank + 1);
  return [{ slot: Math.min(teams, Math.max(1, slot)), p: 1 }];
}
/**
 * @param {number} round
 * @param {number} seasonsOut
 * @param {PickCtx|ValuationConfig} [ctxOrCfg]
 * @param {ValuationConfig} [maybeCfg]
 * @returns {number}
 */
export function pickValue(round, seasonsOut, ctxOrCfg, maybeCfg) {
  // Back-compatible: the third arg used to be the config.
  /** @param {unknown} v @returns {v is ValuationConfig} */
  const isCfg = (v) => !!v && typeof v === "object" && "maxValue" in v;
  const cfg = maybeCfg ?? (isCfg(ctxOrCfg) ? ctxOrCfg : VALUATION_CONFIG);
  const ctx = isCfg(ctxOrCfg) ? {} : (ctxOrCfg ?? {});
  const teams = ctx.teams ?? 12;
  const offset = (round - 1) * teams;
  // Expected value across the slot distribution, not value at the expected slot.
  const dist = slotDistribution(round, ctx, cfg);
  let expected = 0;
  for (const { slot, p } of dist) {
    const overall = offset + slot;
    expected +=
      p * slotValue(overall, cfg) * classMultiplier(overall, ctx.season, cfg);
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
/*
 * `tierOf(value)` USED TO LIVE HERE and mapped a value to a tier name with six
 * hardcoded literals (7000 = Franchise, 4500 = Cornerstone, 2800, 1500, 700, 250).
 * It is gone, deliberately, and nothing replaced it in this file.
 *
 * Those literals were fitted to where this league's value distribution cliffed when
 * they were written, and while that held they agreed with `lib/rankings/tiers.ts`,
 * which reads the breaks off the live distribution instead. The age-curve
 * recalibration moved the distribution and the two systems came apart without any
 * error: measured against the live league, 7000 stopped tracking the top break (which
 * moved from 7,133 to 7,605) and 2800 fell from a clean gap into the middle of a
 * cluster, so a trade receipt and /values started printing different tier names for
 * the same player on the same afternoon.
 *
 * The replacement is `leagueTierLabel(h)` in `lib/rankings/leagueTiers.ts`: one recipe,
 * derived from the distribution it is describing, so this cannot drift again.
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}
