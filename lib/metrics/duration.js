import { VALUATION_CONFIG, ageMultiplier } from "../valuation/index.js";
import { pickCapital } from "../picks.js";
import { analyzeRoster } from "../roster.js";
import { POSTURE_UNREAD } from "./axes.js";
/** Seasons of payout profile to look ahead. Beyond this, value is negligible. */
const HORIZON = 12;
/**
 * Reference dispersion for normalising TCI, in seasons.
 *
 * Calibrated against the genuinely straddled case rather than an abstract worst case.
 * A roster split half-and-half between a 33-year-old core (duration ~1.9) and 2028
 * picks (duration ~7.2) has a value-weighted dispersion of about 2.65. An initial
 * SIGMA_REF of 4 came from a theoretical extreme that no real roster reaches, and it
 * compressed every observed team into TCI 62-80, which is useless resolution.
 *
 * At 3 the index spreads properly: dispersion 0 -> 100, 1.0 -> 67, 1.5 -> 50,
 * 2.5 -> 17, 3.0+ -> 0.
 *
 * TCI is ABSOLUTE in construction, in the narrow sense that a roster's score depends
 * only on its own assets and not on the other thirteen: the same roster scores the same
 * in any league. That makes it comparable ACROSS SEASONS of this league, and it is why
 * the digest can subtract two readings and get a real movement.
 *
 * It does NOT establish cross-league comparability, and an earlier version of this
 * comment claimed it did. The constant is a calibration, and it was calibrated to the
 * dispersion actually observed across THIS league's fourteen rosters - 3 was chosen
 * because 4 compressed them all into TCI 62-80. A league with a different roster size,
 * different lineup shape, or a different pick-to-player mix would produce a different
 * observed spread, and its rosters would be graded on a scale tuned to somebody else's.
 * Two leagues' TCIs are on the same formula; whether they are on the same scale is
 * unverified, and we have exactly one league to check against.
 */
export const SIGMA_REF = 3;
/** Age at which an incoming rookie enters the league. */
const ROOKIE_AGE = 19;
/**
 * Career taper. The valuation age curve deliberately FLOORS rather than reaching zero,
 * because it prices a currently-active player and a 38-year-old starter is not worthless.
 * But a payout profile must terminate: production genuinely ends at retirement.
 *
 * Without this, an old player's profile carries a flat tail out to the horizon, which
 * pushes their duration UP and produced a frankly absurd result caught by test: a
 * 34-year-old scored a LONGER duration than a 27-year-old. Availability ramps from 1 to
 * 0 across these ages, so the series terminates and duration behaves monotonically.
 */
const TAPER_START = 33;
const TAPER_END = 41;
export function availability(age) {
  if (age <= TAPER_START) return 1;
  if (age >= TAPER_END) return 0;
  return (TAPER_END - age) / (TAPER_END - TAPER_START);
}
/**
 * Payout weights for a player: how much value they deliver in each future season.
 * Uses the same age curve the valuation model uses, so the two cannot drift apart.
 */
function playerPayouts(age, cfg) {
  const a = age ?? 25;
  const out = [];
  for (let t = 0; t < HORIZON; t++) {
    const at = a + t;
    // ageMultiplier encodes the value profile by age; availability terminates it at
    // retirement so the series has a finite end and duration stays monotonic in age.
    out.push(Math.max(0, ageMultiplier(at, cfg)) * availability(at));
  }
  return out;
}
/** Macaulay-style duration from a payout series. */
export function durationOf(payouts) {
  let num = 0;
  let den = 0;
  for (let t = 0; t < payouts.length; t++) {
    num += t * payouts[t];
    den += payouts[t];
  }
  return den > 0 ? num / den : 0;
}
/** Duration of a player of a given age, in seasons. */
export function playerDuration(age, cfg = VALUATION_CONFIG) {
  return durationOf(playerPayouts(age, cfg));
}
/**
 * Duration of a draft pick: the wait until it converts, plus the duration of the
 * rookie it becomes. A pick is a deferred claim on a long-duration asset, which is
 * exactly why pick-heavy rosters and veteran-heavy rosters are so hard to compare on
 * total value alone.
 */
