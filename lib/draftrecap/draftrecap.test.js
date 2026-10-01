import { describe, expect, it } from "vitest";
import { averageRanks, marketAgreement, recapDraft } from "./index.js";

// Linear (non-snake) 6-pick draft; roster "A" holds three picks.
const mk = (pickNo, round, rosterId, playerId) => ({
  pickNo,
  round,
  draftSlot: ((pickNo - 1) % 3) + 1,
  rosterId,
  playerId,
  playerName: `Player ${playerId}`,
  position: "WR",
  team: "FA",
});
const PICKS = [
  mk(1, 1, "A", "p1"),
  mk(2, 1, "B", "p2"),
  mk(3, 1, "A", "p3"),
  mk(4, 2, "C", "p4"),
  mk(5, 2, "A", "p5"),
  mk(6, 2, "B", "p6"),
];
const VALUES = { p1: 50, p2: 80, p3: 30, p4: 90, p5: 10, p6: 40 };
const COSTS = { 1: 100, 2: 90, 3: 80, 4: 70, 5: 60, 6: 50 };
const NAMES = { A: "Alpha", B: "Bravo", C: "Charlie" };
const base = {
  picks: PICKS,
  valueOf: (id) => VALUES[id] ?? null,
  slotCost: (n) => COSTS[n] ?? null,
  nameOfRoster: (r) => NAMES[r],
};
const byNo = (r, n) => r.picks.find((p) => p.pickNo === n);

describe("recapDraft", () => {
  it("computes value, cost, surplus per pick on the same scale", () => {
    const r = recapDraft(base);
    expect(byNo(r, 1)).toMatchObject({ value: 50, cost: 100, surplus: -50 });
    expect(byNo(r, 4)).toMatchObject({ value: 90, cost: 70, surplus: 20 });
    expect(r.classTotals).toEqual({ value: 300, cost: 450 });
  });

  it("ranks the class by value and derives slotDelta = pickNo - classRank", () => {
    const r = recapDraft(base);
    const got = r.picks.map((p) => [p.pickNo, p.classRank, p.slotDelta]);
    expect(got).toEqual([
      [1, 3, -2],
      [2, 2, 0],
      [3, 5, -2],
      [4, 1, 3],
      [5, 6, -1],
      [6, 4, 2],
    ]);
  });

  it("aggregates a roster holding several picks in a linear draft", () => {
    const r = recapDraft(base);
    const a = r.teams.find((t) => t.rosterId === "A");
    expect(a).toMatchObject({ name: "Alpha", count: 3, firsts: 2, valueAdded: 90, cost: 240, surplus: -150 });
    expect(a.picks.map((p) => p.pickNo)).toEqual([1, 3, 5]);
    // all three picks tie at -50 surplus -> earliest pick wins the tie
    expect(a.bestPick.pickNo).toBe(1);
  });

  it("sorts teams by valueAdded DESC, ties by earliest pickNo", () => {
    const r = recapDraft(base);
    expect(r.teams.map((t) => t.rosterId)).toEqual(["B", "A", "C"]);
    expect(r.teams.find((t) => t.rosterId === "C").bestPick.pickNo).toBe(4);
  });

  it("lists fallers (positive slotDelta) and reaches (negative), ties by pickNo", () => {
    const r = recapDraft(base);
    expect(r.biggestFallers.map((p) => p.pickNo)).toEqual([4, 6]);
    expect(r.biggestReaches.map((p) => p.pickNo)).toEqual([1, 3, 5]);
  });

  it("treats missing values as 0, flags them, and keeps them out of faller/reach lists", () => {
    const r = recapDraft({
      ...base,
      valueOf: (id) => (id === "p4" ? null : VALUES[id]),
      slotCost: (n) => (n === 6 ? undefined : COSTS[n]),
    });
    const p4 = byNo(r, 4);
    expect(p4).toMatchObject({ value: 0, unpriced: true, classRank: 6 });
    expect(byNo(r, 6)).toMatchObject({ cost: 0, costUnpriced: true, surplus: 40 });
    expect(r.biggestFallers.concat(r.biggestReaches).some((p) => p.pickNo === 4)).toBe(false);
    expect(r.teams.find((t) => t.rosterId === "C").bestPick).toBeNull();
  });

  it("does not mutate inputs and emits no grade-like fields", () => {
    const copy = JSON.parse(JSON.stringify(PICKS));
    const r = recapDraft({ ...base, marketRankOf: (id) => Number(id.slice(1)) });
    expect(PICKS).toEqual(copy);
    const keys = JSON.stringify(r);
    expect(keys).not.toMatch(/"grade"|"verdict"|"worst"/);
    expect(r.marketAgreement).toEqual({ rho: 1, n: 6 });
    expect(byNo(r, 2).marketRank).toBe(2);
  });
});

describe("marketAgreement", () => {
  it("is 1 for identical order and -1 for reversed order", () => {
    expect(marketAgreement(PICKS, (id) => Number(id.slice(1))).rho).toBeCloseTo(1, 12);
    expect(marketAgreement(PICKS, (id) => 7 - Number(id.slice(1))).rho).toBeCloseTo(-1, 12);
  });

  it("uses average ranks for ties and skips picks without a market rank", () => {
    const m = { p1: 1, p2: 2, p3: 2, p4: 4, p5: null };
    const out = marketAgreement(PICKS.slice(0, 5), (id) => m[id]);
    expect(out.n).toBe(4);
    expect(out.rho).toBeCloseTo(Math.sqrt(0.9), 12);
    expect(averageRanks([10, 20, 20, 40])).toEqual([1, 2.5, 2.5, 4]);
  });

  it("returns rho null when fewer than two ranked picks", () => {
    expect(marketAgreement(PICKS, (id) => (id === "p1" ? 3 : null))).toEqual({ rho: null, n: 1 });
  });
});
