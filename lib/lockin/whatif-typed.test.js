import { describe, expect, it } from "vitest";
import { parseAssume, serialiseAssume, ASSUME_SCORE_MAX, assumeText } from "./assume.js";
import { buildWeekDesk } from "./index.js";
import { FIXTURE_LEAGUE_ID, FIXTURE_NOW, fixtureFetchJson } from "./fixture.js";
import { parseTypedScore, validAssume, withAssume, withChoices } from "./assumeView.js";
import { opponentsAheadView, playerFormRow, rivalsView, slotTiles } from "./view.js";
import { pBeatAny, shareAtLeast, slotRivals } from "./rivals.js";

const build = (assume) => buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, fetchJson: fixtureFetchJson, now: FIXTURE_NOW, assume });
const plain = await build(undefined);

describe("typed what-if scores in ?assume=", () => {
  it("parses a lock with a typed score and writes it back the same way", () => {
    const { list, rejected } = parseAssume("m4L30.5,t1L0,t2O,m3L,m5L42");
    expect(rejected).toEqual([]);
    expect(list).toEqual([
      { side: "mine", slot: 4, state: "locked", score: 30.5 },
      { side: "theirs", slot: 1, state: "locked", score: 0 },
      { side: "theirs", slot: 2, state: "open" },
      { side: "mine", slot: 3, state: "locked" },
      { side: "mine", slot: 5, state: "locked", score: 42 },
    ]);
    expect(serialiseAssume(list)).toBe("m4L30.5,t1L0,t2O,m3L,m5L42");
  });
  it("rejects a malformed or out-of-range score, and a score on 'playing on'", () => {
    const { list, rejected } = parseAssume(`m4L.5,m4L30.55,m4L${ASSUME_SCORE_MAX + 1},m4L007,t2O5,m1L-3`);
    expect(list).toEqual([]);
    expect(rejected).toHaveLength(6);
  });
  it("reads a typed score from an input", () => {
    expect(parseTypedScore("24.5")).toBe(24.5);
    expect(parseTypedScore(" 30 ")).toBe(30);
    expect(parseTypedScore("30.")).toBe(30);
    expect(parseTypedScore("30.26")).toBe(30.3);
    expect(parseTypedScore("151")).toBeNull();
    expect(parseTypedScore("abc")).toBeNull();
    expect(parseTypedScore("")).toBeNull();
    expect(withAssume([], "mine", 2, "locked", 18.5)).toEqual([{ side: "mine", slot: 2, state: "locked", score: 18.5 }]);
    expect(withAssume([], "mine", 2, "open", 18.5)).toEqual([{ side: "mine", slot: 2, state: "open" }]);
  });
  it("names a typed score as typed in the assumptions line", () => {
    expect(assumeText([{ side: "mine", slot: 4, state: "locked", score: 30, banked: 12, label: "C" }])).toBe("1 assumed: your C locked at 30.0 (typed)");
  });

  const slot = plain.slots.find((s) => s.playerId && s.lockState !== "locked" && s.lockStateReason !== "final_game_score_stands");
  it("locks the slot at the typed score: a higher typed score raises my projection, theirs unchanged", async () => {
    expect(slot).toBeTruthy();
    const lo = await build([{ side: "mine", slot: slot.index, state: "locked", score: 0 }]);
    const hi = await build([{ side: "mine", slot: slot.index, state: "locked", score: 80 }]);
    const sl = hi.slots.find((s) => s.index === slot.index);
    expect(sl.lockState).toBe("locked");
    expect(sl.assumedScore).toBe(80);
    expect(sl.banked).toBe(slot.banked); // what Sleeper holds is not rewritten
    expect(hi.winProb.mine.mean - lo.winProb.mine.mean).toBeGreaterThan(75);
    expect(hi.winProb.theirs.mean).toBeCloseTo(lo.winProb.theirs.mean, 6);
    expect(hi.winProb.now).toBeGreaterThanOrEqual(lo.winProb.now);
    expect(hi.assumptions.contradictsInferred).toEqual([]);
    expect(slotTiles(hi).find((t) => t.index === slot.index).text).toBe("80.0");
  });
  it("lets a typed score through on any occupied slot, including one with nothing banked", () => {
    const empty = plain.slots.find((s) => s.playerId && !(s.banked > 0));
    const typed = { side: "mine", slot: (empty ?? slot).index, state: "locked", score: 25 };
    expect(validAssume([typed], plain)).toEqual([typed]);
    if (empty) expect(validAssume([{ side: "mine", slot: empty.index, state: "locked" }], plain)).toEqual([]);
  });
  it("carries the typed score on the slot tile so the sheet can show it", async () => {
    const d = await build([{ side: "mine", slot: slot.index, state: "locked", score: 33.5 }]);
    const t = withChoices(slotTiles(d), d, "mine").find((x) => x.index === slot.index);
    expect(t.typedScore).toBe(33.5);
    expect(t.assumed).toBe("locked");
  });
  it("offers a typed score on a slot with no other choice (not played yet)", () => {
    const tiles = withChoices(slotTiles(plain), plain, "mine");
    for (const t of tiles.filter((x) => x.playerId && x.key !== "empty")) expect(t.choices).not.toBeNull();
  });
});

