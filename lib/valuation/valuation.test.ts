import { describe, expect, it } from "vitest";
import type { Player } from "../providers/types";
import {
  VALUATION_CONFIG,
  ageMultiplier,
  classMultiplier,
  estimateOverallPick,
  pickValue,
  slotDistribution,
  positionMultipliers,
  tierOf,
  valuePlayer,
} from "./index";

const SCORING = {
  pts: 0.5, reb: 1, ast: 1, stl: 2, blk: 2, to: -1, tpm: 0.5,
};

function player(overrides: Partial<Player>): Player {
  return {
    playerId: "x",
    fullName: "Test Player",
    firstName: "Test",
    lastName: "Player",
    team: "BOS",
    position: "SF",
    fantasyPositions: ["SF"],
    age: 25,
    yearsExp: 4,
    birthDate: null,
    injuryStatus: null,
    depthChartOrder: 1,
    status: "ACT",
    number: 0,
    searchRank: 50,
    espnId: null,
    ...overrides,
  };
}

describe("ageMultiplier", () => {
  it("rewards youth and penalizes age", () => {
    expect(ageMultiplier(20)).toBeGreaterThan(ageMultiplier(27));
    expect(ageMultiplier(27)).toBeGreaterThan(ageMultiplier(33));
    expect(ageMultiplier(33)).toBeGreaterThan(ageMultiplier(37));
  });
  it("interpolates between anchors", () => {
    const m = ageMultiplier(24);
    expect(m).toBeLessThan(ageMultiplier(23));
    expect(m).toBeGreaterThan(ageMultiplier(25));
  });
  it("returns neutral for unknown age", () => {
    expect(ageMultiplier(null)).toBe(1);
  });
});

describe("valuePlayer", () => {
  it("ranks better players higher (lower rank = more value)", () => {
    const a = valuePlayer(player({ searchRank: 1 }), SCORING);
    const b = valuePlayer(player({ searchRank: 100 }), SCORING);
    expect(a.value).toBeGreaterThan(b.value);
  });
  it("a young player beats an old one of equal rank", () => {
    const young = valuePlayer(player({ age: 21, searchRank: 30 }), SCORING);
    const old = valuePlayer(player({ age: 34, searchRank: 30 }), SCORING);
    expect(young.value).toBeGreaterThan(old.value);
  });
  it("injury status reduces value", () => {
    const healthy = valuePlayer(player({ injuryStatus: null }), SCORING);
    const hurt = valuePlayer(player({ injuryStatus: "Out" }), SCORING);
    expect(hurt.value).toBeLessThan(healthy.value);
  });
  it("exposes an explainable breakdown", () => {
    const b = valuePlayer(player({}), SCORING);
    expect(b).toHaveProperty("base");
    expect(b).toHaveProperty("ageMultiplier");
    expect(b).toHaveProperty("positionMultiplier");
    expect(b.value).toBeGreaterThan(0);
  });
});

describe("positionMultipliers (league-aware)", () => {
  it("boosts steals/blocks-heavy positions when those are weighted 2x", () => {
    const m = positionMultipliers(SCORING);
    // Centers (blk) and guards (stl/ast) should be lifted vs a flat baseline.
    expect(m.C).toBeGreaterThan(0.9);
    expect(m.PG).toBeGreaterThan(0.9);
    // multipliers hover around 1
    for (const v of Object.values(m)) {
      expect(v).toBeGreaterThan(0.7);
      expect(v).toBeLessThan(1.3);
    }
  });
  it("responds to scoring changes", () => {
    const blkHeavy = positionMultipliers({ ...SCORING, blk: 6 });
    const flat = positionMultipliers({ ...SCORING, blk: 2 });
    expect(blkHeavy.C).toBeGreaterThan(flat.C);
  });
});

