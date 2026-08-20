/**
 * Three things are worth pinning here, and they are the three the whole change rests
 * on: that the market derivation counts what it says it counts, that it REFUSES on a
 * thin sample instead of drawing a line through it, and that recalibrating the age
 * curve did not move the ceiling every price in the app is divided by (D28).
 */
import { describe, expect, it } from "vitest";
import {
  VALUATION_CONFIG,
  ageMultiplier,
  positionMultipliers,
  theoreticalMaxMultiplier,
  valuePlayer,
  valuePlayers,
} from "./index.js";
import {
  AGE_CURVE_PROVENANCE,
  CURVE_SUPPORTED_MAX,
  CURVE_SUPPORTED_MIN,
  DERIVED_AGE_CURVE,
  firstCliffAge,
  pastFirstCliff,
} from "./ageCurve.js";
import { SUFFICIENCY, ageBlindConfig, deriveExitWindow } from "./exitWindow.js";
const SCORING = { pts: 0.5, reb: 1, ast: 1, stl: 2, blk: 2, to: -1, tpm: 0.5 };
function player(id, age, searchRank) {
  return {
    playerId: id,
    fullName: `Player ${id}`,
    firstName: "Player",
    lastName: id,
    team: "LAL",
    position: "SF",
    fantasyPositions: ["SF"],
    age,
    yearsExp: 3,
    birthDate: null,
    injuryStatus: null,
    injuryBodyPart: null,
    injuryNotes: null,
    depthChartOrder: 1,
    status: "Active",
    number: 1,
    searchRank,
    espnId: null,
  };
}
function trade(id, season, adds, drops, draftPicks = []) {
  return {
    transactionId: id,
    type: "trade",
    status: "complete",
    season,
    week: 1,
    created: 0,
    statusUpdated: 0,
    creator: null,
    rosterIds: [1, 2],
    consenterIds: [1, 2],
    adds,
    drops,
    draftPicks,
  };
}
function history(players, transactions) {
  return {
    currentLeague: {
      season: "2026",
      scoringSettings: SCORING,
      totalRosters: 12,
      settings: {},
    },
    players: new Map(players.map((p) => [p.playerId, p])),
    transactions,
    rosters: Array.from({ length: 12 }, (_, i) => ({ rosterId: i + 1 })),
  };
}
describe("deriveExitWindow: what it counts", () => {
  it("buckets an acquisition by the player's age WHEN THE TRADE HAPPENED, not today", () => {
    // Traded in 2023, three seasons ago. A 33-year-old today was 30 then.
    const h = history(
      [player("old", 33, 20), player("paid", 27, 40)],
      [trade("t1", "2023", { old: 1, paid: 2 }, { old: 2, paid: 1 })],
    );
    const w = deriveExitWindow(h);
    const thirties = w.buckets.find((b) => b.label === "30 to 31");
    const thirtyTwos = w.buckets.find((b) => b.label === "32 to 33");
    expect(thirties.n).toBe(1);
    expect(thirtyTwos.n).toBe(0);
  });
  it("prices AGE-BLIND, so the age curve cannot manufacture its own confirmation", () => {
    // Same rank, wildly different ages. Under the real config the young one is worth
    // far more; the derivation must see them as equal, or every bucket past 30 would
    // "underperform" purely because the model already discounted them.
    const young = player("young", 22, 30);
    const old = player("old", 35, 30);
    const blind = valuePlayers([young, old], SCORING, ageBlindConfig());
    expect(blind.get("young").value).toBe(blind.get("old").value);
    const normal = valuePlayers([young, old], SCORING);
    expect(normal.get("young").value).toBeGreaterThan(normal.get("old").value);
  });
  it("sets aside pick-heavy sides rather than treating them as evidence (D24)", () => {
    const players = [player("a", 28, 200), player("b", 28, 210)];
    // The same player-for-player swap twice; the second drags a first-round pick
    // across as well, which dwarfs two rank-200 players and makes the whole deal a
    // statement about picks rather than about a 28-year-old.
    const plain = deriveExitWindow(
      history(players, [trade("t1", "2026", { a: 1, b: 2 }, { a: 2, b: 1 })]),
    );
    const picky = deriveExitWindow(
      history(players, [
        trade("t2", "2026", { a: 1, b: 2 }, { a: 2, b: 1 }, [
          {
            round: 1,
            season: "2027",
            rosterId: 1,
            ownerId: 2,
            previousOwnerId: 1,
          },
        ]),
      ]),
    );
    expect(plain.sidesPickHeavy).toBe(0);
    expect(picky.sidesPickHeavy).toBeGreaterThan(0);
    expect(picky.acquisitions).toBeLessThan(plain.acquisitions);
  });
  it("counts a side that gave up no players as unpriceable rather than as free value", () => {
    // Roster 1 receives a player and sends back only a pick. There is no player cost
    // to charge the acquisition against, so it must not enter a bucket at infinity.
    const h = history(
      [player("a", 25, 50)],
      [
        trade("t1", "2026", { a: 1 }, { a: 2 }, [
          {
            round: 1,
            season: "2027",
            rosterId: 1,
            ownerId: 2,
            previousOwnerId: 1,
          },
        ]),
      ],
    );
    const w = deriveExitWindow(h);
    expect(w.sidesNoPricedCost + w.sidesPickHeavy).toBeGreaterThan(0);
    expect(w.buckets.every((b) => Number.isFinite(b.ratio))).toBe(true);
  });
  it("ignores everything that is not a trade", () => {
    const h = history(
      [player("a", 25, 50), player("b", 25, 60)],
      [
        { ...trade("t1", "2026", { a: 1 }, { a: 2 }), type: "waiver" },
        { ...trade("t2", "2026", { b: 1 }, { b: 2 }), type: "free_agent" },
      ],
    );
    expect(deriveExitWindow(h).tradesRead).toBe(0);
  });
});
describe("deriveExitWindow: the refusal", () => {
  it("refuses on a sample where one deal carries a bucket", () => {
    // Three acquisitions in one age bucket. Nowhere near the bar, and the point is
    // that the function says so rather than reporting a ratio as if it meant anything.
    const players = [
      player("in1", 31, 10),
      player("in2", 31, 90),
      player("in3", 31, 95),
      player("out", 27, 40),
    ];
    const h = history(players, [
      trade(
        "t1",
        "2026",
        { in1: 1, in2: 1, in3: 1, out: 2 },
        { in1: 2, in2: 2, in3: 2, out: 1 },
      ),
    ]);
    const w = deriveExitWindow(h);
    const bucket = w.buckets.find((b) => b.label === "30 to 31");
    expect(bucket.n).toBe(3);
    expect(bucket.n).toBeLessThan(SUFFICIENCY.minAcquisitions);
    expect(bucket.sufficient).toBe(false);
    expect(w.sufficientBuckets).toBe(0);
    expect(w.corroboratedThrough).toBeNull();
    expect(w.refusal).toBeTruthy();
  });
  it("refuses a bucket that has the count but is carried by one acquisition", () => {
    // Twenty acquisitions, so `minAcquisitions` is satisfied - and one rank-1 asset
    // among nineteen rank-250 ones, so the ratio is that one deal wearing a crowd.
    const ins = [
      player("star", 31, 1),
      ...Array.from({ length: 19 }, (_, i) => player(`sc${i}`, 31, 250)),
    ];
    const out = player("out", 27, 40);
    const adds = { out: 2 };
    const drops = { out: 1 };
    for (const p of ins) {
      adds[p.playerId] = 1;
      drops[p.playerId] = 2;
    }
    const w = deriveExitWindow(
      history([...ins, out], [trade("t1", "2026", adds, drops)]),
    );
    const bucket = w.buckets.find((b) => b.label === "30 to 31");
    expect(bucket.n).toBeGreaterThanOrEqual(SUFFICIENCY.minAcquisitions);
    expect(bucket.concentration).toBeGreaterThan(SUFFICIENCY.maxConcentration);
    expect(bucket.sufficient).toBe(false);
    expect(w.refusal).toBeTruthy();
  });
  it("keeps the two halves of the bar arithmetically compatible", () => {
    // Concentration is max/sum, so it cannot fall below 1/n however evenly a bucket is
    // spread. A `minAcquisitions` under ceil(1 / maxConcentration) therefore makes the
    // pair unsatisfiable by construction across the whole range where the count binds -
    // which is what shipped (12 against 0.05, unreachable for every n from 12 to 19)
    // and what made this module's "nothing here is hardcoded to no" claim false. This
    // pins the RELATIONSHIP rather than either literal, so retuning one moves the other.
    expect(SUFFICIENCY.minAcquisitions).toBeGreaterThanOrEqual(
      Math.ceil(1 / SUFFICIENCY.maxConcentration),
    );
  });
  it("is not hardcoded to refuse: a thick, evenly spread bucket clears the bar", () => {
    // The refusal has to be falsifiable, or it is decoration. Forty acquisitions of
    // equal weight across forty separate trades pass both halves of SUFFICIENCY.
    const players = [];
    const transactions = [];
    for (let i = 0; i < 40; i++) {
      players.push(player(`in${i}`, 31, 100));
      players.push(player(`out${i}`, 27, 100));
      transactions.push(
        trade(
          `t${i}`,
          "2026",
          { [`in${i}`]: 1, [`out${i}`]: 2 },
          { [`in${i}`]: 2, [`out${i}`]: 1 },
        ),
      );
    }
    const w = deriveExitWindow(history(players, transactions));
    const bucket = w.buckets.find((b) => b.label === "30 to 31");
    expect(bucket.n).toBe(40);
    expect(bucket.concentration).toBeLessThanOrEqual(
      SUFFICIENCY.maxConcentration,
    );
    expect(bucket.sufficient).toBe(true);
    expect(w.refusal).toBeNull();
    expect(w.corroboratedThrough).toBe(31);
  });
  it("reports n on every bucket, including the empty ones", () => {
    const w = deriveExitWindow(history([], []));
    expect(w.buckets).toHaveLength(8);
    for (const b of w.buckets) {
      expect(b.n).toBe(0);
      expect(b.sufficient).toBe(false);
    }
    expect(w.refusal).toBeTruthy();
  });
});
describe("the measured age curve", () => {
  it("is monotonically non-increasing across the whole supported span", () => {
    for (let i = 1; i < DERIVED_AGE_CURVE.length; i++) {
      expect(DERIVED_AGE_CURVE[i].multiplier).toBeLessThanOrEqual(
        DERIVED_AGE_CURVE[i - 1].multiplier,
      );
    }
  });
  it("carries a sample size and a survival rate on every row", () => {
    for (const row of DERIVED_AGE_CURVE) {
      expect(row.cohort).toBeGreaterThanOrEqual(AGE_CURVE_PROVENANCE.minCell);
      expect(row.stillPlaying).toBeGreaterThan(0);
      expect(row.stillPlaying).toBeLessThanOrEqual(1);
    }
  });
  it("IS the config's anchors, so the model and the published table cannot drift", () => {
    expect(VALUATION_CONFIG.ageAnchors).toEqual(
      DERIVED_AGE_CURVE.map((r) => [r.age, r.multiplier]),
    );
  });
  it("holds flat outside the span the sample supports rather than extrapolating", () => {
    expect(ageMultiplier(CURVE_SUPPORTED_MIN - 4)).toBe(
      ageMultiplier(CURVE_SUPPORTED_MIN),
    );
    expect(ageMultiplier(CURVE_SUPPORTED_MAX + 6)).toBe(
      ageMultiplier(CURVE_SUPPORTED_MAX),
    );
  });
  it("finds the first cliff past the reference age, and derives it from the table", () => {
    expect(firstCliffAge()).toBe(30);
    // Moved by the data, not by an edit somewhere else: a table whose only steep year
    // is later reports a later cliff.
    const gentle = DERIVED_AGE_CURVE.map((r) => ({
      ...r,
      multiplier: r.age >= 34 ? r.multiplier : 1 - (r.age - 19) * 0.01,
    }));
    expect(firstCliffAge(gentle)).toBeGreaterThan(30);
  });
  it("marks assets at or past the cliff and nobody younger", () => {
    expect(pastFirstCliff(29)).toBe(false);
    expect(pastFirstCliff(30)).toBe(true);
    expect(pastFirstCliff(41)).toBe(true);
    expect(pastFirstCliff(null)).toBe(false);
    expect(pastFirstCliff(undefined)).toBe(false);
  });
});
describe("D28: recalibrating the curve did not move the ceiling", () => {
  /** The hand-set anchors this change replaced. Kept only to prove the peak held. */
  const HAND_SET = [
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
  ];
  it("keeps the largest age anchor at exactly the value it had before", () => {
    expect(Math.max(...VALUATION_CONFIG.ageAnchors.map(([, m]) => m))).toBe(
      Math.max(...HAND_SET.map(([, m]) => m)),
    );
  });
  it("leaves theoreticalMaxMultiplier bit-for-bit identical", () => {
    const posMults = positionMultipliers(SCORING);
    const before = { ...VALUATION_CONFIG, ageAnchors: HAND_SET };
    expect(theoreticalMaxMultiplier(posMults, VALUATION_CONFIG)).toBe(
      theoreticalMaxMultiplier(posMults, before),
    );
  });
  it("still prices the most extreme hypothetical player at exactly maxValue", () => {
    const posMults = positionMultipliers(SCORING);
    const bestPos = Object.entries(posMults).reduce((b, e) =>
      e[1] > b[1] ? e : b,
    )[0];
    const peakAge = VALUATION_CONFIG.ageAnchors.reduce((b, a) =>
      a[1] > b[1] ? a : b,
    )[0];
    const synthetic = {
      ...player("peak", peakAge, 1),
      position: bestPos,
      fantasyPositions: [bestPos],
    };
    const v = valuePlayer(synthetic, SCORING).value;
    expect(v).toBeLessThanOrEqual(VALUATION_CONFIG.maxValue);
    expect(Math.abs(v - VALUATION_CONFIG.maxValue)).toBeLessThanOrEqual(1);
  });
  it("moved the shape and only the shape: older assets up, the prime slightly down", () => {
    const before = { ...VALUATION_CONFIG, ageAnchors: HAND_SET };
    const at = (age, cfg = VALUATION_CONFIG) =>
      valuePlayer(player("p", age, 50), SCORING, cfg).value;
    // The hand-set curve punished age harder than the games do.
    expect(at(35)).toBeGreaterThan(at(35, before));
    expect(at(33)).toBeGreaterThan(at(33, before));
    // And spread youth's premium too far into the twenties.
    expect(at(23)).toBeLessThan(at(23, before));
    // Ordering by age is untouched, which is what a shape change must not break.
    expect(at(23)).toBeGreaterThan(at(30));
    expect(at(30)).toBeGreaterThan(at(35));
  });
});
// --------------------------------------------------------------------------------
// THE REFUSAL AS DATA (lib/refusal.js). The string was already here; the code is new,
// and so is the figure it declined to publish.
// --------------------------------------------------------------------------------
describe("deriveExitWindow: the refusal carries a code", () => {
  /** Twenty equal-weight acquisitions in one bucket, spread across twenty trades. */
  function thickBucket(n, age = 31) {
    const players = [];
    const transactions = [];
    for (let i = 0; i < n; i++) {
      players.push(player(`in${i}`, age, 100));
      players.push(player(`out${i}`, 27, 100));
      transactions.push(
        trade(
          `t${i}`,
          "2026",
          { [`in${i}`]: 1, [`out${i}`]: 2 },
          { [`in${i}`]: 2, [`out${i}`]: 1 },
        ),
      );
    }
    return history(players, transactions);
  }
  it("reads NO_RECORD when no trade yields a priced acquisition at all", () => {
    const w = deriveExitWindow(history([], []));
    expect(w.refusal.code).toBe("NO_RECORD");
    // Nothing to slope, so nothing is withheld - the module does not manufacture a
    // figure in order to have one to decline.
    expect(w.refusal.withheld).toBeNull();
    for (const b of w.buckets) expect(b.refusal.code).toBe("NO_RECORD");
  });
  it("reads INSUFFICIENT_SAMPLE while the count is what binds", () => {
    const w = deriveExitWindow(thickBucket(5));
    const bucket = w.buckets.find((b) => b.label === "30 to 31");
    expect(bucket.n).toBe(5);
    expect(bucket.refusal.code).toBe("INSUFFICIENT_SAMPLE");
    expect(bucket.refusal.because).toContain(
      `floor of ${SUFFICIENCY.minAcquisitions}`,
    );
    // The ratio the table prints, repeated inside the refusal: a number in a grid
    // reads as a finding unless something adjacent says it is not one.
    expect(bucket.refusal.withheld.label).toBe("Back per 100 paid");
    expect(w.refusal.code).toBe("INSUFFICIENT_SAMPLE");
  });
  it("reads CONCENTRATED_SAMPLE only when the count is NOT the problem", () => {
    // The case the bar was designed around: twenty deals, and one of them carrying
    // the bucket. No amount of waiting fixes this one, and the code says which.
    const ins = [
      player("star", 31, 1),
      ...Array.from({ length: 19 }, (_, i) => player(`sc${i}`, 31, 250)),
    ];
    const out = player("out", 27, 40);
    const adds = { out: 2 };
    const drops = { out: 1 };
    for (const p of ins) {
      adds[p.playerId] = 1;
      drops[p.playerId] = 2;
    }
    const w = deriveExitWindow(
      history([...ins, out], [trade("t1", "2026", adds, drops)]),
    );
    const bucket = w.buckets.find((b) => b.label === "30 to 31");
    expect(bucket.n).toBeGreaterThanOrEqual(SUFFICIENCY.minAcquisitions);
    expect(bucket.refusal.code).toBe("CONCENTRATED_SAMPLE");
    expect(w.refusal.code).toBe("CONCENTRATED_SAMPLE");
    expect(w.refusal.because).toContain("thickest bucket");
  });
  it("prints the age slope it declined, and never anywhere a caller could use it", () => {
    // The centroid pairing: the figure the section would have published, beside the
    // one line proving it would have been dishonest. "The market cannot calibrate an
    // age curve" is an abstraction until a reader sees WHICH number was refused.
    const w = deriveExitWindow(thickBucket(5));
    expect(w.refusal.withheld.label).toBe("This market's own age slope");
    expect(w.refusal.withheld.value).toMatch(/^[+-]?\d+\.\d% per year of age$/);
    // It exists ONLY inside the refusal. Promoting it to a field is how a refused
    // number gets read back out as a calibrated one two refactors later.
    const top = JSON.stringify({ ...w, refusal: null, buckets: null });
    expect(top).not.toContain("per year of age");
    expect(w.ageSlope).toBeUndefined();
    expect(w.slope).toBeUndefined();
  });
  it("leaves a sufficient bucket with no refusal, top level and per bucket", () => {
    const w = deriveExitWindow(thickBucket(40));
    expect(w.refusal).toBeNull();
    const bucket = w.buckets.find((b) => b.label === "30 to 31");
    expect(bucket.sufficient).toBe(true);
    expect(bucket.refusal).toBeNull();
    // Every EMPTY bucket still names its own reason rather than leaving a blank
    // where the code goes. (26 to 27 is not empty: it holds the other side.)
    const empty = w.buckets.filter((b) => b.n === 0);
    expect(empty.length).toBeGreaterThan(0);
    for (const b of empty) expect(b.refusal.code).toBe("NO_RECORD");
  });
  it("points at a falsifiable bar rather than at a retry", () => {
    const w = deriveExitWindow(thickBucket(5));
    const text = `${w.refusal.because} ${w.buckets.map((b) => b.refusal?.because).join(" ")}`;
    expect(w.refusal.because).toContain("buckets thicken and start passing it");
    expect(text).not.toMatch(/\b(try again|retry|refresh|check back|loading)\b/i);
  });
  it("grades no manager for the shape of the market (D6)", () => {
    const w = deriveExitWindow(thickBucket(5));
    expect(w.refusal.because).not.toMatch(
      /\b(good|bad|better|worse|weak|strong|overpaid|mistake)\b/i,
    );
  });
});
