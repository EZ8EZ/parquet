import { describe, expect, it } from "vitest";
import {
  bankedCount,
  bankedPoints,
  deadlinesAhead,
  formatRange,
  gameDatesByWeek,
  injuredStarters,
  leagueToday,
  slotLabels,
  weekSlots,
  weekStatus,
  weekWindow,
} from "./index.js";
import { weekContext } from "./load.js";

const LIVE_SETTINGS = {
  taxi_deadline: 4,
  trade_deadline: 17,
  playoff_week_start: 21,
};

describe("deadlinesAhead", () => {
  it("in week 4, keeps the taxi deadline (end of week 4) until the week ends", () => {
    const live = deadlinesAhead(LIVE_SETTINGS, 4);
    expect(live.map((d) => [d.id, d.weeksAway])).toEqual([
      ["taxi", 0],
      ["trade", 13],
      ["playoffs", 17],
    ]);
    const ended = deadlinesAhead(LIVE_SETTINGS, 4, { weekEnded: true });
    expect(ended.map((d) => d.id)).toEqual(["trade", "playoffs"]);
  });

  it("drops every deadline already behind the current week", () => {
    expect(deadlinesAhead(LIVE_SETTINGS, 18).map((d) => d.id)).toEqual([
      "playoffs",
    ]);
    expect(deadlinesAhead(LIVE_SETTINGS, 21)).toEqual([]);
  });

  it("reads settings, never constants: a league with other weeks gets other weeks", () => {
    const d = deadlinesAhead({ trade_deadline: 12, playoff_week_start: 19 }, 2);
    expect(d.map((x) => [x.id, x.week])).toEqual([
      ["trade", 12],
      ["playoffs", 19],
    ]);
  });

  it("ignores missing or zero settings", () => {
    expect(deadlinesAhead({ taxi_deadline: 0 }, 1)).toEqual([]);
    expect(deadlinesAhead(undefined, 1)).toEqual([]);
  });

  it("with no current week, lists them without claiming how far away they are", () => {
    const d = deadlinesAhead(LIVE_SETTINGS, null);
    expect(d).toHaveLength(3);
    expect(d.every((x) => x.weeksAway === null)).toBe(true);
  });
});

describe("weekWindow", () => {
  const dates = new Map([
    [3, ["2026-11-02", "2026-11-04", "2026-11-07"]],
    [4, ["2026-11-14", "2026-11-09", "2026-11-11"]],
    [5, []],
  ]);

  it("reads Monday to Sunday off the week's own game dates", () => {
    const w = weekWindow(dates, 4, "2026-11-15");
    expect(w).toMatchObject({
      start: "2026-11-09",
      end: "2026-11-15",
      state: "live",
      daysLeft: 0,
      observed: true,
    });
    expect(formatRange(w.start, w.end)).toBe("Nov 9–15");
  });

  it("reports a week whose Sunday has passed as ended", () => {
    expect(weekWindow(dates, 4, "2026-11-16").state).toBe("ended");
  });

  it("places a week with no games yet after the latest week that has some", () => {
    const w = weekWindow(dates, 5, "2026-11-16");
    expect(w).toMatchObject({
      start: "2026-11-16",
      end: "2026-11-22",
      state: "live",
      observed: false,
    });
  });

  it("returns null when no game dates are known", () => {
    expect(weekWindow(new Map(), 4, "2026-11-15")).toBe(null);
    expect(weekWindow(dates, null, "2026-11-15")).toBe(null);
  });

  it("formats a window across a month boundary", () => {
    expect(formatRange("2026-10-26", "2026-11-01")).toBe("Oct 26–Nov 1");
  });
});

describe("weekSlots", () => {
  const players = new Map([
    ["1", { fullName: "Ann Guard", team: "BOS", injuryStatus: null }],
    [
      "2",
      {
        fullName: "Bo Wing",
        team: "LAL",
        injuryStatus: "Out",
        injuryBodyPart: "Knee",
      },
    ],
  ]);
  const labels = slotLabels(["PG", "SG", "SF", "BN", "BN", "IR"]);

  it("keeps only the starting slots, in order", () => {
    expect(labels).toEqual(["PG", "SG", "SF"]);
  });

  it("maps each slot to its player and score, and counts only positive scores as banked", () => {
    const slots = weekSlots({
      labels,
      matchup: { starters: ["1", "2", "0"], startersPoints: [30.5, 0, 0] },
      players,
      gamesThisWeek: new Map([
        ["1", 3],
        ["2", 0],
      ]),
    });
    expect(slots.map((s) => [s.label, s.name, s.points, s.banked])).toEqual([
      ["PG", "Ann Guard", 30.5, true],
      ["SG", "Bo Wing", 0, false],
      ["SF", null, 0, false],
    ]);
    expect(slots[0].gamesPlayed).toBe(3);
    expect(slots[1].injury).toBe("Knee");
    expect(bankedCount(slots)).toBe(1);
  });

  it("without a matchup, returns empty slots rather than zeros", () => {
    const slots = weekSlots({ labels });
    expect(slots.every((s) => s.points === null && s.playerId === null)).toBe(
      true,
    );
    expect(bankedCount(slots)).toBe(0);
  });
});

