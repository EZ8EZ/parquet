import { describe, expect, it } from "vitest";
import { standingsRows } from "./standings.js";

const ranked = [
  { rosterId: 6, teamName: "5-Year Plan", ownerName: "a" },
  { rosterId: 1, teamName: "mjrooney20", ownerName: "b" },
  { rosterId: 8, teamName: "Boozer Cruise", ownerName: "c" },
];
const base = {
  ranked,
  users: new Map(),
  rostersById: new Map(),
  meId: 1,
};

describe("standingsRows", () => {
  it("orders by the league's standings and keeps each roster's value rank beside it", () => {
    const forms = new Map([
      [6, { rank: 1, wins: 3, losses: 0, fpts: 500, season: "2026", isLive: true }],
      [1, { rank: 3, wins: 1, losses: 2, fpts: 420, season: "2026", isLive: true }],
      [8, { rank: 2, wins: 2, losses: 1, fpts: 450, season: "2026", isLive: true }],
    ]);
    const s = standingsRows({ ...base, forms });
    expect(s.rows.map((r) => [r.rosterId, r.rank, r.valueRank])).toEqual([
      [6, 1, 1],
      [8, 2, 3],
      [1, 3, 2],
    ]);
    expect(s.rows.find((r) => r.isMe).rosterId).toBe(1);
    expect(s).toMatchObject({ season: "2026", isLive: true, hasRecords: true });
  });

  it("with no games played, falls back to value order and says so", () => {
    const s = standingsRows({ ...base, forms: new Map() });
    expect(s.hasRecords).toBe(false);
    expect(s.rows.map((r) => r.rosterId)).toEqual([6, 1, 8]);
    expect(s.rows[0].wins).toBe(null);
  });
});
