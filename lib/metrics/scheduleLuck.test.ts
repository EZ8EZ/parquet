import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import { getPrincipals } from "../principals";
import type { HistoryMatchup } from "../history";
import type { RosterSettings } from "../providers/types";
import {
  aggregateSeasonLuck,
  allPlaySeasonLuck,
  foldScheduleLuck,
  scheduleLuckProfiles,
  seasonScheduleLuck,
  type SeasonScheduleLuck,
} from "./scheduleLuck";

/** A weekly matchup row. `season` defaults to "2024" to keep test tables terse. */
function row(
  week: number,
  rosterId: number,
  matchupId: number,
  points: number,
  season = "2024",
): HistoryMatchup {
  return { week, rosterId, matchupId, points, season };
}

function settings(partial: Partial<RosterSettings>): RosterSettings {
  return {
    wins: 0,
    losses: 0,
    ties: 0,
    fpts: 0,
    fptsAgainst: 0,
    ppts: 0,
    waiverBudgetUsed: 0,
    waiverPosition: 0,
    totalMoves: 0,
    ...partial,
  };
}

// ------------------------------------------------------------------- all-play

describe("allPlaySeasonLuck", () => {
  it("scores a perfect all-play week as a full win over both other rosters", () => {
    // Week 1: roster 1 scores 120 (paired with 2), rosters 2 and 3 score less.
    const rows = [
      row(1, 1, 1, 120),
      row(1, 2, 1, 100),
      row(1, 3, 2, 90),
      row(1, 4, 2, 80),
    ];
    const luck = allPlaySeasonLuck(rows, 1, "2024")!;
    expect(luck.gamesPlayed).toBe(1);
    expect(luck.wins).toBe(1);
    expect(luck.expectedWinPct).toBeCloseTo(1, 6); // beat all 3 others that week
    expect(luck.luckWins).toBeCloseTo(0, 6); // won the actual game AND would have all-play
  });

  it("flags a manager who wins their matchup but loses the all-play week (a lucky pairing)", () => {
    // Roster 1 scores 100 - beats its paired opponent (90) but would lose to 2 of
    // the other 3 rosters in the league that same week (110, 105).
    const rows = [
      row(1, 1, 1, 100),
      row(1, 2, 1, 90),
      row(1, 3, 2, 110),
      row(1, 4, 2, 105),
      row(1, 5, 3, 50),
      row(1, 6, 3, 40),
    ];
    const luck = allPlaySeasonLuck(rows, 1, "2024")!;
    expect(luck.wins).toBe(1);
    expect(luck.losses).toBe(0);
    // vs the other 5: beats rosters 4,5,6 (105? no - 100 < 105, so only 5,6) -
    // recompute: others = 90,110,105,50,40. 100 beats 90,50,40 = 3 of 5.
    expect(luck.expectedWinPct).toBeCloseTo(3 / 5, 6);
    expect(luck.luckWins).toBeGreaterThan(0); // won for real, all-play says should win less often
  });

  it("counts a manager who plays the same opponent twice as two separate games", () => {
    // Rosters 1 and 2 face off in week 1 AND week 5 (a rematch) - same matchupId
    // number reused, which is realistic since matchupId only disambiguates within
    // a week. A grouping bug that keys on matchupId alone (ignoring week) would
    // collapse these into one game or cross-wire the scores.
    const rows = [
      row(1, 1, 1, 100),
      row(1, 2, 1, 90), // week 1: roster 1 wins
      row(5, 1, 1, 80),
      row(5, 2, 1, 95), // week 5: roster 1 loses (same matchupId=1, different week)
    ];
    const luck = allPlaySeasonLuck(rows, 1, "2024")!;
    expect(luck.gamesPlayed).toBe(2);
    expect(luck.wins).toBe(1);
    expect(luck.losses).toBe(1);
  });

  it("counts a tie as neither a win nor a loss, weighted at half a win", () => {
    const rows = [row(1, 1, 1, 100), row(1, 2, 1, 100)];
    const luck = allPlaySeasonLuck(rows, 1, "2024")!;
    expect(luck.wins).toBe(0);
    expect(luck.losses).toBe(0);
    expect(luck.ties).toBe(1);
    expect(luck.actualWinPct).toBeCloseTo(0.5, 6);
    expect(luck.expectedWinPct).toBeCloseTo(0.5, 6); // ties with the only other roster
  });

  it("returns null for a season with no games", () => {
    expect(allPlaySeasonLuck([], 1, "2024")).toBeNull();
    // Rows exist, but none for this roster or this season.
    expect(allPlaySeasonLuck([row(1, 2, 1, 100), row(1, 3, 1, 90)], 1, "2024")).toBeNull();
  });

  it("skips a week with no clean pairing rather than guessing", () => {
    // Three rosters share matchupId 1 in week 1 - ambiguous, must be skipped.
    const rows = [
      row(1, 1, 1, 100),
      row(1, 2, 1, 90),
      row(1, 3, 1, 80),
      row(2, 1, 1, 100),
      row(2, 2, 1, 90), // week 2 is clean
    ];
    const luck = allPlaySeasonLuck(rows, 1, "2024")!;
    expect(luck.gamesPlayed).toBe(1); // only week 2 counted
  });

  it("is scoped to the requested season", () => {
    const rows = [
      row(1, 1, 1, 100, "2023"),
      row(1, 2, 1, 90, "2023"),
      row(1, 1, 1, 50, "2024"),
      row(1, 2, 1, 60, "2024"),
    ];
    const luck2024 = allPlaySeasonLuck(rows, 1, "2024")!;
    expect(luck2024.wins).toBe(0);
    expect(luck2024.losses).toBe(1);
  });
});

