import { describe, expect, it } from "vitest";
import {
  QUADRANTS,
  QUADRANT_KEYS,
  TCI_BANDS,
  assignQuadrant,
  axisDomain,
  axisTicks,
  buildQuadrantView,
  median,
  placeLabels,
  tciBand,
  type FragilityInput,
  type TimelineInput,
} from "./quadrant";

describe("median", () => {
  it("returns the middle value for an odd count", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("averages the two middle values for an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("does not mutate its input", () => {
    const xs = [5, 1, 3];
    median(xs);
    expect(xs).toEqual([5, 1, 3]);
  });

  it("survives an empty league rather than returning NaN", () => {
    expect(median([])).toBe(0);
  });

  it("splits a real fourteen-team league in half", () => {
    const tcis = [71, 71, 66, 66, 65, 63, 62, 61, 60, 59, 56, 55, 53, 49];
    const mid = median(tcis);
    expect(tcis.filter((t) => t >= mid).length).toBe(7);
    expect(tcis.filter((t) => t < mid).length).toBe(7);
  });
});

describe("assignQuadrant", () => {
  const mid = { tci: 60, rfi: 50 };

  it("places coherent and spread top-left", () => {
    expect(assignQuadrant(70, 40, mid.tci, mid.rfi)).toBe("agreedSpread");
  });

  it("places coherent and concentrated top-right", () => {
    expect(assignQuadrant(70, 60, mid.tci, mid.rfi)).toBe("agreedTopHeavy");
  });

  it("places incoherent and spread bottom-left", () => {
    expect(assignQuadrant(50, 40, mid.tci, mid.rfi)).toBe("splitSpread");
  });

  it("places incoherent and concentrated bottom-right - the corner with no good reading", () => {
    expect(assignQuadrant(50, 60, mid.tci, mid.rfi)).toBe("splitTopHeavy");
  });

  it("gives a roster sitting exactly on both lines the kinder side of each", () => {
    expect(assignQuadrant(60, 50, mid.tci, mid.rfi)).toBe("agreedSpread");
  });

  it("is a total partition - every roster lands in exactly one quadrant", () => {
    const seen = new Set<string>();
    for (let tci = 0; tci <= 100; tci += 7) {
      for (let rfi = 0; rfi <= 100; rfi += 7) {
        seen.add(assignQuadrant(tci, rfi, mid.tci, mid.rfi));
      }
    }
    expect([...seen].sort()).toEqual([...QUADRANT_KEYS].sort());
  });
});

describe("quadrant copy", () => {
  it("names every key exactly once", () => {
    for (const k of QUADRANT_KEYS) expect(QUADRANTS[k].key).toBe(k);
  });

  /**
   * The load-bearing honesty test (DECISIONS D23). Low fragility is NOT good, so the
   * two spread quadrants must never be described with an evaluative word that would
   * turn a torn-down roster into a compliment.
   */
  it("never calls the low-fragility half safe, healthy or resilient", () => {
    const banned = /\b(safe|safest|healthy|resilient|sturdy|insulated|bulletproof)\b/i;
    for (const k of ["agreedSpread", "splitSpread"] as const) {
      const q = QUADRANTS[k];
      expect(`${q.label} ${q.gist}`).not.toMatch(banned);
      // The thesis may use one of those words to DENY it. What it may never do is
      // assert one, so every occurrence has to sit behind a negation.
      for (const m of q.thesis.matchAll(new RegExp(banned.source, "gi"))) {
        const before = q.thesis.slice(0, m.index);
        expect(before).toMatch(/\bnot\b[^.]*$/i);
      }
    }
  });

  it("says out loud that a spread-and-split roster may simply be empty", () => {
    expect(QUADRANTS.splitSpread.thesis).toMatch(/not because it is insulated/i);
  });

  it("uses no em dashes in any user-facing string", () => {
    for (const k of QUADRANT_KEYS) {
      const q = QUADRANTS[k];
      expect(`${q.label}${q.gist}${q.thesis}`).not.toMatch(/[—–]/);
    }
    for (const b of TCI_BANDS) {
      expect(`${b.range}${b.meaning}`).not.toMatch(/[—–]/);
    }
  });
});

