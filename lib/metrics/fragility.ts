/**
 * THE ROSTER FRAGILITY INDEX (RFI).
 *
 * ---------------------------------------------------------------------------------
 * The question
 * ---------------------------------------------------------------------------------
 * Dynasty Duration (./duration.ts) answers WHEN a roster's value arrives. It is
 * deliberately blind to a second question that decides just as many seasons:
 *
 *   How much of this roster's season is load-bearing on a handful of assets,
 *   and what breaks first?
 *
 * Two rosters can hold the same total value, arriving at the same time, and be in
 * completely different danger. One holds two superstars and fourteen warm bodies. The
 * other holds nine good players. Total value cannot tell them apart. Duration cannot
 * tell them apart, because both are perfectly coherent on the timeline. But one of them
 * loses its season the night a knee goes, and the other does not.
 *
 * This matters more here than in a typical league for two structural reasons, both
 * specific to this league rather than assumed:
 *
 *   1. LOCK-IN SCORING. You commit players per game night, not weekly totals. Every
 *      night you have to field a legal lineup out of bodies who are actually playing.
 *      A roster that cannot fill its slots on a Tuesday forfeits real points, and no
 *      amount of top-end value fixes an empty slot.
 *   2. FOURTEEN TEAMS with seven lineup slots (PG/SG/SF/PF/C plus two UTIL). That is
 *      98 startable bodies needed league-wide out of a shallow pool, so the waiver wire
 *      is not a safety net. Depth has to already be on your roster.
 *
 * ---------------------------------------------------------------------------------
 * The construction: three things that are all "fragility" and none of which is enough
 * ---------------------------------------------------------------------------------
 * 1. LEAVE-ONE-OUT (LOO) DAMAGE. Proper leave-one-out analysis, not a heuristic. For
 *    each player, delete him from the roster, RE-SOLVE the optimal lineup out of who is
 *    left, and measure how much startable value the roster lost. Because the lineup is
 *    re-solved rather than patched, the vacated slot is automatically filled by the best
 *    internal alternative who is eligible for it, and positional eligibility is priced
 *    for free: a roster whose only true centre is one man takes catastrophic damage when
 *    he is removed, even if it is otherwise deep. That is precisely the failure mode a
 *    positional count cannot see. The largest damage names the SINGLE POINT OF FAILURE.
 *
 * 2. CONCENTRATION. A normalized Herfindahl-Hirschman index over starter-weighted asset
 *    value. LOO is a statement about the top of the distribution; concentration is a
 *    statement about its whole shape, and the two genuinely disagree. A roster can have
 *    a small SPOF (because its best player happens to be positionally replaceable) while
 *    still holding all of its value in four men.
 *
 * 3. AVAILABILITY EXPOSURE. Where the value SITS matters, not just how much of it there
 *    is. Value parked in a 37-year-old body and value parked in a 25-year-old body are
 *    not the same asset in a league that asks you to field a lineup 82 nights a year.
 *    This reuses the injury multipliers from the valuation config and the age taper from
 *    duration.ts, so it cannot drift away from the models it borrows from.
 *
 * The three are combined with the weights below into one 0..100 index where HIGHER
 * MEANS MORE FRAGILE, plus a league-relative percentile.
 *
 * ---------------------------------------------------------------------------------
 * What this deliberately does NOT do
 * ---------------------------------------------------------------------------------
 * PICKS ARE EXCLUDED. A 2028 first cannot fill a lineup slot tonight, so it cannot make
 * this season less fragile. Folding pick capital in would make the most extreme teardown
 * in the league (nine thousand points of players, sixteen thousand of picks) read as
 * robust, which is the opposite of true. Pick capital is real optionality and is measured
 * honestly elsewhere (lib/picks.ts); it is not depth.
 *
 * A FULL 82-NIGHT SIMULATION was the alternative considered and rejected. The honest
 * version of "can you fill your slots every night" needs the NBA schedule, per-team
 * back-to-backs and rest patterns, none of which this app ingests. One optimally solved
 * lineup is a defensible proxy for nightly capacity: if the best lineup you can build
 * collapses when one man is deleted, the 82 worse cases collapse too.
 *
 * RFI IS DIRECTION-FREE about strategy, like TCI. A contender and a rebuilder can both
 * be robust or brittle. It measures whether the roster can absorb a hit, not whether we
 * approve of what it is trying to do.
 *
 * RFI IS ALSO NOT A QUALITY METRIC, and the most important thing to say out loud about it
 * is that low fragility is not the same as good. The most stripped-down roster in this
 * league scores mid-pack, because a roster with nothing to lose loses nothing when a
 * player goes down. That is not a bug in the index, it is the honest reading: uniformly
 * weak is robustly weak. `depthBeyondStarters` and `startableValue` are on the profile
 * precisely so this cannot be misread, and the copy for a low score says it too.
 *
 * DEPTH IS REPORTED BUT IS NOT A FOURTH TERM. It would be double counting: a roster with
 * no depth already shows up as large LOO damages, because there is nobody for the lineup
 * to re-solve around. Depth is the diagnostic that explains the score, not another input
 * to it.
 */
