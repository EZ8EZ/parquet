import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import { evaluateTrade } from "./index";

const h = buildFixtureHistory();
const pid = (name: string) => {
  for (const [id, p] of h.players) if (p.fullName === name) return id;
  throw new Error(`no player ${name}`);
};

describe("trade evaluator", () => {
  it("values both sides and returns a thesis, not a grade", () => {
    const e = evaluateTrade(h, {
      give: { playerIds: [pid("Cam Thomas")], picks: [{ round: 1, season: "2028" }] },
      get: { playerIds: [pid("Khris Middleton")], picks: [] },
    });
    expect(e.give.total).toBeGreaterThan(0);
    expect(e.get.total).toBeGreaterThan(0);
    // Thesis fields exist and are non-empty — no letter grade anywhere.
    expect(e.yourBet.length).toBeGreaterThan(0);
    expect(e.theirBet.length).toBeGreaterThan(0);
    expect(e.keyAssumption.length).toBeGreaterThan(0);
    expect(e.historyCheck.length).toBeGreaterThan(0);
    expect(e).not.toHaveProperty("grade");
    expect(e.copyable).toContain("SEND");
  });

  it("classifies acquiring an aging star for a pick as buying (win-now)", () => {
    const e = evaluateTrade(h, {
      give: { playerIds: [pid("Cam Thomas")], picks: [{ round: 1, season: "2028" }] },
      get: { playerIds: [pid("Khris Middleton")], picks: [] },
    });
    expect(e.direction).toBe("buying");
    expect(e.yourBet.toLowerCase()).toContain("window");
  });

  it("present-values a future pick below a player of similar nominal value", () => {
    const e = evaluateTrade(h, {
      give: { playerIds: [], picks: [{ round: 1, season: "2030" }] },
      get: { playerIds: [], picks: [{ round: 1, season: "2027" }] },
    });
    // Receiving the nearer pick for the farther pick is value-positive.
    expect(e.delta).toBeGreaterThan(0);
  });
});
