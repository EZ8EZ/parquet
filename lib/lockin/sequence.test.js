import { describe, expect, it } from "vitest";
import { buildTonight, expMaxNormal, expMaxSample, shareLeftAt, swapAnalysis } from "./sequence.js";
import { playerModel } from "./model.js";

const H = 3600_000;
const T0 = Date.parse("2026-11-17T00:00:00Z");
const mkLog = (mean, n = 30) =>
  Array.from({ length: n }, (_, i) => ({ date: `2026-10-${String(1 + i).padStart(2, "0")}`, fp: mean + ((i % 5) - 2) * 3, sp: 1800, min: 30, complete: true }));
const LOGS = { early: mkLog(20), late: mkLog(30), star: mkLog(45), idle: mkLog(25), volatile: mkLog(27).map((g, i) => ({ ...g, fp: 27 + ((i % 5) - 2) * 9 })) };
const modelAt = (id, date) => playerModel(LOGS[id], date);
const today = "2026-11-16";
function player(id, { slot = null, label = null, tip = null, positions = ["PG"], status = "pre_game", row = null, after = [], holding = null } = {}) {
  return {
    id,
    name: id,
    positions,
    slotIndex: slot,
    slotLabel: label,
    lockState: holding != null ? "unknown_until_next_tip" : null,
    holding,
    game: tip == null && status === "none" ? null : { gameId: `g-${id}`, date: today, status, tipMs: tip, tipSource: "sleeper_scores", row, scheduleGame: status === "in_game" ? { status: "in_game", periods: 2 } : { status } },
    gamesAfter: after.map((date) => ({ date })),
    log: LOGS[id],
    model: modelAt(id, today),
    injuryOut: false,
  };
}

describe("expected-max helpers", () => {
  it("E[max(Y,c)] is at least both c and the mean, and equals max when there is no spread", () => {
    expect(expMaxNormal(20, 0, 25)).toBe(25);
    expect(expMaxNormal(20, 5, 10)).toBeGreaterThanOrEqual(20);
    expect(expMaxNormal(20, 5, 25)).toBeGreaterThan(25);
    expect(expMaxSample([10, 20, 30], 15)).toBeCloseTo((15 + 20 + 30) / 3, 9);
  });

  it("share of the early game left falls with the gap between tips and is 0 once final", () => {
    expect(shareLeftAt(T0, T0)).toBe(1);
    expect(shareLeftAt(T0, T0 + H)).toBeLessThan(1);
    expect(shareLeftAt(T0, T0 + 2.5 * H)).toBe(0);
    expect(shareLeftAt(null, T0)).toBeNull();
  });
});

describe("swapAnalysis", () => {
  const late = { sample: playerModel(LOGS.late, today).dist.sample };

  it("on a final score the threshold is the value of swapping, E[max(Z, C)]", () => {
    const a = swapAnalysis({ early: { mean: 20, sd: 6 }, late, C: 10, shareLeft: 0 });
    expect(a.threshold).toBeCloseTo(a.swapValue, 3);
  });

  it("a stronger later player raises the threshold; a better slot future raises it too", () => {
    const weak = swapAnalysis({ early: { mean: 20, sd: 6 }, late: { sample: playerModel(LOGS.early, today).dist.sample }, C: 5, shareLeft: 0 });
    const strong = swapAnalysis({ early: { mean: 20, sd: 6 }, late, C: 5, shareLeft: 0 });
    expect(strong.threshold).toBeGreaterThan(weak.threshold);
    expect(swapAnalysis({ early: { mean: 20, sd: 6 }, late, C: 25, shareLeft: 0 }).threshold).toBeGreaterThan(strong.threshold);
  });

  it("information has value: putting the early player in first is never worth less than choosing now", () => {
    for (const f of [0, 0.3, 0.6, 1]) {
      const a = swapAnalysis({ early: { mean: 22, sd: 7 }, late, C: 8, shareLeft: f });
      expect(a.planValue).toBeGreaterThanOrEqual(Math.max(a.keepValue, a.swapValue) - 1e-9);
    }
    const none = swapAnalysis({ early: { mean: 22, sd: 7 }, late, C: 8, shareLeft: 1 });
    expect(none.valueOfInformation).toBeCloseTo(0, 6);
    const full = swapAnalysis({ early: { mean: 22, sd: 7 }, late, C: 8, shareLeft: 0 });
    expect(full.valueOfInformation).toBeGreaterThan(0);
  });
});

