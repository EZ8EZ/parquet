import { describe, expect, it } from "vitest";
import { buildWeekDesk } from "./index.js";
import { FIXTURE_LEAGUE_ID, FIXTURE_NOW, fixtureFetchJson } from "./fixture.js";
import { policyFor, playersForDesk, replayAllowed } from "./source.js";
import {
  bankedGameDate,
  distChart,
  dodge,
  gamesLeftText,
  gapLines,
  groupCards,
  leanView,
  minutesChart,
  nowIndex,
  opponentView,
  slotStateKey,
  stripChart,
  weekGrid,
} from "./view.js";

const desk = await buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, fetchJson: fixtureFetchJson, now: FIXTURE_NOW });
const card = (id) => desk.cards.find((c) => c.playerId === id);

/** Every number reachable in a chart geometry object. */
function numbers(o, out = []) {
  if (typeof o === "number") out.push(o);
  else if (Array.isArray(o)) o.forEach((x) => numbers(x, out));
  else if (o && typeof o === "object") Object.entries(o).forEach(([k, v]) => k !== "fp" && k !== "value" && k !== "minutes" && numbers(v, out));
  return out;
}

describe("slot states", () => {
  it("maps the engine's lock states to the five-plus labels", () => {
    const keys = Object.fromEntries(desk.slots.map((s) => [s.playerId, slotStateKey(s)]));
    expect(keys).toMatchObject({ lk01: "locked", lk02: "unknown", lk04: "reset", lk05: "yet", lk07: "final" });
    expect(slotStateKey({ playerId: null })).toBe("empty");
  });
});

describe("groups and text", () => {
  it("puts hazards and lock-or-hold calls in live, in engine order", () => {
    const g = groupCards(desk);
    expect(g.live.map((c) => c.playerId)).toEqual(desk.cards.filter((c) => c.urgencyRank <= 1).map((c) => c.playerId));
    expect(g.live[0].hazards.length).toBeGreaterThan(0);
  });
  it("lists games left by day and opponent, never by tip time", () => {
    expect(gamesLeftText(card("lk02"))).toMatch(/^1 game left: Sat (vs|at) [A-Z]{3}$/);
    expect(gamesLeftText(card("lk07"))).toBe("No games left this week");
  });
  it("finds the banked game: the earlier one when locked, the latest when unknown", () => {
    expect(bankedGameDate(card("lk01"))).toBe("2026-11-09");
    expect(bankedGameDate(card("lk02"))).toBe("2026-11-11");
    expect(bankedGameDate(card("lk04"))).toBeNull();
  });
  it("shows a marginal lean as nearly even and carries the conditional flag", () => {
    expect(leanView({ value: "lock", confidence: "marginal", conditional: true })).toMatchObject({ strength: 1, nearlyEven: true, conditional: true });
    expect(leanView({ value: "hold", confidence: "clear" })).toMatchObject({ strength: 3, nearlyEven: false });
    expect(leanView({ value: "none" })).toBeNull();
  });
});

describe("week grid", () => {
  it("full has every night and player; compact only what is still to play", () => {
    const full = weekGrid(desk);
    expect(full.nights).toHaveLength(7);
    expect(full.rows).toHaveLength(desk.cards.length);
    const c = weekGrid(desk, { compact: true });
    expect(c.nights.every((n) => !n.past)).toBe(true);
    expect(c.rows.some((r) => r.playerId === "lk01")).toBe(false);
    expect(c.rows.some((r) => r.playerId === "lk02")).toBe(true);
    expect(c.rows.some((r) => r.playerId === "lk08")).toBe(false);
    expect(c.bench.players).toBeGreaterThan(0);
    expect(c.bench.cells).toHaveLength(c.nights.length);
    const row = full.rows.find((r) => r.playerId === "lk01");
    expect(row.cells.filter((x) => x.kind === "banked").map((x) => x.date)).toEqual(["2026-11-09"]);
  });
});

