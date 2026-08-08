import { describe, expect, it } from "vitest";
import {
  LATE_MARGIN_POINTS,
  buildGameLog,
  buildSlotPar,
  buildWeekBoard,
  describeGame,
  parPercentile,
  quantile,
  scoreLine,
  type RecordedSlot,
} from "./index";

/**
 * The fixtures below are shaped from the real 2025 league (1240499656799039488) and
 * the real NBA schedule feed, not invented: every field name, every sign convention
 * and the 7-slot shape were read off the live endpoints before these were written.
 */

const SLOT_LABELS = ["PG", "SG", "SF", "PF", "C", "UTIL", "UTIL"];

function slot(playerId: string | null, points: number): RecordedSlot {
  return { playerId, points };
}

describe("buildSlotPar", () => {
  it("excludes zeros from the distribution and counts them separately", () => {
    // Nine scoring slots plus three dead ones: one never filled, two filled with a
    // player who did not play. This is the 2025 pattern in miniature - the league's
    // 2,254 slots held 10 empty and 116 zero-scoring.
    const par = buildSlotPar([
      slot("a", 10),
      slot("b", 20),
      slot("c", 30),
      slot("d", 12),
      slot("e", 22),
      slot("f", 26),
      slot("g", 31),
      slot("h", 36),
      slot("i", 64),
      slot(null, 0),
      slot("j", 0),
      slot("k", 0),
    ]);
    expect(par.n).toBe(9);
    expect(par.totalSlots).toBe(12);
    expect(par.deadSlots).toBe(3);
    expect(par.negativeSlots).toBe(0);
    expect(par.median).toBe(26);
    expect(par.max).toBe(64);
  });

  it("counts a below-zero slot as its own thing, not as a dead one", () => {
    // Four of the league's 2,254 slots in 2025 finished at -1.0. "Banked nothing" and
    // "went backwards" are different events and this scoring line permits both.
    const par = buildSlotPar([
      slot("a", 20),
      slot("b", 30),
      slot("c", -1),
      slot(null, 0),
    ]);
    expect(par.n).toBe(2);
    expect(par.deadSlots).toBe(1);
    expect(par.negativeSlots).toBe(1);
    // Never plotted: the strip starts at zero and a negative bar would distort it.
    expect(par.bins.reduce((s, b) => s + b.count, 0)).toBe(2);
  });

  it("reproduces the league's own 2025 par from its shape", () => {
    // A 2,124-slot distribution with the measured quartiles: p25 20, median 26,
    // p75 31, p90 36. Built by replaying those counts rather than by hardcoding an
    // answer, so the quantile arithmetic is what is under test.
    const slots: RecordedSlot[] = [];
    const push = (v: number, n: number) => {
      for (let i = 0; i < n; i++) slots.push(slot(`p${slots.length}`, v));
    };
    push(14, 531); // bottom quarter
    push(23, 531);
    push(29, 531);
    push(40, 531); // top quarter
    // The league's real dead tail: 10 slots nobody filled and 116 that held a name
    // who did not play, plus the four that finished at -1.0.
    for (let i = 0; i < 126; i++) slots.push(slot(i < 10 ? null : `z${i}`, 0));
    for (let i = 0; i < 4; i++) slots.push(slot(`n${i}`, -1));

    const par = buildSlotPar(slots);
    expect(par.n).toBe(2124);
    expect(par.totalSlots).toBe(2254);
    expect(par.deadSlots).toBe(126);
    expect(par.negativeSlots).toBe(4);
    // Interpolated across the block edges: p25 sits at index 530.75, three quarters
    // of the way from 14 to 23; the median at 1061.5, halfway from 23 to 29 - which
    // is the league's real 26.0; p75 at 1592.25, a quarter of the way from 29 to 40.
    expect(par.p25).toBe(20.8);
    expect(par.median).toBe(26);
    expect(par.p75).toBe(31.8);
    expect(par.p90).toBe(40);
  });

  it("bins across the whole range so the strip cannot lose its tail", () => {
    const par = buildSlotPar([slot("a", 1), slot("b", 26), slot("c", 64)]);
    expect(par.bins[0]).toEqual({ from: 0, to: 4, count: 1 });
    expect(par.bins.at(-1)?.to).toBeGreaterThanOrEqual(64);
    expect(par.bins.reduce((s, b) => s + b.count, 0)).toBe(3);
  });

  it("survives a league with no scored slots at all", () => {
    const par = buildSlotPar([slot(null, 0), slot(null, 0)]);
    expect(par.n).toBe(0);
    expect(par.median).toBe(0);
    expect(parPercentile(par, 30)).toBe(0);
  });
});

describe("quantile and parPercentile", () => {
  it("interpolates rather than snapping to a member", () => {
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(quantile([], 0.5)).toBe(0);
  });

  it("reads a rank from the raw values, not from the bins", () => {
    // 25 and 27 land in the same 4-point bin and must not report the same rank.
    const par = buildSlotPar(
      Array.from({ length: 100 }, (_, i) => slot(`p${i}`, i + 1)),
    );
    expect(parPercentile(par, 25)).toBe(25);
    expect(parPercentile(par, 27)).toBe(27);
  });
});

