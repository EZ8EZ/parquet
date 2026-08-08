import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import {
  coherenceOf,
  durationOf,
  getTimelineProfile,
  leagueTimelines,
  pickDuration,
  playerDuration,
} from "./duration";

const h = buildFixtureHistory();

describe("durationOf (Macaulay construction)", () => {
  it("is 0 when all value arrives immediately", () => {
    expect(durationOf([1, 0, 0, 0])).toBe(0);
  });

  it("equals the period when all value arrives at one future point", () => {
    expect(durationOf([0, 0, 0, 1])).toBe(3);
  });

  it("is the midpoint for a flat payout stream", () => {
    // t = 0..3 with equal weight -> mean 1.5
    expect(durationOf([1, 1, 1, 1])).toBeCloseTo(1.5, 6);
  });

  it("is 0 rather than NaN for an empty stream", () => {
    expect(durationOf([])).toBe(0);
    expect(durationOf([0, 0])).toBe(0);
  });
});

describe("playerDuration", () => {
  it("is longer for younger players", () => {
    expect(playerDuration(20)).toBeGreaterThan(playerDuration(27));
    expect(playerDuration(27)).toBeGreaterThan(playerDuration(34));
  });

  it("decreases monotonically with age", () => {
    const ages = [19, 22, 25, 28, 31, 34, 37];
    const ds = ages.map((a) => playerDuration(a));
    for (let i = 1; i < ds.length; i++) {
      expect(ds[i]).toBeLessThanOrEqual(ds[i - 1]);
    }
  });

  it("handles unknown age without throwing", () => {
    expect(playerDuration(null)).toBeGreaterThan(0);
  });
});

describe("pickDuration", () => {
  it("adds the wait to the rookie's own duration", () => {
    const rookie = playerDuration(19);
    expect(pickDuration(0)).toBeCloseTo(rookie, 6);
    expect(pickDuration(3)).toBeCloseTo(rookie + 3, 6);
  });

  it("makes any pick longer-dated than a prime-age player", () => {
    expect(pickDuration(0)).toBeGreaterThan(playerDuration(27));
  });
});

describe("Timeline Coherence Index", () => {
  it("produces a coherent profile for every roster", () => {
    for (const r of h.rosters) {
      const p = getTimelineProfile(h, r.rosterId);
      expect(p.tci).toBeGreaterThanOrEqual(0);
      expect(p.tci).toBeLessThanOrEqual(100);
      expect(p.rosterDuration).toBeGreaterThan(0);
      expect(p.read.length).toBeGreaterThan(0);
      expect(["contending", "ascending", "rebuilding", "straddling"]).toContain(
        p.posture,
      );
    }
  });

  it("weights duration by value, not by asset count", () => {
    const p = getTimelineProfile(h, h.me.rosterId!);
    const manual =
      p.assets.reduce((s, a) => s + a.value * a.duration, 0) / p.totalValue;
    expect(p.rosterDuration).toBeCloseTo(Math.round(manual * 100) / 100, 2);
  });

  it("nowShare and laterShare are shares of value, never over 1", () => {
    const p = getTimelineProfile(h, h.me.rosterId!);
    expect(p.nowShare).toBeGreaterThanOrEqual(0);
    expect(p.laterShare).toBeGreaterThanOrEqual(0);
    expect(p.nowShare + p.laterShare).toBeLessThanOrEqual(1.0001);
  });

  /**
   * The point of the metric: a roster split between "wins now" and "wins in 2030"
   * must score WORSE on coherence than one whose assets share a timeline, even if the
   * two hold identical total value.
   */
  it("scores a straddled roster below a focused one at equal total value", () => {
    const focused = [
      { d: 5.0, v: 1000 },
      { d: 5.2, v: 1000 },
      { d: 4.8, v: 1000 },
    ];
    const straddled = [
      { d: 0.4, v: 1000 },
      { d: 0.6, v: 1000 },
      { d: 9.0, v: 1000 },
    ];
    const tci = (xs: { d: number; v: number }[]) => {
      const tv = xs.reduce((s, x) => s + x.v, 0);
      const mean = xs.reduce((s, x) => s + x.v * x.d, 0) / tv;
      const sigma = Math.sqrt(
        xs.reduce((s, x) => s + x.v * (x.d - mean) ** 2, 0) / tv,
      );
      return 100 * (1 - Math.min(1, sigma / 4));
    };
    expect(tci(focused)).toBeGreaterThan(tci(straddled));
    expect(tci(focused)).toBeGreaterThan(90);
  });

  it("is direction-free: a coherent rebuild and a coherent contender both score well", () => {
    const tci = (ds: number[]) => {
      const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
      const sigma = Math.sqrt(
        ds.reduce((s, d) => s + (d - mean) ** 2, 0) / ds.length,
      );
      return 100 * (1 - Math.min(1, sigma / 4));
    };
    // All-veteran roster and all-young roster are both internally consistent.
    expect(tci([0.5, 0.7, 0.6])).toBeGreaterThan(90);
    expect(tci([7.5, 7.8, 7.2])).toBeGreaterThan(90);
  });

  it("ranks the whole league without throwing", () => {
    const all = leagueTimelines(h);
    expect(all).toHaveLength(h.rosters.length);
    for (let i = 1; i < all.length; i++) {
      expect(all[i].tci).toBeLessThanOrEqual(all[i - 1].tci);
    }
  });

  it("is deterministic", () => {
    const a = getTimelineProfile(h, h.me.rosterId!);
    const b = getTimelineProfile(h, h.me.rosterId!);
    expect(a.tci).toBe(b.tci);
    expect(a.rosterDuration).toBe(b.rosterDuration);
  });
});

describe("coherenceOf", () => {
  it("is exactly what getTimelineProfile publishes, for every roster in the league", () => {
    // The Lab's counterfactual scores a HYPOTHETICAL roster on this function. If it
    // ever stopped agreeing with the real profile, the two numbers shown side by side
    // would be on different scales - which is the one thing that comparison cannot
    // survive. Pinned here rather than assumed from the refactor.
    for (const r of h.rosters) {
      const profile = getTimelineProfile(h, r.rosterId);
      const c = coherenceOf(profile.assets);
      expect(c.tci).toBe(profile.tci);
      expect(Math.round(c.rosterDuration * 100) / 100).toBe(profile.rosterDuration);
      expect(Math.round(c.dispersion * 100) / 100).toBe(profile.dispersion);
      expect(c.totalValue).toBe(profile.totalValue);
    }
  });

  it("reads an empty bag as zero rather than dividing by it", () => {
    expect(coherenceOf([])).toEqual({
      rosterDuration: 0,
      dispersion: 0,
      tci: 0,
      totalValue: 0,
    });
  });

  it("scores a set that agrees about its own timeline above one that does not", () => {
    const tight = coherenceOf([
      { value: 100, duration: 4 },
      { value: 100, duration: 4.2 },
    ]);
    const split = coherenceOf([
      { value: 100, duration: 1.2 },
      { value: 100, duration: 7.4 },
    ]);
    expect(tight.tci).toBeGreaterThan(split.tci);
    expect(split.tci).toBe(0);
  });
});
