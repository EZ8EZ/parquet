import { describe, expect, it } from "vitest";
import { gameFractionLeft, partialLine, projectFinal, usualMinutes } from "./ingame.js";

const SCORING = { pts: 0.5, reb: 1, ast: 1, stl: 2, blk: 2, to: -1 };

describe("partial line", () => {
  it("states points and minutes so far under league scoring", () => {
    expect(partialLine({ pts: 12, reb: 4, ast: 3, to: 1, sp: 1080 }, SCORING)).toEqual({ fpSoFar: 12, secondsSoFar: 1080, minutesSoFar: 18 });
    expect(partialLine(null, SCORING)).toEqual({ fpSoFar: 0, secondsSoFar: 0, minutesSoFar: 0 });
  });

  it("usual minutes average his last 10 played games before the date", () => {
    const log = Array.from({ length: 12 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, sp: i === 0 ? 0 : 1800, min: i < 2 ? 10 : 30, complete: true }));
    expect(usualMinutes(log, "2026-11-01")).toEqual({ minutes: 30, n: 10 });
    expect(usualMinutes([], "2026-11-01")).toEqual({ minutes: null, n: 0 });
  });

  it("reads share of the game left from listed periods, unknown when not live", () => {
    expect(gameFractionLeft({ status: "in_game", periods: 1 })).toBeCloseTo(0.875, 9);
    expect(gameFractionLeft({ status: "in_game", periods: 3 })).toBeCloseTo(0.375, 9);
    expect(gameFractionLeft({ status: "in_game", periods: 5 })).toBe(0);
    expect(gameFractionLeft({ status: "complete" })).toBe(0);
    expect(gameFractionLeft({ status: "pre_game" })).toBeNull();
    expect(gameFractionLeft({ status: "in_game", periods: null })).toBeNull();
  });
});

describe("projectFinal", () => {
  const base = { pregameMean: 30, pregameSd: 7, usualMinutes: 30, priorMinutes: Infinity };

  it("adds the pre-game per-minute rate over the minutes left", () => {
    const p = projectFinal({ ...base, fpSoFar: 10, secondsSoFar: 900, gameFractionLeft: 0.5 });
    expect(p.remainingMinutes).toBe(15);
    expect(p.mean).toBeCloseTo(25, 9);
    expect(p.p10).toBeLessThan(p.mean);
    expect(p.p90).toBeGreaterThan(p.mean);
  });

  it("narrows as the game runs out and equals the score at the end", () => {
    const early = projectFinal({ ...base, fpSoFar: 5, secondsSoFar: 400, gameFractionLeft: 0.8 });
    const late = projectFinal({ ...base, fpSoFar: 25, secondsSoFar: 1500, gameFractionLeft: 0.1 });
    expect(late.p90 - late.p10).toBeLessThan(early.p90 - early.p10);
    expect(projectFinal({ ...base, fpSoFar: 33, secondsSoFar: 1900, gameFractionLeft: 0 }).mean).toBe(33);
  });

  it("without a clock, uses usual minutes minus minutes so far", () => {
    expect(projectFinal({ ...base, fpSoFar: 10, secondsSoFar: 1200, gameFractionLeft: null }).remainingMinutes).toBe(10);
  });

  it("returns null without usual minutes or a forecast", () => {
    expect(projectFinal({ ...base, usualMinutes: null, fpSoFar: 1, secondsSoFar: 60 })).toBeNull();
    expect(projectFinal({ ...base, pregameMean: null, fpSoFar: 1, secondsSoFar: 60 })).toBeNull();
  });
});
