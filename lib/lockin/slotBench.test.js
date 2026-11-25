import { describe, expect, it } from "vitest";
import { slotBench } from "./slotBench.js";

const sample = (m) => Array.from({ length: 10 }, (_, i) => m + (i - 4.5) * 2);
const opt = (m, pPlays, status = null) => ({ sample: sample(m), games: pPlays.map((p, i) => ({ date: `2026-11-2${6 + i}`, pPlay: p })), status });

describe("slotBench: who else could play an open slot", () => {
  const slots = [
    { index: 0, label: "C", playerId: "c1", name: "Holder", banked: 24.5, lockState: "unknown_until_next_tip" },
    { index: 1, label: "PG", playerId: "g1", name: "Locked", banked: 30, lockState: "locked" },
  ];
  const cards = [
    { playerId: "c1", name: "Holder", role: "starter", positions: ["C"], stopping: { x: 24.5, expectedIfHeld: 22.0 } },
    { playerId: "b1", name: "Big", role: "bench", positions: ["PF", "C"] },
    { playerId: "b2", name: "Guard", role: "bench", positions: ["PG"] },
    { playerId: "b3", name: "Hurt", role: "bench", positions: ["C"] },
    { playerId: "b4", name: "Done", role: "bench", positions: ["C"] },
  ];
  const opts = { c1: opt(20, [0.9]), b1: opt(22, [0.9, 0.9]), b2: opt(30, [1]), b3: opt(25, [0]), b4: null };
  const out = slotBench({ slots, cards, optionOf: (id) => opts[id] ?? null, planStarts: [{ playerId: "b1", slotIndex: 3, slotLabel: "UTIL" }] });
  it("skips locked slots and lists only eligible bench players who can still play", () => {
    expect(Object.keys(out)).toEqual(["0"]);
    expect(out[0].options.map((o) => o.playerId)).toEqual(["b1"]);
  });
  it("values keeping a held score as the better of locking now and holding", () => {
    expect(out[0].occupant).toMatchObject({ expected: 24.5, lockNow: 24.5, ifHeld: 22 });
  });
  it("gives the bench player's projected points, the gap to the occupant and where the plan uses him", () => {
    const b = out[0].options[0];
    expect(b.gamesLeft).toBe(2);
    expect(b.expected).toBeGreaterThan(22);
    expect(b.vsOccupant).toBeCloseTo(b.expected - 24.5, 1);
    expect(b.elsewhere).toBe("UTIL");
  });
});