describe("pickValue", () => {
  const T = { teams: 14 };

  it("discounts future picks", () => {
    expect(pickValue(1, 0, T)).toBeGreaterThan(pickValue(1, 2, T));
  });

  it("earlier rounds are worth more", () => {
    expect(pickValue(1, 0, T)).toBeGreaterThan(pickValue(2, 0, T));
    expect(pickValue(2, 0, T)).toBeGreaterThan(pickValue(3, 0, T));
  });

  it("stays backward compatible with the old (round, seasonsOut) signature", () => {
    expect(pickValue(1, 0)).toBeGreaterThan(0);
    expect(pickValue(1, 0)).toBeGreaterThan(pickValue(3, 0));
  });

  // The headline fix: a 1.01 and a 1.14 are wildly different assets and the old
  // round-only model priced them identically.
  it("prices the 1.01 far above the 1.14", () => {
    const first = pickValue(1, 0, { slot: 1, ...T });
    const last = pickValue(1, 0, { slot: 14, ...T });
    expect(first).toBeGreaterThan(last * 4);
  });

  it("decays monotonically across slots within a round", () => {
    const vals = [1, 2, 5, 9, 14].map((slot) => pickValue(1, 0, { slot, ...T }));
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeLessThan(vals[i - 1]);
    }
  });

  it("never drops below the configured floor", () => {
    expect(pickValue(3, 0, { slot: 14, ...T })).toBeGreaterThanOrEqual(
      VALUATION_CONFIG.pick.floor,
    );
  });

  // Pricing a future pick by who owes it: a weak team's first lands early.
  it("values a weak team's first above a strong team's first", () => {
    const fromWorst = pickValue(1, 0, { originalTeamRank: 14, ...T });
    const fromBest = pickValue(1, 0, { originalTeamRank: 1, ...T });
    expect(fromWorst).toBeGreaterThan(fromBest);
  });

  it("regresses slot estimates toward the middle as picks move further out", () => {
    // You can guess next season's draft order; you cannot guess 2030's. So the gap
    // between a good and bad team's pick must narrow with distance.
    const nearGap =
      pickValue(1, 0, { originalTeamRank: 14, ...T }) -
      pickValue(1, 0, { originalTeamRank: 1, ...T });
    const farGap =
      pickValue(1, 4, { originalTeamRank: 14, ...T }) -
      pickValue(1, 4, { originalTeamRank: 1, ...T });
    expect(farGap).toBeLessThan(nearGap);
  });

  it("falls back to mid-round when nothing is known about the order", () => {
    const unknown = pickValue(1, 0, T);
    expect(unknown).toBeLessThan(pickValue(1, 0, { slot: 1, ...T }));
    expect(unknown).toBeGreaterThan(pickValue(1, 0, { slot: 14, ...T }));
  });
});