describe("tciBand", () => {
  it("puts a straddler below the coherence floor in the reddest step", () => {
    expect(tciBand(49).step).toBe(1);
    expect(tciBand(54.9).step).toBe(1);
  });

  it("moves to step 2 exactly at the coherence floor of 55", () => {
    expect(tciBand(55).step).toBe(2);
  });

  it("climbs monotonically with TCI", () => {
    let last = 0;
    for (let t = 0; t <= 100; t++) {
      const s = tciBand(t).step;
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
  });

  it("covers the whole 0..100 range and tops out at step 4", () => {
    expect(tciBand(0).step).toBe(1);
    expect(tciBand(100).step).toBe(4);
    expect(TCI_BANDS.map((b) => b.step)).toEqual([1, 2, 3, 4]);
  });

  it("clamps values outside the metric's nominal range rather than throwing", () => {
    expect(tciBand(-5).step).toBe(1);
    expect(tciBand(140).step).toBe(4);
  });
});

describe("axisDomain", () => {
  const opts = { pad: 4, minSpan: 30, hardMin: 0, hardMax: 100 };

  it("pads a wide spread and leaves it alone", () => {
    expect(axisDomain([20, 80], opts)).toEqual([16, 84]);
  });

  it("expands a tight cluster to the minimum span so noise is not magnified", () => {
    const [lo, hi] = axisDomain([60, 61], opts);
    expect(hi - lo).toBeCloseTo(30, 6);
    expect(lo).toBeLessThan(60);
    expect(hi).toBeGreaterThan(61);
  });

  it("shifts rather than squashes when it would cross a hard floor", () => {
    const [lo, hi] = axisDomain([1, 2], opts);
    expect(lo).toBe(0);
    expect(hi - lo).toBeCloseTo(30, 6);
  });

  it("shifts rather than squashes when it would cross a hard ceiling", () => {
    const [lo, hi] = axisDomain([98, 99], opts);
    expect(hi).toBe(100);
    expect(hi - lo).toBeCloseTo(30, 6);
  });

  it("clamps to both bounds when the data cannot fit between them", () => {
    expect(axisDomain([0, 100], opts)).toEqual([0, 100]);
  });

  /**
   * The fragility agent may move RFI's range under us, so the domain has to be read
   * off whatever the metric returns rather than off today's numbers.
   */
  it("follows the data when the metric's range moves, with no upper bound assumed", () => {
    const open = { pad: 4, minSpan: 30, hardMin: 0 };
    expect(axisDomain([300, 460], open)).toEqual([296, 464]);
    expect(axisDomain([0.2, 0.9], open)[1]).toBeGreaterThan(0.9);
  });

  it("returns a usable domain for an empty league", () => {
    const [lo, hi] = axisDomain([], opts);
    expect(hi).toBeGreaterThan(lo);
  });

  it("always contains every value it was given", () => {
    const vals = [37, 40, 43, 46, 50, 51, 57, 58, 76];
    const [lo, hi] = axisDomain(vals, { pad: 4, minSpan: 30, hardMin: 0 });
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(lo);
      expect(v).toBeLessThanOrEqual(hi);
    }
  });
});

