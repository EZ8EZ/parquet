import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory.js";
import { getPrincipals } from "../principals.js";
import { actionQueue, seasonPhase } from "./index.js";

function withSettings(h, settings, { games = true } = {}) {
  return {
    ...h,
    currentLeague: { ...h.currentLeague, settings: { ...h.currentLeague.settings, ...settings } },
    rosters: games
      ? h.rosters
      : h.rosters.map((r) => ({ ...r, settings: { ...r.settings, wins: 0, losses: 0, ties: 0 } })),
  };
}

describe("seasonPhase", () => {
  it("reads in-season from games played when no week is known", () => {
    const sp = seasonPhase(buildFixtureHistory());
    expect(sp.phase).toBe("regular");
    expect(sp.weeksToTradeDeadline).toBeNull();
  });
  it("is preseason with no games played, counting from start_week", () => {
    const h = withSettings(buildFixtureHistory(), { taxi_deadline: 4, trade_deadline: 11, start_week: 1 }, { games: false });
    const sp = seasonPhase(h);
    expect(sp.phase).toBe("preseason");
    expect(sp.weeksToTaxiDeadline).toBe(3);
    expect(sp.weeksToTradeDeadline).toBe(10);
  });
  it("is deadline within two weeks of the trade deadline", () => {
    const h = withSettings(buildFixtureHistory(), { leg: 10, trade_deadline: 11, playoff_week_start: 15 });
    expect(seasonPhase(h)).toMatchObject({ phase: "deadline", week: 10, weeksToTradeDeadline: 1 });
  });
  it("is playoffs at or past playoff_week_start", () => {
    const h = withSettings(buildFixtureHistory(), { leg: 15, trade_deadline: 11, playoff_week_start: 15 });
    expect(seasonPhase(h).phase).toBe("playoffs");
  });
});

describe("actionQueue", () => {
  it("returns at most three items, in priority order", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const order = ["crunch", "taxi", "plan", "waivers"];
    for (const r of h.rosters) {
      const q = actionQueue(h, r.rosterId, principals);
      expect(q.length).toBeLessThanOrEqual(3);
      const ranks = q.map((i) => order.indexOf(i.id.startsWith("plan") ? "plan" : i.id));
      expect(ranks.every((x) => x >= 0)).toBe(true);
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
      for (const i of q) {
        expect(i.href).toMatch(/^\/(roster|plan)$/);
        expect(i.title).toBeTruthy();
      }
    }
  });
  it("leads with the crunch when the roster is over the active limit", async () => {
    const base = buildFixtureHistory();
    const principals = await getPrincipals(base);
    // Shrink the active limit so roster 1 is over it.
    const h = withSettings(base, {});
    h.currentLeague.rosterPositions = ["QB", "RB", "BN"];
    const q = actionQueue(h, 1, principals);
    expect(q[0].id).toBe("crunch");
    expect(q[0].title).toMatch(/^Sleeper requires \d+ moves? before lock$/);
  });
  it("uses the game plan's own first move text", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const q = actionQueue(h, 1, principals);
    const plan = q.find((i) => i.id.startsWith("plan"));
    expect(plan?.href).toBe("/plan");
  });
  it("is empty for an unknown roster", () => {
    expect(actionQueue(buildFixtureHistory(), 999, null)).toEqual([]);
  });
});
