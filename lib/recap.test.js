import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "./testing/fixtureHistory.js";
import { loadSeasonRecap } from "./recap.js";
describe("loadSeasonRecap", () => {
  it("recaps the last COMPLETE season, not the in-progress current one", async () => {
    const h = buildFixtureHistory();
    const recap = await loadSeasonRecap(h);
    expect(recap).not.toBeNull();
    // The fixture's current season (2026) is "in_season", not "complete" - see
    // lib/providers/fixture/generate.ts - so 2025 is the last one this can recap.
    expect(recap.season).toBe("2025");
    expect(recap.isNewestSeason).toBe(false);
    expect(recap.currentSeasonNote).toContain("2026");
    expect(recap.currentSeasonNote).toContain("still being played");
  });
  it("resolves a real record for the viewer's own roster in that season", async () => {
    const h = buildFixtureHistory();
    const recap = await loadSeasonRecap(h);
    expect(recap.record.season).toBe("2025");
    expect(recap.record.teams).toBeGreaterThan(0);
    expect(recap.record.rank).toBeGreaterThanOrEqual(1);
    expect(recap.record.rank).toBeLessThanOrEqual(recap.record.teams);
  });
  it("scopes decisions and resolved picks to the recapped season only", async () => {
    const h = buildFixtureHistory();
    const recap = await loadSeasonRecap(h);
    for (const d of recap.decisions) expect(d.season).toBe("2025");
    for (const p of recap.picksResolved) expect(p.season).toBe("2025");
  });
  it("returns null when the viewer has no resolvable roster", async () => {
    const h = buildFixtureHistory();
    const recap = await loadSeasonRecap({
      ...h,
      me: { ...h.me, rosterId: null },
    });
    expect(recap).toBeNull();
  });
  it("returns null when no season in the chain is complete", async () => {
    const h = buildFixtureHistory();
    const recap = await loadSeasonRecap({
      ...h,
      chain: h.chain.map((l) => ({ ...l, status: "in_season" })),
    });
    expect(recap).toBeNull();
  });
  it("flags a viewer who did not yet own the roster in the recapped season", async () => {
    const h = buildFixtureHistory();
    // The fixture's principal chain has real ownership; forcing a bogus current user
    // id proves the check actually looks something up rather than defaulting to true.
    const recap = await loadSeasonRecap({
      ...h,
      me: { ...h.me, userId: "not-a-real-owner-id" },
    });
    expect(recap.viewerWasOwner).toBe(false);
  });
});
