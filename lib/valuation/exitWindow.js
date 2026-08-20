import { refusal } from "../refusal.js";
import { VALUATION_CONFIG } from "./config.js";
import { pickValue, valuePlayers } from "./index.js";
/**
 * WHAT "ENOUGH DATA" MEANS HERE, stated as arithmetic rather than as a feeling.
 *
 * The effect under test is the age curve's slope, which the measured curve puts at
 * roughly 2.5% of dynasty value per year of age - so about 5% across a two-year
 * bucket. A bucket can only speak to a 5% effect if no single deal inside it can move
 * the bucket's own ratio by more than that. So the bar is: no one acquisition may
 * carry more than `maxConcentration` of the bucket's returned value.
 *
 * `minAcquisitions` is the floor underneath that, because a concentration ratio
 * computed from four deals is not a measurement either.
 *
 * THE TWO HALVES HAVE TO BE ARITHMETICALLY COMPATIBLE, and they were not. Concentration
 * is `max(returned) / sum(returned)`, which has a hard floor of `1/n`: a bucket of n
 * equal acquisitions still scores `1/n`. So any `minAcquisitions` below `ceil(1 /
 * maxConcentration)` makes the pair unsatisfiable by construction rather than by data -
 * at n = 12 the best achievable concentration is 0.0833, which fails a 0.05 bar however
 * the league trades. The floor shipped at 12 against a 0.05 bar, which made this bar
 * unreachable for every n from 12 to 19 and made the sentence below false over exactly
 * the range where the floor bound. It is now 20 = ceil(1 / 0.05), so `maxConcentration`
 * is the binding constraint everywhere and the floor never decides the answer alone.
 *
 * This is a deliberately falsifiable bar. If the league trades for another five
 * seasons and the buckets thicken, buckets start passing it and the refusal lifts on
 * its own. Nothing here is hardcoded to "no" - and, since the fix above, nothing here
 * is hardcoded to "no" by arithmetic either.
 */
export const SUFFICIENCY = {
  /**
   * `ceil(1 / maxConcentration)`. Below this the concentration floor of `1/n` decides
   * the answer before the data does - see the header. Keep the two in step.
   */
  minAcquisitions: 20,
  /** Twice the per-year slope of the measured curve: the effect a bucket must resolve. */
  maxConcentration: 0.05,
};
/** Sides where picks are at least this share of the priced value are excluded (D24). */
const MAX_PICK_SHARE = 0.5;
const BUCKETS = [
  { label: "21 and under", minAge: 0, maxAge: 21 },
  { label: "22 to 23", minAge: 22, maxAge: 23 },
  { label: "24 to 25", minAge: 24, maxAge: 25 },
  { label: "26 to 27", minAge: 26, maxAge: 27 },
  { label: "28 to 29", minAge: 28, maxAge: 29 },
  { label: "30 to 31", minAge: 30, maxAge: 31 },
  { label: "32 to 33", minAge: 32, maxAge: 33 },
  { label: "34 and over", minAge: 34, maxAge: null },
];
/**
 * The same config with the age term switched off. See point 4 in the header.
 *
 * BOTH age tables have to flatten, not just `ageAnchors`. D74's star-tier
 * adjustment is itself an age-dependent multiplier (it exists to make an elite
 * player's age curve flatter, which is still an age effect) - leaving it live
 * here would let a "young" and "old" test player of the same top-decile rank
 * price differently on age alone, exactly the confirmation-manufacturing this
 * function exists to prevent. Caught by `exitWindow.test.js`'s own age-blind
 * test, not by inspection.
 */
/**
 * @typedef {import('./config.js').ValuationConfig} ValuationConfig
 */
/**
 * @param {ValuationConfig} [cfg]
 * @returns {ValuationConfig}
 */