import type { LeagueHistory } from "../history";
import type { Player } from "../providers/types";
import {
  injuryMultiplier,
  valuePlayers,
  VALUATION_CONFIG,
  type ValuationConfig,
} from "../valuation";
import { availability } from "./duration";

// ---------------------------------------------------------------------------------
// Weights. These three sum to 1 and are the whole editorial claim of the metric.
// ---------------------------------------------------------------------------------

/**
 * LOO gets the most weight (0.45) because it is the only component that runs an actual
 * counterfactual. The other two are descriptions of a distribution; this one deletes a
 * player and re-solves the lineup, so it prices positional eligibility, bench quality
 * and top-heaviness simultaneously, and it is the component that produces an actionable
 * output (a name). It does not get a majority on its own because it is a statement about
 * three players and a roster is eighteen.
 */
export const W_LOO = 0.45;
/**
 * Concentration gets 0.35. It sees the whole distribution rather than its top, which is
 * the check on LOO: a roster whose stars are individually replaceable can still have
 * every point of real value in four men, and that roster is one bad month from nothing.
 * It is weighted below LOO because HHI is agnostic about WHERE the concentration sits,
 * and concentration in genuinely irreplaceable assets is worse than the same number
 * spread across a flexible frontcourt.
 */
export const W_CONCENTRATION = 0.35;
/**
 * Availability exposure gets 0.20: real, but the weakest-evidenced of the three and so
 * it adjusts rather than drives. Injury status is a snapshot that can change within a
 * day (91 of 251 rostered players in this league are currently day-to-day, which is
 * noise more than signal), and the age term is a career taper being read as body risk.
 * Weighting it like the other two would make the index twitch on nothing. Weighting it
 * zero would let a roster whose entire core is 36 read as robust, which is worse.
 */
export const W_EXPOSURE = 0.20;

// ---------------------------------------------------------------------------------
// Normalising references. Same job SIGMA_REF does in duration.ts: turn a raw ratio into
// a 0..100 score. All three were calibrated against the observed spread across this
// league's 14 rosters, not against a theoretical worst case. That distinction is not
// pedantic: the first version of TCI was normalised against an unreachable extreme and
// compressed all 14 teams into an 18-point band, which is no resolution at all.
// ---------------------------------------------------------------------------------

/**
 * How many of the biggest LOO damages count as "a handful". Seven lineup slots, so three
 * is a bit under half the lineup, which is the right scale for the question being asked.
 * K = 1 is too noisy (it is one player and one positional accident); K = 7 degenerates
 * into total starter value and stops measuring concentration of risk at all.
 */
export const LOO_TOP_K = 3;
/**
 * Reference top-K damage share.
 *
 * Measured across this league's 14 rosters, the top three LOO damages account for 0.33
 * to 0.80 of startable value (median 0.56). An earlier value of 0.6 came from a
 * back-of-envelope guess rather than the data and clipped EIGHT of the fourteen teams at
 * exactly 100, which destroyed the component: the difference between a top-heavy roster
 * and a catastrophically top-heavy one disappeared. At 0.9 the observed range spans
 * roughly 37 to 89 and nothing saturates. Read 0.9 as its literal claim: if your three
 * most load-bearing players are ninety percent of your startable value, they are not
 * part of your season, they ARE your season.
 */
export const LOO_REF = 0.9;
/**
 * Reference normalized HHI. Normalized HHI is already 0..1 by construction, but real
 * rosters live in the bottom fifth of that range (observed 0.074 to 0.209 here), because
 * the theoretical 1.0 requires literally one asset. Mapping the raw value straight to
 * 0..100 would report every team in the league as robust. 0.25 sits just above the most
 * concentrated roster observed, so the top of the scale stays reachable but is not
 * reached in a normal season; the observed range spreads across 30 to 84.
 */
export const CONCENTRATION_REF = 0.25;
/**
 * Reference availability exposure. Observed 0.008 (a young, healthy, mostly
 * unremarkable-status roster) to 0.075 (one carrying real value in post-35 bodies).
 * The theoretical maximum is far higher - a roster of 38-year-olds would score about
 * 0.63 - but normalising against that would flatten every real team to single digits,
 * which is the same mistake as calibrating to an unreachable extreme. 0.12 is set a
 * little above the worst roster in the league, which is what makes the component
 * discriminate: it spreads the observed range over 7 to 63 rather than 5 to 50.
 */
