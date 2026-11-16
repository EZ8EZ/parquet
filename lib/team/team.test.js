import { describe, expect, it } from "vitest";
import { directionSummary } from "./index.js";

const dx = {
  direction: "contend",
  headline: "Your window is open.",
  directionNote: "Your value is dated to pay off now.",
  valueRank: 9,
  teams: 14,
};
const analysis = { coreAge: 28.8, coreAgeBand: "veteran core" };
const form = { wins: 1, losses: 2, rank: 9, teams: 14, season: "2026", isLive: true };

describe("directionSummary", () => {
  it("states the direction and the three inputs: record, value rank, core age", () => {
    const d = directionSummary({ dx, analysis, form });
    expect(d.label).toBe("Contend");
    expect(d.inputs.map((i) => [i.id, i.value, i.sub])).toEqual([
      ["record", "1-2", "9th of 14"],
      ["value", "9th", "of 14 by asset value"],
      ["age", "28.8", "veteran core"],
    ]);
  });

  it("says unknown rather than guessing when an input is missing", () => {
    const d = directionSummary({ dx, analysis: { coreAge: null }, form: null });
    expect(d.inputs.find((i) => i.id === "record").value).toBe("unknown");
    expect(d.inputs.find((i) => i.id === "age").value).toBe("unknown");
  });

  it("returns null with no diagnosis, so the page can omit the card", () => {
    expect(directionSummary({ dx: null, analysis, form })).toBe(null);
  });

  it("labels last season's final standings as such", () => {
    const d = directionSummary({ dx, analysis, form: { ...form, isLive: false, season: "2025" } });
    expect(d.inputs[0].sub).toBe("9th of 14, 2025 final");
  });
});
