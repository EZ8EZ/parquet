import { describe, expect, it } from "vitest";
import {
  MODEL,
  holdValue,
  nextGameDistribution,
  playProbability,
  playerModel,
  probLaterBeats,
  quantile,
  reservationValues,
  stoppingView,
} from "./model.js";

const row = (date, fp, sp = 1800, complete = true) => ({ date, fp, sp, complete, min: sp / 60 });
function log(n, f = (i) => 15 + (i % 7) * 3) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(row(`2026-01-${String(1 + (i % 28)).padStart(2, "0")}-${String(i).padStart(3, "0")}`, f(i)));
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

describe("nextGameDistribution", () => {
  it("falls back in three stated steps: league prior, thin, own shape", () => {
    expect(nextGameDistribution([], "2027-01-01")).toMatchObject({ n: 0, basis: "league-prior", mean: MODEL.leagueMean });
    const thin = nextGameDistribution(log(5), "2027-01-01");
    expect(thin.basis).toBe("thin");
    expect(thin.n).toBe(5);
    expect(thin.sd).toBeCloseTo(MODEL.leagueSd, 0);
    const own = nextGameDistribution(log(40), "2027-01-01");
    expect(own).toMatchObject({ basis: "own", n: 40, shapeN: 30 });
  });

  it("sees only completed played games before asOf", () => {
    const L = [row("2026-01-01", 10), row("2026-01-02", 50, 0), row("2026-01-03", 99, 1800, false), row("2026-01-05", 80)];
    const d = nextGameDistribution(L, "2026-01-04");
    expect(d.n).toBe(1);
    expect(d.mean).toBe(10);
  });

  it("weights recent games more (EWMA half-life 5)", () => {
    const L = log(20, (i) => (i < 15 ? 10 : 30));
    expect(nextGameDistribution(L, "2027-01-01").mean).toBeGreaterThan(20);
  });
});

describe("playProbability", () => {
  it("counts DNP rows, ignores rows not yet final, and shrinks toward 0.8", () => {
    const L = [row("2026-01-01", 10), row("2026-01-02", 0, 0), row("2026-01-03", 0, 0, false)];
    const q = playProbability(L, "2026-02-01");
    expect(q.nRows).toBe(2);
    expect(q.value).toBeCloseTo((1 + 8) / (2 + 10), 6);
  });
});

describe("stopping rule", () => {
  const m = playerModel(log(40), "2027-01-01");

  it("k=0 has no decision", () => {
    const v = stoppingView(m, 25, 0);
    expect(v.decision).toBe(false);
    expect(v.expectedIfHeld).toBeNull();
    expect(v.pLaterBeats).toBeNull();
    expect(holdValue(m, 0, true)).toBeNull();
    expect(probLaterBeats(m.dist.sample, 25, 0, 0.9)).toBeNull();
  });

  it("reservation value is non-decreasing in k for any play probability", () => {
    for (const q of [0.3, 0.6, 0.95, 1]) {
      const { r } = reservationValues(m.dist.sample, q, 6);
      for (let k = 2; k <= 6; k++) expect(r[k]).toBeGreaterThanOrEqual(r[k - 1] - 1e-9);
    }
  });

  it("a score above the top of the distribution has ~0 chance of being beaten", () => {
    const top = Math.max(...m.dist.sample);
    expect(probLaterBeats(m.dist.sample, top + 1, 4, m.q.value)).toBe(0);
    expect(stoppingView(m, top + 1, 3).pLaterBeats).toBe(0);
  });

  it("P(a later game beats x) grows with k and the ruled-out branch is never above the plays branch", () => {
    const x = quantile(m.dist.sample, 0.5);
    expect(probLaterBeats(m.dist.sample, x, 3, 0.9)).toBeGreaterThan(probLaterBeats(m.dist.sample, x, 1, 0.9));
    for (let k = 1; k <= 5; k++) expect(holdValue(m, k, false)).toBeLessThanOrEqual(holdValue(m, k, true) + 1e-9);
  });

  it("reports the 10th-90th range and the n it rests on", () => {
    const v = stoppingView(m, 20, 2, true);
    expect(v.range.p10).toBeLessThan(v.range.p90);
    expect(v.n).toBe(40);
    expect(v.q.nRows).toBe(40);
  });
});
