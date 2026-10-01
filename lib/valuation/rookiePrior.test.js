import { describe, expect, it } from "vitest";
import {
  draftCapitalPercentile,
  NBA_DRAFT_2026,
  nbaDraftOf,
  reorderRookieClass,
} from "./rookiePrior.js";
import { marketRanks } from "./market.js";

describe("rookie prior (D118)", () => {
  it("prices draft capital on the measured curve, and charges a late non-college pick", () => {
    expect(draftCapitalPercentile(1, true)).toBeCloseTo(0.936 * Math.exp(-1 / 43.8), 6);
    expect(draftCapitalPercentile(10, true)).toBeGreaterThan(draftCapitalPercentile(20, true));
    // Under #15 a non-college pick takes the measured -0.16; at #14 he does not.
    expect(draftCapitalPercentile(20, false)).toBeCloseTo(draftCapitalPercentile(20, true) - 0.16, 6);
    expect(draftCapitalPercentile(14, false)).toBe(draftCapitalPercentile(14, true));
  });
  it("is a permutation of the class's own ordinals", () => {
    const cls = NBA_DRAFT_2026.slice(0, 8).map(([id], i) => ({ playerId: id, rank: 100 - i * 7 }));
    const out = reorderRookieClass(cls);
    expect([...out.values()].sort((a, b) => a - b)).toEqual(cls.map((c) => c.rank).sort((a, b) => a - b));
  });
  it("moves a high NBA pick the market had low up within the class", () => {
    // A 20-player class in NBA-draft order, except Wagler (the NBA's #5) whom the market
    // ranks LAST of the twenty. Half the blend is draft capital, so he must rise.
    const wagler = "4881";
    expect(nbaDraftOf(wagler).pick).toBe(5);
    const others = NBA_DRAFT_2026.filter(([id]) => id !== wagler).slice(0, 19);
    const cls = [
      ...others.map(([id], i) => ({ playerId: id, rank: 20 + i * 5 })),
      { playerId: wagler, rank: 200 },
    ];
    const out = reorderRookieClass(cls);
    expect(out.get(wagler)).toBeLessThan(200);
  });
  it("only touches rookies the NBA draft table knows, and only in a live market", () => {
    const vets = Array.from({ length: 220 }, (_, i) => ({
      playerId: `v${i}`,
      searchRank: i + 1,
      dynastyAdp: i + 1,
      redraftAdp: i + 1,
      yearsExp: 5,
    }));
    const wagler = "4881";
    const rookies = NBA_DRAFT_2026.filter(([id]) => id !== wagler)
      .slice(0, 19)
      .map(([id], i) => ({ playerId: id, searchRank: 100 + i, dynastyAdp: 60 + i, redraftAdp: 100 + i, yearsExp: 0 }));
    rookies.push({ playerId: wagler, searchRank: 230, dynastyAdp: 200, redraftAdp: 230, yearsExp: 0 });
    const before = marketRanks([...vets, ...rookies], 0.45);
    const { ranks } = before;
    expect(ranks.get(wagler).rookiePrior).toBe(true);
    expect(ranks.get("v0").rookiePrior).toBeUndefined();
    // No market, no prior: fixture/CSV pricing is untouched.
    const none = marketRanks([...vets, ...rookies].map((p) => ({ ...p, dynastyAdp: null })));
    expect(none.active).toBe(false);
    expect(none.ranks.get(wagler).rookiePrior).toBeUndefined();
  });
});
