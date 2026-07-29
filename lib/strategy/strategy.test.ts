import { describe, expect, it } from "vitest";
import { annotation, buildFixtureHistory } from "../testing/fixtureHistory";
import { getStrategyReport } from "./index";

describe("revealed-vs-stated strategy engine", () => {
  it("detects the rebuild -> win-now contradiction from the fixture arc", () => {
    // Seed the SAME annotation the demo seed uses: 2022 rebuild statement.
    const ann = annotation(
      "fx-2022-rebuildA",
      "Full rebuild. Getting younger and stockpiling first-round picks. Not chasing wins for 2-3 years.",
      "rebuild",
    );
    const h = buildFixtureHistory(ann);
    const report = getStrategyReport(h);

    expect(report.contradictions.length).toBeGreaterThanOrEqual(1);
    const c = report.contradictions[0];
    expect(c.severity).toBe("high");
    expect(c.statedTransactionId).toBe("fx-2022-rebuildA");
    expect(c.revealedTransactionId).toBe("fx-2025-pivot");
    // The narrative should name the contradiction explicitly.
    expect(c.narrative.toLowerCase()).toContain("disagree");
    expect(report.headline).toMatch(/rebuild/i);
  });

  it("produces derived findings and a profile even without annotations", () => {
    const h = buildFixtureHistory();
    const report = getStrategyReport(h);
    expect(report.hasEnoughData).toBe(true);
    expect(report.profile.trades).toBeGreaterThan(0);
    expect(report.findings.length).toBeGreaterThan(0);
    // No stated postures -> no contradictions, but still a headline.
    expect(report.contradictions).toHaveLength(0);
    expect(report.headline.length).toBeGreaterThan(0);
  });

  it("tracks pick flow: you are a net first-round accumulator then spender", () => {
    const h = buildFixtureHistory();
    const report = getStrategyReport(h);
    // Rebuild acquired 2 firsts; pivot spent 2 firsts.
    expect(report.profile.picks.firstsAcquired).toBeGreaterThanOrEqual(2);
    expect(report.profile.picks.firstsSpent).toBeGreaterThanOrEqual(2);
  });

  it("computes an acquisition age trend across seasons", () => {
    const h = buildFixtureHistory();
    const report = getStrategyReport(h);
    expect(report.profile.acquisitions.ageBySeason.length).toBeGreaterThan(0);
    expect(report.profile.acquisitions.avgAge).not.toBeNull();
  });
});