export const EXPOSURE_REF = 0.12;
/**
 * What a bench asset contributes to the starter-weighted value used for concentration.
 *
 * Not 0: in a lock-in league bench players genuinely play, because back-to-backs and
 * rest nights force rotation, so bench value is not pure insurance. Not 1 either: a
 * bench asset's contribution this season is contingent on a slot opening for him. Half
 * is the honest middle, and it is the one number here that is a judgement rather than a
 * calibration.
 */
export const BENCH_CONTRIBUTION = 0.5;
/**
 * Age assumed when a player's age is unknown. Same value duration.ts uses for the same
 * reason: it is the median age of a rostered player in this league, so an unknown age
 * neither flatters nor penalises.
 */
const UNKNOWN_AGE = 25;
/**
 * Slots that are not lineup slots. Anything else in `rosterPositions` is something you
 * have to fill on a game night.
 */
const NON_LINEUP_SLOTS = new Set(["BN", "IR", "TAXI"]);
/**
 * Cap on lineup slots fed to the assignment solver. The solver is exact and exponential
 * in slot count (2^slots masks), which is free at basketball's 5 to 10 slots. The cap
 * exists so a pathological league configuration degrades to "solve the first 12 slots"
 * instead of hanging. No real basketball lineup comes close.
 */
const MAX_LINEUP_SLOTS = 12;

// ---------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------

/** The minimum a player has to tell us to be scored for fragility. */
export interface FragilityAsset {
  playerId: string;
  name: string;
  /** Dynasty value on the common scale (lib/valuation). */
  value: number;
  /** Lineup positions this asset is eligible for (Sleeper `fantasy_positions`). */
  positions: string[];
  age: number | null;
  injuryStatus: string | null;
}

/** One player's leave-one-out result. */
export interface LooDamage {
  playerId: string;
  name: string;
  value: number;
  /** Startable value lost when this player is deleted and the lineup is re-solved. */
  damage: number;
  /** damage / startableValue. The share of the roster's season this player carries. */
  damageShare: number;
  /** Whether he is in the optimal lineup. Non-starters have damage exactly 0. */
  starter: boolean;
}

export interface FragilityProfile {
  rosterId: number;
  teamName: string | null;
  ownerName: string;
  /** 0..100. HIGHER = MORE FRAGILE. */
  fragility: number;
  /** Share of the league this roster is MORE fragile than. 1 = most fragile in league. */
  percentile: number;
  /** Percentile band, for copy and colour. */
  band: "resilient" | "balanced" | "brittle";
  /** Component scores, each 0..100 and each already inverted so higher = worse. */
  looScore: number;
  concentrationScore: number;
  exposureScore: number;
  /** Raw component values, before normalisation, for anything that wants to show them. */
  spofDamageShare: number;
  topKDamageShare: number;
  normalizedHhi: number;
  rawExposure: number;
  /** Value of the optimally solved starting lineup. */
  startableValue: number;
  /** Total value of every player on the roster (picks excluded, deliberately). */
  playerValue: number;
  /**
   * Startable-quality bodies beyond the number of lineup slots. Negative means the
   * roster is already forced to start players the rest of the league would bench.
   */
  depthBeyondStarters: number;
  /** The league-derived value line "startable-quality" is measured against. */
  replacementValue: number;
  /** The asset whose removal costs the most. Null only for an empty roster. */
  singlePointOfFailure: {
    playerId: string;
    name: string;
    damage: number;
    damageShare: number;
  } | null;
  /** Every asset's LOO result, most damaging first. */
  damages: LooDamage[];
  /** Plain-language read, written to be useful rather than flattering. */
  read: string;
}

// ---------------------------------------------------------------------------------
// Lineup solving
// ---------------------------------------------------------------------------------

/**
 * Can this asset fill this lineup slot?
 *
 * UTIL and FLEX take anyone. G and F are the grouped guard/forward slots some leagues
 * run; handling them here rather than assuming this league's exact slot list means the
 * metric survives a league-settings change without silently scoring nonsense. Everything
 * else is an exact position match.
 */
export function slotEligible(slot: string, positions: string[]): boolean {
  if (slot === "UTIL" || slot === "FLEX" || slot === "SUPER_FLEX") return true;
  if (slot === "G") return positions.some((p) => p === "PG" || p === "SG");
  if (slot === "F") return positions.some((p) => p === "SF" || p === "PF");
  return positions.includes(slot);
}

/** The lineup slots a league actually asks you to fill on a game night. */
export function lineupSlots(h: LeagueHistory): string[] {
  const slots = (h.currentLeague.rosterPositions ?? []).filter(
    (s) => !NON_LINEUP_SLOTS.has(s),
  );
  return slots.slice(0, MAX_LINEUP_SLOTS);
}

