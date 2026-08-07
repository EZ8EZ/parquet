/**
 * THE COHERENCE x FRAGILITY BOARD - the two proprietary metrics on one pair of axes.
 *
 * ---------------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------------
 * `/league` plots the Timeline Coherence Index against duration. `/awards` ranks the
 * Roster Fragility Index. Manager Compare shows both, for exactly two managers. So the
 * one question that needs BOTH metrics and ALL fourteen rosters at once has never been
 * askable: which teams are straddling two timelines AND leaning on a handful of names
 * to do it. That intersection is the point of this module.
 *
 * ---------------------------------------------------------------------------------
 * The honesty problem this module is built around
 * ---------------------------------------------------------------------------------
 * TCI is directional. High means the roster's assets agree about when it wins, and
 * duration.ts is explicit that incoherence is the only bad region - a coherent rebuild
 * and a coherent contender are both fine.
 *
 * RFI is NOT directional, and DECISIONS D23 says so out loud: low fragility is not the
 * same as good. The most torn-down roster in the league scores mid-pack or lower
 * because a roster with nothing to lose loses nothing when a player goes down. A chart
 * that painted the low-RFI end green would be stating something false.
 *
 * So this module encodes the two axes differently ON PURPOSE:
 *
 *   - TCI gets the colour ramp (red to green). It is the only axis where a
 *     bad-to-good scale is a true statement.
 *   - RFI gets position only, and its two halves are named with DESCRIPTIVE words
 *     ("spread" / "top-heavy") rather than evaluative ones ("resilient" / "brittle"),
 *     so neither half reads as a verdict.
 *
 * Each quadrant then carries a thesis rather than a grade (DECISIONS D6), and the
 * thesis for the low-RFI half says the quiet part: a low score there can be emptiness.
 *
 * ---------------------------------------------------------------------------------
 * What lives here and what does not
 * ---------------------------------------------------------------------------------
 * Everything in this file is pure and synchronous: medians, quadrant assignment, band
 * lookup, axis domains, tick selection and label placement. It takes the two metric
 * modules' OUTPUT as plain structural types rather than importing their interfaces, so
 * a change to either metric's internals cannot break this, and so the whole thing is
 * testable without building a league. The SVG lives in
 * components/CoherenceFragilityQuadrant.tsx.
 */

/* ---------------------------------------------------------------------------------
 * Inputs. Structural, deliberately minimal - see the note above.
 * ------------------------------------------------------------------------------- */

export interface TimelineInput {
  rosterId: number;
  teamName: string | null;
  ownerName: string;
  /** 0..100, higher = the roster's assets agree about when it wins. */
  tci: number;
  posture: string;
}

export interface FragilityInput {
  rosterId: number;
  /** Higher = more of the season is load-bearing on a few names. */
  fragility: number;
  /** 0..1 within this league. */
  percentile: number;
  band: string;
  /** The name whose loss costs the most startable value, when there is one. */
  spofName?: string | null;
  /** That loss as a share of startable value, 0..1. */
  spofShare?: number | null;
}

/* ---------------------------------------------------------------------------------
 * Quadrants
 * ------------------------------------------------------------------------------- */

export const QUADRANT_KEYS = [
  "agreedSpread",
  "agreedTopHeavy",
  "splitSpread",
  "splitTopHeavy",
] as const;

export type QuadrantKey = (typeof QUADRANT_KEYS)[number];

export interface QuadrantMeta {
  key: QuadrantKey;
  /** The two-word caption printed in the chart's corner. */
  label: string;
  /** Which corner it occupies, for the caption layout. x: coherence, y: fragility. */
  coherent: boolean;
  topHeavy: boolean;
  /** One line, for a grouped list header. */
  gist: string;
  /** The thesis. Not a grade (DECISIONS D6). */
  thesis: string;
}

/**
 * The four theses.
 *
 * Note what the two low-fragility ones do NOT say. Neither calls a spread roster safe,
 * and `splitSpread` names the trap directly, because that is the quadrant where a
 * naive reading of RFI does the most damage.
 */