// ------------------------------------------------------------------ aggregate

describe("aggregateSeasonLuck", () => {
  it("scores expected win rate as the Pythagorean share of fpts vs fptsAgainst", () => {
    const luck = aggregateSeasonLuck(
      "2024",
      settings({ wins: 10, losses: 4, ties: 0, fpts: 2000, fptsAgainst: 1800 }),
    )!;
    const expected = 2000 ** 2 / (2000 ** 2 + 1800 ** 2);
    expect(luck.expectedWinPct).toBeCloseTo(expected, 6);
    expect(luck.actualWinPct).toBeCloseTo(10 / 14, 6);
  });

  it("reports positive luckWins for a team that outwon its scoring", () => {
    // Scored barely more than allowed (near a coin flip) but went nearly undefeated.
    const luck = aggregateSeasonLuck(
      "2024",
      settings({ wins: 13, losses: 1, ties: 0, fpts: 1550, fptsAgainst: 1500 }),
    )!;
    expect(luck.expectedWinPct).toBeLessThan(0.6);
    expect(luck.luckWins).toBeGreaterThan(5); // way more wins than the scoring implies
  });

  it("reports negative luckWins for a team that underwon its scoring", () => {
    const luck = aggregateSeasonLuck(
      "2024",
      settings({ wins: 1, losses: 13, ties: 0, fpts: 1550, fptsAgainst: 1500 }),
    )!;
    expect(luck.luckWins).toBeLessThan(-5);
  });

  it("weights a tie as half a win in the actual rate", () => {
    const luck = aggregateSeasonLuck(
      "2024",
      settings({ wins: 5, losses: 5, ties: 2, fpts: 1000, fptsAgainst: 1000 }),
    )!;
    expect(luck.actualWinPct).toBeCloseTo((5 + 1) / 12, 6);
    expect(luck.expectedWinPct).toBeCloseTo(0.5, 6); // even scoring
    // Even scoring and an even (with ties) record agree exactly: no luck either way.
    expect(luck.luckWins).toBeCloseTo(0, 6);
  });

  it("returns null for a season with no games", () => {
    expect(
      aggregateSeasonLuck("2024", settings({ wins: 0, losses: 0, ties: 0, fpts: 0, fptsAgainst: 0 })),
    ).toBeNull();
  });

  it("returns null when no points were recorded (an unplayed/future season)", () => {
    // Games recorded (unlikely but guard it) with zero points is nonsensical; the
    // realistic case is zero games AND zero points, already covered above, but this
    // guards the fpts===fptsAgainst===0 division-by-zero path directly.
    expect(
      aggregateSeasonLuck("2024", settings({ wins: 1, losses: 0, ties: 0, fpts: 0, fptsAgainst: 0 })),
    ).toBeNull();
  });
});

// -------------------------------------------------------------- method choice