/** A solved lineup: its value, and which assets are in it. */
export interface SolvedLineup {
  value: number;
  starterIds: Set<string>;
}

/**
 * Maximum-value legal lineup, solved exactly.
 *
 * This is a maximum-weight bipartite matching between assets and slots. It is solved
 * with a DP over the SUBSET OF SLOTS FILLED (2^slots states, walked once per asset)
 * rather than greedily, because greedy is wrong in exactly the cases this metric exists
 * to find: given a centre-only asset and a centre-or-forward asset, greedy takes the
 * more valuable one first and can strand the other, understating the lineup and
 * therefore misreporting damage. An exact solver costs 128 states here and removes the
 * question entirely.
 *
 * Assets are pre-sorted and improvements require a STRICT increase, so ties resolve the
 * same way every run. Determinism is a hard requirement, not a nicety: the whole index
 * is built on differences between solved lineups.
 */
export function solveLineup(
  assets: FragilityAsset[],
  slots: string[],
): SolvedLineup {
  const usable = assets
    .filter((a) => a.value > 0)
    .sort((a, b) => b.value - a.value || a.playerId.localeCompare(b.playerId));
  const s = slots.length;
  if (s === 0 || usable.length === 0) return { value: 0, starterIds: new Set() };

  const nMask = 1 << s;
  // eligible[i] = bitmask of slots asset i can fill.
  const eligible = usable.map((a) => {
    let m = 0;
    for (let j = 0; j < s; j++) if (slotEligible(slots[j], a.positions)) m |= 1 << j;
    return m;
  });

  const NEG = -1;
  let cur = new Float64Array(nMask).fill(NEG);
  cur[0] = 0;
  // choice[i][mask] = the slot asset i took to reach `mask`, or -1 if it skipped.
  const choice: Int8Array[] = [];

  for (let i = 0; i < usable.length; i++) {
    const next = new Float64Array(nMask).fill(NEG);
    const ch = new Int8Array(nMask).fill(-1);
    const elig = eligible[i];
    for (let mask = 0; mask < nMask; mask++) {
      // Skip this asset.
      if (cur[mask] > next[mask]) {
        next[mask] = cur[mask];
        ch[mask] = -1;
      }
      // Or place it in one of the slots that `mask` says is filled.
      for (let j = 0; j < s; j++) {
        const bit = 1 << j;
        if (!(mask & bit) || !(elig & bit)) continue;
        const prev = cur[mask ^ bit];
        if (prev < 0) continue;
        const cand = prev + usable[i].value;
        if (cand > next[mask]) {
          next[mask] = cand;
          ch[mask] = j;
        }
      }
    }
    choice.push(ch);
    cur = next;
  }

  // Values are non-negative, so filling more slots is never worse, but scan all masks
  // anyway rather than assuming the full mask is reachable (it is not when the roster
  // has fewer eligible bodies than slots, which is itself a fragility signal).
  let bestMask = 0;
  let best = 0;
  for (let mask = 0; mask < nMask; mask++) {
    if (cur[mask] > best) {
      best = cur[mask];
      bestMask = mask;
    }
  }

  const starterIds = new Set<string>();
  let mask = bestMask;
  for (let i = usable.length - 1; i >= 0; i--) {
    const j = choice[i][mask];
    if (j >= 0) {
      starterIds.add(usable[i].playerId);
      mask ^= 1 << j;
    }
  }
  return { value: best, starterIds };
}

/** Value of the optimally solved lineup. */
export function startableValue(assets: FragilityAsset[], slots: string[]): number {
  return solveLineup(assets, slots).value;
}

// ---------------------------------------------------------------------------------
// 1. Leave-one-out damage
// ---------------------------------------------------------------------------------

/**
 * Leave-one-out damage for every asset, most damaging first.
 *
 * damage_i = startable(roster) - startable(roster minus i)
 *
 * NON-STARTERS ARE SHORT-CIRCUITED TO ZERO, and that is exact rather than an
 * approximation. If i is not in the solved lineup, that same lineup is still legal after
 * i is deleted, so startable(roster minus i) >= startable(roster); and deleting an asset
 * can never raise the maximum, so it is also <= . Hence damage is exactly 0. The same
 * argument bounds damage_i <= value_i for starters, which is what keeps every share
 * below computed against startable value inside 0..1.
 *
 * The consequence worth stating: this re-solves the lineup, so damage already nets off
 * the best internal replacement. A star with a good backup at his position shows small
 * damage. That is the point, and it is why this cannot be replaced by "share of value".
 */
