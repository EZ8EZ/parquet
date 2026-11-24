import { describe, expect, it } from "vitest";
import { boomBustProfile } from "./profile.js";

const mdl = (mean) => ({ dist: { mean, sample: [mean - 5, mean, mean + 5], basis: "own" } });
const log = (fps) => fps.map((fp, i) => ({ date: `2026-10-${String(1 + i).padStart(2, "0")}`, fp, sp: 1800, min: 30, complete: true }));

describe("boom/bust thresholds agree with their comparison", () => {
  it("has no bust line when the mean is within 1.5 x 7.0 of zero (QA: 'Bust under 0.0')", () => {
    const p = boomBustProfile(mdl(8.6), log([0, 2, 8, 12, 20]), "2026-11-01");
    expect(p.bustThreshold).toBeNull();
    expect(p.bustRate).toBeNull();
  });
  it("counts a bust strictly under the shown threshold and a boom at or above it", () => {
    // mean 20: bust under 9.5, boom 30.5+
    const p = boomBustProfile(mdl(20), log([9.5, 9.4, 30.5, 30.4, 20]), "2026-11-01");
    expect(p).toMatchObject({ bustThreshold: 9.5, boomThreshold: 30.5, bustRate: 0.2, boomRate: 0.2, n: 5 });
  });
});
