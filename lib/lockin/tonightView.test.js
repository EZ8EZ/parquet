import { describe, expect, it } from "vitest";
import { buildWeekDesk } from "./index.js";
import { FIXTURE_LEAGUE_ID, FIXTURE_NOW, fixtureFetchJson } from "./fixture.js";
import { countdownText, localDeadline, swapScale, tonightView } from "./tonightView.js";

const desk = await buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, fetchJson: fixtureFetchJson, now: FIXTURE_NOW });

/** A two-tip night: E (7:00) starts in C ahead of L (7:30), plus an explicit swap check at 8:00. */
function night(nowIso) {
  const at7 = "2026-11-17T00:00:00.000Z";
  const at730 = "2026-11-17T00:30:00.000Z";
  const at8 = "2026-11-17T01:00:00.000Z";
  return {
    generatedAt: nowIso,
    cards: [
      { playerId: "E", name: "Early Guy", team: "CLE", slotLabel: "C", injury: { status: "GTD" } },
      { playerId: "L", name: "Late Guy", team: "HOU", slotLabel: null, injury: null },
      { playerId: "B", name: "Bench Guy", team: "MIA", slotLabel: null, injury: { status: "Out" } },
      { playerId: "S", name: "Starter Guy", team: "BOS", slotLabel: "UTIL", injury: null },
    ],
    tonight: {
      date: "2026-11-16",
      status: "games",
      tipsKnown: true,
      tips: [
        { at: at7, atText: "7:00 PM ET", playerIds: ["E", "S"] },
        { at: at730, atText: "7:30 PM ET", playerIds: ["L"] },
        { at: at8, atText: "8:00 PM ET", playerIds: ["B"] },
      ],
      timeline: [
        { order: 1, kind: "start", at: at7, atText: "before 7:00 PM ET", listedStart: "7:00 PM ET", passed: false, playerId: "E", replacesPlayerId: "L", slotLabel: "C", inputs: { reason: "earlier_tip_first", threshold: 16 } },
        { order: 2, kind: "lineup_at_start", at: at7, atText: "before 7:00 PM ET", listedStart: "7:00 PM ET", passed: false, inputs: { gamesStarting: ["E", "S"] } },
        { order: 3, kind: "swap_check", at: at8, atText: "before 8:00 PM ET", listedStart: "8:00 PM ET", passed: false, playerId: "B", forPlayerId: "S", slotLabel: "UTIL", inputs: { threshold: 13.2, now: { projectedFinal: 11, thresholdNow: 12.5, below: true } } },
        { order: 4, kind: "after_game", at: null, atText: "after his game", passed: false, playerId: "E", inputs: { expectedIfHeld: 24.3, gamesAfter: 2, n: 77 } },
      ],
      players: [
        { playerId: "E", slotLabel: "C", tip: at7, tipText: "7:00 PM ET", status: "in_game", line: { fpSoFar: 9.5, minutesSoFar: 14, usualMinutes: 32, usualMinutesN: 10 } },
        { playerId: "L", slotLabel: null, tip: at730, tipText: "7:30 PM ET", status: "pre_game", line: null },
        { playerId: "B", slotLabel: null, tip: at8, tipText: "8:00 PM ET", status: "pre_game", line: null },
        { playerId: "S", slotLabel: "UTIL", tip: at7, tipText: "7:00 PM ET", status: "in_game", line: null },
      ],
      notes: ["MIA game moved"],
    },
  };
}