describe("buildTonight", () => {
  const slots = [
    { index: 0, label: "PG", playerId: "early", locked: false },
    { index: 1, label: "SG", playerId: "idle", locked: false },
  ];

  it("orders decision points by tip and gives a later bench player a swap threshold on the earlier starter", () => {
    const t = buildTonight({
      today,
      nowMs: T0 - H,
      players: [
        player("early", { slot: 0, label: "PG", tip: T0, after: ["2026-11-18"] }),
        player("late", { tip: T0 + 3 * H, after: ["2026-11-19"] }),
        player("idle", { slot: 1, label: "SG", status: "none", positions: ["SG"], after: ["2026-11-18"] }),
      ],
      slots,
      modelAt,
    });
    expect(t.status).toBe("games");
    expect(t.tips.map((x) => x.playerIds)).toEqual([["early"], ["late"]]);
    const swap = t.timeline.find((x) => x.kind === "swap_check");
    expect(swap).toMatchObject({ playerId: "late", forPlayerId: "early", slotLabel: "PG", atText: "before 10:00 PM ET", listedStart: "10:00 PM ET" });
    expect(swap.inputs.on).toBe("final");
    expect(swap.inputs.requiresInGameSwap).toBe(false);
    expect(swap.inputs.threshold).toBeGreaterThan(0);
    const at = t.timeline.map((x) => x.at).filter(Boolean);
    expect([...at].sort()).toEqual(at);
    expect(t.timeline.map((x) => x.order)).toEqual(t.timeline.map((_, i) => i + 1));
  });

  it("puts an earlier bench player in first when a later starter can still replace him", () => {
    const t = buildTonight({
      today,
      nowMs: T0 - H,
      players: [
        player("late", { slot: 0, label: "PG", tip: T0 + 3 * H, after: [] }),
        player("volatile", { tip: T0, after: [] }),
      ],
      slots: [{ index: 0, label: "PG", playerId: "late", locked: false }],
      modelAt,
    });
    const start = t.timeline.find((x) => x.kind === "start");
    expect(start).toMatchObject({ playerId: "volatile", replacesPlayerId: "late", slotLabel: "PG" });
    expect(start.inputs.reason).toBe("earlier_tip_first");
    expect(start.inputs.valueIfEarlyFirst).toBeGreaterThan(start.inputs.valueIfLateOnly);
  });

  it("never offers a later player as replaced by an earlier one, and respects eligibility", () => {
    const t = buildTonight({
      today,
      nowMs: T0 - H,
      players: [
        player("early", { slot: 0, label: "PG", tip: T0 + 3 * H }),
        player("late", { tip: T0, positions: ["C"] }),
      ],
      slots: [{ index: 0, label: "PG", playerId: "early", locked: false }],
      modelAt,
    });
    expect(t.timeline.filter((x) => x.kind === "swap_check" || x.kind === "start")).toEqual([]);
  });

  it("flags a swap that would need an in-game move and reports the live projection against the threshold", () => {
    const t = buildTonight({
      today,
      nowMs: T0 + 1.2 * H,
      players: [
        player("early", { slot: 0, label: "PG", tip: T0, status: "in_game", row: { fp: 6, sp: 900 }, after: ["2026-11-18"] }),
        player("late", { tip: T0 + 1.5 * H }),
      ],
      slots: [{ index: 0, label: "PG", playerId: "early", locked: false }],
      modelAt,
    });
    const swap = t.timeline.find((x) => x.kind === "swap_check");
    expect(swap.inputs.requiresInGameSwap).toBe(true);
    expect(swap.inputs.on).toBe("projected_final");
    expect(swap.inputs.now.projectedFinal).toBeGreaterThan(6);
    expect(typeof swap.inputs.now.below).toBe("boolean");
    const line = t.players.find((p) => p.playerId === "early").line;
    expect(line).toMatchObject({ fpSoFar: 6, minutesSoFar: 15 });
  });

  it("marks passed decision points and returns an explicit state when nobody plays tonight", () => {
    const t = buildTonight({ today, nowMs: T0 + 10 * H, players: [player("early", { slot: 0, label: "PG", tip: T0, after: ["2026-11-18"] }), player("late", { tip: T0 + 3 * H })], slots, modelAt });
    expect(t.timeline.every((x) => x.passed)).toBe(true);
    const none = buildTonight({ today, nowMs: T0, players: [player("idle", { status: "none" })], slots, modelAt });
    expect(none).toMatchObject({ status: "no_games", timeline: [] });
  });

  it("asks for a lock-or-hold before the tip of a holder who plays tonight", () => {
    const t = buildTonight({ today, nowMs: T0 - H, players: [player("early", { slot: 0, label: "PG", tip: T0, holding: 31.5, after: ["2026-11-18"] })], slots, modelAt });
    const l = t.timeline.find((x) => x.kind === "lock_or_hold");
    expect(l).toMatchObject({ playerId: "early", atText: "before 7:00 PM ET" });
    expect(l.inputs).toMatchObject({ x: 31.5, k: 2 });
  });

  it("gives one lineup entry per listed start, naming who is in each open slot at that start", () => {
    const t = buildTonight({
      today,
      nowMs: T0 - H,
      players: [player("early", { slot: 0, label: "PG", tip: T0 }), player("late", { tip: T0 + 3 * H })],
      slots: [{ index: 0, label: "PG", playerId: "early", locked: false }],
      modelAt,
    });
    const ls = t.timeline.filter((x) => x.kind === "lineup_at_start");
    expect(ls.map((x) => x.listedStart)).toEqual(["7:00 PM ET", "10:00 PM ET"]);
    expect(ls[0].inputs.slots).toEqual([{ slotIndex: 0, slotLabel: "PG", playerId: "early", inForThisStart: true }]);
    expect(ls[1].inputs.swapOptions).toEqual([expect.objectContaining({ playerId: "late", forPlayerId: "early" })]);
    expect(ls[1].atText).toBe("before 10:00 PM ET");
  });

  it("does not start an earlier player who could never beat the later one", () => {
    const t = buildTonight({
      today,
      nowMs: T0 - H,
      players: [player("late", { slot: 0, label: "PG", tip: T0 + 3 * H }), player("early", { tip: T0 })],
      slots: [{ index: 0, label: "PG", playerId: "late", locked: false }],
      modelAt,
    });
    expect(t.timeline.filter((x) => x.kind === "start")).toEqual([]);
  });

  it("drops plans that need a mid-game swap when that rule is set to not allowed", () => {
    const players = [player("early", { slot: 0, label: "PG", tip: T0 }), player("late", { tip: T0 + H })];
    const s1 = [{ index: 0, label: "PG", playerId: "early", locked: false }];
    const flagged = buildTonight({ today, nowMs: T0 - H, players, slots: s1, modelAt });
    expect(flagged.timeline.find((x) => x.kind === "swap_check").inputs.requiresInGameSwap).toBe(true);
    expect(flagged.rules).toEqual({ inGameSwap: "allowed", source: "owner (league practice)" });
    const curve = flagged.timeline.find((x) => x.kind === "swap_check").inputs.thresholdByShareOfGameLeft;
    expect(curve[0].shareOfGameLeft).toBe(1);
    expect(curve.length).toBeGreaterThan(1);
    const strict = buildTonight({ today, nowMs: T0 - H, players, slots: s1, modelAt, rules: { inGameSwap: "not_allowed" } });
    expect(strict.timeline.filter((x) => x.kind === "swap_check")).toEqual([]);
  });
});