export function looDamage(
  assets: FragilityAsset[],
  slots: string[],
): LooDamage[] {
  const solved = solveLineup(assets, slots);
  const base = solved.value;
  const out: LooDamage[] = assets.map((a) => {
    const starter = solved.starterIds.has(a.playerId);
    const damage = starter
      ? Math.max(0, base - startableValue(without(assets, a.playerId), slots))
      : 0;
    return {
      playerId: a.playerId,
      name: a.name,
      value: a.value,
      damage,
      damageShare: base > 0 ? damage / base : 0,
      starter,
    };
  });
  out.sort(
    (a, b) =>
      b.damage - a.damage ||
      b.value - a.value ||
      a.playerId.localeCompare(b.playerId),
  );
  return out;
}

function without(assets: FragilityAsset[], playerId: string): FragilityAsset[] {
  return assets.filter((a) => a.playerId !== playerId);
}

// ---------------------------------------------------------------------------------
// 2. Concentration
// ---------------------------------------------------------------------------------

/**
 * Normalized Herfindahl-Hirschman index over a set of values.
 *
 *   HHI  = sum_i ( v_i / total )^2
 *   norm = (HHI - 1/n) / (1 - 1/n)
 *
 * The normalisation is what makes this comparable across rosters of different sizes: a
 * perfectly even roster maps to 0 and a single-asset roster maps to 1, regardless of n.
 * Raw HHI does not have that property, so a 19-player roster would look structurally
 * less concentrated than a 17-player one purely for holding two more fringe bodies.
 *
 * `minMembers` is the floor on n, and it is not a detail. Normalized HHI measures
 * inequality RELATIVE TO n, which produces a genuinely wrong answer if n is allowed to
 * be whatever the roster happens to hold: five evenly valued players and nothing else
 * scores 0.003 (a perfectly even set) while the same five plus five real backups scores
 * 0.036, because the backups are below the mean and so read as inequality. Measured that
 * way, SHEDDING DEPTH LOWERS CONCENTRATION, which is backwards and was caught by the
 * depth property test rather than by inspection. Pinning n to the number of bodies the
 * league expects you to be able to spread value across fixes it: adding depth then always
 * lowers concentration and removing it always raises it, which is what the word means.
 *
 * Zero-value assets contribute nothing to HHI and do not push n past `minMembers`, so a
 * roster cannot manufacture apparent diversification by hoarding worthless players.
 *
 * An empty set, or a single asset, returns 1: everything you have is in one place.
 */
export function concentration(values: number[], minMembers = 0): number {
  const vs = values.filter((v) => v > 0);
  const n = Math.max(vs.length, minMembers);
  if (n <= 1) return 1;
  const total = vs.reduce((s, v) => s + v, 0);
  if (total <= 0) return 1;
  const hhi = vs.reduce((s, v) => s + (v / total) ** 2, 0);
  return clamp01((hhi - 1 / n) / (1 - 1 / n));
}

/**
 * The even-distribution benchmark concentration is measured against: a starter and one
 * backup at every lineup slot. Fourteen bodies in this league.
 *
 * Derived from the league's own lineup shape rather than from roster capacity, because
 * capacity includes bench spots a manager is free to leave empty or fill with lottery
 * tickets, while "one backup per slot" is the minimum structure a lock-in league actually
 * demands of you. Real rosters here carry 17 to 19 valued players, so the floor almost
 * never binds in practice; it exists so the measure stays honest on a stripped roster
 * instead of rewarding it for having nothing left to be unequal about.
 */
export const BACKUP_DEPTH_MULTIPLE = 2;

/** Number of bodies a roster is expected to spread value across, given its lineup. */
export function concentrationBenchmark(slots: string[]): number {
  return slots.length * BACKUP_DEPTH_MULTIPLE;
}

/**
 * Starter-weighted values for the concentration measure: lineup players at full value,
 * everyone else discounted by BENCH_CONTRIBUTION.
 *
 * Weighting is necessary because concentration OF WHAT is the whole question. Raw roster
 * value says a team with two stars and sixteen scrubs is diversified. Starter weighting
 * says the value that decides games is concentrated, and discounts (without erasing) the
 * bench that would have to absorb a loss.
 */
export function starterWeights(
  assets: FragilityAsset[],
  slots: string[],
): number[] {
  const { starterIds } = solveLineup(assets, slots);
  return assets.map((a) =>
    a.value * (starterIds.has(a.playerId) ? 1 : BENCH_CONTRIBUTION),
  );
}

// ---------------------------------------------------------------------------------
// 3. Availability exposure
// ---------------------------------------------------------------------------------