export function ageBlindConfig(cfg = VALUATION_CONFIG) {
  return {
    ...cfg,
    ageAnchors: cfg.ageAnchors.map(([age]) => [age, 1]),
    starAgeAdjustment: cfg.starAgeAdjustment.map((r) => ({ ...r, ratio: 1 })),
  };
}
/**
 * Typed narrowly to just the fields this function reads, rather than the full
 * `LeagueHistory` shape: exit-window tests build minimal hand-rolled histories
 * (no `users`/`usersById`/etc.), and this function never touches those fields
 * anyway.
 * @param {{
 *   currentLeague: { season: string, scoringSettings: Record<string, number> },
 *   rosters: unknown[],
 *   players: Map<string, import('../providers/types.js').Player>,
 *   transactions: import('../providers/types.js').Transaction[],
 * }} h
 * @param {ValuationConfig} [cfg]
 */
export function deriveExitWindow(h, cfg = VALUATION_CONFIG) {
  const currentSeason = Number(h.currentLeague.season);
  const teams = h.rosters.length || 12;
  const values = valuePlayers(
    [...h.players.values()],
    h.currentLeague.scoringSettings,
    ageBlindConfig(cfg),
  );
  const valueOf = (id) => values.get(id)?.value ?? 0;
  const acquisitions = [];
  let tradesRead = 0;
  let sidesPickOnly = 0;
  let sidesNoPricedCost = 0;
  let sidesPickHeavy = 0;
  for (const t of h.transactions) {
    if (t.type !== "trade") continue;
    tradesRead++;
    // Player movement lives entirely in `adds` (playerId -> receiving roster); `drops`
    // mirrors the same movement from the other side, so reading both double-counts.
    const sides = new Map();
    const touch = (rosterId) => {
      let side = sides.get(rosterId);
      if (!side) {
        side = { inIds: [], outIds: [], pickValue: 0 };
        sides.set(rosterId, side);
      }
      return side;
    };
    for (const [playerId, toRoster] of Object.entries(t.adds ?? {})) {
      touch(toRoster).inIds.push(playerId);
      const fromRoster = t.drops?.[playerId];
      if (fromRoster != null && fromRoster !== toRoster) {
        touch(fromRoster).outIds.push(playerId);
      }
    }
    // Picks are weighed, never scored: their value decides whether a side is admissible
    // evidence about a player's age, and then it is thrown away (D24).
    for (const dp of t.draftPicks) {
      const v = pickValue(dp.round, Number(dp.season) - currentSeason, {
        teams,
        season: dp.season,
      });
      touch(dp.ownerId).pickValue += v;
      touch(dp.previousOwnerId).pickValue += v;
    }
    const seasonsAgo = currentSeason - Number(t.season);
    for (const side of sides.values()) {
      if (side.inIds.length === 0) {
        sidesPickOnly++;
        continue;
      }
      const returned = side.inIds.reduce((s, id) => s + valueOf(id), 0);
      const paid = side.outIds.reduce((s, id) => s + valueOf(id), 0);
      if (paid <= 0 || returned <= 0) {
        sidesNoPricedCost++;
        continue;
      }
      if (
        side.pickValue / (side.pickValue + returned + paid) >=
        MAX_PICK_SHARE
      ) {
        sidesPickHeavy++;
        continue;
      }
      for (const playerId of side.inIds) {
        const age = h.players.get(playerId)?.age;
        if (age == null) continue;
        const share = valueOf(playerId) / returned;
        acquisitions.push({
          transactionId: t.transactionId,
          season: t.season,
          playerId,
          // Sleeper carries a current age and no age history, so age at the time of the
          // trade is today's age less the seasons since. Whole years, and exact to
          // within the birthday that may fall either side of the trade date.
          ageAtTrade: age - seasonsAgo,
          returned: valueOf(playerId),
          paid: paid * share,
        });
      }
    }
  }
  const buckets = BUCKETS.map((b) => {
    const rows = acquisitions.filter(
      (a) =>
        a.ageAtTrade >= b.minAge &&
        (b.maxAge == null || a.ageAtTrade <= b.maxAge),
    );
    const returned = rows.reduce((s, r) => s + r.returned, 0);
    const paid = rows.reduce((s, r) => s + r.paid, 0);
    const concentration =
      returned > 0 ? Math.max(...rows.map((r) => r.returned)) / returned : 1;
    const n = rows.length;
    const ratio = paid > 0 ? returned / paid : 0;
    const conc = n ? concentration : 1;
    const sufficient =
      n >= SUFFICIENCY.minAcquisitions &&
      concentration <= SUFFICIENCY.maxConcentration;
    return {
      label: b.label,
      minAge: b.minAge,
      maxAge: b.maxAge,
      n,
      trades: new Set(rows.map((r) => r.transactionId)).size,
      seasons: new Set(rows.map((r) => r.season)).size,
      returned: Math.round(returned),
      paid: Math.round(paid),
      ratio,
      concentration: conc,
      sufficient,
      refusal: sufficient ? null : bucketRefusal(n, ratio, conc, returned),
    };
  });
  const sufficientBuckets = buckets.filter((b) => b.sufficient).length;
  const corroborated = buckets.filter((b) => b.sufficient).pop();
  return {
    buckets,
    acquisitions: acquisitions.length,
    tradesRead,
    sidesPickOnly,
    sidesNoPricedCost,
    sidesPickHeavy,
    rho: spearman(acquisitions),
    sufficientBuckets,
    corroboratedThrough: corroborated?.maxAge ?? corroborated?.minAge ?? null,
    refusal:
      sufficientBuckets > 0 ? null : marketRefusal(buckets, acquisitions),
  };
}
/**
 * One bucket's refusal, and WHICH of the two failures gets named.
 *
 * Both halves of the bar fail together below the floor - that is the arithmetic in the
 * header, where `minAcquisitions` is `ceil(1 / maxConcentration)` precisely so a bucket
 * can never fail the count while passing concentration. So a bucket that fails both is
 * reported as `INSUFFICIENT_SAMPLE`, because "nine acquisitions" is the fact a reader
 * can act on and "one deal carries 31%" is that same fact restated as a ratio. Which
 * leaves `CONCENTRATED_SAMPLE` for exactly the case the bar was designed around: enough
 * deals to count, and one of them still carrying the bucket. When that code appears,
 * the sample size is not the problem and no amount of waiting is either.
 *
 * The withheld figure is the ratio the table already prints in its own column. It is
 * repeated inside the refusal on purpose: the column is a number in a grid, and a
 * number in a grid is read as a finding unless something adjacent says it is not.
 */