export function pickDuration(seasonsOut, cfg = VALUATION_CONFIG) {
  return Math.max(0, seasonsOut) + playerDuration(ROOKIE_AGE, cfg);
}
/**
 * TCI over an arbitrary bag of dated assets, not necessarily a real roster.
 *
 * Pulled out of `getTimelineProfile` (which now calls it) so a HYPOTHETICAL set of
 * assets can be scored on the identical formula and the identical SIGMA_REF - which is
 * the whole point: a counterfactual roster's coherence is only worth reading next to a
 * real one if neither was computed with its own constants.
 *
 * Returns duration and dispersion UNROUNDED, deliberately. `getTimelineProfile`
 * publishes them at 2dp but also feeds the raw duration to `classify` and to a
 * `toFixed(1)` in its own copy, and rounding twice can cross a boundary the single
 * rounding never would. Callers round for display; nothing here rounds for them.
 */
export function coherenceOf(assets) {
  const totalValue = assets.reduce((s, a) => s + a.value, 0);
  if (totalValue === 0) {
    return { rosterDuration: 0, dispersion: 0, tci: 0, totalValue: 0 };
  }
  const rosterDuration =
    assets.reduce((s, a) => s + a.value * a.duration, 0) / totalValue;
  const variance =
    assets.reduce(
      (s, a) => s + a.value * Math.pow(a.duration - rosterDuration, 2),
      0,
    ) / totalValue;
  const dispersion = Math.sqrt(variance);
  return {
    rosterDuration,
    dispersion,
    tci: Math.round(100 * (1 - Math.min(1, dispersion / SIGMA_REF))),
    totalValue,
  };
}
/**
 * Minimum TCI improvement a leave-one-out removal must produce before
 * `findTimelineBreak` names it. Below this, the "improvement" is rounding noise
 * from `coherenceOf`'s own 2dp roundings rather than a real signal - see the
 * function doc for why 1 is the right floor rather than 0.
 */
const BREAK_MIN_DELTA = 1;
/**
 * THE TIMELINE BREAK - the single asset most responsible for a roster's own
 * incoherence, found the same leave-one-out way RFI's `looDamage` finds a lineup's
 * single point of failure, aimed here at TIMELINE AGREEMENT instead of startable
 * value:
 *
 *   breakDelta_i = TCI(assets minus i) - TCI(assets)
 *
 * The asset with the largest breakDelta is whichever one the value-weighted
 * VARIANCE term is most sensitive to - which depends on both how far its duration
 * sits from the roster's own weighted mean and how much value it carries. A $50
 * rookie pick seven seasons out moves the mean by nothing and is never picked; a
 * $4,000 aging star sitting alone at duration 2 while a $20,000 young core sits at
 * 4.9 moves it enormously and always is. Distance alone or value alone would each
 * pick the wrong asset in real cases on this league (a $69 rookie prospect four
 * seasons further out than everyone else is more DISTANT than a misplaced star but
 * carries none of the weight); only the product finds the one that actually matters.
 *
 * CALIBRATED AGAINST THE REAL 14-ROSTER LEAGUE, not asserted. Every roster has at
 * least one asset whose removal raises TCI, and the improvement spans +2 to +13
 * points - a real, differentiated range, not a formality every roster clears by an
 * identical hair. `BREAK_MIN_DELTA` floors it at +1 (below the smallest genuine
 * improvement observed, +2, and above the 2dp rounding noise `coherenceOf` itself
 * can introduce) so a roster with nothing worth naming - every asset interchangeable
 * with the mean - returns null rather than a manufactured pick nobody should read
 * anything into.
 *
 * NAMES THE ASSET, WHICH THE PLAIN TCI NUMBER NEVER DID. On this league's real
 * rosters the break asset is either a deep rebuild's own single longest-dated pick
 * (trimming the tail is a real but modest improvement, +3 to +7) or one significant
 * aging star sitting alone against an otherwise long-dated young core - Anthony
 * Davis (duration 2.18) against a Cunningham/Barnes/Amen-and-Ausar-Thompson core
 * reading 4.6-4.9 is the sharpest real example, and Steph Curry, Kevin Durant,
 * LeBron James, Joel Embiid and Giannis Antetokounmpo are the other five named
 * across this league's fourteen real rosters - which is exactly the "two teams
 * sharing a jersey" case TCI exists to catch, now with a name on it instead of only
 * a dispersion number. `classify` reads a name-bearing break into every posture, not
 * only "straddling": the Anthony Davis roster's OWN dispersion (1.18) was not low
 * enough to cross COHERENCE_FLOOR, so it read as "ascending... assets broadly
 * aligned" with no hint that one $4,277 asset was the reason it wasn't higher.
 *
 * WHAT THIS DOES NOT CLAIM. Not a trade recommendation - the named asset is very
 * often a team's best player, and the honest reading is "this is the one piece that
 * does not match the plan," not "move him." Buying one year of a misaligned star on
 * purpose, or holding one while a young core matures under him, is a real strategy,
 * not a mistake the metric is accusing anyone of. Not a verdict on the rest of the
 * roster either: a break asset can sit on an otherwise very coherent team, which is
 * exactly what the delta size says and the plain TCI number does not - a +2 break on
 * an already-76 roster is a footnote, and a +13 break on a 56 is most of the story.
 *
 * O(n) leave-one-out removals, each an O(n) `coherenceOf` call - O(n^2) total, the
 * same complexity class RFI's LOO already pays and cheap at this league's asset
 * counts (15-32 per roster, so at most ~1,000 additions per roster).
 */
