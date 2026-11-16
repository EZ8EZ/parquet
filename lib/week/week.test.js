import { describe, expect, it } from "vitest";
import { deadlinesAhead, deskHeader, formatRange, injuredFromDesk, leagueToday, scoredCount, slotLabels } from "./index.js";
import { deskWindow, weekContext } from "./load.js";
import { buildWeekDesk } from "../lockin/index.js";
import { FIXTURE_LEAGUE_ID, FIXTURE_NOW, fixtureFetchJson } from "../lockin/fixture.js";

const desk = await buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, fetchJson: fixtureFetchJson, now: FIXTURE_NOW });

describe("dates", () => {
  it("formats a window, across a month boundary too", () => {
    expect(formatRange("2026-11-09", "2026-11-15")).toBe("Nov 9–15");
    expect(formatRange("2026-10-26", "2026-11-01")).toBe("Oct 26–Nov 1");
  });
  it("reads today in US Eastern, where NBA game dates live", () => {
    expect(leagueToday(new Date("2026-11-16T01:32:00Z"))).toBe("2026-11-15");
    expect(leagueToday(new Date("2026-11-16T15:00:00Z"))).toBe("2026-11-16");
  });
  it("derives the deadline window from the desk's dates", () => {
    expect(deskWindow(desk)).toMatchObject({ start: "2026-11-09", end: "2026-11-15", state: "live", daysLeft: 3 });
    expect(deskWindow({ dateWindow: { start: "2026-11-09", end: "2026-11-15" }, today: "2026-11-16" }).state).toBe("ended");
    expect(deskWindow(null)).toBe(null);
  });
});

describe("the bar's scored count, from the matchup row alone", () => {
  const labels = slotLabels(["PG", "SG", "SF", "BN", "IR"]);
  it("counts slots showing a score above 0, and says nothing without a matchup", () => {
    expect(labels).toEqual(["PG", "SG", "SF"]);
    expect(scoredCount(labels, { starters: ["1", "2", "0"], startersPoints: [30.5, 0, 12] })).toEqual({ scored: 1, of: 3 });
    expect(scoredCount(labels, null)).toBe(null);
  });
});

describe("Home's header and injured starters come from the desk", () => {
  it("counts slot states with the engine's vocabulary", () => {
    const h = deskHeader(desk);
    expect(h).toMatchObject({ range: "Nov 9–15", locked: 1, open: "2-5", live: 3 });
    expect(h.points).toBe(154);
    expect(deskHeader({ status: "between_weeks" })).toBe(null);
  });
  it("lists injured starters with games left, leaving hazards to their live cards", () => {
    expect(injuredFromDesk(desk)).toEqual([]);
    const lk05 = desk.cards.find((c) => c.playerId === "lk05");
    const tagged = { ...desk, cards: [...desk.cards, { ...lk05, injury: { status: "Questionable", bodyPart: "Knee" } }] };
    expect(injuredFromDesk(tagged).map((x) => [x.playerId, x.status, x.gamesLeft, x.nextDay])).toEqual([["lk05", "Questionable", 2, "Thu"]]);
  });
});

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
