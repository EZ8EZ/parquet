import { describe, expect, it } from "vitest";
import {
  RawPlayer,
  RawRoster,
  RawTransaction,
  toPlayer,
  toRoster,
  toTransaction,
} from "./schemas";

describe("Sleeper transaction parser", () => {
  // Real shape observed from the live API (see API_NOTES.md).
  const raw = {
    status: "complete",
    type: "trade",
    metadata: null,
    created: 1759080693000,
    settings: null,
    leg: 1,
    draft_picks: [
      { round: 1, season: "2026", league_id: null, roster_id: 10, owner_id: 3, previous_owner_id: 10 },
    ],
    creator: "882675268022648832",
    transaction_id: "abc123",
    adds: { "2181": 10 },
    consenter_ids: [3, 10],
    drops: { "2181": 3 },
    roster_ids: [3, 10],
    status_updated: 1759080693980,
    waiver_budget: [],
  };

  it("validates and maps to the domain shape with season stamped", () => {
    const parsed = RawTransaction.parse(raw);
    const t = toTransaction(parsed, "2025");
    expect(t.type).toBe("trade");
    expect(t.season).toBe("2025");
    expect(t.week).toBe(1);
    expect(t.creator).toBe("882675268022648832");
    expect(t.adds["2181"]).toBe(10);
    expect(t.drops["2181"]).toBe(3);
    expect(t.draftPicks).toHaveLength(1);
    expect(t.draftPicks[0]).toMatchObject({
      round: 1,
      season: "2026",
      rosterId: 10,
      ownerId: 3,
      previousOwnerId: 10,
    });
    expect(t.consenterIds).toEqual([3, 10]);
  });

  it("tolerates a waiver with a bid and null draft_picks", () => {
    const w = {
      type: "waiver",
      transaction_id: "w1",
      status: "complete",
      created: 1,
      status_updated: 2,
      leg: 5,
      roster_ids: [4],
      consenter_ids: [4],
      adds: { "999": 4 },
      drops: null,
      draft_picks: null,
      settings: { waiver_bid: 17 },
      creator: "u4",
    };
    const t = toTransaction(RawTransaction.parse(w), "2025");
    expect(t.type).toBe("waiver");
    expect(t.waiverBid).toBe(17);
    expect(t.drops).toEqual({});
    expect(t.draftPicks).toEqual([]);
  });
});

describe("Sleeper roster parser", () => {
  it("combines fpts + fpts_decimal into a whole number", () => {
    const raw = {
      roster_id: 1,
      owner_id: "882656931146457088",
      players: ["1074", "1082"],
      starters: ["1074", "0"],
      reserve: null,
      taxi: null,
      settings: {
        fpts: 4042, fpts_decimal: 50,
        fpts_against: 3362, fpts_against_decimal: 50,
        ppts: 4230, ppts_decimal: 50,
        wins: 15, losses: 5, ties: 0, waiver_budget_used: 0, waiver_position: 12,
      },
    };
    const r = toRoster(RawRoster.parse(raw));
    expect(r.settings.fpts).toBeCloseTo(4042.5);
    expect(r.settings.ppts).toBeCloseTo(4230.5);
    expect(r.settings.wins).toBe(15);
    // "0" placeholder starters are filtered out
    expect(r.starters).toEqual(["1074"]);
  });
});

describe("Sleeper player parser", () => {
  it("maps rich fields and coerces espn_id to string", () => {
    const raw = {
      player_id: "1362",
      full_name: "LeBron James",
      first_name: "LeBron",
      last_name: "James",
      team: "PHI",
      position: "PF",
      fantasy_positions: ["PF", "SF"],
      age: 41,
      years_exp: 22,
      birth_date: "1984-12-30",
      search_rank: 54,
      espn_id: 1966,
      depth_chart_order: 1,
    };
    const p = toPlayer(RawPlayer.parse(raw));
    expect(p.fullName).toBe("LeBron James");
    expect(p.fantasyPositions).toEqual(["PF", "SF"]);
    expect(p.age).toBe(41);
    expect(p.searchRank).toBe(54);
    expect(p.espnId).toBe("1966");
  });

  it("falls back to first+last when full_name is missing", () => {
    const p = toPlayer(RawPlayer.parse({ player_id: "z", first_name: "A", last_name: "B" }));
    expect(p.fullName).toBe("A B");
  });
});