/**
 * Value-weighted exposure to assets that may not play, 0..1.
 *
 *   play_i     = injuryMultiplier(status_i) * availability(age_i)
 *   exposure   = sum_i v_i * (1 - play_i) / sum_i v_i
 *
 * Both terms are borrowed rather than invented, on purpose. `injuryMultiplier` is the
 * league's own valuation config, so the statuses this league actually reports are priced
 * exactly as the value model prices them. `availability` is duration.ts's career taper,
 * reused so the two metrics cannot disagree about when a body stops being reliable.
 *
 * Read this as an INDEX OF EXPOSURE, not a probability of missing games. A 37-year-old
 * scoring 0.5 on the taper does not mean he misses half the season; it means half of his
 * remaining career is behind him and the risk attached to his minutes is high. A genuine
 * games-missed model would need per-player injury history, which this app does not
 * ingest, and faking the precision would be worse than naming the proxy.
 *
 * Value-weighted, not headcount-weighted: a fragile fringe body is not a problem, and a
 * fragile franchise player is the only problem.
 */
export function availabilityExposure(
  assets: FragilityAsset[],
  cfg: ValuationConfig = VALUATION_CONFIG,
): number {
  let num = 0;
  let den = 0;
  for (const a of assets) {
    if (a.value <= 0) continue;
    const play = clamp01(
      injuryMultiplier(a.injuryStatus, cfg) * availability(a.age ?? UNKNOWN_AGE),
    );
    num += a.value * (1 - play);
    den += a.value;
  }
  return den > 0 ? clamp01(num / den) : 0;
}

// ---------------------------------------------------------------------------------
// Depth
// ---------------------------------------------------------------------------------

/**
 * Startable-quality bodies beyond the number of lineup slots.
 *
 * `replacementValue` is derived from the LEAGUE (see `replacementLevel`), never from a
 * hardcoded number, so "startable quality" means the same thing on every team's page and
 * rescales automatically if the league changes size or lineup shape.
 *
 * Can be negative, and that is the useful case: -2 means the roster is already forced to
 * start two players the rest of the league would have on its bench, so it has no slack
 * left to absorb anything.
 */
export function depthBeyondStarters(
  assets: FragilityAsset[],
  slots: string[],
  replacementValue: number,
): number {
  const startable = assets.filter((a) => a.value >= replacementValue).length;
  return startable - slots.length;
}

/**
 * The value of the last player the league would expect to be starting.
 *
 * teams * lineup slots startable bodies are needed league-wide, so the value at that
 * rank in the pool of rostered players IS replacement level in this league. Derived, not
 * assumed: a 14-team league starting seven is a much shallower pool than a 10-team
 * league starting five, and a fixed threshold would be wrong in both.
 */
export function replacementLevel(values: number[], neededBodies: number): number {
  const desc = values.filter((v) => v > 0).sort((a, b) => b - a);
  if (desc.length === 0) return 0;
  const idx = Math.min(desc.length, Math.max(1, neededBodies)) - 1;
  return desc[idx];
}

// ---------------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------------

/** The scored parts of one roster, before league context is applied. */
export interface FragilityScore {
  looScore: number;
  concentrationScore: number;
  exposureScore: number;
  spofDamageShare: number;
  topKDamageShare: number;
  normalizedHhi: number;
  rawExposure: number;
  /** Unrounded 0..100 index. Rounded only at the profile boundary. */
  raw: number;
  startableValue: number;
  damages: LooDamage[];
}

/**
 * Score one roster's assets. Pure, and the whole index in one place.
 *
 * Each component is normalised to 0..1 against its reference, clamped, then combined
 * with the declared weights. Clamping before combining rather than after is deliberate:
 * without it a single extreme component could carry the index past 100, and a bounded
 * index is a promise the tests hold this file to.
 */
export function scoreFragility(
  assets: FragilityAsset[],
  slots: string[],
  cfg: ValuationConfig = VALUATION_CONFIG,
): FragilityScore {
  const damages = looDamage(assets, slots);
  const startable = startableValue(assets, slots);

  const spofDamageShare = damages[0]?.damageShare ?? 0;
  const topKDamageShare = damages
    .slice(0, LOO_TOP_K)
    .reduce((s, d) => s + d.damageShare, 0);
  const normalizedHhi = concentration(
    starterWeights(assets, slots),
    concentrationBenchmark(slots),
  );
  const rawExposure = availabilityExposure(assets, cfg);

  const loo01 = clamp01(topKDamageShare / LOO_REF);
  const conc01 = clamp01(normalizedHhi / CONCENTRATION_REF);
  const expo01 = clamp01(rawExposure / EXPOSURE_REF);

  return {
    looScore: 100 * loo01,
    concentrationScore: 100 * conc01,
    exposureScore: 100 * expo01,
    spofDamageShare,
    topKDamageShare,
    normalizedHhi,
    rawExposure,
    raw: 100 * (W_LOO * loo01 + W_CONCENTRATION * conc01 + W_EXPOSURE * expo01),
    startableValue: startable,
    damages,
  };
}

// ---------------------------------------------------------------------------------
// League assembly
// ---------------------------------------------------------------------------------