describe("injuredStarters", () => {
  const slots = [
    { playerId: "1", injury: null },
    { playerId: "2", injury: "Knee" },
    { playerId: null, injury: null },
  ];

  it("lists only starters with an injury tag", () => {
    expect(injuredStarters(slots, "live").map((s) => s.playerId)).toEqual([
      "2",
    ]);
  });

  it("knows games left only once the week is over; otherwise unknown, never guessed", () => {
    expect(injuredStarters(slots, "ended")[0].gamesLeft).toBe(0);
    expect(injuredStarters(slots, "live")[0].gamesLeft).toBe(null);
    expect(injuredStarters(slots, undefined)[0].gamesLeft).toBe(null);
  });
});

describe("gameDatesByWeek and leagueToday", () => {
  it("pools game dates by week across players", () => {
    const seasons = new Map([
      ["a", new Map([[4, [{ date: "2026-11-09" }, { date: null }]]])],
      ["b", new Map([[4, [{ date: "2026-11-11T00:00:00" }]]])],
    ]);
    expect(gameDatesByWeek(seasons).get(4)).toEqual([
      "2026-11-09",
      "2026-11-11",
    ]);
  });

  it("reads today in US Eastern, where NBA game dates live", () => {
    expect(leagueToday(new Date("2026-11-16T01:32:00Z"))).toBe("2026-11-15");
    expect(leagueToday(new Date("2026-11-16T15:00:00Z"))).toBe("2026-11-16");
  });
});

describe("weekContext", () => {
  const base = {
    provider: "sleeper",
    rosters: [{ settings: { wins: 1, losses: 2 } }],
    currentLeague: {
      season: "2026",
      status: "in_season",
      rosterPositions: ["PG", "SG", "SF", "PF", "C", "UTIL", "UTIL", "BN"],
      settings: { leg: 4, start_week: 1, game_mode: 1, ...LIVE_SETTINGS },
    },
  };

  it("reads the week and seven slots from league settings", () => {
    const ctx = weekContext(base);
    expect(ctx.week).toBe(4);
    expect(ctx.labels).toHaveLength(7);
    expect(ctx.offseason).toBe(false);
    expect(ctx.lockIn).toBe(true);
  });

  it("calls a pre-draft league the offseason and claims no week", () => {
    const ctx = weekContext({
      ...base,
      rosters: [{ settings: { wins: 0, losses: 0 } }],
      currentLeague: {
        ...base.currentLeague,
        status: "pre_draft",
        settings: { start_week: 1 },
      },
    });
    expect(ctx.offseason).toBe(true);
    expect(ctx.week).toBe(null);
  });

  it("marks a non-Sleeper provider as not live", () => {
    expect(weekContext({ ...base, provider: "fixture" }).live).toBe(false);
  });
});

describe("weekStatus and bankedPoints", () => {
  const live = { state: "live", daysLeft: 0, start: "2026-11-09", end: "2026-11-15" };
  it("says how much of the week is left, from the derived window", () => {
    expect(weekStatus(live, 4, 3)).toBe("Last day");
    expect(weekStatus({ ...live, daysLeft: 3 }, 4, 3)).toBe("3 days left");
    expect(weekStatus({ ...live, daysLeft: 1 }, 4, 3)).toBe("1 day left");
  });
  it("separates games over from scored, using the league's last scored week", () => {
    const ended = { ...live, state: "ended" };
    expect(weekStatus(ended, 4, 3)).toBe("Games over, not yet scored");
    expect(weekStatus(ended, 4, 4)).toBe("Final");
    expect(weekStatus({ ...live, state: "upcoming", start: "2026-11-16" }, 5, 4)).toBe(
      "Starts Mon, Nov 16",
    );
    expect(weekStatus(null, 4, 3)).toBe(null);
  });
  it("sums only banked scores", () => {
    expect(
      bankedPoints([
        { banked: true, points: 30.5 },
        { banked: false, points: 0 },
        { banked: true, points: 28 },
      ]),
    ).toBe(58.5);
  });
});
