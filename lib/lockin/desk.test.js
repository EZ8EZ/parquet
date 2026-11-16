import { describe, expect, it } from "vitest";
import { buildWeekDesk } from "./index.js";
import { FIXTURE_LEAGUE_ID, FIXTURE_NOW, fixtureFetchJson } from "./fixture.js";
import { resolveWeek, deadlineText } from "./calendar.js";
import { indexSchedule } from "./normalize.js";

/** Fixture fetch, recording each call; `override(url)` may return a replacement or throw. */
function recorder(override) {
  const calls = [];
  const fetchJson = async (url, opts) => {
    calls.push({ url, immutable: !!opts?.immutable });
    if (override) {
      const r = override(url, opts);
      if (r !== undefined) return r;
    }
    return fixtureFetchJson(url, opts);
  };
  return { fetchJson, calls };
}
/** @param {Record<string, any>} opts */
const build = (opts = {}) => buildWeekDesk(/** @type {any} */ ({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, now: FIXTURE_NOW, ...opts }));
const card = (desk, id) => desk.cards.find((c) => c.playerId === id);

describe("fixture week end to end", () => {
  it("builds a serialisable in-season board within budget and without gaps", async () => {
    const { fetchJson, calls } = recorder();
    const desk = await build({ fetchJson });
    expect(desk).toMatchObject({ version: 1, status: "in_season", inSeason: true, week: 4, weekSource: "state", today: "2026-11-12" });
    expect(desk.dateWindow).toMatchObject({ start: "2026-11-09", end: "2026-11-15" });
    expect(desk.gaps).toEqual([]);
    expect(calls.length).toBeLessThanOrEqual(40);
    expect(desk.requests.count).toBe(calls.length);
    expect(JSON.parse(JSON.stringify(desk))).toEqual(desk);
    expect(desk.slots.map((s) => s.label)).toEqual(["PG", "SG", "SF", "PF", "C", "UTIL", "UTIL"]);
    expect(desk.excluded.map((e) => e.reason).sort()).toEqual(["reserve", "taxi"]);
    expect(desk.cards.some((c) => c.playerId === "lk12" || c.playerId === "lk13")).toBe(false);
  });

  it("marks past-season logs immutable and current ones not", async () => {
    const { fetchJson, calls } = recorder();
    await build({ fetchJson });
    const logs = calls.filter((c) => c.url.includes("/stats/nba/player/"));
    expect(logs.filter((c) => c.url.includes("season=2025")).every((c) => c.immutable)).toBe(true);
    expect(logs.filter((c) => c.url.includes("season=2026")).every((c) => !c.immutable)).toBe(true);
  });

  it("infers each lock state from the slot scores", async () => {
    const desk = await build({ fetchJson: fixtureFetchJson });
    const st = Object.fromEntries(desk.slots.map((s) => [s.playerId, s.lockState]));
    expect(st).toMatchObject({ lk01: "locked", lk02: "unknown_until_next_tip", lk04: "reset", lk05: null, lk07: null });
  });

  it("orders cards by urgency: hazards, then lock-or-hold, then lineup, then nothing", async () => {
    const desk = await build({ fetchJson: fixtureFetchJson });
    const ranks = desk.cards.map((c) => c.urgencyRank);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(desk.cards[0].hazards.length).toBeGreaterThan(0);
    expect(card(desk, "lk02").decision).toMatchObject({ kind: "lock_or_hold", deadlineDate: "2026-11-14", deadlineText: "before his next game on Sat" });
    expect(card(desk, "lk05").decision.deadlineText).toBe("before his next game tonight");
  });

  it("flags the reset hazard: ruled out of his next game while holding a score", async () => {
    const desk = await build({ fetchJson: fixtureFetchJson });
    const h = card(desk, "lk03").hazards;
    expect(h.map((x) => x.code)).toEqual(["ruled_out_holding"]);
    expect(h[0].deadlineDate).toBe("2026-11-13");
    expect(card(desk, "lk03").stopping.availabilityAssumed).toBe("listed_out");
  });

  it("flags the DNP hazard: final game of the week with a likely DNP", async () => {
    const desk = await build({ fetchJson: fixtureFetchJson });
    expect(card(desk, "lk06").hazards.map((x) => x.code)).toEqual(["final_game_likely_dnp"]);
    expect(card(desk, "lk06").gamesLeft).toBe(1);
  });

  it("gives the lean its own field, conditional while lock state is unknown, none otherwise", async () => {
    const desk = await build({ fetchJson: fixtureFetchJson });
    const l = card(desk, "lk02").lean;
    expect(["lock", "hold"]).toContain(l.value);
    expect(l.conditional).toBe(true);
    expect(l.reason).toMatch(/^31\.5 now against \d+\.\d expected if held, 1 game left/);
    expect(["marginal", "moderate", "clear"]).toContain(l.confidence);
    expect(l.inputs).toMatchObject({ x: 31.5, k: 1 });
    expect(card(desk, "lk01").lean).toMatchObject({ value: "none", noneCode: "already_locked" });
    expect(card(desk, "lk07").lean).toMatchObject({ value: "none", noneCode: "no_games_left" });
    expect(card(desk, "lk05").lean).toMatchObject({ value: "none", noneCode: "has_not_played_this_week" });
    expect(card(desk, "lk08").lean).toMatchObject({ value: "none", noneCode: "bench" });
    expect(desk.leanRecord).toMatchObject({ gainPerTeamWeek: 9.4, interval95: [5.5, 14.7], n: 240 });
    expect(desk.leanRecord.rotationCaveat).toMatch(/\+0\.8/);
  });

  it("carries numbers with their n and the rookie's thin-history fallback", async () => {
    const desk = await build({ fetchJson: fixtureFetchJson });
    const s = card(desk, "lk02").stopping;
    expect(s.n).toBeGreaterThanOrEqual(10);
    expect(s.pLaterBeats).toBeGreaterThanOrEqual(0);
    expect(s.pLaterBeats).toBeLessThanOrEqual(s.pLaterBeatsIfPlays);
    expect(card(desk, "lk09").forecast).toMatchObject({ basis: "thin" });
    expect(card(desk, "lk09").forecast.n).toBeLessThan(10);
  });

  it("annotates the last 15 with facts only", async () => {
    const desk = await build({ fetchJson: fixtureFetchJson });
    const series = card(desk, "lk02").series;
    expect(series.n).toBe(15);
    const texts = series.games.flatMap((g) => g.annotations.map((a) => a.text));
    expect(texts).toContain("NYK Starter 2 did not start");
    expect(texts).toContain("Overtime game");
    expect(card(desk, "lk03").series.games.some((g) => g.annotations.some((a) => a.code === "minutes_jump"))).toBe(true);
    const all = JSON.stringify(desk.cards.map((c) => [c.series, c.hazards, c.decision, c.lean.reason]));
    expect(all).not.toMatch(/\b(because|due to|caused|thanks to|led to|should|mistake|grade)\b/i);
    const opp = card(desk, "lk02").opponentHistory;
    expect(opp.meetings.length).toBeLessThanOrEqual(5);
    expect(opp.n).toBe(opp.meetings.length);
  });

  it("reports slot pressure per night", async () => {
    const desk = await build({ fetchJson: fixtureFetchJson });
    const sp = desk.slotPressure;
    expect(sp.summary).toMatchObject({ lockedCertain: 1, holdingUnknown: 3, openMax: 6, openMin: 3 });
    const thu = sp.nights.find((n) => n.date === "2026-11-12");
    expect(thu.past).toBe(false);
    expect(thu.playersWithGame).toBeGreaterThan(0);
    expect(sp.nights.find((n) => n.date === "2026-11-09").past).toBe(true);
    expect(sp.rowOrder).toEqual(desk.cards.map((c) => c.playerId));
  });
});

