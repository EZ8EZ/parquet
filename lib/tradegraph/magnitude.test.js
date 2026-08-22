import { describe, expect, it } from "vitest";
import { dealMagnitudes, ticksLabel } from "./magnitude.js";

/**
 * The measurement's contract, pinned where it could silently drift into a verdict:
 * value moved is a SUM OVER BOTH SIDES (it cannot say who won), zero-priced deals
 * are unmeasured rather than "tiny", and a season's headline is its largest deal
 * by that sum - deterministically, so a re-render can never swap headlines.
 */

const trade = (id, season, created, adds) => ({
  type: "trade",
  transactionId: id,
  season,
  created,
  adds,
});

describe("dealMagnitudes", () => {
  it("sums BOTH directions of a deal - a measurement of weight, not of winners", () => {
    const price = (pid) => ({ a: 100, b: 40 })[pid] ?? 0;
    const { byId } = dealMagnitudes(
      [trade("t1", "2024", 1, { a: 1, b: 2 })],
      price,
    );
    expect(byId.get("t1").value).toBe(140);
  });

  it("skips non-trades entirely", () => {
    const { byId } = dealMagnitudes(
      [{ type: "waiver", transactionId: "w1", season: "2024", created: 1, adds: { a: 1 } }],
      () => 100,
    );
    expect(byId.size).toBe(0);
  });

  it("gives a deal the model cannot price NO ticks - unmeasured, never 'measured: tiny' (D19 posture)", () => {
    const price = (pid) => (pid === "a" ? 100 : 0);
    const { byId } = dealMagnitudes(
      [
        trade("priced", "2024", 1, { a: 1 }),
        trade("unpriced", "2024", 2, { z: 2 }),
      ],
      price,
    );
    expect(byId.get("unpriced")).toEqual({ value: 0, ticks: null });
    expect(byId.get("priced").ticks).not.toBeNull();
  });

  it("buckets by quartile of the PRICED deals: bottom quarter 1, middle half 2, top quarter 3", () => {
    // Eight priced deals, values 10..80: q1 (nearest-rank) = 20, q3 = 60, so the
    // outer buckets are exactly the outer quarters: {10,20} and {70,80}.
    const txs = Array.from({ length: 8 }, (_, i) =>
      trade(`t${i}`, "2024", i, { [`p${i}`]: 1 }),
    );
    const price = (pid) => (Number(pid.slice(1)) + 1) * 10;
    const { byId } = dealMagnitudes(txs, price);
    const ticks = Array.from({ length: 8 }, (_, i) => byId.get(`t${i}`).ticks);
    expect(ticks).toEqual([1, 1, 2, 2, 2, 2, 3, 3]);
  });

  it("zero-value deals do not drag the quartile thresholds down", () => {
    const txs = [
      ...Array.from({ length: 4 }, (_, i) =>
        trade(`z${i}`, "2024", i, { unpriced: 1 }),
      ),
      trade("small", "2024", 10, { s: 1 }),
      trade("mid1", "2024", 11, { m1: 1 }),
      trade("mid2", "2024", 12, { m2: 1 }),
      trade("big", "2024", 13, { b: 1 }),
    ];
    const price = (pid) => ({ s: 10, m1: 20, m2: 30, b: 40 })[pid] ?? 0;
    const { byId } = dealMagnitudes(txs, price);
    // With zeros excluded the four priced deals still spread 1/2/2/3; had the
    // zeros counted, q1 would be 0 and nothing could ever measure "bottom".
    expect(byId.get("small").ticks).toBe(1);
    expect(byId.get("mid1").ticks).toBe(2);
    expect(byId.get("mid2").ticks).toBe(2);
    expect(byId.get("big").ticks).toBe(3);
  });

  it("headlines each season with its largest deal by value moved, and only seasons that measured at all", () => {
    const txs = [
      trade("s24-small", "2024", 1, { a: 1 }),
      trade("s24-big", "2024", 2, { b: 1 }),
      trade("s25-only", "2025", 3, { a: 1 }),
      trade("s26-unpriced", "2026", 4, { z: 1 }),
    ];
    const price = (pid) => ({ a: 50, b: 500 })[pid] ?? 0;
    const { headlineBySeason } = dealMagnitudes(txs, price);
    expect(headlineBySeason.get("2024")).toBe("s24-big");
    expect(headlineBySeason.get("2025")).toBe("s25-only");
    // A season of nothing the model can price has NO headline rather than an
    // arbitrary one.
    expect(headlineBySeason.has("2026")).toBe(false);
  });

  it("breaks a headline tie deterministically: earlier deal, then id", () => {
    const txs = [
      trade("later", "2024", 20, { a: 1 }),
      trade("earlier", "2024", 10, { a: 1 }),
    ];
    const { headlineBySeason } = dealMagnitudes(txs, () => 100);
    expect(headlineBySeason.get("2024")).toBe("earlier");
  });
});

describe("ticksLabel", () => {
  it("stays measurement language - quarters of the distribution, no verdict words", () => {
    for (const t of [1, 2, 3]) {
      const label = ticksLabel(t);
      expect(label).toMatch(/^value moved: /);
      expect(label).not.toMatch(/best|worst|win|blockbuster|big(?:gest)?/i);
    }
  });
});
