/**
 * THE OTHER HALF OF THE AGE QUESTION - and the half that has to be refused.
 *
 * `./ageCurve.ts` answers "when does production decline", from 4,587 real NBA
 * player-seasons. This file asks the different question a dynasty manager actually
 * cares about: **when does THIS league stop paying?** Those are not the same
 * question, and only one of them is reconstructable.
 *
 * A price is a social fact. It is what fourteen specific people believed on a specific
 * Tuesday, and no amount of historical box score arithmetic can recover it for a
 * league that did not exist. So this half is stuck with what the league actually did:
 * five seasons, 91 trades. That is thin, and the honest thing to do with a thin sample
 * is measure it, report n at every bucket, and then say plainly that it does not
 * support a conclusion - rather than draw a curve through it. D19 deleted a working
 * inference engine for less.
 *
 * ---------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------
 * For each side of each trade: the players that side received, and the players it gave
 * up, both priced at TODAY's value. Each received player is bucketed by how old he was
 * when the trade happened, and charged a pro-rata share of what his side paid. The
 * bucket's ratio is everything returned over everything paid.
 *
 * FOUR THINGS THIS CANNOT DO, each handled explicitly:
 *
 *  1. HINDSIGHT, not foresight (D23). Every price here is today's price. "Players
 *     acquired at 32 returned more than they cost" is a statement about how those
 *     deals turned out, not about how they were reasoned and not a prediction about
 *     the next one. The app holds no historical ranking snapshots, so a
 *     process-fair version is not available at any price.
 *
 *  2. PICKS ARE PRICED SEPARATELY (D24). The player model and the pick model are
 *     different models, and a trade that was mostly picks says almost nothing about
 *     the player who came with them. Sides whose pick component outweighs their player
 *     component are excluded and counted. This bites hard here: 87 of 91 trades in
 *     this league carry recorded picks.
 *
 *  3. UNRECORDED PICKS (D19). Commissioner-executed trades arrive with an empty
 *     `draft_picks` array, so a side that looks player-only may not have been. That is
 *     not detectable, and the exclusion in (2) cannot catch it.
 *
 *  4. THE CURVE IS IN THE PRICE. Grading trades with the ordinary valuation would be
 *     circular: today's value of a 35-year-old already carries the age multiplier this
 *     is supposed to be testing, so old players would "return less" by construction.
 *     Everything here is therefore priced with an AGE-BLIND config - every anchor
 *     flattened to 1.0 - so whatever age signal survives is a signal about age and not
 *     an echo of the model.
 *
 * ---------------------------------------------------------------------------------
 * COST (D25)
 * ---------------------------------------------------------------------------------
 * Nothing here fetches anything. It reads `h.transactions` and `h.players`, both
 * already on the corpus, and prices them with `valuePlayers`, which the app runs on
 * every page anyway. Safe to call from a render path; no memoized slot needed, and
 * nothing was added to `assembleCorpus()`.
 */
import type { LeagueHistory } from "../history";
import { VALUATION_CONFIG, type ValuationConfig } from "./config";
import { pickValue, valuePlayers } from "./index";

export interface AgeBucket {
  label: string;
  minAge: number;
  /** Null on the open-ended top bucket. */
  maxAge: number | null;
  /** Player acquisitions falling in this bucket. The sample size, stated everywhere. */
  n: number;
  /** Distinct trades those acquisitions came from. */
  trades: number;
  /** Distinct seasons those trades span. */
  seasons: number;
  /** Age-blind value today of the players acquired at this age. */
  returned: number;
  /** Age-blind value today of what their acquirers gave up, allocated pro rata. */
  paid: number;
  /** returned / paid. Present even when the bucket is insufficient - `sufficient` is
   *  the field that decides whether it may be read as anything. */
  ratio: number;
  /** The largest single acquisition's share of `returned`. The bucket's fragility. */
  concentration: number;
  /** Whether this bucket clears `SUFFICIENCY`. */
  sufficient: boolean;
}

