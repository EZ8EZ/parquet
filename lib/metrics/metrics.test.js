import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import {
  coherenceOf,
  durationOf,
  findTimelineBreak,
  getTimelineProfile,
  leagueTimelines,
  pickDuration,
  playerDuration,
  shortnessPercentile,
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
    const p = getTimelineProfile(h, h.me.rosterId);
    const manual =
      p.assets.reduce((s, a) => s + a.value * a.duration, 0) / p.totalValue;
    expect(p.rosterDuration).toBeCloseTo(Math.round(manual * 100) / 100, 2);
  });
  it("nowShare and laterShare are shares of value, never over 1", () => {
    const p = getTimelineProfile(h, h.me.rosterId);
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
    const tci = (xs) => {
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
    const tci = (ds) => {
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
  it("never counts a roster as shorter-dated than itself", () => {
    // `leagueDurations` is built from the ROUNDED `rosterDuration` while `classify` is
    // called with the unrounded one, so a roster whose duration rounded up used to land
    // in its own numerator while the denominator excluded it - inflating it by exactly
    // 1/(n-1). Pinned on the shape that reproduces it: a value that rounds up sitting in
    // a league that contains its own rounded self.
    const league = [4.09, 4.13, 4.54, 5.07, 5.26];
    // 4.538767 rounds to 4.54, which is its own entry. Two rosters are longer-dated,
    // out of the four that are not it: 0.5, not the 0.75 self-counting produced.
    expect(shortnessPercentile(4.538767, league)).toBeCloseTo(2 / 4, 10);
    // The longest-dated roster in the league is shorter-dated than nobody.
    expect(shortnessPercentile(5.257667, league)).toBe(0);
    // And the shortest is shorter-dated than all four of the others.
    expect(shortnessPercentile(4.086926, league)).toBeCloseTo(1, 10);
  });
  it("orders the whole live league without any roster inflating itself", () => {
    // The cross-roster form of the same invariant: shortness must fall monotonically as
    // duration rises, which a self-counting numerator breaks for exactly the rosters
    // that round up.
    const all = leagueTimelines(h);
    const durations = all.map((p) => p.rosterDuration);
    const sorted = [...all].sort((a, b) => a.rosterDuration - b.rosterDuration);
    let prev = Infinity;
    for (const p of sorted) {
      const pct = shortnessPercentile(p.rosterDuration, durations);
      expect(pct).toBeLessThanOrEqual(prev);
      expect(pct).toBeLessThanOrEqual(1);
      prev = pct;
    }
  });
  it("is deterministic", () => {
    const a = getTimelineProfile(h, h.me.rosterId);
    const b = getTimelineProfile(h, h.me.rosterId);
    expect(a.tci).toBe(b.tci);
    expect(a.rosterDuration).toBe(b.rosterDuration);
  });
  it("carries a timelineBreak field (object or null) for every real roster", () => {
    for (const r of h.rosters) {
      const p = getTimelineProfile(h, r.rosterId);
      if (p.timelineBreak === null) continue;
      expect(p.timelineBreak.delta).toBeGreaterThanOrEqual(1);
      expect(typeof p.timelineBreak.label === "string" || p.timelineBreak.label === null).toBe(true);
      // Read must actually mention the break when one exists.
      expect(p.read).toContain("does not fit that story");
    }
  });
});
describe("findTimelineBreak", () => {
  it("returns null with fewer than two assets", () => {
    expect(findTimelineBreak([], 100)).toBeNull();
    expect(findTimelineBreak([{ id: "a", value: 100, duration: 3 }], 100)).toBeNull();
  });
  it("returns null when every asset agrees exactly - dispersion already 0, nothing to improve", () => {
    const assets = [
      { id: "a", label: "A", value: 100, duration: 4 },
      { id: "b", label: "B", value: 100, duration: 4 },
      { id: "c", label: "C", value: 100, duration: 4 },
    ];
    const tci = coherenceOf(assets).tci;
    expect(tci).toBe(100);
    expect(findTimelineBreak(assets, tci)).toBeNull();
  });
  it("names the one asset dragging an otherwise-coherent core off its plan", () => {
    // A young core clustered near duration 4.8, plus one large-value asset sitting
    // alone at duration 2 - the real "Anthony Davis on a Cunningham/Barnes/Amen
    // Thompson core" shape found on the live league (roster 7, TCI 61->73).
    const assets = [
      { id: "core1", label: "Core One", value: 7000, duration: 4.8 },
      { id: "core2", label: "Core Two", value: 6000, duration: 4.9 },
      { id: "core3", label: "Core Three", value: 5000, duration: 4.6 },
      { id: "outlier", label: "Outlier", value: 4000, duration: 2.0 },
    ];
    const tci = coherenceOf(assets).tci;
    const b = findTimelineBreak(assets, tci);
    expect(b).not.toBeNull();
    expect(b.id).toBe("outlier");
    expect(b.delta).toBeGreaterThan(0);
  });
  it("ignores a low-value asset when its distance is not extreme enough to matter", () => {
    // A $10 rookie pick six seasons out is farther from the mean than anything
    // else here, but it carries so little value that removing it cannot lift TCI
    // past the materiality floor - distance alone must not win over value * distance.
    // (A far enough duration - see the next test - eventually does; this is the
    // boundary that proves the floor is doing real work rather than never firing.)
    const assets = [
      { id: "core1", label: "Core One", value: 5000, duration: 4 },
      { id: "core2", label: "Core Two", value: 5000, duration: 4.1 },
      { id: "core3", label: "Core Three", value: 5000, duration: 3.9 },
      { id: "farpick", label: "Far Pick", value: 10, duration: 6 },
    ];
    const tci = coherenceOf(assets).tci;
    expect(findTimelineBreak(assets, tci)).toBeNull();
  });
  it("but a low-value asset far enough out can still clear the floor - product, not distance alone, decides", () => {
    const assets = [
      { id: "core1", label: "Core One", value: 5000, duration: 4 },
      { id: "core2", label: "Core Two", value: 5000, duration: 4.1 },
      { id: "core3", label: "Core Three", value: 5000, duration: 3.9 },
      { id: "farpick", label: "Far Pick", value: 10, duration: 10 },
    ];
    const tci = coherenceOf(assets).tci;
    const b = findTimelineBreak(assets, tci);
    expect(b).not.toBeNull();
    expect(b.id).toBe("farpick");
  });
  it("floors materiality at BREAK_MIN_DELTA rather than naming a trivial 0-1 point gain", () => {
    // Four tightly clustered assets: removing any one of them can only nudge
    // dispersion by rounding-level noise, never a full point.
    const assets = [
      { id: "a", label: "A", value: 1000, duration: 4.0 },
      { id: "b", label: "B", value: 1000, duration: 4.05 },
      { id: "c", label: "C", value: 1000, duration: 3.95 },
      { id: "d", label: "D", value: 1000, duration: 4.02 },
    ];
    const tci = coherenceOf(assets).tci;
    expect(findTimelineBreak(assets, tci)).toBeNull();
  });
  it("breaks a value tie on larger value, then on id, deterministically", () => {
    // Two equally-distant, equally-valuable assets on opposite sides of the mean
    // improve TCI by the identical amount when either is removed; the tie-break
    // must pick one and the same one every run.
    const assets = [
      { id: "z-high", label: "Z High", value: 1000, duration: 8 },
      { id: "a-low", label: "A Low", value: 1000, duration: 0 },
      { id: "mid1", label: "Mid 1", value: 3000, duration: 4 },
      { id: "mid2", label: "Mid 2", value: 3000, duration: 4 },
    ];
    const tci = coherenceOf(assets).tci;
    const b1 = findTimelineBreak(assets, tci);
    const b2 = findTimelineBreak([...assets].reverse(), tci);
    expect(b1).not.toBeNull();
    // Order-independent: reversing the input array cannot change the winner.
    expect(b1.id).toBe(b2.id);
  });
  it("is exactly what getTimelineProfile publishes, for every roster in the league", () => {
    for (const r of h.rosters) {
      const p = getTimelineProfile(h, r.rosterId);
      const manual = findTimelineBreak(p.assets, p.tci);
      expect(manual).toEqual(p.timelineBreak);
    }
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
      expect(Math.round(c.rosterDuration * 100) / 100).toBe(
        profile.rosterDuration,
      );
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