export const QUADRANTS: Record<QuadrantKey, QuadrantMeta> = {
  agreedSpread: {
    key: "agreedSpread",
    label: "AGREED / SPREAD",
    coherent: true,
    topHeavy: false,
    gist: "One timeline, no single name deciding it.",
    thesis:
      "These rosters know when they win, and no one man decides whether they do. " +
      "The bet is that a high floor beats a high ceiling across 82 nights. The risk " +
      "is the mirror image of fragility rather than the absence of it: depth is easy " +
      "to admire and easy to overpay for, and a lineup with no real top end loses to " +
      "the top-heavy teams on the nights their stars play.",
  },
  agreedTopHeavy: {
    key: "agreedTopHeavy",
    label: "AGREED / TOP-HEAVY",
    coherent: true,
    topHeavy: true,
    gist: "One timeline, running through a short list of names.",
    thesis:
      "Nothing here is confused. The assets agree about when this team wins, and the " +
      "plan runs through a handful of players who have to be on the floor for it to " +
      "happen. That is a bought ceiling, paid for in the nights it cannot cover. It " +
      "is a real strategy, and it is the one that a single knee ends.",
  },
  splitSpread: {
    key: "splitSpread",
    label: "SPLIT / SPREAD",
    coherent: false,
    topHeavy: false,
    gist: "Assets disagree about when, and little is concentrated.",
    thesis:
      "The assets disagree about when this team wins, and there is not much " +
      "concentrated value left to lose. Read the low fragility carefully: a " +
      "torn-down roster sits here because nothing on it is load-bearing, not because " +
      "it is insulated. The cheap move from this corner is to pick a direction while " +
      "the pieces are still tradeable, because nobody is forcing the choice yet.",
  },
  splitTopHeavy: {
    key: "splitTopHeavy",
    label: "SPLIT / TOP-HEAVY",
    coherent: false,
    topHeavy: true,
    gist: "Straddling two timelines, and leaning on a few names to do it.",
    thesis:
      "The one corner of this board with no charitable reading. These rosters are " +
      "straddling two timelines and leaning on a short list of players to straddle " +
      "them. Whichever direction they eventually pick, they are one long-term injury " +
      "away from having it picked for them, and the pick will be the worse of the two.",
  },
};

/**
 * Which quadrant a roster sits in, relative to the two dividing lines.
 *
 * A point exactly ON a line is assigned to the kinder side of it (coherent, spread).
 * With fourteen rosters and a median divider, landing on the line is common enough
 * that the tie-break has to be a decision rather than an accident of `>` vs `>=`.
 */
export function assignQuadrant(
  tci: number,
  fragility: number,
  tciMid: number,
  fragilityMid: number,
): QuadrantKey {
  const coherent = tci >= tciMid;
  const topHeavy = fragility > fragilityMid;
  if (coherent) return topHeavy ? "agreedTopHeavy" : "agreedSpread";
  return topHeavy ? "splitTopHeavy" : "splitSpread";
}

/* ---------------------------------------------------------------------------------
 * The colour ramp - TCI only
 * ------------------------------------------------------------------------------- */

export interface TciBand {
  /** 1..4, 1 = least coherent. Maps to `--tci-1` .. `--tci-4` in globals.css. */
  step: 1 | 2 | 3 | 4;
  /** Upper bound, exclusive. The last band has none. */
  max: number | null;
  /** Legend text. */
  range: string;
  /** What that band means in words, so the colour never has to be read alone. */
  meaning: string;
}

/**
 * Four ABSOLUTE bands, not league quantiles.
 *
 * duration.ts keeps TCI absolute on purpose - a roster's score depends only on its
 * own assets, so the same roster scores the same next season - and quantile colouring
 * would quietly undo that: it would paint the best of a uniformly incoherent league
 * green. What that absoluteness does NOT buy is cross-league comparability, and
 * duration.ts retracts that exact claim in its own SIGMA_REF comment: the reference
 * dispersion was calibrated against the spread observed across THIS league's fourteen
 * rosters, so these four edges are tuned to this league too. The first edge is 55
 * because that is
 * the coherence floor duration.ts already classifies against - below it a roster is
 * straddling regardless of its duration - and the rest are round decades from there.
 *
 * A consequence worth keeping rather than fixing: in a league where everybody sits in
 * the sixties, most dots come out the same colour. That is the true statement. The
 * axis is scaled to the data so the ordering is still readable; the colour is scaled
 * to the metric so the altitude is still honest.
 */
export const TCI_BANDS: TciBand[] = [
  { step: 1, max: 55, range: "under 55", meaning: "straddling - below the coherence floor" },
  { step: 2, max: 65, range: "55 to 64", meaning: "loosely agreed" },
  { step: 3, max: 75, range: "65 to 74", meaning: "agreed" },
  { step: 4, max: null, range: "75 and up", meaning: "one clear timeline" },
];

export function tciBand(tci: number): TciBand {
  for (const b of TCI_BANDS) {
    if (b.max === null || tci < b.max) return b;
  }
  return TCI_BANDS[TCI_BANDS.length - 1];
}

/* ---------------------------------------------------------------------------------
 * Scales
 * ------------------------------------------------------------------------------- */