describe("buildWeekBoard", () => {
  const schedule = [
    // Week 5 of 2025 ran Mon 17 Nov to Sun 23 Nov - the real dates.
    g("g1", "2025-11-17", 5, "complete", "SAS", "MEM"),
    g("g2", "2025-11-18", 5, "complete", "MEM", "DAL"), // MEM back-to-back
    g("g3", "2025-11-20", 5, "pre_game", "SAS", "DEN"),
    g("g4", "2025-11-21", 5, "pre_game", "DEN", "MEM"), // DEN back-to-back
    g("g5", "2025-11-25", 6, "pre_game", "SAS", "MEM"), // next week: excluded
  ];

  function g(
    gameId: string,
    date: string,
    week: number,
    status: string,
    home: string,
    away: string,
  ) {
    return { gameId, date, week, status, home: { team: home }, away: { team: away } };
  }

  const base = {
    week: 5,
    slotLabels: SLOT_LABELS,
    playerNames: new Map([
      ["1", "Fox"],
      ["2", "Morant"],
      ["3", "Jokic"],
    ]),
    playerTeams: new Map<string, string | null>([
      ["1", "SAS"],
      ["2", "MEM"],
      ["3", null], // Sleeper has no team on file
    ]),
    schedule,
  };

  it("holds seven chips, filled and open, and never more", () => {
    const b = buildWeekBoard({
      ...base,
      starters: ["1", "", "0", "", "", "", ""],
      startersPoints: [32, 0, 0, 0, 0, 0, 0],
      players: ["1", "2", "3"],
    });
    expect(b.slots).toHaveLength(7);
    expect(b.openSlots).toBe(6);
    expect(b.slots[0]).toMatchObject({ label: "PG", playerName: "Fox", banked: 32 });
    expect(b.slots[2].empty).toBe(true); // "0" is Sleeper's unfilled marker, not a player
    expect(b.bankedSoFar).toBe(32);
  });

  it("counts player-GAMES left, not players, and drops the slotted ones", () => {
    const b = buildWeekBoard({
      ...base,
      starters: ["1", "", "", "", "", "", ""],
      startersPoints: [32, 0, 0, 0, 0, 0, 0],
      players: ["1", "2", "3"],
    });
    // Fox (SAS) has g1 played and g3 to come, but he is slotted, so neither counts.
    // Morant (MEM) has g1 and g2 played and g4 to come: one game left.
    expect(b.gamesLeft).toBe(1);
    expect(b.playersWithoutTeam).toBe(1);
  });

  it("groups by night and marks the second leg of a back-to-back", () => {
    const b = buildWeekBoard({
      ...base,
      starters: ["", "", "", "", "", "", ""],
      startersPoints: [],
      players: ["2"],
    });
    expect(b.days.map((d) => d.date)).toEqual([
      "2025-11-17",
      "2025-11-18",
      "2025-11-21",
    ]);
    const nov18 = b.days.find((d) => d.date === "2025-11-18")!.games[0];
    expect(nov18.backToBack).toBe(true);
    expect(nov18.played).toBe(true);
    const nov17 = b.days.find((d) => d.date === "2025-11-17")!.games[0];
    expect(nov17.backToBack).toBe(false);
    expect(nov17.home).toBe(false); // MEM was away at SAS
    expect(nov17.opponent).toBe("SAS");
  });

  it("counts down a player's remaining games within the week", () => {
    const b = buildWeekBoard({
      ...base,
      starters: ["", "", "", "", "", "", ""],
      startersPoints: [],
      players: ["2"],
    });
    expect(b.days.flatMap((d) => d.games).map((x) => x.gamesLeftForPlayer)).toEqual([
      3, 2, 1,
    ]);
  });

  it("ignores other weeks entirely", () => {
    const b = buildWeekBoard({
      ...base,
      starters: ["", "", "", "", "", "", ""],
      startersPoints: [],
      players: ["1"],
    });
    expect(b.days.flatMap((d) => d.games).map((x) => x.gameId)).toEqual(["g1", "g3"]);
  });

  it("degrades to the chips when the schedule is empty", () => {
    const b = buildWeekBoard({
      ...base,
      schedule: [],
      starters: ["1", "", "", "", "", "", ""],
      startersPoints: [32],
      players: ["1", "2"],
    });
    expect(b.days).toEqual([]);
    expect(b.gamesLeft).toBe(0);
    expect(b.slots).toHaveLength(7);
  });
});

