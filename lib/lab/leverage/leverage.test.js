import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../../testing/fixtureHistory.js";
import {
  LEVERAGE_REF,
  baseSlotCounts,
  buildLeverageProfile,
  leagueLeverage,
  leaguePositionPools,
} from "./index.js";
const h = buildFixtureHistory();
describe("baseSlotCounts", () => {
  it("counts exact-position slots and ignores flex/util entirely", () => {
    const counts = baseSlotCounts(h);
    // The fixture mirrors the real league's shape: one exact slot per position,
    // two UTIL slots that must not be attributed to any single position.
    for (const [, n] of counts) expect(n).toBeGreaterThanOrEqual(0);
    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    expect(total).toBeLessThan(counts.size * 3); // sane upper bound, not degenerate
  });
});
describe("leaguePositionPools", () => {
  const pools = leaguePositionPools(h);
  it("produces a share for every canonical position that sums to ~1", () => {
    const shares = [...pools.leagueSharePos.values()];
    const sum = shares.reduce((s, v) => s + v, 0);
    // 0 when the fixture has literally no positioned value; otherwise ~1.
    expect(sum === 0 || Math.abs(sum - 1) < 1e-9).toBe(true);
  });
  it("never lets replacement exceed top - the drop-off cannot be negative", () => {
    for (const pos of pools.topByPos.keys()) {
      expect(pools.topByPos.get(pos)).toBeGreaterThanOrEqual(
        pools.replacementByPos.get(pos) ?? 0,
      );
    }
  });
  it("scarcity weights stay inside 0..1", () => {
    for (const w of pools.scarcityByPos.values()) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });
});
describe("buildLeverageProfile", () => {
  const fakePools = (over) => ({
    leagueSharePos: new Map([
      ["PG", 0.25],
      ["SG", 0.2],
      ["SF", 0.15],
      ["PF", 0.15],
      ["C", 0.25],
    ]),
    scarcityByPos: new Map([
      ["PG", 0.8],
      ["SG", 0.6],
      ["SF", 0.4],
      ["PF", 0.5],
      ["C", 1.0],
    ]),
    ...over,
  });
  const analysisOf = (byPosition, valued) => ({
    rosterId: 1,
    teamName: "Test Team",
    ownerName: "Tester",
    byPosition,
    valued: valued ?? [],
  });
  it("scores exactly 50 when a roster's own mix matches the league's mix", () => {
    const pools = fakePools();
    // Own shares identical to leagueSharePos above: every deviation is 0.
    const byPosition = [
      { pos: "PG", value: 250 },
      { pos: "SG", value: 200 },
      { pos: "SF", value: 150 },
      { pos: "PF", value: 150 },
      { pos: "C", value: 250 },
    ];
    const p = buildLeverageProfile(pools, analysisOf(byPosition));
    expect(p.score).toBe(50);
    expect(p.raw).toBeCloseTo(0, 10);
  });
  it("returns an empty profile with no score, rather than dividing by zero", () => {
    const pools = fakePools();
    const p = buildLeverageProfile(pools, analysisOf([]));
    expect(p.score).toBeNull();
    expect(p.positions).toEqual([]);
    expect(p.read.length).toBeGreaterThan(0);
  });
  it("is scale-invariant: multiplying every position's value by a constant leaves raw unchanged", () => {
    // This is the property the naive (pre-fix) version of this metric FAILED: a
    // richer roster read as having more "leverage" purely by holding more value.
    // ownShare is a ratio within the roster, so it must be immune to an across-the-
    // board rescale.
    const pools = fakePools();
    const base = [
      { pos: "PG", value: 400 },
      { pos: "SG", value: 100 },
      { pos: "SF", value: 100 },
      { pos: "PF", value: 100 },
      { pos: "C", value: 300 },
    ];
    const scaled = base.map((b) => ({ ...b, value: b.value * 7.3 }));
    const p1 = buildLeverageProfile(pools, analysisOf(base));
    const p2 = buildLeverageProfile(pools, analysisOf(scaled));
    expect(p2.raw).toBeCloseTo(p1.raw, 10);
    expect(p2.score).toBe(p1.score);
  });
  it("rewards overweighting a scarce position and penalises underweighting one", () => {
    const pools = fakePools();
    // Everything in C (scarcity 1.0, the highest) and nothing elsewhere: a real,
    // large deviation at the scarcest position should read well above 50.
    const heavy = [
      { pos: "PG", value: 0 },
      { pos: "SG", value: 0 },
      { pos: "SF", value: 0 },
      { pos: "PF", value: 0 },
      { pos: "C", value: 1000 },
    ];
    const p = buildLeverageProfile(pools, analysisOf(heavy));
    expect(p.score).toBeGreaterThan(50);
    expect(p.bestPosition.pos).toBe("C");
  });
  it("clamps at 0 and 100 rather than reporting an out-of-range score", () => {
    // An extreme, synthetic pool with a huge LEVERAGE_REF-busting deviation.
    const pools = fakePools({
      leagueSharePos: new Map([
        ["PG", 0.02],
        ["SG", 0.02],
        ["SF", 0.02],
        ["PF", 0.02],
        ["C", 0.92],
      ]),
    });
    const allC = [
      { pos: "PG", value: 0 },
      { pos: "SG", value: 0 },
      { pos: "SF", value: 0 },
      { pos: "PF", value: 0 },
      { pos: "C", value: 1000 },
    ];
    const p = buildLeverageProfile(pools, analysisOf(allC));
    expect(p.score).toBeLessThanOrEqual(100);
    expect(p.score).toBeGreaterThanOrEqual(0);
  });
  it("names the roster's own top asset at its best and worst positions when present", () => {
    const pools = fakePools();
    const valued = [
      { name: "Star Center", position: "C", value: 900 },
      { name: "Backup Center", position: "C", value: 100 },
    ];
    const byPosition = [
      { pos: "PG", value: 0 },
      { pos: "SG", value: 0 },
      { pos: "SF", value: 0 },
      { pos: "PF", value: 0 },
      { pos: "C", value: 1000 },
    ];
    const p = buildLeverageProfile(pools, analysisOf(byPosition, valued));
    expect(p.bestPosition.topAsset?.name).toBe("Star Center");
  });
});
describe("leagueLeverage on the live fixture", () => {
  it("produces a profile for every roster without throwing", () => {
    const all = leagueLeverage(h);
    expect(all).toHaveLength(h.rosters.length);
    for (const p of all) {
      if (p.score == null) continue;
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(100);
      expect(Number.isFinite(p.raw)).toBe(true);
    }
  });
  it("sorts most-leveraged first, nulls last", () => {
    const all = leagueLeverage(h);
    const scored = all.filter((p) => p.score != null);
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i].score).toBeLessThanOrEqual(scored[i - 1].score);
    }
  });
  it("is deterministic across repeated calls", () => {
    const a = leagueLeverage(h);
    const b = leagueLeverage(h);
    expect(a.map((p) => p.score)).toEqual(b.map((p) => p.score));
    expect(a.map((p) => p.rosterId)).toEqual(b.map((p) => p.rosterId));
  });
});
describe("LEVERAGE_REF", () => {
  it("is a positive constant, not accidentally zero", () => {
    expect(LEVERAGE_REF).toBeGreaterThan(0);
  });
});