/** Ordinary median. Even counts average the two middle values. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length / 2;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[mid - 1] + s[mid]) / 2;
}

export interface DomainOptions {
  /** Breathing room added to each end before any other rule. */
  pad: number;
  /**
   * Smallest span the axis may show. Without it a league whose values happen to sit
   * within two points of each other renders as noise magnified to full width.
   */
  minSpan: number;
  /** Hard floor the domain may not cross (the metric's own definition, not the data). */
  hardMin?: number;
  /** Hard ceiling. Omit when the metric's upper bound is not guaranteed. */
  hardMax?: number;
}

/**
 * An axis domain derived from the DATA, never from today's numbers.
 *
 * Both metrics are under active development and either one's range can move, so
 * nothing here assumes an observed spread. The only constants allowed in are the
 * metric's own documented bounds, passed in by the caller as hardMin/hardMax, and
 * even those only clamp - they never define the view.
 */
export function axisDomain(values: number[], opts: DomainOptions): [number, number] {
  const { pad, minSpan, hardMin, hardMax } = opts;
  if (values.length === 0) {
    const lo = hardMin ?? 0;
    return [lo, hardMax ?? lo + minSpan];
  }
  let lo = Math.min(...values) - pad;
  let hi = Math.max(...values) + pad;

  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  // Shift rather than squash when a hard bound is crossed, so the span survives.
  if (hardMin !== undefined && lo < hardMin) {
    hi += hardMin - lo;
    lo = hardMin;
  }
  if (hardMax !== undefined && hi > hardMax) {
    lo -= hi - hardMax;
    hi = hardMax;
  }
  if (hardMin !== undefined && lo < hardMin) lo = hardMin;
  return [lo, hi];
}

const TICK_STEPS = [1, 2, 5, 10, 20, 25, 50, 100];

/** Round tick values inside a domain, aiming for roughly `target` of them. */
export function axisTicks(lo: number, hi: number, target = 4): number[] {
  if (!(hi > lo)) return [];
  let best = TICK_STEPS[TICK_STEPS.length - 1];
  let bestErr = Infinity;
  for (const step of TICK_STEPS) {
    const n = Math.floor(hi / step) - Math.ceil(lo / step) + 1;
    if (n < 2) continue;
    const err = Math.abs(n - target);
    if (err < bestErr) {
      bestErr = err;
      best = step;
    }
  }
  const out: number[] = [];
  for (let t = Math.ceil(lo / best) * best; t <= hi + 1e-9; t += best) {
    out.push(Math.round(t * 1e6) / 1e6);
  }
  return out;
}

/* ---------------------------------------------------------------------------------
 * Label placement
 * ------------------------------------------------------------------------------- */

export type LabelSide = "right" | "left" | "above" | "below";

export interface PlacedLabel {
  dx: number;
  dy: number;
  side: LabelSide;
  anchor: "start" | "end" | "middle";
}

export interface LabelPlacementOptions {
  /** Width of the rendered label, in viewBox units. */
  w: number;
  /** Height of the rendered label, in viewBox units. */
  h: number;
  /** Clearance between the edge of a dot and its own label box. */
  gap: number;
  /** Plot rectangle the labels must stay inside: [x0, y0, x1, y1]. */
  bounds: [number, number, number, number];
  /**
   * Each point's drawn radius, index-aligned. Labels dodge OTHER points' marks as
   * well as other labels, which is the collision that actually shows up on a real
   * board: two rosters a point apart on both metrics put one dot straight through
   * its neighbour's number. A point never dodges its own mark.
   */
  radii?: number[];
}

const SIDES: LabelSide[] = ["right", "left", "above", "below"];

function offsetFor(side: LabelSide, gap: number, h: number): PlacedLabel {
  switch (side) {
    case "right":
      return { dx: gap, dy: h / 3, side, anchor: "start" };
    case "left":
      return { dx: -gap, dy: h / 3, side, anchor: "end" };
    case "above":
      return { dx: 0, dy: -gap, side, anchor: "middle" };
    case "below":
      return { dx: 0, dy: gap + h, side, anchor: "middle" };
  }
}

function boxOf(
  x: number,
  y: number,
  p: PlacedLabel,
  w: number,
  h: number,
): [number, number, number, number] {
  const cx = x + p.dx;
  const x0 = p.anchor === "start" ? cx : p.anchor === "end" ? cx - w : cx - w / 2;
  const y1 = y + p.dy;
  return [x0, y1 - h, x0 + w, y1];
}

const overlaps = (
  a: [number, number, number, number],
  b: [number, number, number, number],
) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

const inside = (
  a: [number, number, number, number],
  b: [number, number, number, number],
) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];

