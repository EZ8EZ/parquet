import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import type { AssetDuration, TimelineProfile } from "./duration";
import {
  MIN_ASSETS_FOR_WINDOW,
  leagueWindows,
  overlapFor,
  weightedQuantile,
  windowLabel,
  windowOf,
  windowSynthesis,
  windowThesis,
  windowsByRoster,
  type ValueWindow,
} from "./window";

const h = buildFixtureHistory();
const NOW = h.currentSeasonYear;

/** A dated asset. Only `value` and `duration` matter to this module. */
function asset(duration: number, value: number, i = 0): AssetDuration {
  return { id: `a${duration}-${value}-${i}`, label: `A${i}`, kind: "player", value, duration };
}

function profile(over: Partial<TimelineProfile> = {}): TimelineProfile {
  return {
    rosterId: 1,
    teamName: "Test",
    ownerName: "Tester",
    rosterDuration: 3,
    dispersion: 1,
    tci: 70,
    totalValue: 100,
    nowShare: 0.1,
    laterShare: 0.4,
    posture: "ascending",
    read: "",
    assets: [],
    ...over,
  };
}

function win(over: Partial<ValueWindow> = {}): ValueWindow {
  return {
    rosterId: 1,
    teamName: null,
    ownerName: "x",
    isMe: false,
    assetCount: 10,
    state: "window",
    openOffset: 1,
    peakOffset: 2,
    closeOffset: 3,
    open: NOW + 1,
    peak: NOW + 2,
    close: NOW + 3,
    tci: 70,
    posture: "ascending",
    rosterDuration: 2,
    ...over,
  };
}

describe("weightedQuantile", () => {
  it("returns the duration at which the quantile of VALUE has arrived, not of count", () => {
    // Nine cheap short assets and one enormous long one: by count the median is 1,
    // by value it is 9, and value is what a window is about.
    const assets = [
      ...Array.from({ length: 9 }, (_, i) => asset(1, 1, i)),
      asset(9, 1000, 99),
    ];
    expect(weightedQuantile(assets, 0.5)).toBe(9);
    expect(weightedQuantile(assets, 0.25)).toBe(9);
  });

  it("is invariant to the order assets arrive in", () => {
    const a = [asset(1, 10, 1), asset(5, 10, 2), asset(3, 10, 3)];
    const b = [asset(3, 10, 3), asset(1, 10, 1), asset(5, 10, 2)];
    for (const q of [0.25, 0.5, 0.75]) {
      expect(weightedQuantile(a, q)).toBe(weightedQuantile(b, q));
    }
  });

  it("lands on the asset that completes a clean half rather than the next one", () => {
    // Two equal assets: the 50th percentile is reached exactly by the first.
    expect(weightedQuantile([asset(2, 50, 1), asset(6, 50, 2)], 0.5)).toBe(2);
  });

  it("ignores zero and negative value, and returns null when nothing is left", () => {
    expect(weightedQuantile([asset(1, 0, 1), asset(4, 8, 2)], 0.5)).toBe(4);
    expect(weightedQuantile([], 0.5)).toBeNull();
    expect(weightedQuantile([asset(1, 0, 1)], 0.5)).toBeNull();
  });
});