export function findTimelineBreak(assets, tci) {
  if (assets.length < 2) return null;
  let best = null;
  for (let i = 0; i < assets.length; i++) {
    const rest = assets.slice(0, i).concat(assets.slice(i + 1));
    const delta = coherenceOf(rest).tci - tci;
    const a = assets[i];
    const better =
      !best ||
      delta > best.delta ||
      (delta === best.delta &&
        (a.value > best.asset.value ||
          (a.value === best.asset.value &&
            String(a.id ?? i).localeCompare(String(best.asset.id ?? best.index)) <
              0)));
    if (better) best = { asset: a, delta, index: i };
  }
  if (!best || best.delta < BREAK_MIN_DELTA) return null;
  return {
    id: best.asset.id ?? best.index,
    label: best.asset.label ?? null,
    kind: best.asset.kind ?? null,
    duration: Math.round(best.asset.duration * 100) / 100,
    value: best.asset.value,
    delta: best.delta,
  };
}
export function getTimelineProfile(h, rosterId, optsOrCfg = {}) {
  const isCfg = (v) => !!v && typeof v === "object" && "maxValue" in v;
  const opts = isCfg(optsOrCfg) ? { cfg: optsOrCfg } : optsOrCfg;
  const cfg = opts.cfg ?? VALUATION_CONFIG;
  const analysis = analyzeRoster(h, rosterId);
  const caps = pickCapital(h, rosterId);
  const assets = [];
  for (const p of analysis.valued) {
    if (p.value <= 0) continue;
    assets.push({
      id: p.playerId,
      label: p.name,
      kind: "player",
      value: p.value,
      duration: playerDuration(p.age, cfg),
    });
  }
  for (const pk of caps.picks) {
    if (pk.value <= 0) continue;
    const seasonsOut = parseInt(pk.season, 10) - h.currentSeasonYear;
    assets.push({
      id: `${pk.season}-${pk.round}-${pk.originalRoster}`,
      label: pk.label,
      kind: "pick",
      value: pk.value,
      duration: pickDuration(seasonsOut, cfg),
    });
  }
  const { rosterDuration, dispersion, tci, totalValue } = coherenceOf(assets);
  if (totalValue === 0) {
    return {
      rosterId,
      teamName: analysis.teamName,
      ownerName: analysis.ownerName,
      rosterDuration: 0,
      dispersion: 0,
      tci: 0,
      totalValue: 0,
      nowShare: 0,
      laterShare: 0,
      /*
       * THE ABSENCE OF A READING, AND IT USED TO BE SPELLED "straddling".
       *
       * This branch fires when a roster holds no priced asset at all, so there are no
       * durations, no dispersion, and nothing for `classify` to classify. It returned
       * the literal word "straddling" - a POSTURE, the strongest negative one the
       * vocabulary has, and the one thing this roster demonstrably is not: straddling
       * means the assets disagree about when they pay off, and there are no assets.
       * The `tci: 0` beside it was the tell, since `classify` reads straddling off
       * `tci < COHERENCE_FLOOR` and 0 clears that trivially, so the fabricated word was
       * even self-consistent with the fabricated number.
       *
       * That is not a cosmetic mislabel: every tally of posture in the app counted this
       * roster into the straddling bucket, and a bucket that silently absorbs "we do
       * not know" is exactly the failure D19 exists to prevent - the app inferring a
       * reading it does not have.
       *
       * `POSTURE_UNREAD` was already declared in lib/metrics/axes.js as "the absence of
       * a reading, which is not a fifth posture", and `lib/agency/index.js` already
       * consumed it (POSTURE_ORDER, and the `?? POSTURE_UNREAD` fallbacks in
       * `summarizeAgency` / `groupAgency`). The shape existed and the register was
       * closed; the one function that can produce the condition never emitted the word.
       * It does now, which is why `POSTURE_ORDER`'s fifth entry can finally be reached
       * by something other than a null.
       *
       * DOWNSTREAM, CHECKED RATHER THAN ASSUMED. `stanceOf` (axes.js) has no
       * `STANCE_FROM_POSTURE` key for this, falls through to its `basis: "unread"`
       * branch and says so in words - which is what it always should have done here and
       * could not while the word was "straddling" (that branch returns retool with a
       * note claiming the assets disagree). `windowOf` (metrics/window.js) tests
       * `posture === "straddling"` to decide `state: "split"`, and this roster now
       * misses that test - correctly, because it is caught one branch earlier by
       * `assetCount === 0` and refused as `NO_RECORD`, which is the honest code.
       * `PostureGlyph` renders nothing for an unknown word, so the row prints the word
       * with no shape rather than borrowing the diamond straddling owns.
       */
      posture: POSTURE_UNREAD,
      read: "No valued assets to read a timeline from.",
      timelineBreak: null,
      assets: [],
    };
  }
  const nowShare =
    assets.filter((a) => a.duration < 2).reduce((s, a) => s + a.value, 0) /
    totalValue;
  const laterShare =
    assets.filter((a) => a.duration >= 4).reduce((s, a) => s + a.value, 0) /
    totalValue;
  const timelineBreak = findTimelineBreak(assets, tci);
  const { posture, read } = classify(
    rosterDuration,
    tci,
    nowShare,
    laterShare,
    opts.leagueDurations,
    timelineBreak,
  );
  assets.sort((a, b) => b.duration - a.duration);
  return {
    rosterId,
    teamName: analysis.teamName,
    ownerName: analysis.ownerName,
    rosterDuration: Math.round(rosterDuration * 100) / 100,
    dispersion: Math.round(dispersion * 100) / 100,
    tci,
    totalValue,
    nowShare: Math.round(nowShare * 1000) / 1000,
    laterShare: Math.round(laterShare * 1000) / 1000,
    posture,
    read,
    timelineBreak,
    assets,
  };
}
/**
 * Incoherence threshold. Below this TCI the roster is straddling regardless of duration.
 *
 * Exported because it is the ONE posture test that is absolute - every other branch of
 * `classify` is a percentile against the other thirteen rosters. That makes it the only
 * part of a posture that can be honestly re-derived for a HYPOTHETICAL roster, which is
 * what lib/tradefinder/after.js needs to decide whether a proposed trade leaves the
 * viewer straddling. Nothing else reads it, and nothing else should: a caller wanting
 * the rest of a posture needs the league.
 */
