import { describe, expect, it } from "vitest";
import type { Player } from "../providers/types";
import {
  ageMultiplier,
  pickValue,
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
  it("discounts future picks", () => {
    expect(pickValue(1, 0)).toBeGreaterThan(pickValue(1, 2));
  });
  it("earlier rounds are worth more", () => {
    expect(pickValue(1, 0)).toBeGreaterThan(pickValue(2, 0));
    expect(pickValue(2, 0)).toBeGreaterThan(pickValue(3, 0));
  });
});

describe("tierOf", () => {
  it("labels descending tiers", () => {
    expect(tierOf(8000)).toBe("Franchise");
    expect(tierOf(100)).toBe("Fringe");
  });
});