function assetsOf(
  roster: { players: string[] } | undefined,
  h: LeagueHistory,
  valueOf: (playerId: string) => number,
): FragilityAsset[] {
  const out: FragilityAsset[] = [];
  for (const pid of roster?.players ?? []) {
    const p: Player | undefined = h.players.get(pid);
    if (!p) continue;
    const value = valueOf(pid);
    if (value <= 0) continue;
    const positions =
      p.fantasyPositions.length > 0
        ? p.fantasyPositions
        : p.position
          ? [p.position]
          : [];
    out.push({
      playerId: pid,
      name: p.fullName,
      value,
      positions,
      age: p.age,
      injuryStatus: p.injuryStatus,
    });
  }
  // Stable order so every downstream consumer sees the same list every run.
  out.sort((a, b) => b.value - a.value || a.playerId.localeCompare(b.playerId));
  return out;
}

/**
 * Every roster's profile, most fragile first.
 *
 * ONE valuation pass for the whole league, then a cheap solve per roster. The percentile
 * is why this is the primitive and the single-roster getter is the wrapper: fragility is
 * only meaningful against the league you actually play in, so there is no honest way to
 * profile one roster without scoring all of them. Same conclusion duration.ts reached
 * about posture, arrived at the same way (absolute thresholds miscalibrated badly enough
 * on real data to be a bug).
 */
export function leagueFragility(
  h: LeagueHistory,
  cfg: ValuationConfig = VALUATION_CONFIG,
): FragilityProfile[] {
  const slots = lineupSlots(h);
  const values = valuePlayers(
    [...h.players.values()],
    h.currentLeague.scoringSettings,
    cfg,
  );
  const valueOf = (pid: string) => values.get(pid)?.value ?? 0;

  const byRoster = h.rosters.map((r) => ({
    roster: r,
    assets: assetsOf(r, h, valueOf),
  }));

  // Replacement level over the players actually rostered in this league, which is the
  // pool a manager can realistically reach. Free agents are excluded on purpose: in a
  // 14-team league starting seven, what is on the wire is not startable.
  const teams = h.currentLeague.totalRosters || h.rosters.length || 1;
  const replacement = replacementLevel(
    byRoster.flatMap((b) => b.assets.map((a) => a.value)),
    teams * Math.max(1, slots.length),
  );

  const scored = byRoster.map((b) => ({
    ...b,
    score: scoreFragility(b.assets, slots, cfg),
  }));
  const raws = scored.map((s) => s.score.raw);

  return scored
    .map((s) => buildProfile(h, s.roster, s.assets, s.score, slots, replacement, raws))
    .sort(
      (a, b) =>
        b.fragility - a.fragility ||
        // Percentile is computed off the UNROUNDED index, so it breaks ties between two
        // rosters that round to the same displayed number. Roster id is the final
        // tie-break so the order is total and identical on every run.
        b.percentile - a.percentile ||
        a.rosterId - b.rosterId,
    );
}

/**
 * One roster's fragility profile.
 *
 * Delegates to `leagueFragility` rather than scoring in isolation, because the percentile
 * and the read both need the league's distribution. An unknown roster id gets an empty
 * profile rather than a throw, matching how the rest of the metrics layer degrades.
 */
export function getFragilityProfile(
  h: LeagueHistory,
  rosterId: number,
  cfg: ValuationConfig = VALUATION_CONFIG,
): FragilityProfile {
  const all = leagueFragility(h, cfg);
  const found = all.find((p) => p.rosterId === rosterId);
  if (found) return found;
  const roster = h.rostersById.get(rosterId);
  const user = roster?.ownerId ? h.usersById.get(roster.ownerId) : undefined;
  return emptyProfile(
    rosterId,
    user?.teamName ?? null,
    user?.displayName ?? `Roster ${rosterId}`,
  );
}