export const COHERENCE_FLOOR = 55;
/**
 * Fraction of the league this roster is shorter-dated than. 1 = shortest in league.
 *
 * THE DENOMINATOR EXCLUDES SELF, SO THE NUMERATOR HAS TO AS WELL. `leagueDurations` is
 * built in `leagueTimelines`' first pass from `rosterDuration`, which is ROUNDED to 2dp,
 * while `classify` is called with the unrounded value - so a roster whose duration
 * rounded UP counted itself as longer-dated than itself, and every one of those was
 * inflated by exactly 1/(n-1), 7.7pp on this fourteen-roster league, on 9 of 14 rosters.
 * Rounding the incoming value the same way makes self compare EQUAL rather than greater,
 * which the strict `>` then drops, matching the denominator. Ties between two genuinely
 * equal rosters are excluded from each other's numerator too, which is the ordinary
 * handling for a percentile and is the same answer either way.
 */
export function shortnessPercentile(duration, leagueDurations) {
  if (!leagueDurations || leagueDurations.length < 4) return null;
  const self = Math.round(duration * 100) / 100;
  const shorter = leagueDurations.filter((d) => d > self).length;
  return shorter / (leagueDurations.length - 1);
}
/**
 * The break sentence, appended to EVERY posture rather than only "straddling".
 *
 * That is the point of naming a break asset at all: the Anthony Davis roster on the
 * real league reads "ascending" (dispersion 1.18 does not cross COHERENCE_FLOOR) with
 * no hint anywhere in the paragraph that one $4,277 asset is why it isn't higher.
 * `findTimelineBreak`'s own materiality floor (BREAK_MIN_DELTA) already decides
 * whether there is anything worth saying - a genuinely coherent roster's `timelineBreak`
 * is null and this returns the empty string, unchanged from before this existed.
 */
