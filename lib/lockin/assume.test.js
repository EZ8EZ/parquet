import { describe, expect, it } from "vitest";
import { ASSUME_MAX, assumedLockState, assumeText, normaliseAssume, parseAssume, serialiseAssume } from "./assume.js";
import { buildWeekDesk } from "./index.js";
import { FIXTURE_LEAGUE_ID, FIXTURE_NOW, fixtureFetchJson } from "./fixture.js";
import { teamSimInput } from "./matchup.js";
import { playerModel } from "./model.js";

const build = (assume) => buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, fetchJson: fixtureFetchJson, now: FIXTURE_NOW, assume });
const plain = await build(undefined);
const card = (d, id) => d.cards.find((c) => c.playerId === id);
// request counts depend on what earlier builds in this process already cached (finished
// weeks are read once, lockin M1), so they are not part of "identical output"
const strip = (d) => ({ ...d, requests: { ...d.requests, wallMs: null, count: null } });

describe("assume param parser", () => {
  it("parses side, slot and state and round-trips", () => {
    expect(parseAssume("m3L,t5O")).toEqual({ list: [{ side: "mine", slot: 3, state: "locked" }, { side: "theirs", slot: 5, state: "open" }], rejected: [] });
    expect(serialiseAssume(parseAssume("m3L,t5O").list)).toBe("m3L,t5O");
    expect(parseAssume(" m0L , ,t1O ").list).toHaveLength(2);
  });
  it("rejects unknown slots and malformed tokens", () => {
    const r = parseAssume("m7L,m6O,x1L,m1X,mL,m-1L,M1L,m123L", { slotCount: 7 });
    expect(r.list).toEqual([{ side: "mine", slot: 6, state: "open" }]);
    expect(r.rejected).toEqual(["m7L", "x1L", "m1X", "mL", "m-1L", "M1L", "m123L"]);
  });
  it("ignores duplicates with the last one winning, and caps at 20 entries", () => {
    expect(parseAssume("m1L,t1O,m1O").list).toEqual([{ side: "mine", slot: 1, state: "open" }, { side: "theirs", slot: 1, state: "open" }]);
    const many = Array.from({ length: 25 }, (_, i) => `${i % 2 ? "t" : "m"}${Math.floor(i / 2)}L`).join(",");
    const r = parseAssume(many);
    expect(ASSUME_MAX).toBe(20);
    expect(r.list).toHaveLength(20);
    expect(r.rejected).toHaveLength(5);
    // a duplicate of an entry already kept still counts as its update, not a new entry
    expect(parseAssume(`${many},m0O`).list[0]).toEqual({ side: "mine", slot: 0, state: "open" });
  });
  it("handles empty and non-string input; normalises a given list by the same rules", () => {
    expect(parseAssume(undefined)).toEqual({ list: [], rejected: [] });
    expect(parseAssume("")).toEqual({ list: [], rejected: [] });
    expect(normaliseAssume([{ side: "mine", slot: 1, state: "locked" }, { side: "x", slot: 1, state: "open" }, { side: "theirs", slot: 9, state: "open" }, { side: "mine", slot: 1, state: "open" }], { slotCount: 7 })).toEqual([{ side: "mine", slot: 1, state: "open" }]);
    expect(normaliseAssume(null)).toEqual([]);
  });
});

describe("assumed lock state", () => {
  const unknown = { state: "unknown_until_next_tip", reason: "banked_equals_latest_game", certain: false };
  const locked = { state: "locked", reason: "banked_matches_earlier_game", certain: true };
  const reset = { state: "reset", reason: "latest_game_dnp", certain: true };
  it("locked makes the banked score final; contradicts only a certain reset", () => {
    expect(assumedLockState(unknown, "locked", { banked: 30, gamesLeft: 2, live: false })).toEqual({ ls: { state: "locked", reason: "assumed_locked", certain: true, score: 30 }, contradicts: false });
    expect(assumedLockState(reset, "locked", { banked: 0, gamesLeft: 1, live: false }).contradicts).toBe(true);
  });
  it("open: a held score stays a holder, zero opens the slot, nothing left stands; contradicts a certain lock", () => {
    expect(assumedLockState(locked, "open", { banked: 40, gamesLeft: 1, live: false })).toEqual({ ls: { state: "unknown_until_next_tip", reason: "assumed_open", certain: true, score: 40 }, contradicts: true });
    expect(assumedLockState(unknown, "open", { banked: 0, gamesLeft: 1, live: false }).ls.state).toBe("reset");
    expect(assumedLockState(unknown, "open", { banked: 21, gamesLeft: 0, live: false }).ls.reason).toBe("final_game_score_stands");
    expect(assumedLockState(locked, "open", { banked: 12, gamesLeft: 1, live: true }).ls).toMatchObject({ state: null, reason: "assumed_open_live" });
  });
  it("describes the list in one line", () => {
    expect(assumeText([{ side: "mine", slot: 0, label: "PG", state: "locked", banked: 33 }, { side: "theirs", slot: 4, label: "C", state: "open", banked: 20 }])).toBe("2 assumed: your PG locked at 33.0; their C playing on");
    expect(assumeText([])).toBeNull();
  });
});

