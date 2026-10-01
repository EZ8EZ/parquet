import { describe, it, expect } from "vitest";
import { marketGaps, marketSourceCounts } from "./index.js";

const v = (playerId, rank, marketRank, extra = {}) => ({
  playerId,
  rank,
  marketRank,
  value: 1000,
  marketSource: "blend",
  productionBacked: false,
  ...extra,
});

const h = {
  players: new Map([
    ["a", { fullName: "A A", team: "KC", age: 25, yearsExp: 3 }],
    ["b", { fullName: "B B", team: "BUF", age: 22, yearsExp: 0 }],
    ["c", { fullName: "C C", team: "SF", age: 28, yearsExp: 5 }],
    ["d", { fullName: "D D", team: "NYJ", age: 30, yearsExp: 8 }],
    ["e", { fullName: "E E", team: "DAL", age: 24, yearsExp: 2 }],
    ["f", { fullName: "F F", team: "MIA", age: 26, yearsExp: 4 }],
  ]),
  rosters: [
    { rosterId: 1, players: ["a", "c"] },
    { rosterId: 2, players: ["b"] },
  ],
  currentLeague: { scoringSettings: {} },
};

const values = new Map([
  ["a", v("a", 10, 30, { productionBacked: true })], // +20
  ["b", v("b", 20, 12)], // -8, rookie
  ["c", v("c", 40, 33)], // -7
  ["d", v("d", 50, 53)], // +3: under threshold
  ["e", v("e", 5, 50, { value: 0 })], // value 0: excluded
  ["f", v("f", 5, null)], // no market rank: excluded
]);

describe("marketGaps", () => {
  it("splits, filters and sorts by |gap|", () => {
    const { higher, lower } = marketGaps(h, { values });
    expect(higher.map((r) => r.playerId)).toEqual(["a"]);
    expect(lower.map((r) => r.playerId)).toEqual(["b", "c"]);
    expect(higher[0]).toMatchObject({
      gap: 20,
      reason: "production",
      rosteredBy: 1,
      name: "A A",
      team: "KC",
      age: 25,
    });
    expect(lower[0]).toMatchObject({ gap: -8, reason: "rookie prior", rosteredBy: 2 });
    expect(lower[1]).toMatchObject({ reason: "model", rosteredBy: 1 });
  });
  it("scopes to rosterIds and honours limit", () => {
    const { higher, lower } = marketGaps(h, { values, rosterIds: [2] });
    expect(higher).toEqual([]);
    expect(lower.map((r) => r.playerId)).toEqual(["b"]);
    expect(marketGaps(h, { values, limit: 1 }).lower).toHaveLength(1);
  });
  it("leaves unrostered players with rosteredBy null", () => {
    const vals = new Map([["d", v("d", 10, 40)]]);
    expect(marketGaps(h, { values: vals }).higher[0].rosteredBy).toBeNull();
  });
  it("counts market sources over priced players", () => {
    expect(marketSourceCounts(values)).toEqual({ blend: 5, dynasty: 0, redraft: 0 });
  });
});