describe("chart geometry", () => {
  it("never emits NaN or negative coordinates for any card", () => {
    for (const c of desk.cards) {
      for (const g of [stripChart(c), distChart(c), minutesChart(c)]) {
        if (!g.ok) {
          expect(g.missing).toBeTruthy();
          continue;
        }
        for (const n of numbers({ ...g, alt: null, legend: null })) {
          expect(Number.isFinite(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
  it("marks the score on the table and the expected-if-held rule", () => {
    const g = stripChart(card("lk02"));
    expect(g.ok).toBe(true);
    expect(nowIndex(card("lk02"))).toBe(g.dots.length - 1);
    expect(g.now.text).toBe("31.5 now");
    expect(g.rule.value).toBe(card("lk02").stopping.expectedIfHeld);
    expect(g.markers.some((m) => m.code === "overtime")).toBe(true);
  });
  it("refuses a strip on too few games and says what is missing", () => {
    const thin = { ...card("lk02"), series: { games: card("lk02").series.games.slice(0, 3), n: 3 } };
    expect(stripChart(thin)).toMatchObject({ ok: false });
    expect(stripChart(thin).missing).toMatch(/3 played games/);
    expect(minutesChart(thin).ok).toBe(false);
  });
  it("splits the distribution at the score with the share above it", () => {
    const g = distChart(card("lk02"));
    expect(g.ok).toBe(true);
    expect(g.dots).toHaveLength(card("lk02").forecast.shape.length);
    expect(g.above).toBe(g.dots.filter((d) => d.above).length);
    expect(g.pIfPlays).toBe(card("lk02").stopping.pLaterBeatsIfPlays);
    expect(distChart({ ...card("lk02"), forecast: { ...card("lk02").forecast, basis: "league-prior" } }).ok).toBe(false);
  });
  it("keeps opponent history to five rows, newest first", () => {
    const v = opponentView(card("lk02"));
    if (v.ok) {
      expect(v.rows.length).toBeLessThanOrEqual(5);
      expect([...v.rows].sort((a, b) => (a.date < b.date ? 1 : -1))).toEqual(v.rows);
    } else expect(v.missing).toMatch(/No meetings|No game left/);
    expect(opponentView(card("lk07")).ok).toBe(false);
  });
  it("dodges labels apart inside the bounds", () => {
    const out = dodge([{ y: 50 }, { y: 52 }, { y: 99 }], { gap: 12, min: 0, max: 100 });
    expect(out[1].y - out[0].y).toBeGreaterThanOrEqual(12);
    expect(Math.max(...out.map((o) => o.y))).toBeLessThanOrEqual(100);
    expect(Math.min(...out.map((o) => o.y))).toBeGreaterThanOrEqual(0);
  });
});

describe("gaps and source", () => {
  it("groups gaps into plain lines with player names", () => {
    const d = { gaps: [{ source: "playerLog", subject: "lk02", code: "fetch_failed" }, { source: "playerLog", subject: "lk03", code: "fetch_failed" }], cards: desk.cards };
    expect(gapLines(d)).toEqual(["Game logs missing for Bryce Holden, Cal Rivers (fetch failed)."]);
  });
  it("picks client cache policies by endpoint", () => {
    expect(policyFor("https://api.sleeper.app/v1/league/1/matchups/4")).toBe("matchups");
    expect(policyFor("https://api.sleeper.app/v1/league/1/matchups/4", true)).toBe("immutable");
    expect(policyFor("https://api.sleeper.app/stats/nba/player/1?season=2026")).toBe("playerStats");
    expect(policyFor("https://api.sleeper.app/v1/state/nba")).toBe("league");
    expect(policyFor("https://api.sleeper.app/schedule/nba/regular/2026")).toBe("matchups");
  });
  it("adapts the corpus players Map and never replays in production", () => {
    const m = new Map([["1", { fullName: "A B", team: "BOS", fantasyPositions: ["PG"], injuryStatus: "Out", injuryBodyPart: null }]]);
    expect(playersForDesk(m)["1"]).toMatchObject({ name: "A B", positions: ["PG"], injuryStatus: "Out" });
    expect(playersForDesk(m)).toBe(playersForDesk(m));
    const arr = [{ playerId: "7", fullName: "C D", team: null, position: "C", fantasyPositions: [] }];
    expect(playersForDesk(arr)).toEqual({ 7: { id: "7", name: "C D", team: null, positions: ["C"], injuryStatus: null, injuryBodyPart: null } });
    expect(replayAllowed({ NODE_ENV: "production", LOCKIN_REPLAY_DIR: "/x" })).toBe(false);
    expect(replayAllowed({ NODE_ENV: "development", LOCKIN_REPLAY_DIR: "/x" })).toBe(true);
  });
});
