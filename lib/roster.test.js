import { describe, expect, it } from "vitest";
import { rankSeasonRosters } from "./roster";
function roster(rosterId, wins, losses, fpts) {
  return {
    rosterId,
    ownerId: `u${rosterId}`,
    coOwners: [],
    players: [],
    starters: [],
    reserve: [],
    taxi: [],
    settings: {
      wins,
      losses,
      ties: 0,
      fpts,
      fptsAgainst: 0,
      ppts: fpts + 100,
      waiverBudgetUsed: 0,
      waiverPosition: 0,
      totalMoves: 0,
    },
  };
}
describe("rankSeasonRosters", () => {
  it("ranks by win differential first", () => {
    const ranked = rankSeasonRosters(
      [roster(1, 5, 9, 1000), roster(2, 10, 4, 900)],
      "2024",
      false,
    );
    expect(ranked.get(2).rank).toBe(1);
    expect(ranked.get(1).rank).toBe(2);
    expect(ranked.get(2).teams).toBe(2);
  });
  it("breaks a tied win differential on points", () => {
    const ranked = rankSeasonRosters(
      [roster(1, 7, 7, 1000), roster(2, 7, 7, 1200)],
      "2024",
      false,
    );
    expect(ranked.get(2).rank).toBe(1);
    expect(ranked.get(1).rank).toBe(2);
  });
  it("carries the season and isLive flag through untouched", () => {
    const ranked = rankSeasonRosters([roster(1, 1, 1, 100)], "2023", true);
    expect(ranked.get(1).season).toBe("2023");
    expect(ranked.get(1).isLive).toBe(true);
  });
});