describe("tonightView", () => {
  it("orders decision points by listed start and derives the swap back at the later tip", () => {
    const v = tonightView(night("2026-11-16T23:50:00.000Z"));
    expect(v.nodes.map((n) => n.listedStart)).toEqual(["7:00 PM ET", "7:30 PM ET", "8:00 PM ET"]);
    expect(v.nodes[0].starting).toEqual(["E", "S"]);
    expect(v.nodes[0].actions[0]).toMatchObject({ kind: "start", playerId: "E", slotLabel: "C", threshold: 16, laterTip: "7:30 PM ET" });
    expect(v.nodes[1].actions[0]).toMatchObject({ kind: "swap", earlyId: "E", laterId: "L", slotLabel: "C", threshold: 16, below: null });
    expect(v.nodes[2].actions[0]).toMatchObject({ kind: "swap", earlyId: "S", laterId: "B", below: true, belowInputs: { projectedFinal: 11, threshold: 12.5 } });
    expect(v.afterGames).toEqual([{ playerId: "E", expectedIfHeld: 24.3, gamesAfter: 2, n: 77 }]);
    expect(v.notes).toEqual(["MIA game moved"]);
  });

  it("counts only slotted players as starters, and drops a start with only a bench player in it", () => {
    const d = night("2026-11-16T23:50:00.000Z");
    const at9 = "2026-11-17T02:00:00.000Z";
    d.cards.push({ playerId: "X", name: "Benched Guy", team: "NYK", slotLabel: null, injury: { status: "Out" } });
    d.tonight.tips.push({ at: at9, atText: "9:00 PM ET", playerIds: ["X"] });
    d.tonight.timeline[1].inputs.slots = [
      { slotLabel: "C", playerId: "E", inForThisStart: true },
      { slotLabel: "UTIL", playerId: "Q", inForThisStart: false },
    ];
    d.tonight.timeline.push({ order: 5, kind: "lineup_at_start", at: at9, atText: "before 9:00 PM ET", listedStart: "9:00 PM ET", passed: false, inputs: { gamesStarting: ["X"], slots: [{ slotLabel: "C", playerId: "E", inForThisStart: false }] } });
    const v = tonightView(d);
    expect(v.nodes[0].starting).toEqual(["E"]);
    expect(v.nodes.map((n) => n.listedStart)).toEqual(["7:00 PM ET", "7:30 PM ET", "8:00 PM ET"]);
  });

  it("collapses passed points and makes the first open one the next", () => {
    const before = tonightView(night("2026-11-16T23:50:00.000Z"));
    expect(before.next.listedStart).toBe("7:00 PM ET");
    expect(before.passed).toHaveLength(0);
    expect(before.toDecide).toBe(3);
    const mid = tonightView(night("2026-11-17T00:10:00.000Z"));
    expect(mid.passed.map((n) => n.listedStart)).toEqual(["7:00 PM ET"]);
    expect(mid.next.listedStart).toBe("7:30 PM ET");
    expect(mid.later.map((n) => n.listedStart)).toEqual(["8:00 PM ET"]);
    expect(mid.toDecide).toBe(2);
    const done = tonightView(night("2026-11-17T01:00:00.000Z"));
    expect(done.next).toBeNull();
    expect(done.toDecide).toBe(0);
  });

  it("carries the listing: Out, and GTD as uncertain", () => {
    const v = tonightView(night("2026-11-16T23:50:00.000Z"));
    expect(v.players.E.listing).toEqual({ status: "GTD", assumed: "listed_uncertain" });
    expect(v.players.B.listing).toEqual({ status: "Out", assumed: "listed_out" });
    expect(v.players.L.listing).toBeNull();
    expect(v.players.E.line).toMatchObject({ fpSoFar: 9.5, minutesSoFar: 14, usualMinutes: 32 });
  });

  it("works on the engine fixture and says when there are no games", () => {
    const v = tonightView(desk);
    expect(v.status).toBe("games");
    expect(v.nodes.length).toBeGreaterThan(0);
    expect(v.nodes.every((n, i) => i === 0 || (v.nodes[i - 1].atMs ?? 0) <= (n.atMs ?? Infinity))).toBe(true);
    const none = tonightView({ ...desk, tonight: { ...desk.tonight, status: "no_games", timeline: [], tips: [] } });
    expect(none.status).toBe("no_games");
    expect(none.nextDay?.day).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
    expect(tonightView({ ...desk, tonight: undefined })).toBeNull();
  });
});

describe("deadline and countdown formatting", () => {
  it("formats a listed start in the viewer's zone, always as 'before'", () => {
    expect(localDeadline("2026-11-17T00:30:00.000Z", "America/New_York")).toBe("before 7:30 PM EST");
    expect(localDeadline("2026-11-17T00:30:00.000Z", "America/Los_Angeles")).toBe("before 4:30 PM PST");
    expect(localDeadline(null)).toBeNull();
  });
  it("counts down to the minute and stops at the deadline", () => {
    const d = Date.parse("2026-11-17T00:30:00.000Z");
    expect(countdownText(d, d - 65 * 60_000)).toBe("1 h 05 min");
    expect(countdownText(d, d - 12 * 60_000)).toBe("12 min");
    expect(countdownText(d, d - (4 * 60 + 10) * 1000)).toBe("4 min 10 s");
    expect(countdownText(d, d - 45_000)).toBe("45 s");
    expect(countdownText(d, d)).toBeNull();
    expect(countdownText(d, d + 1)).toBeNull();
  });
  it("puts the threshold and the points so far on one scale", () => {
    expect(swapScale(16, { fpSoFar: 8 })).toEqual({ max: 24, thresholdPct: 66.7, pointsPct: 33.3 });
    expect(swapScale(16, null).pointsPct).toBeNull();
    expect(swapScale(5, { fpSoFar: 30 }).pointsPct).toBeCloseTo(87, 0);
  });
});
