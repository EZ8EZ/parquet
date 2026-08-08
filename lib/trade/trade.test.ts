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

/**
 * The pick-agency thesis. The evaluator has always priced a pick by the strength of
 * the team that owes it; these pin the sentence that says WHOSE SEASON decides it,
 * which is the read a dynasty manager makes before the price matters.
 */
describe("trade evaluator: whose season decides the picks", () => {
  const me = h.me.rosterId!;
  const other = h.rosters.find((r) => r.rosterId !== me)!.rosterId;

  it("says nothing at all when the deal moves no attributable pick", () => {
    const e = evaluateTrade(h, {
      give: { playerIds: [pid("Cam Thomas")], picks: [] },
      get: { playerIds: [pid("Khris Middleton")], picks: [] },
    });
    expect(e.agencyNotes).toEqual([]);
    // An unattributed pick has no original roster, so there is no season to name.
    const anon = evaluateTrade(h, {
      give: { playerIds: [], picks: [{ round: 1, season: "2028" }] },
      get: { playerIds: [pid("Khris Middleton")], picks: [] },
    });
    expect(anon.agencyNotes).toEqual([]);
  });

  it("names the manager whose season decides an incoming pick", () => {
    const e = evaluateTrade(h, {
      give: { playerIds: [pid("Cam Thomas")], picks: [] },
      get: {
        playerIds: [],
        picks: [{ round: 1, season: "2028", originalRosterId: other }],
      },
    });
    expect(e.agencyNotes).toHaveLength(1);
    expect(e.agencyNotes[0]).toMatch(/^Incoming:/);
    expect(e.agencyNotes[0]).toMatch(/they hold the outcome/i);
    expect(e.agencyNotes[0]).not.toMatch(/tank/i);
  });

  it("calls out a pick coming back to the roster that owns its season", () => {
    const e = evaluateTrade(h, {
      give: { playerIds: [pid("Cam Thomas")], picks: [] },
      get: {
        playerIds: [],
        picks: [{ round: 1, season: "2028", originalRosterId: me }],
      },
    });
    expect(e.agencyNotes[0]).toMatch(/brings your own 2028 1st back to you/i);
  });

  it("says what you give up by sending a pick your own season sets", () => {
    const e = evaluateTrade(h, {
      give: {
        playerIds: [],
        picks: [{ round: 1, season: "2028", originalRosterId: me }],
      },
      get: { playerIds: [pid("Khris Middleton")], picks: [] },
    });
    expect(e.agencyNotes).toHaveLength(1);
    expect(e.agencyNotes[0]).toMatch(/^Outgoing:/);
    expect(e.agencyNotes[0]).toMatch(/passenger on your results/i);
  });

  it("emits one note per pick and never an em dash", () => {
    const e = evaluateTrade(h, {
      give: {
        playerIds: [],
        picks: [{ round: 2, season: "2028", originalRosterId: me }],
      },
      get: {
        playerIds: [],
        picks: [
          { round: 1, season: "2028", originalRosterId: other },
          { round: 1, season: "2029", originalRosterId: me },
        ],
      },
    });
    expect(e.agencyNotes).toHaveLength(3);
    for (const n of e.agencyNotes) expect(n).not.toMatch(/[—–]/);
  });
});
