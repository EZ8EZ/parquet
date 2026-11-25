import { describe, expect, it } from "vitest";
import { simulateTotals } from "./winprob.js";

describe("the opponent's lock share at every deadline (D137)", () => {
  const p = { id: "z", sample: [5, 10, 40, 45], q: 1, r: [0, 25, 30, 32, 33, 34, 35], H: (k, x) => Math.max(x, 20 + k), games: [{ plays: true }, { plays: true }, { plays: true }], x: null };
  it("leaves a walk unchanged without a share", () => {
    const a = simulateTotals({ fixed: 0, riders: [], slots: [p] }, { sims: 400, seed: 3 });
    const b = simulateTotals({ fixed: 0, riders: [], slots: [p], lockShare: null }, { sims: 400, seed: 3 });
    expect(Array.from(a)).toEqual(Array.from(b));
  });
  it("with a share of 1 he keeps his first game's score", () => {
    const t = simulateTotals({ fixed: 0, riders: [], slots: [p], lockShare: 1 }, { sims: 400, seed: 3 });
    for (const v of t) expect(p.sample).toContain(v);
  });
  it("a share below 1 pulls the mean toward a random lock (here down)", () => {
    const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    const none = simulateTotals({ fixed: 0, riders: [], slots: [p] }, { sims: 3000, seed: 3 });
    const some = simulateTotals({ fixed: 0, riders: [], slots: [p], lockShare: 0.3 }, { sims: 3000, seed: 3 });
    expect(mean(Array.from(some))).toBeLessThan(mean(Array.from(none)));
  });
});
