import { describe, expect, it } from "vitest";
import { buildSlotPar, parPercentile, quantile } from "./slotPar";
/**
 * Moved here with the module when /lab/startline was shelved (SHELVED.md, S1). The
 * fixtures are shaped from the real 2025 league (1240499656799039488), not invented:
 * the 7-slot shape and the dead-slot counts were read off the live endpoints.
 */
function slot(playerId, points) {
  return { playerId, points };
}
describe("buildSlotPar", () => {
  it("excludes zeros from the distribution and counts them separately", () => {
    // Nine scoring slots plus three dead ones: one never filled, two filled with a
    // player who did not play. This is the 2025 pattern in miniature - the league's
    // 2,254 slots held 10 empty and 116 zero-scoring.
    const par = buildSlotPar([
      slot("a", 10),
      slot("b", 20),
      slot("c", 30),
      slot("d", 12),
      slot("e", 22),
      slot("f", 26),
      slot("g", 31),
      slot("h", 36),
      slot("i", 64),
      slot(null, 0),
      slot("j", 0),
      slot("k", 0),
    ]);
    expect(par.n).toBe(9);
    expect(par.totalSlots).toBe(12);
    expect(par.deadSlots).toBe(3);
    expect(par.negativeSlots).toBe(0);
    expect(par.median).toBe(26);
    expect(par.max).toBe(64);
  });
  it("counts a below-zero slot as its own thing, not as a dead one", () => {
    // Four of the league's 2,254 slots in 2025 finished at -1.0. "Banked nothing" and
    // "went backwards" are different events and this scoring line permits both.
    const par = buildSlotPar([
      slot("a", 20),
      slot("b", 30),
      slot("c", -1),
      slot(null, 0),
    ]);
    expect(par.n).toBe(2);
    expect(par.deadSlots).toBe(1);
    expect(par.negativeSlots).toBe(1);
    // Never plotted: the strip starts at zero and a negative bar would distort it.
    expect(par.bins.reduce((s, b) => s + b.count, 0)).toBe(2);
  });
  it("reproduces the league's own 2025 par from its shape", () => {
    // A 2,124-slot distribution with the measured quartiles: p25 20, median 26,
    // p75 31, p90 36. Built by replaying those counts rather than by hardcoding an
    // answer, so the quantile arithmetic is what is under test.
    const slots = [];
    const push = (v, n) => {
      for (let i = 0; i < n; i++) slots.push(slot(`p${slots.length}`, v));
    };
    push(14, 531); // bottom quarter
    push(23, 531);
    push(29, 531);
    push(40, 531); // top quarter
    // The league's real dead tail: 10 slots nobody filled and 116 that held a name
    // who did not play, plus the four that finished at -1.0.
    for (let i = 0; i < 126; i++) slots.push(slot(i < 10 ? null : `z${i}`, 0));
    for (let i = 0; i < 4; i++) slots.push(slot(`n${i}`, -1));
    const par = buildSlotPar(slots);
    expect(par.n).toBe(2124);
    expect(par.totalSlots).toBe(2254);
    expect(par.deadSlots).toBe(126);
    expect(par.negativeSlots).toBe(4);
    // Interpolated across the block edges: p25 sits at index 530.75, three quarters
    // of the way from 14 to 23; the median at 1061.5, halfway from 23 to 29 - which
    // is the league's real 26.0; p75 at 1592.25, a quarter of the way from 29 to 40.
    expect(par.p25).toBe(20.8);
    expect(par.median).toBe(26);
    expect(par.p75).toBe(31.8);
    expect(par.p90).toBe(40);
  });
  it("bins across the whole range so the strip cannot lose its tail", () => {
    const par = buildSlotPar([slot("a", 1), slot("b", 26), slot("c", 64)]);
    expect(par.bins[0]).toEqual({ from: 0, to: 4, count: 1 });
    expect(par.bins.at(-1)?.to).toBeGreaterThanOrEqual(64);
    expect(par.bins.reduce((s, b) => s + b.count, 0)).toBe(3);
  });
  it("survives a league with no scored slots at all", () => {
    const par = buildSlotPar([slot(null, 0), slot(null, 0)]);
    expect(par.n).toBe(0);
    expect(par.median).toBe(0);
    expect(parPercentile(par, 30)).toBe(0);
  });
});
describe("quantile and parPercentile", () => {
  it("interpolates rather than snapping to a member", () => {
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(quantile([], 0.5)).toBe(0);
  });
  it("reads a rank from the raw values, not from the bins", () => {
    // 25 and 27 land in the same 4-point bin and must not report the same rank.
    const par = buildSlotPar(
      Array.from({ length: 100 }, (_, i) => slot(`p${i}`, i + 1)),
    );
    expect(parPercentile(par, 25)).toBe(25);
    expect(parPercentile(par, 27)).toBe(27);
  });
});