describe("windowOf", () => {
  it("reads open, peak and close off the value-weighted quartiles", () => {
    const assets = [
      asset(0, 25, 1),
      asset(2, 25, 2),
      asset(4, 25, 3),
      asset(6, 25, 4),
    ];
    const w = windowOf(profile({ assets }), assets, NOW, false);
    expect(w.state).toBe("window");
    expect(w.openOffset).toBe(0);
    expect(w.peakOffset).toBe(2);
    expect(w.closeOffset).toBe(4);
    expect(w.open).toBe(NOW);
    expect(w.peak).toBe(NOW + 2);
    expect(w.close).toBe(NOW + 4);
  });

  it("rounds offsets to whole seasons", () => {
    const assets = [asset(1.4, 10, 1), asset(2.6, 10, 2), asset(3.5, 10, 3)];
    const w = windowOf(profile({ assets }), assets, NOW, false);
    expect(w.open).toBe(NOW + 1);
    expect(w.peak).toBe(NOW + 3);
    expect(w.close).toBe(NOW + 4);
  });

  // ------------------------------------------------------------ the straddling case
  it("refuses to call a straddled roster's span a window", () => {
    // Two lumps with a hole between them - the canonical straddle. The quartiles are
    // still real, but the seasons in the middle are a hole, not a peak.
    const assets = [
      asset(0.5, 30, 1),
      asset(0.8, 30, 2),
      asset(7, 30, 3),
      asset(7.5, 30, 4),
    ];
    const w = windowOf(profile({ assets, posture: "straddling", tci: 40 }), assets, NOW, false);
    expect(w.state).toBe("split");
    // The ends survive - "their value runs from here to here" is true.
    expect(w.open).toBe(NOW + 1);
    expect(w.close).toBe(NOW + 7);
    expect(w.assetCount).toBe(4);
  });

  it("gives a split roster no thesis and no place in anyone's overlap", () => {
    const me = win({ rosterId: 1, open: NOW + 2, peak: NOW + 3, close: NOW + 4 });
    const split = win({ rosterId: 2, state: "split", posture: "straddling" });
    expect(windowThesis(me, split)).toBeNull();
    expect(windowThesis(split, me)).toBeNull();
    const o = overlapFor(me, [me, split])!;
    expect(o.unresolved).toEqual([2]);
    expect(o.shared).toEqual([]);
    expect(o.earlier).toEqual([]);
    expect(o.later).toEqual([]);
  });

  // -------------------------------------------------------- the too-few-assets case
  it("is unreadable below three valued assets, where the quartiles cannot separate", () => {
    for (const n of [0, 1, 2]) {
      const assets = Array.from({ length: n }, (_, i) => asset(i + 1, 100, i));
      const w = windowOf(profile({ assets }), assets, NOW, false);
      expect(w.state).toBe("unreadable");
      expect(w.open).toBeNull();
      expect(w.peak).toBeNull();
      expect(w.close).toBeNull();
      expect(w.assetCount).toBe(n);
    }
    expect(MIN_ASSETS_FOR_WINDOW).toBe(3);
  });

  it("counts only valued assets toward the floor, so a bench of zeroes does not qualify", () => {
    const assets = [asset(1, 10, 1), asset(2, 10, 2), asset(3, 0, 3), asset(4, 0, 4)];
    expect(windowOf(profile({ assets }), assets, NOW, false).state).toBe("unreadable");
  });

  it("becomes readable at exactly three", () => {
    const assets = [asset(1, 10, 1), asset(2, 10, 2), asset(3, 10, 3)];
    expect(windowOf(profile({ assets }), assets, NOW, false).state).toBe("window");
  });

  it("takes posture from the profile rather than recomputing it", () => {
    const assets = [asset(1, 10, 1), asset(2, 10, 2), asset(3, 10, 3)];
    const w = windowOf(profile({ assets, posture: "rebuilding", tci: 88 }), assets, NOW, false);
    expect(w.posture).toBe("rebuilding");
    expect(w.tci).toBe(88);
  });
});

