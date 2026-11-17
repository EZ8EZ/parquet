import { describe, expect, it } from "vitest";
import { availabilityOf, heldValueFor } from "./availability.js";
import { buildWeekDesk } from "./index.js";
import { FIXTURE_LEAGUE_ID, FIXTURE_NOW, fixtureFetchJson } from "./fixture.js";

describe("availability from the injury listing", () => {
  it("reads Sleeper's NBA listings: Out and IR rule him out, GTD and DTD are uncertain", () => {
    expect(availabilityOf("Out")).toMatchObject({ assumed: "listed_out", playsNext: false });
    expect(availabilityOf("IR")).toMatchObject({ assumed: "listed_out", playsNext: false });
    expect(availabilityOf("GTD")).toMatchObject({ assumed: "listed_uncertain", playsNext: null });
    expect(availabilityOf("DTD")).toMatchObject({ assumed: "listed_uncertain", playsNext: null });
    expect(availabilityOf("Doubtful").assumed).toBe("listed_uncertain");
    expect(availabilityOf(null)).toMatchObject({ assumed: "not_listed_out", playsNext: true });
  });

  it("weights both branches by the listed play rate for an uncertain listing", () => {
    const av = availabilityOf("GTD", { value: 0.6, n: 20 });
    expect(av.rate).toEqual({ value: 0.6, n: 20 });
    expect(heldValueFor(30, 10, av)).toBeCloseTo(0.6 * 30 + 0.4 * 10, 9);
    expect(heldValueFor(30, 10, availabilityOf("Out"))).toBe(10);
    expect(heldValueFor(30, 10, availabilityOf(null))).toBe(30);
  });

  it("without a measured rate an uncertain listing keeps the plays branch and says so", () => {
    const av = availabilityOf("DTD", { value: null, n: 0 });
    expect(av.rate).toBeNull();
    expect(heldValueFor(30, 10, av)).toBe(30);
  });

  it("marks the fixture's Doubtful holder as listed uncertain, not as if healthy", async () => {
    const desk = await buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, now: FIXTURE_NOW, fetchJson: fixtureFetchJson });
    const s = desk.cards.find((c) => c.playerId === "lk06").stopping;
    expect(s.availabilityAssumed).toBe("listed_uncertain");
    expect(s.expectedIfHeldOut).toBeLessThanOrEqual(s.expectedIfHeldPlays);
  });
});
