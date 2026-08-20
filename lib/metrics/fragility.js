import {
  cachedValuePlayers,
  injuryMultiplier,
  VALUATION_CONFIG,
} from "../valuation/index.js";
import { availability } from "./duration.js";
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
export const W_EXPOSURE = 0.2;
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
 * Measured across this league's 14 rosters, the top three LOO damages account for 0.29
 * to 0.82 of startable value (median 0.55). An earlier value of 0.6 came from a
 * back-of-envelope guess rather than the data and clipped EIGHT of the fourteen teams at
 * exactly 100, which destroyed the component: the difference between a top-heavy roster
 * and a catastrophically top-heavy one disappeared. At 0.9 the observed range spans
 * roughly 32 to 91 and nothing saturates. Read 0.9 as its literal claim: if your three
 * most load-bearing players are ninety percent of your startable value, they are not
 * part of your season, they ARE your season.
 */
export const LOO_REF = 0.9;
/**
 * Reference normalized HHI. Normalized HHI is already 0..1 by construction, but real
 * rosters live in the bottom fifth of that range (observed 0.062 to 0.207 here), because
 * the theoretical 1.0 requires literally one asset. Mapping the raw value straight to
 * 0..100 would report every team in the league as robust. 0.25 sits just above the most
 * concentrated roster observed, so the top of the scale stays reachable but is not
 * reached in a normal season; the observed range spreads across 25 to 83.
 */
export const CONCENTRATION_REF = 0.25;
/**
 * Reference availability exposure. Observed 0.0015 (a young, healthy, mostly
 * unremarkable-status roster) to 0.122 (one carrying real value in ageing bodies),
 * median 0.024. The theoretical maximum is far higher - a roster of 38-year-olds would
 * score about 0.63 - but normalising against that would flatten every real team to
 * single digits, which is the same mistake as calibrating to an unreachable extreme.
 * The reference sits a little above the worst roster in the league, which is what makes
 * the component discriminate: it spreads the observed range over 1 to 87.
 *
 * RAISED FROM 0.12 TO 0.14 AFTER THE AGE-CURVE RECALIBRATION, and this is the clearest
 * case in the app of a constant that was correct at one distribution and silently wrong
 * at the next. Exposure is value-weighted, so it moves whenever the value of ageing
 * bodies moves, and the recalibration raised 32-and-over sharply (LeBron James 826 ->
 * 1,468). The worst roster in the league went from 0.0873 - comfortably inside a 0.12
 * reference - to 0.1220, PAST it, and clipped at exactly 100. Nothing threw and no test
 * failed: the component simply stopped being able to tell that roster apart from any
 * worse one, which is the identical failure the LOO_REF note above describes at 0.6.
 * 0.14 restores the stated relationship and un-saturates the component. The fix belongs
 * here rather than in the curve, which is measured rather than tuned (D28).
 *
 * RAISED AGAIN, 0.14 TO 0.18, WHEN IN-LEAGUE PRODUCTION ENTERED THE RANK PRIOR
 * (lib/valuation/production.js) - and the second time it was checked, the constant
 * turned out to have been saturated ALREADY, on a league nobody had measured.
 *
 * The live league first. The paragraph above predicted this exactly: exposure is
 * value-weighted, so it moves whenever the value of ageing bodies moves, and production
 * moved it up, because the players who out-produced their consensus rank here are
 * disproportionately in their late twenties and thirties (James Harden at 36 gains 762,
 * Jamal Murray at 29 gains 992, Bam Adebayo at 29 gains 850) while the players it demotes
 * are mostly 23-26. The worst live roster went 0.1251 -> 0.1416, past 0.14, and clipped.
 *
 * THEN THE FIXTURE LEAGUE, which is where the third measurement earned its keep. The
 * offline fixture corpus (`LEAGUE_PROVIDER=fixture` - the demo, and what every test in
 * this file runs against) has a worst roster at 0.1588, and that number is IDENTICAL
 * before and after production: the fixture's synthetic player ids do not overlap the
 * production table at all, so nothing about this change touched it. It was over 0.14 all
 * along. The demo has been rendering a clipped exposure component, silently, since the
 * 0.14 revision - the exact failure that revision was written to fix, in the one league
 * it did not think to measure.
 *
 * So 0.18 is fitted against the WORSE of the two leagues this app actually renders
 * (0.1588, x1.13 - the same margin the 0.14 revision used against its own 0.1220), not
 * against whichever one happened to be in mind. Live headroom is 21%, fixture 12%.
 *
 * And it is now CHECKED rather than restated: `fragility.test.js` asserts both that the
 * fixture league sits strictly inside this reference and that the reference clears the
 * live league's measured worst. A future recalibration that saturates either one fails a
 * test instead of quietly flattening a component, which is what all three previous
 * versions of this constant cost.
 *
 * Note what did NOT need moving, and why that is not luck. Production is blended in rank
 * space and read back off the pool's own sorted search ranks, so the league's collection
 * of base values is unchanged by construction - nothing here is reacting to a rescaled
 * value axis, only to value moving between OLDER and YOUNGER players. `LOO_REF` (worst
 * 0.8064 -> 0.7785) and `CONCENTRATION_REF` (0.2206 -> 0.1933) both moved AWAY from their
 * references, and `SIGMA_REF` in duration.js keeps 46% headroom (worst dispersion 1.62 of
 * 3). All three were re-measured, not reasoned about.
 */