/**
 * Where each dot's number goes so that fourteen of them are all readable at 390px.
 *
 * Greedy and deterministic, which matters twice over: this renders on the server and
 * hydrates on the client, so any nondeterminism is a hydration mismatch rather than a
 * cosmetic wobble. Points are placed in the order given; each takes the first of
 * right/left/above/below that both stays inside the plot and clears every label
 * already placed. If all four collide the first is used anyway - an overlapping
 * label is better than a missing one, and the numbered list underneath is the
 * authoritative reading of the same data either way.
 */
export function placeLabels(
  points: { x: number; y: number }[],
  opts: LabelPlacementOptions,
): PlacedLabel[] {
  const { w, h, gap, bounds, radii } = opts;
  const dots = points.map(
    (p, i): [number, number, number, number] => {
      const r = radii?.[i] ?? 0;
      return [p.x - r, p.y - r, p.x + r, p.y + r];
    },
  );
  const taken: [number, number, number, number][] = [];
  return points.map((pt, i) => {
    const own = radii?.[i] ?? 0;
    const blockers = [...taken, ...dots.filter((_, j) => j !== i)];
    let fallback: PlacedLabel | null = null;
    for (const side of SIDES) {
      const cand = offsetFor(side, own + gap, h);
      const box = boxOf(pt.x, pt.y, cand, w, h);
      if (fallback === null) fallback = cand;
      if (!inside(box, bounds)) continue;
      if (blockers.some((t) => overlaps(box, t))) continue;
      taken.push(box);
      return cand;
    }
    const chosen = fallback ?? offsetFor("right", own + gap, h);
    taken.push(boxOf(pt.x, pt.y, chosen, w, h));
    return chosen;
  });
}

/* ---------------------------------------------------------------------------------
 * The view model
 * ------------------------------------------------------------------------------- */

export interface QuadrantPoint {
  rosterId: number;
  /** 1-based, matching the numbered list under the chart. */
  n: number;
  name: string;
  ownerName: string;
  tci: number;
  posture: string;
  fragility: number;
  fragilityPercentile: number;
  fragilityBand: string;
  spofName: string | null;
  spofShare: number | null;
  quadrant: QuadrantKey;
  tciStep: 1 | 2 | 3 | 4;
  isMe: boolean;
}

export interface QuadrantView {
  points: QuadrantPoint[];
  tciMid: number;
  fragilityMid: number;
  counts: Record<QuadrantKey, number>;
}

/**
 * Join the two metric passes into one board.
 *
 * The dividing lines are LEAGUE MEDIANS on both axes rather than absolute thresholds,
 * because "top-heavy" has no absolute meaning - fragility.ts already scores the band
 * by within-league percentile for exactly that reason - and because a median split
 * guarantees all four quadrants are reachable, which an absolute cut on a clustered
 * league does not. The chart labels the lines as medians so nobody reads them as a
 * pass mark.
 *
 * Ordering is most-incoherent first, then most fragile, then roster id: the board's
 * own worst corner leads the list, and the order is total so it is identical on the
 * server and on the client.
 */
export function buildQuadrantView(
  timelines: TimelineInput[],
  fragility: FragilityInput[],
  meRosterId: number | null,
): QuadrantView {
  const byRoster = new Map(fragility.map((f) => [f.rosterId, f]));
  const joined = timelines.filter((t) => byRoster.has(t.rosterId));

  const tciMid = median(joined.map((t) => t.tci));
  const fragilityMid = median(joined.map((t) => byRoster.get(t.rosterId)!.fragility));

  const points: QuadrantPoint[] = joined
    .map((t) => {
      const f = byRoster.get(t.rosterId)!;
      return {
        rosterId: t.rosterId,
        n: 0,
        name: t.teamName ?? t.ownerName,
        ownerName: t.ownerName,
        tci: t.tci,
        posture: t.posture,
        fragility: f.fragility,
        fragilityPercentile: f.percentile,
        fragilityBand: f.band,
        spofName: f.spofName ?? null,
        spofShare: f.spofShare ?? null,
        quadrant: assignQuadrant(t.tci, f.fragility, tciMid, fragilityMid),
        tciStep: tciBand(t.tci).step,
        isMe: meRosterId != null && t.rosterId === meRosterId,
      };
    })
    .sort(
      (a, b) =>
        a.tci - b.tci || b.fragility - a.fragility || a.rosterId - b.rosterId,
    )
    .map((p, i) => ({ ...p, n: i + 1 }));

  const counts = {
    agreedSpread: 0,
    agreedTopHeavy: 0,
    splitSpread: 0,
    splitTopHeavy: 0,
  } as Record<QuadrantKey, number>;
  for (const p of points) counts[p.quadrant] += 1;

  return { points, tciMid, fragilityMid, counts };
}
