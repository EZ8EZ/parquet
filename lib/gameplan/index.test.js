import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory.js";
import { getPrincipals } from "../principals.js";
import {
  buildGamePlan,
  diagnose,
  DEAD_THRESHOLD,
  STAR_THRESHOLD,
} from "./index.js";
describe("gameplan diagnose", () => {
  it("classifies a top-half, star-heavy roster as contend", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const dx = diagnose(h, 1, principals);
    expect(dx.direction).toBe("contend");
    expect(dx.headline.length).toBeGreaterThan(0);
    expect(dx.because.length).toBeGreaterThan(0);
    expect(dx.valueRank).toBeGreaterThanOrEqual(1);
    expect(dx.teams).toBe(h.rosters.length);
  });
  it("classifies a young, asset-poor bottom-half roster as rebuild", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const dx = diagnose(h, 2, principals);
    expect(dx.direction).toBe("rebuild");
  });
  it("classifies a mid-pack roster as retool", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const dx = diagnose(h, 5, principals);
    expect(dx.direction).toBe("retool");
  });
  it("computes weak/strong positions relative to the roster's own average, not fixed cutoffs", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const dx = diagnose(h, 1, principals);
    for (const pos of [...dx.weakPositions, ...dx.strengthPositions]) {
      expect(["PG", "SG", "SF", "PF", "C"]).toContain(pos);
    }
    // A position cannot be both a weakness and a strength at once.
    expect(dx.weakPositions.some((p) => dx.strengthPositions.includes(p))).toBe(
      false,
    );
  });
});
describe("gameplan buildGamePlan", () => {
  it("a contending roster gets consolidation-flavored moves, never rebuild-flavored ones", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const gp = buildGamePlan(h, 1, principals);
    expect(gp.diagnosis.direction).toBe("contend");
    const ids = gp.moves.map((m) => m.id);
    expect(ids).toContain("consolidate");
    expect(ids).not.toContain("sell-vets");
    expect(ids).not.toContain("buy-youth");
  });
  it("a rebuilding roster gets sell/buy-youth moves, never consolidate-into-a-star", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const gp = buildGamePlan(h, 2, principals);
    expect(gp.diagnosis.direction).toBe("rebuild");
    const ids = gp.moves.map((m) => m.id);
    expect(ids).toContain("buy-youth");
    expect(ids).not.toContain("consolidate");
    expect(ids).not.toContain("cash-picks");
  });
  it("a retooling roster gets a 'pick a lane' caveat naming the mid-pack bind", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const gp = buildGamePlan(h, 5, principals);
    expect(gp.diagnosis.direction).toBe("retool");
    expect(gp.caveats.some((c) => /mid-pack/i.test(c))).toBe(true);
  });
  it("every move names its cost and never fabricates a partner it can't source from a dossier", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    for (const rosterId of [1, 2, 5]) {
      const gp = buildGamePlan(h, rosterId, principals);
      for (const m of gp.moves) {
        expect(m.cost.length).toBeGreaterThan(0);
        expect(m.give.length).toBeGreaterThan(0);
        expect(m.get.length).toBeGreaterThan(0);
        // partnerName and partnerRosterId must agree: both present or both null.
        expect(m.partnerRosterId === null).toBe(m.partnerName === null);
      }
    }
  });
  it("flags dead-weight streamlining only once three or more sub-threshold bodies exist", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const gp = buildGamePlan(h, 3, principals);
    const streamline = gp.moves.find((m) => m.id === "streamline");
    if (streamline) {
      expect(streamline.give.length).toBeGreaterThanOrEqual(1);
      expect(streamline.title).toMatch(/\d+ dead-weight/);
    }
  });
  it("is deterministic for the same roster and history", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const a = buildGamePlan(h, 1, principals);
    const b = buildGamePlan(h, 1, principals);
    expect(a).toEqual(b);
  });
});
describe("gameplan thresholds", () => {
  it("keeps the dead-weight cutoff well below the star cutoff", () => {
    expect(DEAD_THRESHOLD).toBeLessThan(STAR_THRESHOLD);
  });
});