export const EXPOSURE_REF = 0.18;
/**
 * The worst availability exposure measured on the LIVE league (14 rosters, 2026-08-20)
 * with production in the rank prior. Pinned so `EXPOSURE_REF` cannot be lowered back
 * under the distribution it has to cover - see the note above, and the test that uses
 * it. Tests cannot reach the network, so the measurement is carried here as a number
 * rather than recomputed; re-measure it whenever the value model is recalibrated.
 */
export const LIVE_WORST_EXPOSURE = 0.1416;
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
export function slotEligible(slot, positions) {
  if (slot === "UTIL" || slot === "FLEX" || slot === "SUPER_FLEX") return true;
  if (slot === "G") return positions.some((p) => p === "PG" || p === "SG");
  if (slot === "F") return positions.some((p) => p === "SF" || p === "PF");
  return positions.includes(slot);
}
/** The lineup slots a league actually asks you to fill on a game night. */
export function lineupSlots(h) {
  const slots = (h.currentLeague.rosterPositions ?? []).filter(
    (s) => !NON_LINEUP_SLOTS.has(s),
  );
  return slots.slice(0, MAX_LINEUP_SLOTS);
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
export function solveLineup(assets, slots) {
  const usable = assets
    .filter((a) => a.value > 0)
    .sort((a, b) => b.value - a.value || a.playerId.localeCompare(b.playerId));
  const s = slots.length;
  if (s === 0 || usable.length === 0)
    return { value: 0, starterIds: new Set() };
  const nMask = 1 << s;
  // eligible[i] = bitmask of slots asset i can fill.
  const eligible = usable.map((a) => {
    let m = 0;
    for (let j = 0; j < s; j++)
      if (slotEligible(slots[j], a.positions)) m |= 1 << j;
    return m;
  });
  const NEG = -1;
  let cur = new Float64Array(nMask).fill(NEG);
  cur[0] = 0;
  // choice[i][mask] = the slot asset i took to reach `mask`, or -1 if it skipped.
  const choice = [];
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
  const starterIds = new Set();
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
export function startableValue(assets, slots) {
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
export function looDamage(assets, slots) {
  const solved = solveLineup(assets, slots);
  const base = solved.value;
  const out = assets.map((a) => {
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
function without(assets, playerId) {
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
export function concentration(values, minMembers = 0) {
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
export function concentrationBenchmark(slots) {
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
export function starterWeights(assets, slots) {
  const { starterIds } = solveLineup(assets, slots);
  return assets.map(
    (a) => a.value * (starterIds.has(a.playerId) ? 1 : BENCH_CONTRIBUTION),
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
 * league's own valuation config, so an injury is priced here exactly as the value model
 * prices it - which since the injury rebuild means by body part, note type and the
 * player's age at the injury, not by a status word. `availability` is duration.ts's
 * career taper, reused so the two metrics cannot disagree about when a body stops being
 * reliable.
 *
 * The rebuild moved this metric in both directions, which is correct in both: a roster
 * carrying a star with a surgically repaired Achilles now registers far more exposure
 * than before, and a roster whose only flags are young players marked "Rest" now
 * registers none, because load management is not an injury.
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
export function availabilityExposure(assets, cfg = VALUATION_CONFIG) {
  let num = 0;
  let den = 0;
  for (const a of assets) {
    if (a.value <= 0) continue;
    const play = clamp01(
      injuryMultiplier(
        {
          status: a.injuryStatus,
          bodyPart: a.injuryBodyPart,
          notes: a.injuryNotes,
          age: a.age,
        },
        cfg,
      ) * availability(a.age ?? UNKNOWN_AGE),
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
export function depthBeyondStarters(assets, slots, replacementValue) {
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
export function replacementLevel(values, neededBodies) {
  const desc = values.filter((v) => v > 0).sort((a, b) => b - a);
  if (desc.length === 0) return 0;
  const idx = Math.min(desc.length, Math.max(1, neededBodies)) - 1;
  return desc[idx];
}
/**
 * Score one roster's assets. Pure, and the whole index in one place.
 *
 * Each component is normalised to 0..1 against its reference, clamped, then combined
 * with the declared weights. Clamping before combining rather than after is deliberate:
 * without it a single extreme component could carry the index past 100, and a bounded
 * index is a promise the tests hold this file to.
 */
export function scoreFragility(assets, slots, cfg = VALUATION_CONFIG) {
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
function assetsOf(roster, h, valueOf) {
  // Exclude taxi-squad players: they are stashed and cannot be started without
  // moving them off the taxi squad first. Including them overstates startable depth.
  const taxiSet = new Set(roster?.taxi ?? []);
  return assetsFromIds(
    (roster?.players ?? []).filter((pid) => !taxiSet.has(pid)),
    h,
    valueOf,
  );
}
/**
 * Fragility assets for an ARBITRARY set of player ids.
 *
 * Split out of `assetsOf` so a HYPOTHETICAL roster (the one you would hold after a
 * proposed trade) is built by exactly the same code as a real one. If the two were
 * assembled separately, a difference between before and after could be a difference in
 * method rather than a difference in the roster, which is the only thing a post-trade
 * fragility read is allowed to report.
 */
export function assetsFromIds(playerIds, h, valueOf) {
  const out = [];
  const seen = new Set();
  for (const pid of playerIds) {
    if (seen.has(pid)) continue;
    seen.add(pid);
    const p = h.players.get(pid);
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
      injuryBodyPart: p.injuryBodyPart,
      injuryNotes: p.injuryNotes,
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
export function leagueFragility(h, cfg = VALUATION_CONFIG) {
  const slots = lineupSlots(h);
  const values = cachedValuePlayers(h, cfg);
  const valueOf = (pid) => values.get(pid)?.value ?? 0;
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
  // THE LADDER IS THE ROUNDED INDEX, DELIBERATELY - see `fragilityLadder`. Percentile
  // and band are both derived from it, so the number a reader sees is the number the
  // band was decided from.
  const ladder = fragilityLadder(scored.map((s) => s.score.raw));
  return scored
    .map((s) => ({
      // The unrounded index survives only as a sort key, never as a displayed or
      // classified quantity. It is what orders two rosters that show the same number,
      // and it does the job the percentile used to do here - which the percentile can
      // no longer do, now that identical displayed numbers share one percentile by
      // construction. Roster id is the final tie-break so the order is total and
      // identical on every run.
      raw: s.score.raw,
      profile: buildProfile(
        h,
        s.roster,
        s.assets,
        s.score,
        slots,
        replacement,
        ladder,
      ),
    }))
    .sort(
      (a, b) =>
        b.profile.fragility - a.profile.fragility ||
        b.raw - a.raw ||
        a.profile.rosterId - b.profile.rosterId,
    )
    .map((s) => s.profile);
}
/**
 * The league's fragility scores AS DISPLAYED - i.e. rounded - which is the ladder both
 * the percentile and the band are read off.
 *
 * This is a correctness fix, not a formatting one. The band used to be derived from the
 * unrounded index while the number was rounded for display, so two rosters whose raw
 * scores differed by less than 0.5 rendered the SAME number on opposite sides of the
 * 25th-percentile line. `/league`'s quadrant is the surface that made it unreadable,
 * because it is the first one to put the number and the band adjacent in a single
 * sorted list: it showed 46 "resilient" above 46 "balanced" above 43 "resilient", which
 * is not a subtle rounding artifact to a reader, it is the board contradicting itself.
 *
 * Rounding the ladder first makes the invariant hold BY CONSTRUCTION and everywhere,
 * not just where somebody remembered to format it: equal displayed numbers get an equal
 * count of rosters below them, hence an equal percentile, hence an equal band. The
 * alternatives considered were both narrower. Showing a decimal in the quadrant fixes
 * the one list that happens to render both, and leaves every other surface (`/recap`,
 * `/managers/compare`, the trade web) free to disagree with itself the moment it grows
 * a second roster on screen. Showing the percentile instead of the band there replaces
 * a word the whole app uses with a number nobody else shows.
 *
 * Cost, measured against the live league: exactly ONE of fourteen rosters changes band,
 * and it is the one the contradiction was about - the 46 that read "balanced" now reads
 * "resilient", agreeing with the other 46. Every other assignment is unchanged.
 */
function fragilityLadder(raws) {
  return raws.map((r) => Math.round(r));
}
/**
 * One roster's fragility profile.
 *
 * Delegates to `leagueFragility` rather than scoring in isolation, because the percentile
 * and the read both need the league's distribution. An unknown roster id gets an empty
 * profile rather than a throw, matching how the rest of the metrics layer degrades.
 */
export function getFragilityProfile(h, rosterId, cfg = VALUATION_CONFIG) {
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
// ---------------------------------------------------------------------------------
// Reading a roster's single point of failure, real or hypothetical
// ---------------------------------------------------------------------------------
/** The players a roster can actually start tonight. Taxi squad excluded, as ever. */
export function startableRosterIds(h, rosterId) {
  const r = h.rostersById.get(rosterId);
  if (!r) return [];
  const taxi = new Set(r.taxi ?? []);
  return (r.players ?? []).filter((pid) => !taxi.has(pid));
}
/**
 * The league's replacement line: the value of the last player the league expects to be
 * starting. Extracted so a hypothetical roster is measured against the SAME line
 * `leagueFragility` uses, rather than one derived from the hypothetical itself.
 */
export function leagueReplacementValue(h, cfg = VALUATION_CONFIG) {
  const slots = lineupSlots(h);
  const values = cachedValuePlayers(h, cfg);
  const valueOf = (pid) => values.get(pid)?.value ?? 0;
  const teams = h.currentLeague.totalRosters || h.rosters.length || 1;
  return replacementLevel(
    h.rosters.flatMap((r) => assetsOf(r, h, valueOf).map((a) => a.value)),
    teams * Math.max(1, slots.length),
  );
}
/**
 * The single point of failure for an arbitrary set of players on this league's lineup
 * shape. The roster somebody holds today, or the one they would hold after a trade.
 *
 * No percentile and no band, because both are league-relative and a hypothetical roster
 * has no place in a league it does not exist in. What survives the hypothetical is the
 * part that was always the actionable output: a name and a share.
 */
export function spofOfPlayers(h, playerIds, opts = {}) {
  const cfg = opts.cfg ?? VALUATION_CONFIG;
  const slots = lineupSlots(h);
  const values = cachedValuePlayers(h, cfg);
  const assets = assetsFromIds(
    playerIds,
    h,
    (pid) => values.get(pid)?.value ?? 0,
  );
  if (assets.length === 0) return null;
  const solved = solveLineup(assets, slots);
  const top = looDamage(assets, slots)[0];
  if (!top) return null;
  const replacement = opts.replacementValue ?? leagueReplacementValue(h, cfg);
  return {
    playerId: top.playerId,
    name: top.name,
    damage: Math.round(top.damage),
    damageShare: round3(top.damageShare),
    startableValue: Math.round(solved.value),
    depthBeyondStarters: depthBeyondStarters(assets, slots, replacement),
  };
}
/**
 * Posture-conditioned reading of the band lives in ./bands, so the trade web can import
 * the rule without importing the valuation model. Re-exported here because this file is
 * where a reader looks for it.
 */
export { fragilityIsAlarming, fragilityTone } from "./bands.js";
function buildProfile(
  h,
  roster,
  assets,
  score,
  slots,
  replacement,
  leagueLadder,
) {
  const user = roster.ownerId ? h.usersById.get(roster.ownerId) : undefined;
  const teamName = user?.teamName ?? null;
  const ownerName = user?.displayName ?? `Roster ${roster.rosterId}`;
  if (assets.length === 0)
    return emptyProfile(roster.rosterId, teamName, ownerName);
  // The displayed number FIRST, then everything derived from it. Both arguments are
  // rounded, which is the whole point: a reader who sees two identical numbers can
  // never be shown two different bands, because the band cannot see anything the
  // reader cannot.
  const fragility = Math.round(score.raw);
  const percentile = fragilityPercentile(fragility, leagueLadder);
  const band =
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
    fragility,
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
function emptyProfile(rosterId, teamName, ownerName) {
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
 * Callers inside this module pass the ROUNDED ladder (`fragilityLadder`) on both
 * arguments, so rosters that display the same number share one percentile and therefore
 * one band. The function itself stays generic - it only knows how to rank a number
 * against a list - because the decision about which ladder to rank against belongs to
 * whoever knows what the reader is being shown.
 *
 * Deliberately relative, and the reason is a bug we already shipped once: the first
 * version of duration.ts classified posture off absolute cutoffs and, on real data,
 * declared that a 14-team league contained zero contenders. Fragility has the same
 * failure mode. "Brittle" only means anything next to the fourteen rosters you actually
 * have to beat.
 */
export function fragilityPercentile(raw, leagueRaws) {
  if (leagueRaws.length < 2) return 0.5;
  const lower = leagueRaws.filter((r) => r < raw).length;
  return lower / (leagueRaws.length - 1);
}
function readFor(band, score, depth, slotCount, top) {
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
function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function round3(n) {
  return Math.round(n * 1000) / 1000;
}