describe("overlapFor", () => {
  const me = win({ rosterId: 1, open: NOW + 2, peak: NOW + 3, close: NOW + 4, isMe: true });

  it("counts a roster sharing any season as shared, including a single-season touch", () => {
    const touching = win({ rosterId: 2, open: NOW + 4, peak: NOW + 5, close: NOW + 6 });
    expect(overlapFor(me, [me, touching])!.shared).toEqual([2]);
  });

  it("separates earlier and later, and never both", () => {
    const before = win({ rosterId: 2, open: NOW, peak: NOW, close: NOW + 1 });
    const after = win({ rosterId: 3, open: NOW + 5, peak: NOW + 6, close: NOW + 7 });
    const o = overlapFor(me, [me, before, after])!;
    expect(o.earlier).toEqual([2]);
    expect(o.later).toEqual([3]);
    expect(o.shared).toEqual([]);
  });

  it("counts a shared peak season separately from a shared window", () => {
    const samePeak = win({ rosterId: 2, open: NOW + 1, peak: NOW + 3, close: NOW + 5 });
    const sharedOnly = win({ rosterId: 3, open: NOW + 4, peak: NOW + 6, close: NOW + 7 });
    const o = overlapFor(me, [me, samePeak, sharedOnly])!;
    expect(o.shared).toEqual([2, 3]);
    expect(o.samePeak).toEqual([2]);
  });

  it("never places the viewer against themselves", () => {
    const o = overlapFor(me, [me])!;
    expect([...o.shared, ...o.earlier, ...o.later, ...o.unresolved]).toEqual([]);
  });

  it("returns null when the viewer has no window of their own to compare", () => {
    expect(overlapFor(win({ state: "split" }), [])).toBeNull();
    expect(overlapFor(win({ state: "unreadable", open: null, close: null }), [])).toBeNull();
  });
});

describe("windowThesis", () => {
  const me = win({ rosterId: 1, open: NOW + 2, peak: NOW + 3, close: NOW + 4 });

  it("names the shared seasons when two windows overlap", () => {
    const rival = win({ rosterId: 2, open: NOW + 3, peak: NOW + 4, close: NOW + 5 });
    expect(windowThesis(me, rival)).toContain("overlaps yours");
  });

  it("says so when both peak in the same season", () => {
    const twin = win({ rosterId: 2, open: NOW + 1, peak: NOW + 3, close: NOW + 5 });
    expect(windowThesis(me, twin)).toContain("the same season yours is");
  });

  it("states an earlier roster as arithmetic, never as intent", () => {
    const early = win({ rosterId: 2, open: NOW, peak: NOW, close: NOW + 1 });
    const t = windowThesis(me, early)!;
    expect(t).toContain("entirely before yours begins");
    // D19: the app cannot see intent, so it does not claim any.
    expect(t).not.toMatch(/will (sell|be selling|trade)/i);
    expect(t).not.toMatch(/should/i);
  });

  it("grades nobody (D6)", () => {
    const rival = win({ rosterId: 2, open: NOW + 3, peak: NOW + 4, close: NOW + 5 });
    const early = win({ rosterId: 3, open: NOW, peak: NOW, close: NOW + 1 });
    for (const t of [windowThesis(me, rival)!, windowThesis(me, early)!]) {
      expect(t).not.toMatch(/\b(good|bad|better|worse|best|worst|weak|strong)\b/i);
    }
  });
});

describe("windowSynthesis", () => {
  it("counts the league against the viewer's window", () => {
    const me = win({ rosterId: 1, isMe: true, open: NOW + 2, peak: NOW + 3, close: NOW + 4 });
    const rows = [
      me,
      win({ rosterId: 2, open: NOW + 3, peak: NOW + 3, close: NOW + 5 }),
      win({ rosterId: 3, open: NOW, peak: NOW, close: NOW + 1 }),
      win({ rosterId: 4, state: "split" }),
    ];
    const s = windowSynthesis({
      currentSeason: NOW,
      first: NOW,
      last: NOW + 5,
      rows,
      me,
      overlap: overlapFor(me, rows),
    })!;
    expect(s).toContain(`middle half of your value is dated ${NOW + 2}-${NOW + 4}`);
    expect(s).toContain("1 roster overlaps that");
    expect(s).toContain(`1 of them heaviest in ${NOW + 3}`);
    expect(s).toContain("1 roster is dated entirely before you");
    expect(s).toContain("1 roster has no single span");
    // The axis is an ordering inside a compressed band, and the copy has to say so
    // rather than leaving a count that fires on most of the league reading as a
    // finding about a named season. See components/WindowMap.tsx.
    expect(s).toContain("overlapping is the ordinary case");
  });

  it("says the spread is a spread when the viewer straddles", () => {
    const me = win({ rosterId: 1, isMe: true, state: "split" });
    const s = windowSynthesis({
      currentSeason: NOW,
      first: NOW,
      last: NOW + 5,
      rows: [me],
      me,
      overlap: null,
    })!;
    expect(s).toContain("do not agree about when your value arrives");
    expect(s).toContain("rather than a single span");
  });

  it("says there is nothing to line up when the viewer has too few assets", () => {
    const me = win({ rosterId: 1, isMe: true, state: "unreadable", open: null, peak: null, close: null });
    const s = windowSynthesis({
      currentSeason: NOW,
      first: NOW,
      last: NOW,
      rows: [me],
      me,
      overlap: null,
    })!;
    expect(s).toContain("Too few valued assets");
  });
});