describe("seasonScheduleLuck", () => {
  it("prefers all-play when matchup rows exist for the season", () => {
    const rows = [row(1, 1, 1, 100), row(1, 2, 1, 90)];
    const luck = seasonScheduleLuck(
      rows,
      1,
      "2024",
      settings({ wins: 1, losses: 0, ties: 0, fpts: 100, fptsAgainst: 90 }),
    )!;
    expect(luck.method).toBe("all-play");
  });

  it("falls back to aggregate when no matchup rows exist for the season (the live league today)", () => {
    const luck = seasonScheduleLuck(
      [],
      1,
      "2024",
      settings({ wins: 10, losses: 4, ties: 0, fpts: 2000, fptsAgainst: 1800 }),
    )!;
    expect(luck.method).toBe("aggregate");
  });

  it("returns null when neither method has anything to work with", () => {
    expect(
      seasonScheduleLuck([], 1, "2024", settings({ wins: 0, losses: 0, ties: 0, fpts: 0, fptsAgainst: 0 })),
    ).toBeNull();
  });
});

// -------------------------------------------------------------------- fold

function season(
  s: string,
  overrides: Partial<SeasonScheduleLuck> = {},
): SeasonScheduleLuck {
  return {
    season: s,
    method: "aggregate",
    gamesPlayed: 14,
    wins: 7,
    losses: 7,
    ties: 0,
    actualWinPct: 0.5,
    expectedWinPct: 0.5,
    expectedWins: 7,
    luckWins: 0,
    ...overrides,
  };
}

describe("foldScheduleLuck", () => {
  it("sums numerator and denominator across seasons rather than averaging rates", () => {
    const p = foldScheduleLuck("u1", 1, [
      season("2023", { gamesPlayed: 20, wins: 15, expectedWins: 10, luckWins: 5 }),
      season("2024", { gamesPlayed: 4, wins: 1, expectedWins: 2, luckWins: -1 }),
    ]);
    expect(p.gamesPlayed).toBe(24);
    expect(p.wins).toBe(16);
    expect(p.luckWins).toBeCloseTo(4, 6); // 5 + -1, additive
  });

  it("never divides by zero on an empty history", () => {
    const p = foldScheduleLuck("u1", 1, []);
    expect(p.gamesPlayed).toBe(0);
    expect(p.actualWinPct).toBe(0);
    expect(p.expectedWinPct).toBe(0);
    expect(p.luckiest).toBeNull();
    expect(p.unluckiest).toBeNull();
  });

  it("reports allPlay:true only when every folded season used all-play", () => {
    const allAllPlay = foldScheduleLuck("u1", 1, [
      season("2023", { method: "all-play" }),
      season("2024", { method: "all-play" }),
    ]);
    expect(allAllPlay.allPlay).toBe(true);

    const mixed = foldScheduleLuck("u1", 1, [
      season("2023", { method: "all-play" }),
      season("2024", { method: "aggregate" }),
    ]);
    expect(mixed.allPlay).toBe(false);
  });

  it("finds the luckiest and unluckiest seasons", () => {
    const p = foldScheduleLuck("u1", 1, [
      season("2022", { luckWins: 0 }),
      season("2023", { luckWins: 4 }),
      season("2024", { luckWins: -3 }),
    ]);
    expect(p.luckiest!.season).toBe("2023");
    expect(p.unluckiest!.season).toBe("2024");
  });

  it("does not report an unluckiest season for a single-season career", () => {
    const p = foldScheduleLuck("u1", 1, [season("2024", { luckWins: 2 })]);
    expect(p.luckiest!.season).toBe("2024");
    expect(p.unluckiest).toBeNull();
  });
});

// --------------------------------------------------------------- orchestrator

describe("scheduleLuckProfiles (fixture integration)", () => {
  it("resolves a career profile for every principal with recorded games, all via all-play", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const profiles = await scheduleLuckProfiles(h, principals);
    expect(profiles.size).toBeGreaterThan(0);
    for (const p of profiles.values()) {
      expect(p.gamesPlayed).toBeGreaterThan(0);
      // The fixture provider is the one place matchups are actually loaded, so
      // every folded season here should have used the true all-play method.
      expect(p.allPlay).toBe(true);
      expect(Number.isFinite(p.luckWins)).toBe(true);
    }
  });
});
