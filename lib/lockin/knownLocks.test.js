import { describe, expect, it } from "vitest";
import { indexKnownLocks, withKnownLock } from "./knownLocks.js";

const entry = { leagueId: "L", season: "2026", week: 6, rosterId: 4, playerId: "2135", score: 39 };
const at = { leagueId: "L", season: "2026", week: 6, rosterId: 4, playerId: "2135", banked: 39 };
const unknown = { state: "unknown_until_next_tip", reason: "banked_equals_latest_game", certain: false };

describe("withKnownLock: locks seen in the Sleeper app", () => {
  const idx = indexKnownLocks([entry]);
  it("turns a recorded lock into a certain one while the score still matches", () => {
    expect(withKnownLock(unknown, at, idx)).toEqual({ state: "locked", reason: "reported_locked", certain: true, score: 39 });
  });
  it("drops the entry once the banked score moved (a reset or a stale record)", () => {
    expect(withKnownLock(unknown, { ...at, banked: 12 }, idx)).toBe(unknown);
  });
  it("never overrides a certain reset", () => {
    const reset = { state: "reset", reason: "latest_game_dnp", certain: true, score: 0 };
    expect(withKnownLock(reset, { ...at, banked: 39 }, idx)).toBe(reset);
  });
  it("is keyed by league, season, week, roster and player", () => {
    for (const k of ["leagueId", "season", "week", "rosterId", "playerId"]) {
      expect(withKnownLock(unknown, { ...at, [k]: k === "week" || k === "rosterId" ? 99 : "x" }, idx)).toBe(unknown);
    }
  });
});
