import { describe, expect, it } from "vitest";
import { REFUSAL_CODE_LIST } from "../refusal.js";
import { buildFixtureHistory } from "../testing/fixtureHistory.js";
import {
  MIN_ASSETS_FOR_WINDOW,
  leagueWindows,
  overlapFor,
  weightedQuantile,
  windowLabel,
  windowOf,
  windowRefusalCode,
  windowRefusalSummary,
  windowShort,
  windowSynthesis,
  windowThesis,
  windowsByRoster,
} from "./window.js";
const h = buildFixtureHistory();
const NOW = h.currentSeasonYear;
/** A dated asset. Only `value` and `duration` matter to this module. */
function asset(duration, value, i = 0) {
  return {
    id: `a${duration}-${value}-${i}`,
    label: `A${i}`,
    kind: "player",
    value,
    duration,
  };
}
function profile(over = {}) {
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
function win(over = {}) {
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
    const w = windowOf(
      profile({ assets, posture: "straddling", tci: 40 }),
      assets,
      NOW,
      false,
    );
    expect(w.state).toBe("split");
    // The ends survive - "their value runs from here to here" is true.
    expect(w.open).toBe(NOW + 1);
    expect(w.close).toBe(NOW + 7);
    expect(w.assetCount).toBe(4);
  });
  it("gives a split roster no thesis and no place in anyone's overlap", () => {
    const me = win({
      rosterId: 1,
      open: NOW + 2,
      peak: NOW + 3,
      close: NOW + 4,
    });
    const split = win({ rosterId: 2, state: "split", posture: "straddling" });
    expect(windowThesis(me, split)).toBeNull();
    expect(windowThesis(split, me)).toBeNull();
    const o = overlapFor(me, [me, split]);
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
    const assets = [
      asset(1, 10, 1),
      asset(2, 10, 2),
      asset(3, 0, 3),
      asset(4, 0, 4),
    ];
    expect(windowOf(profile({ assets }), assets, NOW, false).state).toBe(
      "unreadable",
    );
  });
  it("becomes readable at exactly three", () => {
    const assets = [asset(1, 10, 1), asset(2, 10, 2), asset(3, 10, 3)];
    expect(windowOf(profile({ assets }), assets, NOW, false).state).toBe(
      "window",
    );
  });
  it("takes posture from the profile rather than recomputing it", () => {
    const assets = [asset(1, 10, 1), asset(2, 10, 2), asset(3, 10, 3)];
    const w = windowOf(
      profile({ assets, posture: "rebuilding", tci: 88 }),
      assets,
      NOW,
      false,
    );
    expect(w.posture).toBe("rebuilding");
    expect(w.tci).toBe(88);
  });
});
describe("overlapFor", () => {
  const me = win({
    rosterId: 1,
    open: NOW + 2,
    peak: NOW + 3,
    close: NOW + 4,
    isMe: true,
  });
  it("counts a roster sharing any season as shared, including a single-season touch", () => {
    const touching = win({
      rosterId: 2,
      open: NOW + 4,
      peak: NOW + 5,
      close: NOW + 6,
    });
    expect(overlapFor(me, [me, touching]).shared).toEqual([2]);
  });
  it("separates earlier and later, and never both", () => {
    const before = win({ rosterId: 2, open: NOW, peak: NOW, close: NOW + 1 });
    const after = win({
      rosterId: 3,
      open: NOW + 5,
      peak: NOW + 6,
      close: NOW + 7,
    });
    const o = overlapFor(me, [me, before, after]);
    expect(o.earlier).toEqual([2]);
    expect(o.later).toEqual([3]);
    expect(o.shared).toEqual([]);
  });
  it("counts a shared peak season separately from a shared window", () => {
    const samePeak = win({
      rosterId: 2,
      open: NOW + 1,
      peak: NOW + 3,
      close: NOW + 5,
    });
    const sharedOnly = win({
      rosterId: 3,
      open: NOW + 4,
      peak: NOW + 6,
      close: NOW + 7,
    });
    const o = overlapFor(me, [me, samePeak, sharedOnly]);
    expect(o.shared).toEqual([2, 3]);
    expect(o.samePeak).toEqual([2]);
  });
  it("never places the viewer against themselves", () => {
    const o = overlapFor(me, [me]);
    expect([...o.shared, ...o.earlier, ...o.later, ...o.unresolved]).toEqual(
      [],
    );
  });
  it("returns null when the viewer has no window of their own to compare", () => {
    expect(overlapFor(win({ state: "split" }), [])).toBeNull();
    expect(
      overlapFor(win({ state: "unreadable", open: null, close: null }), []),
    ).toBeNull();
  });
});
describe("windowThesis", () => {
  const me = win({ rosterId: 1, open: NOW + 2, peak: NOW + 3, close: NOW + 4 });
  it("names the shared seasons when two windows overlap", () => {
    const rival = win({
      rosterId: 2,
      open: NOW + 3,
      peak: NOW + 4,
      close: NOW + 5,
    });
    expect(windowThesis(me, rival)).toContain("overlaps yours");
  });
  it("says so when both peak in the same season", () => {
    const twin = win({
      rosterId: 2,
      open: NOW + 1,
      peak: NOW + 3,
      close: NOW + 5,
    });
    expect(windowThesis(me, twin)).toContain("the same season yours is");
  });
  it("states an earlier roster as arithmetic, never as intent", () => {
    const early = win({ rosterId: 2, open: NOW, peak: NOW, close: NOW + 1 });
    const t = windowThesis(me, early);
    expect(t).toContain("entirely before yours begins");
    // D19: the app cannot see intent, so it does not claim any.
    expect(t).not.toMatch(/will (sell|be selling|trade)/i);
    expect(t).not.toMatch(/should/i);
  });
  it("grades nobody (D6)", () => {
    const rival = win({
      rosterId: 2,
      open: NOW + 3,
      peak: NOW + 4,
      close: NOW + 5,
    });
    const early = win({ rosterId: 3, open: NOW, peak: NOW, close: NOW + 1 });
    for (const t of [windowThesis(me, rival), windowThesis(me, early)]) {
      expect(t).not.toMatch(
        /\b(good|bad|better|worse|best|worst|weak|strong)\b/i,
      );
    }
  });
});
describe("windowSynthesis", () => {
  it("counts the league against the viewer's window", () => {
    const me = win({
      rosterId: 1,
      isMe: true,
      open: NOW + 2,
      peak: NOW + 3,
      close: NOW + 4,
    });
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
    });
    expect(s).toContain(
      `middle half of your value is dated ${NOW + 2}-${NOW + 4}`,
    );
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
    });
    expect(s).toContain("do not agree about when your value arrives");
    expect(s).toContain("rather than a single span");
  });
  it("says there is nothing to line up when the viewer has too few assets", () => {
    const me = win({
      rosterId: 1,
      isMe: true,
      state: "unreadable",
      open: null,
      peak: null,
      close: null,
    });
    const s = windowSynthesis({
      currentSeason: NOW,
      first: NOW,
      last: NOW,
      rows: [me],
      me,
      overlap: null,
    });
    expect(s).toContain("Too few valued assets");
  });
});
describe("windowLabel", () => {
  it("collapses a one-season window", () => {
    expect(windowLabel(win({ open: NOW + 1, close: NOW + 1 }))).toBe(
      `${NOW + 1}`,
    );
  });
  it("says so when there is no window", () => {
    expect(
      windowLabel(win({ state: "unreadable", open: null, close: null })),
    ).toBe("no window");
  });
});
describe("leagueWindows on the real league", () => {
  const map = leagueWindows(h);
  it("places every roster", () => {
    expect(map.rows).toHaveLength(h.rosters.length);
    expect(new Set(map.rows.map((r) => r.rosterId)).size).toBe(
      h.rosters.length,
    );
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
      expect(r.open).toBeLessThanOrEqual(r.peak);
      expect(r.peak).toBeLessThanOrEqual(r.close);
    }
  });
  it("never dates a window before the current season", () => {
    for (const r of map.rows) {
      if (r.open != null)
        expect(r.open).toBeGreaterThanOrEqual(map.currentSeason);
    }
  });
  it("spans an axis that contains every window it drew", () => {
    for (const r of map.rows) {
      if (r.open == null) continue;
      expect(r.open).toBeGreaterThanOrEqual(map.first);
      expect(r.close).toBeLessThanOrEqual(map.last);
    }
  });
  it("sorts earliest peak first, with unreadable rosters last", () => {
    const peaks = map.rows.map((r) => r.peakOffset);
    const dated = peaks.filter((p) => p != null);
    expect(dated).toEqual([...dated].sort((a, b) => a - b));
    expect(peaks.slice(dated.length).every((p) => p == null)).toBe(true);
  });
  it("identifies the viewer and gives them an overlap reading", () => {
    expect(map.me?.rosterId).toBe(h.me.rosterId);
    // The fixture viewer is coherent, so the overlap arithmetic is available.
    expect(map.overlap).not.toBeNull();
    const o = map.overlap;
    const placed =
      o.shared.length + o.earlier.length + o.later.length + o.unresolved.length;
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
// --------------------------------------------------------------------------------
// THE REFUSAL CODES (lib/refusal.js). What `state` alone could not carry.
// --------------------------------------------------------------------------------
describe("a refused window carries a code, not just a word", () => {
  it("reads NO_RECORD when no asset on the roster carries a price", () => {
    const assets = [asset(1, 0, 1), asset(2, 0, 2), asset(3, 0, 3)];
    const w = windowOf(profile({ assets }), assets, NOW, false);
    expect(w.state).toBe("unreadable");
    expect(w.refusal.code).toBe("NO_RECORD");
    // Nothing was computed, so there is no centroid to print and declining to
    // invent one is the whole behaviour.
    expect(w.refusal.withheld).toBeNull();
  });
  it("reads INSUFFICIENT_SAMPLE at one or two valued assets, and prints the centroid it declined", () => {
    for (const n of [1, 2]) {
      const assets = Array.from({ length: n }, (_, i) => asset(i + 2, 100, i));
      const w = windowOf(profile({ assets }), assets, NOW, false);
      expect(w.state).toBe("unreadable");
      expect(w.refusal.code).toBe("INSUFFICIENT_SAMPLE");
      expect(w.refusal.because).toContain(`${n} valued asset`);
      // The number the app declined to publish, printed beside its disproof - and
      // NOT promoted into the field the chart reads.
      expect(w.refusal.withheld.value).toBe(`${NOW + 2}`);
      expect(w.peak).toBeNull();
      expect(w.peakOffset).toBeNull();
    }
  });
  it("reads SPLIT_ROSTER for a straddler, withholding the single season its quartiles centre on", () => {
    const assets = [asset(1, 100, 1), asset(4, 100, 2), asset(7, 100, 3)];
    const w = windowOf(
      profile({ assets, posture: "straddling" }),
      assets,
      NOW,
      false,
    );
    expect(w.state).toBe("split");
    expect(w.refusal.code).toBe("SPLIT_ROSTER");
    expect(w.refusal.withheld).toEqual({
      label: "A single window",
      value: `${NOW + 4}`,
    });
    // The quartiles themselves are still published: the refusal is narrowly about
    // collapsing them to one number, which is what the chart's two ends encode.
    expect(w.open).toBe(NOW + 1);
    expect(w.close).toBe(NOW + 7);
    expect(w.refusal.because).toContain("7 seasons");
  });
  it("leaves a readable window with no refusal at all", () => {
    const assets = [asset(1, 10, 1), asset(2, 10, 2), asset(3, 10, 3)];
    const w = windowOf(profile({ assets }), assets, NOW, false);
    expect(w.state).toBe("window");
    expect(w.refusal).toBeNull();
    expect(windowRefusalCode(w)).toBeNull();
  });
  it("names a code even for a row somebody else assembled", () => {
    // Defence for the one thing that must never happen: a refused window printing
    // with no code. A hand-built row has no `refusal`, and still cannot be blank.
    expect(windowRefusalCode(win({ state: "split", refusal: undefined }))).toBe(
      "SPLIT_ROSTER",
    );
    expect(
      windowRefusalCode(win({ state: "unreadable", refusal: undefined })),
    ).toBe("INSUFFICIENT_SAMPLE");
  });
  it("puts a code in every refused row of the real league", () => {
    for (const r of leagueWindows(h).rows) {
      if (r.state === "window") {
        expect(r.refusal).toBeNull();
        continue;
      }
      expect(REFUSAL_CODE_LIST).toContain(r.refusal.code);
      expect(r.refusal.because.length).toBeGreaterThan(40);
    }
  });
});
describe("windowShort", () => {
  it("is the range for a readable window", () => {
    expect(windowShort(win({ open: NOW + 1, close: NOW + 3 }))).toBe(
      `${NOW + 1}-${NOW + 3}`,
    );
  });
  it("is the register's human LABEL for a refused one, never a dash and never the raw code", () => {
    // The dash was the bug. In a mono line between two figures it reads as a
    // missing value, which is a claim the derivation had just refused to make.
    // The label replaced the code in the chip (VISION.md kill-list #4): the code
    // survives on `w.refusal` for grep/serialization, it just no longer speaks.
    const split = windowShort(win({ state: "split" }));
    const none = windowShort(
      win({ state: "unreadable", open: null, close: null }),
    );
    expect(split).toBe("the parts do not agree");
    expect(none).toBe("too few records to separate");
    for (const s of [split, none]) {
      expect(s).not.toBe("-");
      expect(s).not.toBe("");
    }
  });
});
describe("windowRefusalSummary", () => {
  it("is null when every roster on the board is readable", () => {
    expect(windowRefusalSummary([win(), win({ rosterId: 2 })])).toBeNull();
  });
  it("groups by code, counts each, and says nothing is still arriving", () => {
    const s = windowRefusalSummary([
      win({ rosterId: 1 }),
      win({ rosterId: 2, state: "split", refusal: undefined }),
      win({ rosterId: 3, state: "split", refusal: undefined }),
      win({ rosterId: 4, state: "unreadable", refusal: undefined }),
    ]);
    expect(s).toContain("The parts do not agree: 2 rosters are drawn as two ends");
    expect(s).toContain("Too few records to separate: One roster holds");
    // The deterministic statement. A refusal sitting where numbers usually load
    // invites a reader to wait for it, and nothing here is loading.
    expect(s).toContain("nothing to retry");
  });
  it("keeps register order however the rows are shuffled", () => {
    const rows = [
      win({ rosterId: 1, state: "split", refusal: undefined }),
      win({ rosterId: 2, state: "unreadable", refusal: undefined }),
    ];
    const a = windowRefusalSummary(rows);
    const b = windowRefusalSummary([...rows].reverse());
    expect(a).toBe(b);
    expect(a.indexOf("Too few records to separate")).toBeLessThan(
      a.indexOf("The parts do not agree"),
    );
  });
  it("grades nobody (D6)", () => {
    const s = windowRefusalSummary([
      win({ state: "split", refusal: undefined }),
      win({ rosterId: 2, state: "unreadable", refusal: undefined }),
    ]);
    expect(s).not.toMatch(/\b(good|bad|weak|strong|worse|better|poor)\b/i);
  });
});
describe("windowSynthesis speaks in codes too", () => {
  const map = (me) => ({
    currentSeason: NOW,
    first: NOW,
    last: NOW + 5,
    rows: [me],
    me,
    overlap: null,
  });
  it("opens with the viewer's own code and keeps the withheld season", () => {
    const s = windowSynthesis(
      map(
        win({
          isMe: true,
          state: "split",
          refusal: {
            code: "SPLIT_ROSTER",
            label: "the parts do not agree",
            because: "unused here",
            withheld: { label: "A single window", value: `${NOW + 3}` },
          },
        }),
      ),
    );
    expect(s.startsWith("The parts do not agree: ")).toBe(true);
    expect(s).toContain(`${NOW + 3}`);
    // The second-person wording is this function's own; only the code and the
    // withheld figure are shared with the board's third-person reading.
    expect(s).toContain("do not agree about when your value arrives");
  });
  it("distinguishes an empty record from a thin one, which one word could not", () => {
    const thin = windowSynthesis(
      map(
        win({
          isMe: true,
          state: "unreadable",
          open: null,
          close: null,
          refusal: { code: "INSUFFICIENT_SAMPLE", because: "", withheld: null },
        }),
      ),
    );
    const empty = windowSynthesis(
      map(
        win({
          isMe: true,
          state: "unreadable",
          open: null,
          close: null,
          refusal: { code: "NO_RECORD", because: "", withheld: null },
        }),
      ),
    );
    expect(thin).toContain("Too few valued assets");
    expect(empty).toContain("No asset on your roster carries a price");
    expect(empty.startsWith("No record to read: ")).toBe(true);
  });
});
describe("a straddler whose quartiles round into one season", () => {
  it("does not claim a spread it cannot show, because posture is read unrounded", () => {
    // The case that catches a sloppy refusal: `open === close`, so "spread across 1
    // seasons" would be ungrammatical AND false - it hands a reader a visible span to
    // disbelieve instead of the real reason. Fires on the live fixture league.
    const assets = [asset(1.1, 100, 1), asset(1.2, 100, 2), asset(1.3, 100, 3)];
    const w = windowOf(
      profile({ assets, posture: "straddling" }),
      assets,
      NOW,
      false,
    );
    expect(w.state).toBe("split");
    expect(w.open).toBe(w.close);
    expect(w.refusal.because).toContain("round into the single season");
    expect(w.refusal.because).not.toContain("1 seasons");
    expect(w.refusal.withheld.value).toBe(`${w.peak}`);
  });
  it("says every refused roster on the real league grammatically", () => {
    for (const r of leagueWindows(h).rows) {
      if (!r.refusal) continue;
      expect(r.refusal.because).not.toMatch(/\b1 seasons\b/);
      expect(r.refusal.because).not.toMatch(/\b1 valued assets\b/);
    }
  });
});
