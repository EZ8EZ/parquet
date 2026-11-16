import { describe, expect, it } from "vitest";
import { inferLockState } from "./lockState.js";

const g = (status, fp = null, sp = 1800) => ({ status, row: fp == null ? null : { fp, sp } });
const dnp = (status = "complete") => ({ status, row: { fp: 0, sp: 0 } });

describe("inferLockState", () => {
  it("locked is certain when the banked score differs from the latest game and matches an earlier one", () => {
    const s = inferLockState(40, [g("complete", 40), g("complete", 28), g("pre_game")]);
    expect(s).toMatchObject({ state: "locked", certain: true });
  });

  it("banked equal to the latest game is unknown until the next tip, never unlocked", () => {
    const s = inferLockState(31.5, [dnp(), g("complete", 31.5), g("pre_game")]);
    expect(s).toMatchObject({ state: "unknown_until_next_tip", certain: false });
  });

  it("a DNP after a played game zeroes an unlocked score: reset", () => {
    expect(inferLockState(0, [g("complete", 18.5), dnp(), g("pre_game")])).toMatchObject({ state: "reset", reason: "latest_game_dnp" });
  });

  it("a score tracking tonight's live game after an earlier game means it reset at tip", () => {
    expect(inferLockState(4, [g("complete", 22), g("in_game", 4)])).toMatchObject({ state: "reset", certain: true });
    expect(inferLockState(22, [g("complete", 22), g("in_game", 4)])).toMatchObject({ state: "locked" });
  });

  it("a final game with no log row is a box score still updating, never a DNP or a reset", () => {
    expect(inferLockState(24, [g("complete", 18.5), { status: "complete", row: null }, g("pre_game")])).toMatchObject({ state: null, reason: "box_score_pending", certain: false });
    expect(inferLockState(0, [g("complete", 18.5), { status: "complete", row: null }])).toMatchObject({ state: null, reason: "box_score_pending" });
  });

  it("returns no state, with a reason, where none applies", () => {
    const none = (...a) => inferLockState(...a).state;
    expect(none(0, [g("pre_game")])).toBeNull();
    expect(inferLockState(0, [g("pre_game")]).reason).toBe("no_game_yet");
    expect(inferLockState(21, [g("complete", 19), g("complete", 21)]).reason).toBe("final_game_score_stands");
    expect(inferLockState(17, [g("complete", 19), g("complete", 21), g("pre_game")]).reason).toBe("banked_matches_no_loaded_game");
    expect(inferLockState(null, []).reason).toBe("empty_slot");
  });

  it("never emits an 'unlocked' state", () => {
    const cases = [
      [0, [g("pre_game")]],
      [12, [g("complete", 12), g("pre_game")]],
      [12, [g("complete", 12), g("complete", 9), g("pre_game")]],
      [0, [g("complete", 5), dnp()]],
      [3, [g("complete", 5), g("in_game", 3)]],
    ];
    for (const [b, w] of cases) expect(["locked", "unknown_until_next_tip", "reset", null]).toContain(inferLockState(b, w).state);
  });
});
