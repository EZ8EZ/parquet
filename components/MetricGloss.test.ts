import { describe, expect, it } from "vitest";
import { METRIC_GLOSS, METRIC_GLOSS_NOTE } from "./MetricGloss";

/**
 * The gloss copy is behavior, not decoration: it is the one in-context place a
 * first-time reader learns what the two indexes claim, so the honesty caveats are
 * pinned mechanically the way the streak panel pins its award-language ban. A
 * future edit that shortens the copy into praise fails here, not in production.
 */
describe("metric gloss copy", () => {
  const allCopy = [
    ...Object.values(METRIC_GLOSS).flatMap((g) => [g.name, g.scale, g.body]),
    METRIC_GLOSS_NOTE,
  ].join("\n");

  it("carries no dash of either width in any encoding (house rule)", () => {
    for (const bad of ["—", "–", "&mdash;", "&ndash;"]) {
      expect(allCopy).not.toContain(bad);
    }
  });

  it("TCI names its refusal: direction-free, not a judgment of the plan", () => {
    expect(METRIC_GLOSS.tci.body).toContain("direction-free");
    expect(METRIC_GLOSS.tci.body.toLowerCase()).toContain(
      "not whether the plan is good",
    );
  });

  it("RFI names its refusal: low is not good, and picks are excluded", () => {
    expect(METRIC_GLOSS.rfi.body.toLowerCase()).toContain(
      "low is not the same as good",
    );
    expect(METRIC_GLOSS.rfi.body).toContain("Picks are excluded");
    expect(METRIC_GLOSS.rfi.scale).toContain("higher is more fragile");
  });

  it("neither body grades anything - no letter-grade or verdict language", () => {
    // D6 is a copy decision as much as a product one; the gloss must not
    // reintroduce the vocabulary the app refuses elsewhere.
    expect(allCopy.toLowerCase()).not.toMatch(/\bgrade[sd]?\b|\brating\b/);
  });

  it("keeps the indexes absolute and only their labels league-relative", () => {
    // The note used to claim both indexes were measured against the league's own
    // spread. duration.ts is explicit that TCI is absolute in construction (a
    // roster scores the same in any league), and it already records one earlier
    // comment making this same mistake. Pin the true version so the false one
    // cannot come back as a copy edit.
    expect(METRIC_GLOSS_NOTE).toContain("a roster's own assets");
    expect(METRIC_GLOSS_NOTE).toContain("league-relative");
    expect(METRIC_GLOSS_NOTE).toContain("tonight");
    expect(METRIC_GLOSS_NOTE.toLowerCase()).not.toContain(
      "measured against this league",
    );
  });
});