describe("who could beat the score on the table (rivals)", () => {
  it("computes per-game and any-game chances", () => {
    expect(shareAtLeast([10, 20, 30, 40], 25)).toBe(0.5);
    expect(shareAtLeast([], 25)).toBeNull();
    expect(pBeatAny([{ pPlay: 1 }, { pPlay: 1 }], 0.5)).toBeCloseTo(0.75, 9);
    expect(pBeatAny([{ pPlay: 0 }], 0.9)).toBe(0);
  });
  it("lists him first, the eligible bench by chance, who can't help, and the combined chance without players used elsewhere", () => {
    const card = { playerId: "a", name: "A", role: "starter", slotLabel: "C", slotIndex: 4, positions: ["C"], stopping: { x: 25 } };
    const cards = [
      card,
      { playerId: "b", name: "B", role: "bench", positions: ["C"] },
      { playerId: "c", name: "C", role: "bench", positions: ["PF", "C"], injury: { status: "Out" } },
      { playerId: "d", name: "D", role: "bench", positions: ["PG"] },
      { playerId: "e", name: "E", role: "bench", positions: ["C"] },
      { playerId: "f", name: "F", role: "bench", positions: ["C"] },
    ];
    const opt = {
      a: { sample: [20, 30], games: [{ date: "2026-11-25", pPlay: 1 }], status: null },
      b: { sample: [10, 30, 30, 40], games: [{ date: "2026-11-27", pPlay: 0.5 }, { date: "2026-11-29", pPlay: 0.5 }], status: null },
      c: { sample: [40], games: [{ date: "2026-11-25", pPlay: 0 }], status: "Out" },
      d: { sample: [50], games: [{ date: "2026-11-25", pPlay: 1 }], status: null },
      e: null,
      f: { sample: [60], games: [{ date: "2026-11-28", pPlay: 1 }], status: null },
    };
    const r = slotRivals({ card, cards, optionOf: (id) => opt[id], planStarts: [{ playerId: "f", slotIndex: 2, slotLabel: "PF" }] });
    expect(r.options.map((o) => o.playerId)).toEqual(["a", "f", "b"]);
    expect(r.options[0]).toMatchObject({ role: "self", pGame: 0.5, pBeat: 0.5 });
    // B: 3 of 4 outcomes beat 25, plays each of two games half the time: 1 - (1 - 0.375)^2
    expect(r.options[2].pBeat).toBeCloseTo(0.609, 3);
    expect(r.options[1].elsewhere).toEqual({ slotLabel: "PF" });
    expect(r.cannot.map((c) => c.playerId).sort()).toEqual(["c", "e"]);
    // F is used at PF in the plan, so only A and B count: 1 - 0.5 * 0.391
    expect(r.pAny).toBeCloseTo(0.805, 3);
    expect(rivalsView({ rivals: r }).summary).toBe("If you let 25.0 go: 81% chance someone beats it at C (2 options)");
  });
  it("is on every lock-or-hold card on the board, himself first, chances in range", () => {
    const withR = plain.cards.filter((c) => c.rivals);
    expect(withR.length).toBeGreaterThan(0);
    for (const c of withR) {
      expect(c.rivals.options[0].role).toBe("self");
      expect(c.rivals.pAny).toBeGreaterThanOrEqual(0);
      expect(c.rivals.pAny).toBeLessThanOrEqual(1);
      for (const o of c.rivals.options) expect(o.games.length).toBeGreaterThan(0);
    }
    expect(plain.cards.filter((c) => c.role === "bench").every((c) => !c.rivals)).toBe(true);
  });
});

describe("past games against this week's opponents", () => {
  it("gives one block per game left, each with its opponent and its own average", () => {
    const c = plain.cards.find((x) => (x.opponentsAhead || []).length > 0);
    expect(c).toBeTruthy();
    const v = opponentsAheadView(c);
    expect(v.ok).toBe(true);
    expect(v.blocks.map((b) => b.opponent)).toEqual(c.opponentsAhead.map((o) => o.opponent));
    for (const b of v.blocks) if (b.n) expect(b.avg).toBeCloseTo(b.rows.reduce((t, r) => t + r.fp, 0) / b.n, 1);
    const f = playerFormRow(c);
    expect(f.n).toBeLessThanOrEqual(10);
    expect(f.ahead).toHaveLength(c.opponentsAhead.length);
  });
  it("says so when no game is left", () => {
    expect(opponentsAheadView({ opponentsAhead: [] }).ok).toBe(false);
  });
});

describe("the status-bar scorebug counts what Home lists", () => {
  it("counts the same calls as Your calls, bench moves included, and points to the first move ahead", async () => {
    const { deskCallCount, deskNextMove } = await import("./source.js");
    const { callRows } = await import("./matchupView.js");
    const rows = callRows(plain);
    expect(deskCallCount(plain)).toBe(rows.length);
    expect(rows.some((r) => r.kind === "start")).toBe(true);
    const now = Date.parse(plain.generatedAt);
    const at = deskNextMove(plain, now);
    const moves = (plain.whatIf.plan.actions || []).filter((a) => a.kind === "then_start" && a.deadline && Date.parse(a.deadline) > now);
    for (const m of moves) expect(Date.parse(at)).toBeLessThanOrEqual(Date.parse(m.deadline));
  });
  it("writes every bench move in one form, scores with one decimal", () => {
    for (const a of (plain.whatIf.plan.actions || []).filter((x) => x.kind === "then_start" && /in place of/.test(x.text))) {
      expect(a.text).toMatch(/in place of .+'s \d+\.\d \(the slot is worth \d+\.\d after it\)/);
    }
  });
});
