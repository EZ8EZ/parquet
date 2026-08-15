import { describe, expect, it } from "vitest";
import { fragilityIsAlarming, fragilityTone } from "./bands";
const BANDS = ["resilient", "balanced", "brittle"];
const POSTURES = ["contending", "ascending", "rebuilding", "straddling"];
describe("posture-conditioned fragility flag", () => {
  it("flags brittle only for a roster playing for this season", () => {
    expect(fragilityIsAlarming("brittle", "contending")).toBe(true);
    expect(fragilityIsAlarming("brittle", "ascending")).toBe(true);
    expect(fragilityIsAlarming("brittle", "rebuilding")).toBe(false);
    expect(fragilityIsAlarming("brittle", "straddling")).toBe(false);
  });
  /**
   * The D23 misreading, pinned. A torn-down roster scores low BECAUSE it has nothing
   * left to lose, so brittleness on it is a description of a teardown rather than a
   * problem to fix, and nothing in the UI may say otherwise.
   */
  it("never alarms a rebuild, at any band", () => {
    for (const band of BANDS) {
      expect(fragilityIsAlarming(band, "rebuilding")).toBe(false);
    }
  });
  it("never alarms a band that is not brittle", () => {
    for (const posture of POSTURES) {
      expect(fragilityIsAlarming("resilient", posture)).toBe(false);
      expect(fragilityIsAlarming("balanced", posture)).toBe(false);
    }
  });
  it("does not alarm when the posture is unknown", () => {
    expect(fragilityIsAlarming("brittle", null)).toBe(false);
    expect(fragilityIsAlarming("brittle", undefined)).toBe(false);
  });
});
describe("fragilityTone", () => {
  it("is negative exactly where the flag is alarming", () => {
    for (const band of BANDS) {
      for (const posture of POSTURES) {
        expect(fragilityTone(band, posture)).toBe(
          fragilityIsAlarming(band, posture) ? "negative" : "neutral",
        );
      }
    }
  });
  /**
   * Low fragility is not the same as good (D23), so no combination may render green.
   * A positive chip is the shortest way of telling a reader that a stripped roster is
   * in good shape.
   */
  it("never returns a positive tone for any band or posture", () => {
    for (const band of BANDS) {
      for (const posture of [...POSTURES, null, undefined]) {
        expect(fragilityTone(band, posture)).not.toBe("positive");
      }
    }
  });
});