describe("buildGameLog", () => {
  // The league's real scoring keys, trimmed to the ones these fixtures exercise.
  const scoring = { pts: 1, reb: 1, ast: 1.5, stl: 2, blk: 2, to: -1 };

  const sched = new Map([
    [
      "gA",
      {
        status: "complete",
        home: { team: "SAS", points: 120, starters: ["1872"], quarters: [30, 30, 30, 30] },
        away: { team: "MEM", points: 95, starters: ["9999"], quarters: [22, 22, 24, 27] },
      },
    ],
    [
      "gB",
      {
        status: "complete",
        home: { team: "MEM", points: 101, starters: ["9999"], quarters: [25, 25, 25, 26] },
        away: { team: "SAS", points: 99, starters: ["4321"], quarters: [25, 24, 25, 25] },
      },
    ],
    [
      "gC",
      {
        // Not played. `starters` is pre-populated and must not be believed.
        status: "pre_game",
        home: { team: "SAS", points: null, starters: ["1872"], quarters: [] },
        away: { team: "DEN", points: null, starters: ["3225"], quarters: [] },
      },
    ],
  ]);

  const line = (
    gameId: string | null,
    date: string,
    opponent: string,
    isAway: boolean | null,
    sp: number,
    stats: Record<string, number>,
  ) => ({ gameId, date, opponent, isAway, secondsPlayed: sp, stats: { sp, ...stats } });

  it("scores under the league's own settings, never pts_std", () => {
    expect(scoreLine({ pts: 26, reb: 5, ast: 8, pts_std: 33 }, scoring)).toBe(43);
  });

  it("marks the starting five from the schedule, and only when the game finished", () => {
    const rows = buildGameLog({
      playerId: "1872",
      games: [
        line("gA", "2025-11-17", "MEM", false, 1992, { pts: 26, reb: 5, ast: 8 }),
        line("gB", "2025-11-18", "MEM", true, 1230, { pts: 12, reb: 3, ast: 4 }),
        line("gC", "2025-11-20", "DEN", false, 600, { pts: 8 }),
      ],
      schedule: sched,
      scoring,
    });
    // Most recent first.
    expect(rows.map((r) => r.gameId)).toEqual(["gC", "gB", "gA"]);
    expect(rows[2].started).toBe(true);
    expect(rows[1].started).toBe(false); // in the roster, not in the five
    // The unplayed game lists him as a starter in the feed. We refuse to say so.
    expect(rows[0].started).toBeNull();
    expect(rows[0].thirdQuarterMargin).toBeNull();
  });

  it("flags a late margin from the third-quarter score, not the final", () => {
    const rows = buildGameLog({
      playerId: "1872",
      games: [
        line("gA", "2025-11-17", "MEM", false, 1992, { pts: 26 }),
        line("gB", "2025-11-18", "MEM", true, 1230, { pts: 12 }),
      ],
      schedule: sched,
      scoring,
    });
    const a = rows.find((r) => r.gameId === "gA")!;
    expect(a.thirdQuarterMargin).toBe(22); // 90 - 68
    expect(a.finalMargin).toBe(25);
    expect(a.lateMargin).toBe(true);
    const b = rows.find((r) => r.gameId === "gB")!;
    expect(b.thirdQuarterMargin).toBe(-1); // SAS 74, MEM 75
    expect(b.lateMargin).toBe(false);
    expect(LATE_MARGIN_POINTS).toBe(18);
  });

  it("carries no adjusted number anywhere in the row", () => {
    const [row] = buildGameLog({
      playerId: "1872",
      games: [line("gA", "2025-11-17", "MEM", false, 1992, { pts: 26, reb: 5 })],
      schedule: sched,
      scoring,
    });
    expect(row.points).toBe(31);
    // The refusal, pinned: annotations are fields, never a second score.
    expect(Object.keys(row).filter((k) => /adjust|true|expected|proj/i.test(k))).toEqual(
      [],
    );
  });

  it("drops DNPs and keeps the last ten", () => {
    const games = Array.from({ length: 15 }, (_, i) =>
      line(null, `2025-12-${String(i + 1).padStart(2, "0")}`, "MEM", false, i === 3 ? 0 : 1800, {
        pts: i,
      }),
    );
    const rows = buildGameLog({ playerId: "1872", games, schedule: sched, scoring });
    expect(rows).toHaveLength(10);
    expect(rows[0].points).toBe(14);
    expect(rows.some((r) => r.minutes === null)).toBe(false);
  });

  it("never claims a reason for a player who was not in the five", () => {
    const [row] = buildGameLog({
      playerId: "1872",
      games: [line("gB", "2025-11-18", "MEM", true, 1230, { pts: 12 })],
      schedule: sched,
      scoring,
    });
    const sentence = describeGame(row);
    expect(sentence).toContain("not in the starting five");
    expect(sentence).toContain("does not say why");
    expect(sentence).not.toMatch(/injur|out|rest|dnp/i);
  });

  it("describes a blowout without pricing it", () => {
    const [row] = buildGameLog({
      playerId: "1872",
      games: [line("gA", "2025-11-17", "MEM", false, 1992, { pts: 26 })],
      schedule: sched,
      scoring,
    });
    const sentence = describeGame(row);
    expect(sentence).toContain("ahead by 22");
    expect(sentence).toContain("at home against MEM");
    expect(sentence).not.toMatch(/should|would have|worth|inflat|deflat|adjust/i);
  });
});