describe("windowLabel", () => {
  it("collapses a one-season window", () => {
    expect(windowLabel(win({ open: NOW + 1, close: NOW + 1 }))).toBe(`${NOW + 1}`);
  });
  it("says so when there is no window", () => {
    expect(windowLabel(win({ state: "unreadable", open: null, close: null }))).toBe("no window");
  });
});

describe("leagueWindows on the real league", () => {
  const map = leagueWindows(h);

  it("places every roster", () => {
    expect(map.rows).toHaveLength(h.rosters.length);
    expect(new Set(map.rows.map((r) => r.rosterId)).size).toBe(h.rosters.length);
  });

  it("agrees with leagueTimelines about posture, which is the relative one", () => {
    const straddlers = map.rows.filter((r) => r.posture === "straddling");
    for (const r of straddlers) expect(r.state).toBe("split");
    for (const r of map.rows.filter((r) => r.state === "window"))
      expect(r.posture).not.toBe("straddling");
  });

  it("keeps open <= peak <= close for every readable roster", () => {
    for (const r of map.rows) {
      if (r.open == null) continue;
      expect(r.open).toBeLessThanOrEqual(r.peak!);
      expect(r.peak).toBeLessThanOrEqual(r.close!);
    }
  });

  it("never dates a window before the current season", () => {
    for (const r of map.rows) {
      if (r.open != null) expect(r.open).toBeGreaterThanOrEqual(map.currentSeason);
    }
  });

  it("spans an axis that contains every window it drew", () => {
    for (const r of map.rows) {
      if (r.open == null) continue;
      expect(r.open).toBeGreaterThanOrEqual(map.first);
      expect(r.close!).toBeLessThanOrEqual(map.last);
    }
  });

  it("sorts earliest peak first, with unreadable rosters last", () => {
    const peaks = map.rows.map((r) => r.peakOffset);
    const dated = peaks.filter((p): p is number => p != null);
    expect(dated).toEqual([...dated].sort((a, b) => a - b));
    expect(peaks.slice(dated.length).every((p) => p == null)).toBe(true);
  });

  it("identifies the viewer and gives them an overlap reading", () => {
    expect(map.me?.rosterId).toBe(h.me.rosterId);
    // The fixture viewer is coherent, so the overlap arithmetic is available.
    expect(map.overlap).not.toBeNull();
    const o = map.overlap!;
    const placed = o.shared.length + o.earlier.length + o.later.length + o.unresolved.length;
    expect(placed).toBe(map.rows.length - 1);
  });

  it("is a pure read of the same numbers - two calls agree exactly", () => {
    expect(leagueWindows(h)).toEqual(map);
  });

  it("keyed by roster is the same derivation", () => {
    const byRoster = windowsByRoster(h);
    for (const r of map.rows) expect(byRoster.get(r.rosterId)).toEqual(r);
  });

  it("has exactly one single-roster entry point, and it is the agreeing one", () => {
    // `windowForRoster` was deleted (SHELVED S4): zero production callers, and its one
    // distinguishing behaviour was carrying the ABSOLUTE posture fallback, so it
    // disagreed with the function every page uses on 6 of 14 live rosters. This pins
    // the replacement contract - a caller holding one roster goes through
    // `windowsByRoster`, which is the same derivation and therefore cannot diverge.
    const r = map.rows[0];
    expect(windowsByRoster(h).get(r.rosterId)).toEqual(r);
  });
});
