import { describe, expect, it } from "vitest";
import type { Player } from "../providers/types";
import { computeTiers, tierResolver } from "./tiers";
import {
  applyRanks,
  blendSources,
  consensusSource,
  customSource,
  disagreements,
} from "./index";

function player(id: string, name: string, rank: number | null): Player {
  return {
    playerId: id,
    fullName: name,
    firstName: name.split(" ")[0],
    lastName: name.split(" ").slice(1).join(" "),
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
    searchRank: rank,
    espnId: null,
  };
}

describe("computeTiers", () => {
  it("cuts at the natural cliff, not at an arbitrary threshold", () => {
    // Two obvious groups with a chasm between them.
    const values = [9000, 8800, 8600, 500, 480, 460];
    const tiers = computeTiers(values, { tierCount: 2, minTierSize: 2 });
    expect(tiers).toHaveLength(2);
    expect(tiers[0].count).toBe(3);
    expect(tiers[0].minValue).toBe(8600);
    expect(tiers[1].maxValue).toBe(500);
  });

  it("covers every asset exactly once, with no gaps or overlaps", () => {
    const values = Array.from({ length: 60 }, (_, i) => 9000 - i * 130);
    const tiers = computeTiers(values, { tierCount: 8 });
    expect(tiers[0].startIndex).toBe(0);
    expect(tiers[tiers.length - 1].endIndex).toBe(values.length - 1);
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].startIndex).toBe(tiers[i - 1].endIndex + 1);
    }
    expect(tiers.reduce((s, t) => s + t.count, 0)).toBe(values.length);
  });

  it("respects the minimum tier size", () => {
    const values = Array.from({ length: 40 }, (_, i) => 9000 - i * 200);
    const tiers = computeTiers(values, { tierCount: 8, minTierSize: 3 });
    for (const t of tiers) expect(t.count).toBeGreaterThanOrEqual(3);
  });

  it("is monotonic: every tier ranks strictly below the one above", () => {
    const values = Array.from({ length: 50 }, (_, i) => 10000 - i * 175);
    const tiers = computeTiers(values, { tierCount: 6 });
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].maxValue).toBeLessThanOrEqual(tiers[i - 1].minValue);
    }
  });

  it("is deterministic across repeated calls", () => {
    const values = Array.from({ length: 45 }, (_, i) => 9500 - i * 143);
    expect(JSON.stringify(computeTiers(values))).toBe(
      JSON.stringify(computeTiers(values)),
    );
  });

  it("degrades safely on empty and tiny inputs", () => {
    expect(computeTiers([])).toEqual([]);
    expect(computeTiers([500])).toHaveLength(1);
    expect(computeTiers([500, 400], { tierCount: 8 })).toHaveLength(2);
  });

  it("floor bounds the cliff search; below-floor values resolve to the final tier", () => {
    // A genuine gap under the elite group, then a tail whose junk drops (60 -> 30,
    // 30 -> 12) would out-score it if the tail were allowed into the search.
    const values = [9000, 8800, 8600, 5000, 4800, 60, 30, 12, 5];
    const tiers = computeTiers(values, { tierCount: 2, minTierSize: 2, floor: 1000 });
    expect(tiers).toHaveLength(2);
    expect(tiers[0].count).toBe(3); // the break lands at the real cliff
    expect(tiers[1].minValue).toBe(4800);
    const resolve = tierResolver(tiers);
    expect(resolve(30)!.tier).toBe(2); // tail still resolves, into the last tier
  });

  it("falls back to the full population when the floor excludes everything", () => {
    const tiers = computeTiers([90, 80, 8, 6], { tierCount: 2, floor: 1000 });
    expect(tiers.reduce((s, t) => s + t.count, 0)).toBe(4);
  });

  it("resolves a value to its tier", () => {
    const values = [9000, 8800, 400, 380];
    const resolve = tierResolver(computeTiers(values, { tierCount: 2, minTierSize: 2 }));
    expect(resolve(9000)!.tier).toBe(1);
    expect(resolve(390)!.tier).toBe(2);
    // Below everything still resolves rather than returning null.
    expect(resolve(1)!.tier).toBe(2);
  });
});

describe("rank sources", () => {
  const players = [
    player("a", "Alpha", 1),
    player("b", "Bravo", 2),
    player("c", "Charlie", 3),
    player("d", "Delta", null),
  ];

  it("builds a consensus source, skipping unranked players", () => {
    const s = consensusSource(players);
    expect(s.ranks.get("a")).toBe(1);
    expect(s.ranks.has("d")).toBe(false);
  });

  it("builds a custom source from an ordered list", () => {
    const s = customSource(["c", "a"]);
    expect(s.ranks.get("c")).toBe(1);
    expect(s.ranks.get("a")).toBe(2);
    expect(s.ranks.has("b")).toBe(false);
  });

  it("blend at weight 0 is pure consensus", () => {
    const base = consensusSource(players);
    const blended = blendSources(base, customSource(["c"]), 0);
    expect(blended.ranks.get("c")).toBe(base.ranks.get("c"));
  });

  it("blend at weight 1 fully adopts your ranking where you have one", () => {
    const base = consensusSource(players);
    const blended = blendSources(base, customSource(["c"]), 1);
    expect(blended.ranks.get("c")).toBe(1);
    // Untouched elsewhere.
    expect(blended.ranks.get("b")).toBe(2);
  });

  it("blend at 0.5 splits the difference", () => {
    const base = consensusSource(players); // c = 3
    const blended = blendSources(base, customSource(["c"]), 0.5); // your c = 1
    expect(blended.ranks.get("c")).toBe(2);
  });

  it("never drops players the custom ranking omits", () => {
    const base = consensusSource(players);
    const blended = blendSources(base, customSource(["c"]), 1);
    expect(blended.ranks.size).toBe(base.ranks.size);
  });

  it("surfaces disagreements biggest-first with the right sign", () => {
    const base = consensusSource(players);
    const mine = customSource(["c", "b", "a"]); // I love Charlie, hate Alpha
    const d = disagreements(mine, base, new Map(players.map((p) => [p.playerId, p])));
    expect(d[0].playerId).toBe("c");
    expect(d[0].delta).toBeGreaterThan(0); // higher on Charlie than consensus
    const alpha = d.find((x) => x.playerId === "a")!;
    expect(alpha.delta).toBeLessThan(0); // lower on Alpha than consensus
  });

  it("applyRanks overrides searchRank without mutating the originals", () => {
    const applied = applyRanks(players, customSource(["c"]));
    expect(applied.find((p) => p.playerId === "c")!.searchRank).toBe(1);
    expect(players.find((p) => p.playerId === "c")!.searchRank).toBe(3);
  });
});