describe("gaps", () => {
  it("records a failed player log as a named gap and still builds the board", async () => {
    const { fetchJson } = recorder((url) => {
      if (url.includes("/player/lk02?") && url.includes("season=2026")) throw new Error("HTTP 503");
    });
    const desk = await build({ fetchJson });
    expect(desk.status).toBe("in_season");
    expect(desk.gaps).toContainEqual(expect.objectContaining({ source: "playerLog", subject: "lk02", code: "fetch_failed", message: "HTTP 503" }));
    expect(card(desk, "lk02").lean.noneCode).toBe("no_model");
    expect(card(desk, "lk02").hazards).toEqual([]);
  });

  it("records a shape change loudly and returns an explicit unavailable state", async () => {
    const { fetchJson } = recorder((url) => (url.includes("/schedule/") ? [{ nonsense: true }] : undefined));
    const desk = await build({ fetchJson });
    expect(desk.status).toBe("unavailable");
    expect(desk.message).toMatch(/schedule/);
    expect(desk.gaps[0]).toMatchObject({ source: "schedule", code: "shape_mismatch" });
  });

  it("stops at the request budget and names every skipped request", async () => {
    const desk = await build({ fetchJson: fixtureFetchJson, budget: { maxRequests: 12 } });
    expect(desk.requests.count).toBe(12);
    expect(desk.gaps.length).toBeGreaterThan(0);
    expect(desk.gaps.every((g) => g.code === "budget_exhausted" || g.code === "log_missing")).toBe(true);
  });
});

describe("out of season and between weeks", () => {
  it("returns a small explicit offseason state, not an empty board", async () => {
    const { fetchJson } = recorder((url) =>
      url.endsWith("/state/nba") ? { week: 0, season: "2026", season_type: "off" } : undefined,
    );
    const desk = await build({ fetchJson });
    expect(desk).toMatchObject({ status: "offseason", inSeason: false, cards: [], slotPressure: null });
    expect(desk.message).not.toBe("");
  });

  it("resolves between weeks and rollover from the schedule", () => {
    const sched = indexSchedule(
      [
        { game_id: "1", week: 4, date: "2026-11-15", status: "complete", home: { team: "A" }, away: { team: "B" } },
        { game_id: "2", week: 5, date: "2026-11-17", status: "pre_game", home: { team: "A" }, away: { team: "B" } },
      ],
      "2026",
    );
    const base = { state: { week: 4, season: "2026", season_type: "regular" }, league: { status: "in_season", season: "2026" }, scheduleIdx: sched };
    expect(resolveWeek({ ...base, today: "2026-11-16" })).toMatchObject({ kind: "between_weeks", completedWeek: 4, nextWeek: 5, nextWeekStart: "2026-11-17" });
    expect(resolveWeek({ ...base, today: "2026-11-17" })).toMatchObject({ kind: "week", week: 5, source: "schedule_rollover" });
    expect(resolveWeek({ ...base, league: { status: "complete", season: "2026" }, today: "2026-11-17" }).kind).toBe("offseason");
  });

  it("states deadlines by day because tip times are unknown", () => {
    expect(deadlineText("2026-11-12", "2026-11-12")).toBe("before his next game tonight");
    expect(deadlineText("2026-11-13", "2026-11-12")).toBe("before his next game on Fri");
  });
});
