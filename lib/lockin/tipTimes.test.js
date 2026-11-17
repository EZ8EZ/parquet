import { describe, expect, it } from "vitest";
import { indexTips, proxyTipsFromLogs, tipLabel, tipsSchema, urlTips } from "./tipTimes.js";
import { indexSchedule } from "./normalize.js";
import { buildWeekDesk } from "./index.js";
import { FIXTURE_LEAGUE_ID, FIXTURE_NOW, fixtureFetchJson } from "./fixture.js";

const sched = indexSchedule(
  [
    { game_id: "1", week: 5, date: "2026-11-16", status: "pre_game", home: { team: "BOS" }, away: { team: "ORL" } },
    { game_id: "2", week: 5, date: "2026-11-16", status: "postponed", home: { team: "WAS" }, away: { team: "MEM" } },
    { game_id: "3", week: 5, date: "2026-11-16", status: "pre_game", home: { team: "DEN" }, away: { team: "PHX" } },
  ],
  "2026",
);

describe("tip times", () => {
  it("maps the scores feed to schedule games by game_id", () => {
    const raw = tipsSchema.parse([
      { game_id: "1", start_time: Date.parse("2026-11-17T00:00:00Z"), metadata: { home_team: { team: "BOS" }, away_team: { team: "ORL" } } },
      { game_id: "3", start_time: null, metadata: { scheduled: "2026-11-17T02:00:00+00:00" } },
    ]);
    const t = indexTips(raw, sched);
    expect(t.get("1")).toEqual({ startMs: Date.parse("2026-11-17T00:00:00Z"), source: "sleeper_scores" });
    expect(t.get("3").startMs).toBe(Date.parse("2026-11-17T02:00:00Z"));
  });

  it("gives a postponed game no tip rather than a stale one", () => {
    const t = indexTips([{ game_id: "2", start_time: Date.parse("2026-11-17T00:00:00Z") }], sched);
    expect(t.has("2")).toBe(false);
  });

  it("falls back to future log rows created at the scheduled tip, and ignores off-grid times", () => {
    const rows = [
      { gameId: "1", complete: false, updatedAt: Date.parse("2026-11-17T00:30:00Z") },
      { gameId: "3", complete: false, updatedAt: Date.parse("2026-11-17T02:07:13Z") },
    ];
    const t = proxyTipsFromLogs(rows, sched);
    expect(t.get("1")).toEqual({ startMs: Date.parse("2026-11-17T00:30:00Z"), source: "log_row_proxy" });
    expect(t.has("3")).toBe(false);
  });

  it("labels tips in Eastern time and builds the week URL", () => {
    expect(tipLabel(Date.parse("2026-11-17T00:30:00Z"))).toBe("7:30 PM ET");
    expect(urlTips("2026", 5)).toBe("https://api.sleeper.app/scores/nba/regular/2026/5");
  });

  it("records a failed scores feed as a named gap and orders tonight by the proxy", async () => {
    const fetchJson = async (url, opts) => {
      if (url.includes("/scores/")) throw new Error("HTTP 502");
      return fixtureFetchJson(url, opts);
    };
    const desk = await buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, now: FIXTURE_NOW, fetchJson });
    expect(desk.status).toBe("in_season");
    expect(desk.gaps).toContainEqual(expect.objectContaining({ source: "scores", code: "fetch_failed", message: "HTTP 502" }));
    expect(desk.tonight.notes.join(" ")).toMatch(/proxy|unknown/);
  });

  it("puts tonight on the fixture desk with tips from the scores feed", async () => {
    const desk = await buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, now: FIXTURE_NOW, fetchJson: fixtureFetchJson });
    expect(desk.tonight).toMatchObject({ date: "2026-11-12", status: "games", tipsKnown: true, tipSource: ["sleeper_scores"] });
    expect(desk.tonight.tips.map((t) => t.atText)).toEqual(["7:00 PM ET", "8:00 PM ET", "9:30 PM ET"]);
    expect(JSON.parse(JSON.stringify(desk.tonight))).toEqual(desk.tonight);
  });
});
