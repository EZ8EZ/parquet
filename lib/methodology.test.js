import { describe, expect, it } from "vitest";
import {
  EXAMPLE_POOL,
  baseCurveSamples,
  baseOfRank,
  pickWalkthroughExample,
} from "./methodology.js";
import { VALUATION_CONFIG, valuePlayers } from "./valuation/index.js";
const SCORING = { pts: 0.5, reb: 1, ast: 1, stl: 2, blk: 2, to: -1, tpm: 0.5 };
/** A minimal player the value model will price. */
function player(id, over = {}) {
  return {
    playerId: id,
    fullName: `Player ${id}`,
    position: "SF",
    fantasyPositions: ["SF"],
    age: 27,
    searchRank: Number(id),
    injuryStatus: null,
    injuryBodyPart: null,
    injuryNotes: null,
    depthChartOrder: 1,
    ...over,
  };
}
describe("baseOfRank / baseCurveSamples", () => {
  it("is the model's own exponential: rank 1 prices at exactly maxValue", () => {
    expect(baseOfRank(1)).toBe(VALUATION_CONFIG.maxValue);
  });
  it("agrees with what valuePlayers publishes as `base`", () => {
    // The walkthrough's curve must be the SAME function the model prices with -
    // this is the drift test. Age 27 / healthy / starter so only base matters here.
    const pool = [7, 33, 141].map((r) => player(String(r), { searchRank: r }));
    const valued = valuePlayers(pool, SCORING);
    for (const p of pool) {
      expect(valued.get(p.playerId).base).toBe(baseOfRank(p.searchRank));
    }
  });
  it("samples are strictly decreasing and always end at maxRank", () => {
    const s = baseCurveSamples(260, 8);
    expect(s[0]).toEqual({ rank: 1, base: VALUATION_CONFIG.maxValue });
    expect(s[s.length - 1].rank).toBe(260);
    for (let i = 1; i < s.length; i++) {
      expect(s[i].base).toBeLessThan(s[i - 1].base);
    }
  });
});
describe("pickWalkthroughExample", () => {
  it("returns null for an empty corpus", () => {
    expect(pickWalkthroughExample(new Map(), new Map())).toBeNull();
  });
  it("prefers the asset whose price exercises more of the model's terms", () => {
    // Rank 2 is healthy; rank 5 carries a real injury flag, so its price uses one
    // more term. Both are comfortably inside the pool, so the flagged one must win
    // even though it is the cheaper asset.
    const pool = [
      player("2", { searchRank: 2 }),
      player("5", {
        searchRank: 5,
        injuryStatus: "Out",
        injuryBodyPart: "Knee",
        injuryNotes: "Surgery",
      }),
      ...Array.from({ length: 20 }, (_, i) =>
        player(String(10 + i), { searchRank: 10 + i }),
      ),
    ];
    const players = new Map(pool.map((p) => [p.playerId, p]));
    const valued = valuePlayers(pool, SCORING);
    const ex = pickWalkthroughExample(valued, players);
    expect(ex.playerId).toBe("5");
    // And every figure on it is the model's own output, not a recompute.
    expect(ex.value).toBe(valued.get("5").value);
    expect(ex.injuryMultiplier).toBeLessThan(1);
  });
  it("breaks ties toward the higher price and stays inside the pool", () => {
    // Everyone identical in shape: the tie must go to the top price, and a heavily
    // exercised asset OUTSIDE the top-EXAMPLE_POOL prices must not be reached for.
    const pool = [
      ...Array.from({ length: EXAMPLE_POOL }, (_, i) =>
        player(String(i + 1), { searchRank: i + 1 }),
      ),
      player("deep", {
        searchRank: 200,
        injuryStatus: "Out",
        injuryBodyPart: "Achilles",
        injuryNotes: "Surgery",
        depthChartOrder: 3,
      }),
    ];
    const players = new Map(pool.map((p) => [p.playerId, p]));
    const valued = valuePlayers(pool, SCORING);
    const ex = pickWalkthroughExample(valued, players);
    expect(ex.playerId).toBe("1");
  });
});