describe("axisTicks", () => {
  it("returns round numbers inside the domain", () => {
    expect(axisTicks(45, 75, 4)).toEqual([50, 60, 70]);
  });

  it("never returns a tick outside the domain", () => {
    for (const [lo, hi] of [
      [33, 80],
      [0, 100],
      [61.5, 92.25],
    ]) {
      for (const t of axisTicks(lo, hi)) {
        expect(t).toBeGreaterThanOrEqual(lo);
        expect(t).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("gives up rather than inventing ticks on a degenerate domain", () => {
    expect(axisTicks(50, 50)).toEqual([]);
    expect(axisTicks(80, 20)).toEqual([]);
  });
});

describe("placeLabels", () => {
  const opts = {
    w: 12,
    h: 9,
    gap: 8,
    bounds: [0, 0, 300, 200] as [number, number, number, number],
  };

  it("puts a lone label to the right of its dot", () => {
    expect(placeLabels([{ x: 100, y: 100 }], opts)[0].side).toBe("right");
  });

  it("moves the second of two identical points somewhere else", () => {
    const [a, b] = placeLabels(
      [
        { x: 100, y: 100 },
        { x: 100, y: 100 },
      ],
      opts,
    );
    expect(a.side).toBe("right");
    expect(b.side).not.toBe("right");
  });

  it("flips a label inward at the right edge instead of letting it run off", () => {
    expect(placeLabels([{ x: 297, y: 100 }], opts)[0].side).toBe("left");
  });

  it("flips a label inward at the left edge", () => {
    expect(placeLabels([{ x: 3, y: 100 }], opts)[0].side).toBe("right");
  });

  it("keeps every placed box inside the plot when the points allow it", () => {
    const pts = Array.from({ length: 14 }, (_, i) => ({
      x: 20 + i * 19,
      y: 30 + (i % 5) * 30,
    }));
    const placed = placeLabels(pts, opts);
    placed.forEach((p, i) => {
      const cx = pts[i].x + p.dx;
      const x0 = p.anchor === "start" ? cx : p.anchor === "end" ? cx - opts.w : cx - opts.w / 2;
      expect(x0).toBeGreaterThanOrEqual(opts.bounds[0] - 1e-9);
      expect(x0 + opts.w).toBeLessThanOrEqual(opts.bounds[2] + 1e-9);
    });
  });

  it("steps a label around a neighbouring dot, not just a neighbouring label", () => {
    // Two rosters a whisker apart: the left one's label would land on the right
    // one's mark, which is exactly the collision a real fourteen-team board makes.
    const pts = [
      { x: 100, y: 100 },
      { x: 118, y: 100 },
    ];
    const withDots = placeLabels(pts, { ...opts, radii: [6, 6] });
    expect(withDots[0].side).not.toBe("right");
    // The mark it dodged is the neighbour's, never its own.
    expect(placeLabels([{ x: 100, y: 100 }], { ...opts, radii: [6] })[0].side).toBe(
      "right",
    );
  });

  it("clears its own mark by the requested gap", () => {
    const p = placeLabels([{ x: 100, y: 100 }], { ...opts, radii: [6] })[0];
    expect(p.dx).toBe(14);
  });

  it("is deterministic - the same points give the same placement every time", () => {
    const pts = Array.from({ length: 14 }, (_, i) => ({
      x: 40 + (i % 4) * 6,
      y: 40 + Math.floor(i / 4) * 6,
    }));
    expect(placeLabels(pts, opts)).toEqual(placeLabels(pts, opts));
  });

  it("still returns a placement for every point when a pile-up exhausts every side", () => {
    const pile = Array.from({ length: 8 }, () => ({ x: 150, y: 100 }));
    const placed = placeLabels(pile, opts);
    expect(placed).toHaveLength(8);
    for (const p of placed) expect(Number.isFinite(p.dx)).toBe(true);
  });
});

/* --------------------------------------------------------------------------- */

const T = (rosterId: number, tci: number, name: string): TimelineInput => ({
  rosterId,
  teamName: name,
  ownerName: `owner${rosterId}`,
  tci,
  posture: tci < 55 ? "straddling" : "ascending",
});

const F = (rosterId: number, fragility: number): FragilityInput => ({
  rosterId,
  fragility,
  percentile: 0.5,
  band: "balanced",
  spofName: `spof${rosterId}`,
  spofShare: 0.3,
});

describe("buildQuadrantView", () => {
  const timelines = [T(1, 70, "A"), T(2, 68, "B"), T(3, 52, "C"), T(4, 50, "D")];
  const fragility = [F(1, 40), F(2, 60), F(3, 40), F(4, 60)];

  it("splits the league on medians of both metrics", () => {
    const v = buildQuadrantView(timelines, fragility, null);
    expect(v.tciMid).toBe(60);
    expect(v.fragilityMid).toBe(50);
  });

  it("fills all four quadrants when the league actually spans them", () => {
    const v = buildQuadrantView(timelines, fragility, null);
    expect(v.counts).toEqual({
      agreedSpread: 1,
      agreedTopHeavy: 1,
      splitSpread: 1,
      splitTopHeavy: 1,
    });
  });

  it("orders most incoherent first so the worst corner leads the list", () => {
    const v = buildQuadrantView(timelines, fragility, null);
    expect(v.points.map((p) => p.rosterId)).toEqual([4, 3, 2, 1]);
    expect(v.points.map((p) => p.n)).toEqual([1, 2, 3, 4]);
  });

  it("breaks a TCI tie on fragility, then on roster id, so the order is total", () => {
    const tied = [T(9, 60, "X"), T(4, 60, "Y"), T(7, 60, "Z")];
    const frag = [F(9, 50), F(4, 70), F(7, 50)];
    const v = buildQuadrantView(tied, frag, null);
    expect(v.points.map((p) => p.rosterId)).toEqual([4, 7, 9]);
    expect(buildQuadrantView(tied, frag, null).points.map((p) => p.n)).toEqual([1, 2, 3]);
  });

  it("marks the viewer's own roster and nobody else's", () => {
    const v = buildQuadrantView(timelines, fragility, 3);
    expect(v.points.filter((p) => p.isMe).map((p) => p.rosterId)).toEqual([3]);
  });

  it("marks nobody when the viewer has no roster in this league", () => {
    const v = buildQuadrantView(timelines, fragility, null);
    expect(v.points.some((p) => p.isMe)).toBe(false);
  });

  it("drops rosters the fragility pass did not score rather than plotting them at zero", () => {
    const v = buildQuadrantView(timelines, [F(1, 40), F(2, 60)], null);
    expect(v.points.map((p) => p.rosterId)).toEqual([2, 1]);
  });

  it("returns an empty board rather than throwing when neither metric has data", () => {
    const v = buildQuadrantView([], [], 6);
    expect(v.points).toEqual([]);
    expect(v.counts.splitTopHeavy).toBe(0);
  });

  it("carries the colour step from the absolute band, not from league rank", () => {
    // Every roster in this league is incoherent; none of them earns a green dot.
    const dim = [T(1, 40, "A"), T(2, 45, "B"), T(3, 50, "C"), T(4, 54, "D")];
    const v = buildQuadrantView(dim, fragility, null);
    expect(v.points.map((p) => p.tciStep)).toEqual([1, 1, 1, 1]);
  });

  it("prefers the team name and falls back to the owner", () => {
    const v = buildQuadrantView(
      [{ ...T(1, 70, "A"), teamName: null }, T(2, 68, "B")],
      [F(1, 40), F(2, 60)],
      null,
    );
    expect(v.points.find((p) => p.rosterId === 1)!.name).toBe("owner1");
  });
});