function breakSentence(tci, timelineBreak) {
  if (!timelineBreak || !timelineBreak.label) return "";
  const without = tci + timelineBreak.delta;
  return (
    ` One asset does not fit that story: ${timelineBreak.label}, at ` +
    `${timelineBreak.duration.toFixed(1)} seasons. The rest of the roster reads ` +
    `${without} on its own - ${timelineBreak.delta} points more coherent without him - ` +
    `which is the gap between "this roster is coherent" and "this roster is coherent ` +
    `except for one piece," and the two are different sentences.`
  );
}
function classify(duration, tci, nowShare, laterShare, leagueDurations, timelineBreak) {
  const pctNow = Math.round(nowShare * 100);
  const pctLater = Math.round(laterShare * 100);
  const pct = shortnessPercentile(duration, leagueDurations);
  const withBreak = (result) => ({
    ...result,
    read: result.read + breakSentence(tci, timelineBreak),
  });
  if (tci < COHERENCE_FLOOR) {
    return withBreak({
      posture: "straddling",
      read:
        `Your assets do not agree about when you win. ${pctNow}% of your value pays off ` +
        `inside two seasons while ${pctLater}% does not arrive for four or more, and the ` +
        `spread between them (${duration.toFixed(1)} seasons on average, dispersion ` +
        `high) is what "stuck in the middle" actually looks like as a number. This is ` +
        `the most expensive position in dynasty: the win-now assets decay while you ` +
        `wait for the young ones, and the young ones are not helped by the wait. Pick a ` +
        `direction and make the timeline agree with it.`,
    });
  }
  // Relative when we have league context, absolute otherwise.
  const isShort = pct != null ? pct >= 0.75 : duration < 2.6;
  const isLong = pct != null ? pct <= 0.25 : duration >= 4.2;
  /**
   * The forced curve, stated out loud.
   *
   * Percentile classification is what made posture work at all (absolute cutoffs once
   * found zero contenders in a fourteen-team league), and it has a cost nothing in the
   * app admitted to: the quartile boundaries mean roughly a quarter of coherent rosters
   * are labelled contending no matter how the league is actually built. In a league of
   * pure rebuilders, somebody is still "contending". The label is a RANK, and a reader
   * who takes it as a standard is reading something we did not say.
   */
  const relative = (label, share) =>
    pct != null
      ? ` One thing "${label}" does not mean: an absolute standard. It is the ${share} ` +
        `of THIS league by duration, so somebody carries the label in every league, ` +
        `however that league is built.`
      : "";
  if (isShort) {
    return withBreak({
      posture: "contending",
      read:
        `A coherent win-now roster: ${pctNow}% of your value pays off within two ` +
        `seasons and the assets are aligned about it. That is a real plan, but it has an ` +
        `expiry date, and every season you do not convert it costs you value that cannot ` +
        `be recovered.` +
        relative("contending", "shortest-dated quarter"),
    });
  }
  if (isLong) {
    return withBreak({
      posture: "rebuilding",
      read:
        `A coherent rebuild: ${pctLater}% of your value arrives four or more seasons out ` +
        `and your assets agree on the timeline. The risk here is not incoherence, it is ` +
        `patience. Value this far out is probabilistic, and a rebuild that never picks a ` +
        `window to open just keeps deferring.` +
        relative("rebuilding", "longest-dated quarter"),
    });
  }
  return withBreak({
    posture: "ascending",
    read:
      `An ascending roster: value concentrated around ${duration.toFixed(1)} seasons ` +
      `out, with the assets broadly aligned. This is the strongest place to be, because ` +
      `your core matures together rather than in sequence. The decision ahead is when to ` +
      `convert future capital into the last piece, not whether to blow it up.` +
      relative("ascending", "middle half"),
  });
}
/*
 * `postureCensus(timelines)` stood here - the league's postures as counts, in
 * `TIMELINE_AXIS` order - and it is shelved on 2026-08-20 (SHELVED.md, S11). This note is
 * deliberately where the function was, because the next person to want a league-wide
 * posture tally will look here first.
 *
 * It was correct arithmetic. The problem was the question. Three of its four counts are
 * COUNTS OF QUARTILE MEMBERSHIP: `classify` above hands out contending / ascending /
 * rebuilding by `shortnessPercentile` against the league's own duration distribution
 * (`pct >= 0.75`, `pct <= 0.25`), and its own comment already says the consequence out
 * loud - "somebody carries the label in every league, however that league is built".
 * A census of a rank is a census of where the rank lines fell.
 *
 * Worse than tautological, it was MISLEADING, and measured rather than asserted: the
 * quartiles are taken over all fourteen rosters while the three labels are only handed
 * to the seven that clear `COHERENCE_FLOOR`. On the live league that printed
 * "1 contending" while three of the four shortest-dated rosters were disqualified for
 * incoherence rather than for timing - so a reader took "one team is trying to win now"
 * from a tile that meant "one team is both shortest-dated-quartile AND coherent", and a
 * one-word label has nowhere to put the difference.
 *
 * The fourth count (straddling) was the honest one - it comes off the ABSOLUTE
 * `COHERENCE_FLOOR`, not a quantile, so it is genuinely free to be 0 or 14 - and it is
 * already said twice on /league in better places: the split rows on the window map, and
 * `windowRefusalSummary`, which states it in a sentence with its reason attached.
 *
 * If a league-wide tally is wanted on /league, `buildQuadrantView().counts` is the one
 * that earns its slot: an intersection of two median splits is free to come out 0, and
 * it renders beside the axes it was read from rather than floating at the page head.
 */
