import { describe, expect, it } from "vitest";
import { loadDeskState, refreshDeskState } from "./refresh.js";
import { FIXTURE_LEAGUE_ID, FIXTURE_NOW, fixtureFetchJson } from "./fixture.js";

const args = { rosterId: 1, leagueId: FIXTURE_LEAGUE_ID };
const LATER = new Date(FIXTURE_NOW.getTime() + 9 * 3600_000); // 02:00Z Fri = 9 PM ET Thu

/** Fixture fetch where PHX's Thursday game is final and UTA's is live; records URLs. */
function liveNight(calls) {
  return async (url, opts) => {
    calls.push(url);
    const data = await fixtureFetchJson(url, {});
    if (url.includes("/schedule/")) {
      for (const g of data) {
        if (g.date !== "2026-11-12") continue;
        if (g.game_id.includes("-PHX-")) g.status = "complete";
        if (g.game_id.includes("-UTA-")) g.status = "in_game";
      }
    }
    return opts?.schema ? opts.schema.parse(data) : data;
  };
}

describe("live-night refresh", () => {
  it("refetches only matchups, the schedule and the logs of live or newly final players", async () => {
    const state = await loadDeskState({ ...args, fetchJson: fixtureFetchJson, now: FIXTURE_NOW });
    const calls = [];
    const next = await refreshDeskState(state, { ...args, fetchJson: liveNight(calls), now: LATER });
    expect(next.refreshed.players.sort()).toEqual(["lk05", "lk11"]);
    expect(next.refreshed.requests).toBe(4);
    expect(calls.filter((u) => u.includes("/stats/nba/player/")).every((u) => u.includes("season=2026"))).toBe(true);
    expect(calls.some((u) => u.includes("/players/nba") || u.includes("/rosters") || u.includes("/state/"))).toBe(false);
    expect(next.desk.status).toBe("in_season");
    expect(next.desk.gaps).toEqual([]);
  });

  it("keeps the previous data and names the gap when a refresh request fails", async () => {
    const state = await loadDeskState({ ...args, fetchJson: fixtureFetchJson, now: FIXTURE_NOW });
    const failing = async (url, opts) => {
      if (url.includes("/matchups/")) throw new Error("HTTP 500");
      return fixtureFetchJson(url, opts);
    };
    const next = await refreshDeskState(state, { ...args, fetchJson: failing, now: LATER });
    expect(next.desk.status).toBe("in_season");
    expect(next.desk.gaps).toContainEqual(expect.objectContaining({ source: "matchups", code: "fetch_failed" }));
    expect(next.desk.slots.length).toBe(7);
  });
});
