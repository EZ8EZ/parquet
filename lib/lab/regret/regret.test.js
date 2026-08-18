import { describe, expect, it } from "vitest";
import { buildRegretLedger, scoreGame } from "./index.js";
/** This league's real scoring line, read off `/league/{id}` (never hardcoded in app
 *  code - hardcoded here so the arithmetic under test is pinned to known numbers). */
const SCORING = {
  ast: 1,
  blk: 2,
  bonus_pt_40p: 2,
  bonus_pt_50p: 2,
  dd: 1,
  ff: -2,
  pts: 0.5,
  reb: 1,
  stl: 2,
  td: 2,
  tf: -2,
  to: -1,
  tpm: 0.5,
};
const SLOTS = ["PG", "SG", "SF", "PF", "C", "UTIL", "UTIL"];
function game(stats, date = "2025-11-17") {
  return { date, opponent: "CLE", stats };
}
function input(over = {}) {
  return {
    season: "2025",
    rosterId: 1,
    matchups: [],
    games: new Map(),
    scoring: SCORING,
    slotLabels: SLOTS,
    playerNames: new Map(),
    playoffWeekStart: 21,
    ...over,
  };
}
describe("scoreGame", () => {
  it("reproduces a real Sleeper line under this league's own settings", () => {
    // Ryan Rollins, 2025 week 5 at PHI. Sleeper banked 37.0 for this game.
    expect(
      scoreGame(
        { pts: 32, reb: 6, ast: 14, stl: 1, to: 3, tpm: 2, dd: 1 },
        SCORING,
      ),
    ).toBe(37);
  });
  it("picks up the scoring bonuses that `pts_std` silently omits", () => {
    const line = { pts: 43, reb: 5, ast: 3, tpm: 4, to: 2, bonus_pt_40p: 1 };
    expect(scoreGame(line, SCORING)).toBe(21.5 + 5 + 3 + 2 - 2 + 2);
    // Same line without the league's bonus is 2 points lighter - the exact gap that
    // makes `pts_std` unusable here.
    const { bonus_pt_40p: _drop, ...noBonus } = line;
    void _drop;
    expect(scoreGame(noBonus, SCORING)).toBe(scoreGame(line, SCORING) - 2);
  });
  it("ignores stat keys the league does not score", () => {
    expect(scoreGame({ pts: 10, plus_minus: 30, fga: 22 }, SCORING)).toBe(5);
  });
});
describe("the regret ledger", () => {
  const games = new Map([
    // A produced 30 on Tuesday and 50 on Thursday.
    [
      "A",
      new Map([
        [
          1,
          [
            game({ pts: 60 }),
            game({ pts: 100, bonus_pt_40p: 1, bonus_pt_50p: 1 }),
          ],
        ],
      ]),
    ],
    ["B", new Map([[1, [game({ pts: 40 })]]])],
    ["C", new Map([[1, [game({ pts: 20 })]]])],
    // D never played that week.
    ["D", new Map([[1, []]])],
  ]);
  const names = new Map([
    ["A", "Ada"],
    ["B", "Bo"],
    ["C", "Cy"],
    ["D", "Dee"],
  ]);
  it("counts an unfilled slot as empty, and a filled slot that scored nothing as zero", () => {
    const l = buildRegretLedger(
      input({
        games,
        playerNames: names,
        matchups: [
          {
            week: 1,
            starters: ["A", "0", "", "D", "B", "C", "C"],
            startersPoints: [30, 0, 0, 0, 20, 10, 0],
            players: ["A", "B", "C", "D"],
          },
        ],
      }),
    );
    const w = l.weeks[0];
    expect(w.emptySlots).toBe(2);
    // D and the second C both banked 0 while holding a real name.
    expect(w.zeroSlots).toBe(2);
    expect(l.slotsTotal).toBe(7);
    expect(w.filledSlots).toBe(5);
  });
  it("takes each player's BEST game once, never a player twice", () => {
    const l = buildRegretLedger(
      input({
        games,
        playerNames: names,
        matchups: [
          {
            week: 1,
            starters: ["A", "B", "C", "0", "0", "0", "0"],
            startersPoints: [30, 20, 10, 0, 0, 0, 0],
            players: ["A", "B", "C", "D"],
          },
        ],
      }),
    );
    const w = l.weeks[0];
    // A's best is the 50-point night (100 pts = 50, +2 +2 bonuses = 54).
    expect(w.bestSeven.map((g) => `${g.name}:${g.points}`)).toEqual([
      "Ada:54",
      "Bo:20",
      "Cy:10",
    ]);
    expect(new Set(w.bestSeven.map((g) => g.playerId)).size).toBe(
      w.bestSeven.length,
    );
    // D played no games that week, so he was never available.
    expect(w.poolSize).toBe(3);
    expect(w.best).toBe(84);
    expect(w.banked).toBe(60);
    expect(w.gap).toBe(24);
  });
  it("verifies each banked figure against a real box score, and says when it cannot", () => {
    const l = buildRegretLedger(
      input({
        games,
        playerNames: names,
        matchups: [
          {
            week: 1,
            // A banked his 30-point night, not his 54. B banked a figure no game
            // we can see produced.
            starters: ["A", "B", "0", "0", "0", "0", "0"],
            startersPoints: [30, 99, 0, 0, 0, 0, 0],
            players: ["A", "B"],
          },
        ],
      }),
    );
    const w = l.weeks[0];
    expect(w.slots[0].verified).toBe(true);
    // A lock-in slot is a player-GAME, so the matched night is named.
    expect(w.slots[0].bankedOpponent).toBe("CLE");
    expect(w.slots[1].verified).toBe(false);
    expect(w.slots[1].bankedOpponent).toBeNull();
    expect(l.verifiedSlots).toBe(1);
    // B's unmatched 99 still floors his availability, so the gap never goes negative
    // because of a fetch we could not complete.
    expect(w.best).toBeGreaterThanOrEqual(w.banked);
    expect(w.gap).toBe(54 - 30);
  });
  it("refuses to name the game when two nights scored the same", () => {
    const twin = new Map([
      [
        "A",
        new Map([
          [
            1,
            [game({ pts: 60 }, "2025-11-17"), game({ pts: 60 }, "2025-11-19")],
          ],
        ]),
      ],
    ]);
    const l = buildRegretLedger(
      input({
        games: twin,
        playerNames: names,
        matchups: [
          {
            week: 1,
            starters: ["A", "0", "0", "0", "0", "0", "0"],
            startersPoints: [30, 0, 0, 0, 0, 0, 0],
            players: ["A"],
          },
        ],
      }),
    );
    const s = l.weeks[0].slots[0];
    expect(s.verified).toBe(true);
    expect(s.bankedDate).toBeNull();
    expect(s.bankedOpponent).toBeNull();
  });
  it("counts a slot that banked the player's own best game", () => {
    const l = buildRegretLedger(
      input({
        games,
        playerNames: names,
        matchups: [
          {
            week: 1,
            starters: ["A", "B", "0", "0", "0", "0", "0"],
            startersPoints: [54, 20, 0, 0, 0, 0, 0],
            players: ["A", "B"],
          },
        ],
      }),
    );
    expect(l.slotsAtPlayerBest).toBe(2);
    expect(l.gapTotal).toBe(0);
  });
  it("never reports a negative gap when a player's stats fail to load", () => {
    const l = buildRegretLedger(
      input({
        games: new Map(),
        playerNames: names,
        matchups: [
          {
            week: 1,
            starters: ["A", "B", "0", "0", "0", "0", "0"],
            startersPoints: [30, 20, 0, 0, 0, 0, 0],
            players: ["A", "B", "C"],
          },
        ],
      }),
    );
    const w = l.weeks[0];
    expect(w.missingStats).toBe(3);
    expect(w.best).toBe(50);
    expect(w.gap).toBe(0);
    expect(w.verifiedSlots).toBe(0);
  });
  it("tags playoff weeks and totals the season", () => {
    const wk = (week, pts) => ({
      week,
      starters: ["A", "0", "0", "0", "0", "0", "0"],
      startersPoints: [pts, 0, 0, 0, 0, 0, 0],
      players: ["A"],
    });
    const l = buildRegretLedger(
      input({
        games: new Map([
          [
            "A",
            new Map([
              [1, [game({ pts: 60 })]],
              [21, [game({ pts: 80 })]],
            ]),
          ],
        ]),
        playerNames: names,
        matchups: [wk(1, 30), wk(21, 10)],
      }),
    );
    expect(l.weeks.map((w) => w.playoff)).toEqual([false, true]);
    expect(l.bankedTotal).toBe(40);
    expect(l.bestTotal).toBe(70);
    expect(l.gapTotal).toBe(30);
    expect(l.widestWeek?.week).toBe(21);
    expect(l.tightestWeek?.week).toBe(1);
  });
  it("returns an empty ledger for a season that never ran", () => {
    const l = buildRegretLedger(input());
    expect(l.weeks).toHaveLength(0);
    expect(l.slotsTotal).toBe(0);
    expect(l.widestWeek).toBeNull();
    expect(l.gapTotal).toBe(0);
  });
});