function bucketRefusal(n, ratio, concentration, returned) {
  if (n === 0)
    return refusal(
      "NO_RECORD",
      `No acquisition of a player this age survives the exclusions, so there is no ratio to compute.`,
    );
  const withheld = {
    label: "Back per 100 paid",
    value: `${Math.round(ratio * 100)}`,
  };
  if (n < SUFFICIENCY.minAcquisitions)
    return refusal(
      "INSUFFICIENT_SAMPLE",
      `${n} usable acquisition${n === 1 ? "" : "s"} against a floor of ${SUFFICIENCY.minAcquisitions}, ` +
        `below which the concentration floor of 1/n fails the bar however this league traded.`,
      withheld,
    );
  return refusal(
    "CONCENTRATED_SAMPLE",
    `${n} acquisitions clear the floor, but one deal carries ` +
      `${Math.round(concentration * 100)}% of the ${Math.round(returned)} value returned here, ` +
      `against the ${Math.round(SUFFICIENCY.maxConcentration * 100)}% age effect the ratio is being asked ` +
      `to resolve - so the ratio moves with that deal rather than with age.`,
    withheld,
  );
}
/**
 * The whole section's refusal: the age term this market would have implied, printed
 * once, beside the reason it is not allowed anywhere near the model.
 *
 * WHY COMPUTE A NUMBER THE MODULE REFUSES TO USE. Because "the market cannot calibrate
 * an age curve" is an abstraction, and a reader has no way to tell whether the app
 * declined to publish something close to the model's own -2.5% per year or something
 * wildly different. Both are the same refusal and they feel completely different, and
 * the honest move is to show which one it was. The figure is returned ONLY inside
 * `refusal.withheld` - never as a top-level field, never in the config, never anywhere
 * a caller could mistake it for a calibrated term. Grep for `ageSlopePctPerYear` and
 * this is its only caller, which is the property to preserve.
 *
 * The bar is falsifiable and the sentence says so, which is the one place a refusal in
 * this app is allowed to point at a future: not "try again", which would be false, but
 * "buckets that thicken start passing this", which is what the arithmetic does.
 */