export interface ExitWindow {
  buckets: AgeBucket[];
  /** Acquisitions that made it into a bucket. */
  acquisitions: number;
  tradesRead: number;
  /** Sides that received no players at all - a pure pick sale, nothing to price. */
  sidesPickOnly: number;
  /** Sides that gave up no players - nothing to charge the acquisition against. */
  sidesNoPricedCost: number;
  /** Sides excluded because picks outweighed players (D24). */
  sidesPickHeavy: number;
  /** Spearman correlation between age at trade and realised return. */
  rho: number | null;
  /** Buckets clearing `SUFFICIENCY`. Zero on this league. */
  sufficientBuckets: number;
  /**
   * The oldest age this league's own record is thick enough to check the curve
   * against. Null when no bucket clears, which is the case here.
   */
  corroboratedThrough: number | null;
  /**
   * Set whenever the sample cannot support recalibrating anything, which is the
   * expected outcome and not an error. Null would mean the sample DID support it.
   */
  refusal: string | null;
}

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
} as const;

/** Sides where picks are at least this share of the priced value are excluded (D24). */
const MAX_PICK_SHARE = 0.5;

const BUCKETS: ReadonlyArray<{ label: string; minAge: number; maxAge: number | null }> = [
  { label: "21 and under", minAge: 0, maxAge: 21 },
  { label: "22 to 23", minAge: 22, maxAge: 23 },
  { label: "24 to 25", minAge: 24, maxAge: 25 },
  { label: "26 to 27", minAge: 26, maxAge: 27 },
  { label: "28 to 29", minAge: 28, maxAge: 29 },
  { label: "30 to 31", minAge: 30, maxAge: 31 },
  { label: "32 to 33", minAge: 32, maxAge: 33 },
  { label: "34 and over", minAge: 34, maxAge: null },
];

/** One player arriving on one side of one trade. */
interface Acquisition {
  transactionId: string;
  season: string;
  playerId: string;
  ageAtTrade: number;
  returned: number;
  paid: number;
}

/** The same config with the age term switched off. See point 4 in the header. */
export function ageBlindConfig(cfg: ValuationConfig = VALUATION_CONFIG): ValuationConfig {
  return {
    ...cfg,
    ageAnchors: cfg.ageAnchors.map(([age]) => [age, 1] as [number, number]),
  };
}

export function deriveExitWindow(
  h: LeagueHistory,
  cfg: ValuationConfig = VALUATION_CONFIG,
): ExitWindow {
  const currentSeason = Number(h.currentLeague.season);
  const teams = h.rosters.length || 12;
  const values = valuePlayers(
    [...h.players.values()],
    h.currentLeague.scoringSettings,
    ageBlindConfig(cfg),
  );
  const valueOf = (id: string) => values.get(id)?.value ?? 0;

  const acquisitions: Acquisition[] = [];
  let tradesRead = 0;
  let sidesPickOnly = 0;
  let sidesNoPricedCost = 0;
  let sidesPickHeavy = 0;

  for (const t of h.transactions) {
    if (t.type !== "trade") continue;
    tradesRead++;
    // Player movement lives entirely in `adds` (playerId -> receiving roster); `drops`
    // mirrors the same movement from the other side, so reading both double-counts.
    const sides = new Map<
      number,
      { inIds: string[]; outIds: string[]; pickValue: number }
    >();
    const touch = (rosterId: number) => {
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
      if (side.pickValue / (side.pickValue + returned + paid) >= MAX_PICK_SHARE) {
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
      (a) => a.ageAtTrade >= b.minAge && (b.maxAge == null || a.ageAtTrade <= b.maxAge),
    );
    const returned = rows.reduce((s, r) => s + r.returned, 0);
    const paid = rows.reduce((s, r) => s + r.paid, 0);
    const concentration = returned > 0 ? Math.max(...rows.map((r) => r.returned)) / returned : 1;
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
function spearman(rows: Acquisition[]): number | null {
  const pairs = rows
    .filter((r) => r.paid > 0 && r.returned > 0)
    .map((r) => [r.ageAtTrade, Math.log(r.returned / r.paid)] as const);
  const n = pairs.length;
  if (n < 3) return null;
  const rank = (vals: number[]): number[] => {
    const order = vals.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
    const out = new Array<number>(vals.length);
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