/** Timeline profiles for every roster, most coherent first. */
export function leagueTimelines(h, cfg = VALUATION_CONFIG) {
  // Two passes: the first establishes the league's duration distribution, the second
  // classifies each roster against it. Posture is only meaningful in context.
  const first = h.rosters.map((r) =>
    getTimelineProfile(h, r.rosterId, { cfg }),
  );
  const leagueDurations = first.map((p) => p.rosterDuration);
  return h.rosters
    .map((r) => getTimelineProfile(h, r.rosterId, { cfg, leagueDurations }))
    .sort((a, b) => b.tci - a.tci);
}
let timelinesByCorpus = new WeakMap();
/**
 * `leagueTimelines`, memoized per corpus - the same trick and the same key
 * (`h.players`) `cachedValuePlayers` uses, for the same reason.
 *
 * A single render already asked for this twice or three times before anything here
 * changed: /league calls `leagueTimelines` AND `leagueWindows` (which calls it again),
 * and /plan calls it alongside a game plan that now needs the postures too. Each call
 * is two full passes over fourteen rosters with an O(n^2) leave-one-out per roster, so
 * the duplication was real and the fix is one line rather than threading the array
 * through six signatures. Nothing in a timeline profile depends on annotations, which
 * are the only part of the corpus this process writes.
 */
export function cachedLeagueTimelines(h, cfg = VALUATION_CONFIG) {
  if (cfg !== VALUATION_CONFIG) return leagueTimelines(h, cfg);
  const hit = timelinesByCorpus.get(h.players);
  if (hit) return hit;
  const value = leagueTimelines(h);
  timelinesByCorpus.set(h.players, value);
  return value;
}
/** Drop every memoized timeline pass. Test hook, mirroring `invalidateValuesCache`. */
export function invalidateTimelinesCache() {
  timelinesByCorpus = new WeakMap();
}