function marketRefusal(buckets, acquisitions) {
  if (acquisitions.length === 0)
    return refusal(
      "NO_RECORD",
      `No trade in this league's record yields a priced player acquisition, so there is nothing to read an age effect from at all.`,
    );
  const thickest = buckets.reduce((a, b) => (b.n > a.n ? b : a));
  const cleared = buckets.some((b) => b.n >= SUFFICIENCY.minAcquisitions);
  const slope = ageSlopePctPerYear(acquisitions);
  const withheld =
    slope == null
      ? null
      : {
          label: "This market's own age slope",
          value: `${slope >= 0 ? "+" : ""}${slope.toFixed(1)}% per year of age`,
        };
  return refusal(
    cleared ? "CONCENTRATED_SAMPLE" : "INSUFFICIENT_SAMPLE",
    `No age bucket clears the bar. It wants ${SUFFICIENCY.minAcquisitions} usable acquisitions with no ` +
      `single deal carrying more than ${Math.round(SUFFICIENCY.maxConcentration * 100)}% of the bucket's ` +
      `returned value; the thickest bucket here is "${thickest.label}" at ${thickest.n}, where one deal ` +
      `carries ${Math.round(thickest.concentration * 100)}% - so that slope is a handful of individual ` +
      `deals and not a measurement of age. Nothing in the model is calibrated against it. The bar is ` +
      `arithmetic rather than policy: as this league keeps trading, buckets thicken and start passing it ` +
      `on their own.`,
    withheld,
  );
}
/**
 * Least-squares slope of log(returned / paid) on age at the trade, as percent per year.
 *
 * The comparable to the model's own age term, which the measured production curve puts
 * near 2.5% of dynasty value per year. Deliberately the plainest estimator there is -
 * no weighting, no winsorizing, no bucket structure - because dressing up a figure the
 * module is about to refuse would be the wrong kind of care. See `marketRefusal` for
 * why it is computed at all and where it is allowed to go.
 */
function ageSlopePctPerYear(rows) {
  const pairs = rows
    .filter((r) => r.paid > 0 && r.returned > 0)
    .map((r) => [r.ageAtTrade, Math.log(r.returned / r.paid)]);
  if (pairs.length < 3) return null;
  const n = pairs.length;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  if (den === 0) return null;
  return (Math.exp(num / den) - 1) * 100;
}
/**
 * Rank correlation between age at the trade and how the acquisition turned out.
 *
 * Reported because its SIGN is the finding. A market that systematically overpays for
 * older players would show a negative correlation; on this league it comes out
 * positive, which says the opposite - the deals for older players are the ones that
 * came back. That is not a recommendation and it is barely a result: it rests on nine
 * to eleven acquisitions per bucket past 30, and it is hindsight (D23). It is here so
 * the direction can be seen rather than assumed.
 */
function spearman(rows) {
  const pairs = rows
    .filter((r) => r.paid > 0 && r.returned > 0)
    .map((r) => [r.ageAtTrade, Math.log(r.returned / r.paid)]);
  const n = pairs.length;
  if (n < 3) return null;
  const rank = (vals) => {
    const order = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const out = new Array(vals.length);
    order.forEach(([, i], k) => (out[i] = k + 1));
    return out;
  };
  const ra = rank(pairs.map((p) => p[0]));
  const rb = rank(pairs.map((p) => p[1]));
  const mean = (n + 1) / 2;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - mean) * (rb[i] - mean);
    da += (ra[i] - mean) ** 2;
    db += (rb[i] - mean) ** 2;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : null;
}