function buildProfile(
  h: LeagueHistory,
  roster: { rosterId: number; ownerId: string | null },
  assets: FragilityAsset[],
  score: FragilityScore,
  slots: string[],
  replacement: number,
  leagueRaws: number[],
): FragilityProfile {
  const user = roster.ownerId ? h.usersById.get(roster.ownerId) : undefined;
  const teamName = user?.teamName ?? null;
  const ownerName = user?.displayName ?? `Roster ${roster.rosterId}`;
  if (assets.length === 0) return emptyProfile(roster.rosterId, teamName, ownerName);

  const percentile = fragilityPercentile(score.raw, leagueRaws);
  const band: FragilityProfile["band"] =
    percentile >= BRITTLE_PERCENTILE
      ? "brittle"
      : percentile <= RESILIENT_PERCENTILE
        ? "resilient"
        : "balanced";
  const top = score.damages[0] ?? null;
  const depth = depthBeyondStarters(assets, slots, replacement);
  const playerValue = assets.reduce((s, a) => s + a.value, 0);

  return {
    rosterId: roster.rosterId,
    teamName,
    ownerName,
    fragility: Math.round(score.raw),
    percentile: Math.round(percentile * 100) / 100,
    band,
    looScore: Math.round(score.looScore),
    concentrationScore: Math.round(score.concentrationScore),
    exposureScore: Math.round(score.exposureScore),
    spofDamageShare: round3(score.spofDamageShare),
    topKDamageShare: round3(score.topKDamageShare),
    normalizedHhi: round3(score.normalizedHhi),
    rawExposure: round3(score.rawExposure),
    startableValue: Math.round(score.startableValue),
    playerValue,
    depthBeyondStarters: depth,
    replacementValue: replacement,
    singlePointOfFailure: top
      ? {
          playerId: top.playerId,
          name: top.name,
          damage: Math.round(top.damage),
          damageShare: round3(top.damageShare),
        }
      : null,
    damages: score.damages,
    read: readFor(band, score, depth, slots.length, top),
  };
}

function emptyProfile(
  rosterId: number,
  teamName: string | null,
  ownerName: string,
): FragilityProfile {
  return {
    rosterId,
    teamName,
    ownerName,
    fragility: 0,
    percentile: 0,
    band: "resilient",
    looScore: 0,
    concentrationScore: 0,
    exposureScore: 0,
    spofDamageShare: 0,
    topKDamageShare: 0,
    normalizedHhi: 0,
    rawExposure: 0,
    startableValue: 0,
    playerValue: 0,
    depthBeyondStarters: 0,
    replacementValue: 0,
    singlePointOfFailure: null,
    damages: [],
    read: "No valued players to read fragility from.",
  };
}

/** Top and bottom quartile of the league. Bands are relative for the same reason posture is. */
const BRITTLE_PERCENTILE = 0.75;
const RESILIENT_PERCENTILE = 0.25;

/**
 * Share of the league this roster is more fragile than. 1 = most fragile in the league.
 *
 * Deliberately relative, and the reason is a bug we already shipped once: the first
 * version of duration.ts classified posture off absolute cutoffs and, on real data,
 * declared that a 14-team league contained zero contenders. Fragility has the same
 * failure mode. "Brittle" only means anything next to the fourteen rosters you actually
 * have to beat.
 */
export function fragilityPercentile(raw: number, leagueRaws: number[]): number {
  if (leagueRaws.length < 2) return 0.5;
  const lower = leagueRaws.filter((r) => r < raw).length;
  return lower / (leagueRaws.length - 1);
}

function readFor(
  band: FragilityProfile["band"],
  score: FragilityScore,
  depth: number,
  slotCount: number,
  top: LooDamage | null,
): string {
  const spof = top ? top.name : "your best player";
  const spofPct = Math.round(score.spofDamageShare * 100);
  const topKPct = Math.round(score.topKDamageShare * 100);
  const depthPhrase =
    depth > 0
      ? `${depth} startable ${depth === 1 ? "body" : "bodies"} beyond the ${slotCount} you have to fill`
      : depth === 0
        ? `exactly ${slotCount} startable bodies and no spares`
        : `${Math.abs(depth)} fewer startable ${Math.abs(depth) === 1 ? "body" : "bodies"} than slots, so you are already starting players this league would bench`;

  if (band === "brittle") {
    return (
      `This is one of the most fragile rosters in the league. Losing ${spof} costs you ` +
      `${spofPct}% of your startable value even after the best internal replacement steps ` +
      `in, and your three most load-bearing players carry ${topKPct}% of it between them. ` +
      `You have ${depthPhrase}. In a lock-in league that is the expensive kind of ` +
      `fragility: the nights you cannot fill a slot are not a hypothetical, and top-end ` +
      `value does not cover for an empty lineup. Trading a surplus star for two real ` +
      `starters would lower your ceiling and raise almost every other night.`
    );
  }
  if (band === "resilient") {
    return (
      `One of the sturdier rosters in the league. Your worst single loss is ${spof} at ` +
      `${spofPct}% of startable value, which means the roster re-solves around him rather ` +
      `than collapsing, and you have ${depthPhrase}. The risk on a roster like this is the ` +
      `opposite one: depth is easy to admire and easy to overpay for, and a lineup with no ` +
      `real top end loses to the brittle teams on the nights their stars play.`
    );
  }
  return (
    `Middling fragility for this league. ${spof} is the single point of failure at ` +
    `${spofPct}% of startable value, your top three carry ${topKPct}%, and you have ` +
    `${depthPhrase}. Nothing here is alarming, but nothing is insulated either: one ` +
    `long-term injury to the wrong man moves this roster into the brittle group, and the ` +
    `cheapest insurance is a startable body at the position where you currently have one.`
  );
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