describe("lottery-aware pick valuation", () => {
  // This league: 14 teams, 8 make the playoffs, so 6 lottery teams take picks 1-6
  // and the 8 playoff teams draft 7-14 in reverse standings, champion last.
  const L = { teams: 14, playoffTeams: 8 };

  it("spreads a non-playoff team's first across the whole lottery range", () => {
    const dist = slotDistribution(1, { ...L, originalTeamRank: 14 });
    expect(dist.length).toBe(6);
    expect(dist[0].slot).toBe(1);
    expect(dist[dist.length - 1].slot).toBe(6);
    const total = dist.reduce((s, d) => s + d.p, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("gives a playoff team a single deterministic slot after the lottery", () => {
    const dist = slotDistribution(1, { ...L, originalTeamRank: 8 });
    expect(dist).toEqual([{ slot: 7, p: 1 }]);
  });

  it("makes the champion pick last", () => {
    const dist = slotDistribution(1, { ...L, originalTeamRank: 1 });
    expect(dist[0].slot).toBe(14);
  });

  it("still ranks a lottery pick above every playoff team's pick", () => {
    const lottery = pickValue(1, 0, { ...L, originalTeamRank: 12 });
    const bestPlayoff = pickValue(1, 0, { ...L, originalTeamRank: 8 });
    const champion = pickValue(1, 0, { ...L, originalTeamRank: 1 });
    expect(lottery).toBeGreaterThan(bestPlayoff);
    expect(bestPlayoff).toBeGreaterThan(champion);
  });

  /**
   * The value curve is convex, so averaging value over the lottery outcomes is worth
   * MORE than valuing the average slot. Collapsing the lottery to one slot would
   * systematically underprice every rebuilding team's first.
   */
  it("prices the lottery by expected value, not value at the expected slot", () => {
    const dist = slotDistribution(1, { ...L, originalTeamRank: 14 });
    const expectedSlot = Math.round(dist.reduce((s, d) => s + d.slot * d.p, 0));
    const expectedValue = pickValue(1, 0, { ...L, originalTeamRank: 14 });
    const valueAtExpectedSlot = pickValue(1, 0, { ...L, slot: expectedSlot });
    expect(expectedValue).toBeGreaterThan(valueAtExpectedSlot);
  });

  it("treats lottery teams alike under flat odds", () => {
    // With lotteryWeighting at 0 every lottery team has the same distribution, so
    // finishing 14th rather than 9th must not change the pick's value.
    expect(pickValue(1, 0, { ...L, originalTeamRank: 14 })).toBe(
      pickValue(1, 0, { ...L, originalTeamRank: 9 }),
    );
  });

  it("falls back to strict reverse standings when playoffTeams is unknown", () => {
    const dist = slotDistribution(1, { teams: 14, originalTeamRank: 14 });
    expect(dist).toEqual([{ slot: 1, p: 1 }]);
  });
});

describe("classMultiplier", () => {
  it("is neutral for an unconfigured season", () => {
    expect(classMultiplier(1, "2031")).toBe(1);
    expect(classMultiplier(30, undefined)).toBe(1);
  });

  it("applies a deep class to the tail more than the top", () => {
    const cfg = {
      ...VALUATION_CONFIG,
      classStrength: { "2099": { top: 1.0, depth: 1.2 } },
    };
    const atTop = classMultiplier(1, "2099", cfg);
    const atTail = classMultiplier(30, "2099", cfg);
    expect(atTop).toBeCloseTo(1, 2);
    expect(atTail).toBeGreaterThan(atTop);
  });

  it("applies a top-heavy class to the 1.01 more than the tail", () => {
    const cfg = {
      ...VALUATION_CONFIG,
      classStrength: { "2099": { top: 1.6, depth: 1.0 } },
    };
    expect(classMultiplier(1, "2099", cfg)).toBeGreaterThan(
      classMultiplier(30, "2099", cfg),
    );
  });

  it("flows through to pick value", () => {
    const cfg = {
      ...VALUATION_CONFIG,
      classStrength: { "2099": { top: 2.0, depth: 2.0 } },
    };
    const boosted = pickValue(1, 0, { teams: 14, slot: 1, season: "2099" }, cfg);
    const neutral = pickValue(1, 0, { teams: 14, slot: 1, season: "2098" }, cfg);
    expect(boosted).toBeGreaterThan(neutral * 1.5);
  });
});

describe("estimateOverallPick", () => {
  it("maps round and slot onto an overall pick number", () => {
    expect(estimateOverallPick(1, 0, { slot: 1, teams: 14 })).toBe(1);
    expect(estimateOverallPick(2, 0, { slot: 1, teams: 14 })).toBe(15);
    expect(estimateOverallPick(3, 0, { slot: 14, teams: 14 })).toBe(42);
  });

  it("inverts standings: the worst team picks first", () => {
    expect(estimateOverallPick(1, 0, { originalTeamRank: 14, teams: 14 })).toBe(1);
    expect(estimateOverallPick(1, 0, { originalTeamRank: 1, teams: 14 })).toBe(14);
  });

  it("clamps an out-of-range slot into the round", () => {
    expect(estimateOverallPick(1, 0, { slot: 99, teams: 14 })).toBe(14);
    expect(estimateOverallPick(1, 0, { slot: -5, teams: 14 })).toBe(1);
  });
});

describe("tierOf", () => {
  it("labels descending tiers", () => {
    expect(tierOf(8000)).toBe("Franchise");
    expect(tierOf(100)).toBe("Fringe");
  });
});
