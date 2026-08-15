import { VALUATION_CONFIG } from "./config";
import { pickValue, valuePlayers } from "./index";
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
/** The same config with the age term switched off. See point 4 in the header. */
export function ageBlindConfig(cfg = VALUATION_CONFIG) {
  return {
    ...cfg,
    ageAnchors: cfg.ageAnchors.map(([age]) => [age, 1]),
  };
}
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
    return {
      label: b.label,
      minAge: b.minAge,
      maxAge: b.maxAge,
      n: rows.length,
      trades: new Set(rows.map((r) => r.transactionId)).size,
      seasons: new Set(rows.map((r) => r.season)).size,
      returned: Math.round(returned),
      paid: Math.round(paid),
      ratio: paid > 0 ? returned / paid : 0,
      concentration: rows.length ? concentration : 1,
      sufficient:
        rows.length >= SUFFICIENCY.minAcquisitions &&
        concentration <= SUFFICIENCY.maxConcentration,
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
      sufficientBuckets > 0
        ? null
        : `No age bucket clears the bar: it wants ${SUFFICIENCY.minAcquisitions} usable ` +
          `acquisitions with no single deal carrying more than ` +
          `${Math.round(SUFFICIENCY.maxConcentration * 100)}% of the bucket's returned ` +
          `value, and every bucket here is thin enough that one deal moves its ratio ` +
          `further than the age effect being tested. This league's market cannot ` +
          `calibrate an age curve, and the curve in the model is not calibrated ` +
          `against it.`,
  };
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