describe("assumptions on the desk (fixture)", () => {
  it("no assumption: identical to today's output (pinned fixture figures), and no assumptions field", async () => {
    expect(strip(await build([]))).toEqual(strip(plain));
    expect(plain.assumptions).toBeUndefined();
    expect(plain.winProb.baseline).toBeUndefined();
    // values from c15ad99 before this change
    expect([plain.winProb.now, plain.winProb.mine.mean, plain.winProb.theirs.mean]).toEqual([0.324, 193.2, 199.2]); // the release engine at e86c258 (plan follows Tonight's lineup) gives the same
  });
  it("a locked assumption removes that slot's later games and its decision", async () => {
    const d = await build([{ side: "mine", slot: 1, state: "locked" }]);
    expect(d.slots[1]).toMatchObject({ playerId: "lk02", lockState: "locked", lockStateReason: "assumed_locked" });
    expect(card(d, "lk02").decision).toMatchObject({ kind: "none", text: "Assumed locked (your assumption)" });
    expect(d.whatIf.options.some((o) => o.playerId === "lk02" && (o.kind === "lock" || o.kind === "hold"))).toBe(false);
    expect(d.assumptions).toEqual({ list: [{ side: "mine", slot: 1, state: "locked" }], contradictsInferred: [], text: "1 assumed: your SG locked at 31.5" });
    expect(d.winProb.baseline).toEqual({ p: plain.winProb.now, mine: plain.winProb.mine.mean, theirs: plain.winProb.theirs.mean });
    expect(d.winProb.assumptions.at(-1)).toMatch(/include your lock-state assumptions/);
    expect(d.winProb.theirs).toEqual(plain.winProb.theirs);
  });
  it("an open assumption on an inferred-locked slot adds his games back and is flagged", async () => {
    const d = await build([{ side: "mine", slot: 0, state: "open" }]);
    expect(card(plain, "lk01").decision.kind).toBe("none");
    expect(card(d, "lk01").decision.kind).toBe("lock_or_hold");
    expect(d.assumptions.contradictsInferred).toEqual([{ side: "mine", slot: 0, state: "open", inferred: "locked", inferredReason: "banked_matches_earlier_game" }]);
    expect(d.whatIf.options.some((o) => o.id === "lock:lk01")).toBe(true);
  });
  it("works on the opponent's side: locked fixes his score, open removes the chance it is already locked", async () => {
    const lockedT = await build([{ side: "theirs", slot: 2, state: "locked" }]);
    expect(lockedT.opponent.slots[2]).toMatchObject({ playerId: "op03", lockState: "locked", lockStateReason: "assumed_locked" });
    expect(lockedT.winProb.theirs.mean).not.toBe(plain.winProb.theirs.mean);
    expect(lockedT.winProb.mine).toEqual(plain.winProb.mine);
    const openT = await build([{ side: "theirs", slot: 2, state: "open" }]);
    expect(openT.opponent.slots[2].lockStateReason).toBe("assumed_open");
    expect(openT.winProb.theirs.mean).not.toBe(plain.winProb.theirs.mean);
    const both = await build([{ side: "mine", slot: 1, state: "locked" }, { side: "theirs", slot: 0, state: "open" }]);
    expect(both.assumptions.text).toBe("2 assumed: your SG locked at 31.5; their PG playing on");
    expect(both.assumptions.contradictsInferred.map((x) => `${x.side}${x.slot}`)).toEqual(["theirs0"]);
  });
  it("drops an assumption on a slot that does not exist", async () => {
    const d = await build([{ side: "mine", slot: 9, state: "locked" }]);
    expect(strip(d)).toEqual(strip(plain));
  });
});

describe("listed-out players are still never assigned under an assumption", () => {
  const mk = (mean) => Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(1 + i).padStart(2, "0")}`, fp: mean + ((i % 5) - 2) * 3, sp: 1800, min: 30, complete: true }));
  const fact = (pid, mean) => ({ pid, who: { positions: ["PF"] }, log: mk(mean), remaining: [{ date: "2026-11-25", gameId: `${pid}-0` }], live: null, noData: false });
  it("an assumed-open slot is filled by the healthy player, not the star listed Out", () => {
    const P = new Map([["star", fact("star", 40)], ["sub", fact("sub", 15)]]);
    const models = new Map([...P].map(([id, p]) => [id, playerModel(p.log, "2026-11-25")]));
    const slot = { index: 0, label: "PF", playerId: null, banked: null, lockState: "reset", lockStateReason: "assumed_open" };
    const input = teamSimInput({ slots: [slot], P, modelAt: (id) => models.get(id), statusOf: (id) => (id === "star" ? "Out" : null), mode: "policy" });
    expect(input.team.slots.map((x) => x?.id)).toEqual(["sub"]);
  });
});
