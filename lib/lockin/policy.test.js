import { describe, expect, it } from "vitest";
import { maxWeightAssign } from "./assign.js";
import { assignTonight, chooseLocks, eligible, pickLockSlot } from "./policy.js";
import { playerModel } from "./model.js";

const NEG = -Infinity;
const mkLog = (mean) =>
  Array.from({ length: 30 }, (_, i) => ({ date: `2026-01-${String(1 + i).padStart(2, "0")}`, fp: mean + ((i % 5) - 2) * 3, sp: 1800, complete: true, min: 30 }));
const LOGS = { a: mkLog(30), b: mkLog(20), c: mkLog(25), d: mkLog(15) };
const modelAt = (id, date) => playerModel(LOGS[id], date);
const games = (...dates) => dates.map((date, i) => ({ date, plays: i === 0 ? true : null }));

describe("maxWeightAssign", () => {
  it("respects eligibility and leaves a slot empty rather than place an ineligible player", () => {
    const { assign, value } = maxWeightAssign([
      [NEG, 10],
      [5, NEG],
    ]);
    expect(assign).toEqual([1, 0]);
    expect(value).toBe(15);
    expect(maxWeightAssign([[NEG, NEG]]).assign).toEqual([-1]);
  });

  it("finds the global optimum, not the greedy one", () => {
    const { value } = maxWeightAssign([
      [10, 9],
      [8, NEG],
    ]);
    expect(value).toBe(17);
  });
});

describe("eligibility", () => {
  it("UTIL takes anyone; a position slot takes only its position", () => {
    expect(eligible(["C"], "UTIL")).toBe(true);
    expect(eligible(["C"], "PG")).toBe(false);
    expect(eligible(["C"], "PG", false)).toBe(true);
    expect(pickLockSlot([{ label: "UTIL" }, { label: "C" }], ["C"])).toBe(1);
    expect(pickLockSlot([{ label: "PG", locked: null }], ["C"])).toBe(-1);
  });
});

describe("chooseLocks", () => {
  it("locks a score well above its hold value and holds one well below", () => {
    const hi = { id: "a", positions: ["PG"], games: games("2026-02-03"), x: 60, inSlot: true, done: false, holdW: 30 };
    const lo = { id: "b", positions: ["SG"], games: games("2026-02-03"), x: 5, inSlot: true, done: false, holdW: 20 };
    const res = chooseLocks({ openLabels: ["PG", "SG"], holders: [hi, lo], others: [], dn: "2026-02-03", modelAt });
    expect(res.perHolder.find((h) => h.id === "a").locks).toBe(true);
    expect(res.perHolder.find((h) => h.id === "b").locks).toBe(false);
  });

  it("cannot lock two C-only holders into one C slot", () => {
    const h = (id, x) => ({ id, positions: ["C"], games: games("2026-02-03"), x, inSlot: true, done: false, holdW: 1 });
    const res = chooseLocks({ openLabels: ["C", "PG"], holders: [h("a", 50), h("c", 45)], others: [], dn: "2026-02-03", modelAt });
    expect(res.perHolder.filter((p) => p.locks).map((p) => p.id)).toEqual(["a"]);
  });

  it("keeps a slot open for a stronger later player when slots are scarce", () => {
    const holder = { id: "d", positions: ["PG"], games: games("2026-02-03"), x: 16, inSlot: true, done: false, holdW: 14 };
    const later = { id: "a", positions: ["PG"], games: games("2026-02-03"), x: null, inSlot: false, done: false };
    const res = chooseLocks({ openLabels: ["PG"], holders: [holder], others: [later], dn: "2026-02-03", modelAt });
    expect(res.perHolder[0].locks).toBe(false);
    expect(res.perHolder[0].valueIfHold).toBeGreaterThan(res.perHolder[0].valueIfLock);
  });
});

describe("assignTonight", () => {
  it("puts tonight's players in eligible open slots only", () => {
    const cand = [
      { id: "a", positions: ["C"], games: games("2026-02-03"), x: null, inSlot: false, done: false },
      { id: "b", positions: ["PG"], games: games("2026-02-03"), x: null, inSlot: false, done: false },
    ];
    const playsOn = (p, d) => p.games.some((g) => g.date === d && g.plays);
    const res = assignTonight({ openLabels: ["PG", "C"], cand, d: "2026-02-03", modelAt, playsOn });
    expect(res.assigned.get("a")).toBe(1);
    expect(res.assigned.get("b")).toBe(0);
  });
});
