/**
 * THE PROVENANCE RAIL - why this asset is here, drawn against real time.
 *
 * One vertical rail, oldest at the top, today at the bottom. Read TOP TO BOTTOM: every
 * caption on it ("14 months later") counts forward, so down the page is forward in
 * time. `AssetMove.created` has existed since the first version of this feature and was
 * used only for sorting; drawing it is what turns "it sat unresolved for eighteen
 * months" from a subtraction the reader has to perform into a gap they can see.
 *
 * ---------------------------------------------------------------------------------
 * THE Y-AXIS USED TO CLAIM MORE THAN IT COULD KEEP. MEASURED, THEN REBUILT (D100)
 * ---------------------------------------------------------------------------------
 * The old layout computed every row's height in JS: proportional to elapsed time, then
 * floored at a hand-measured `MIN_ROW = 92` so two events days apart still had room for
 * their words. The floor is what broke the axis, and not by a little. Run against the
 * real function, on the chain shapes this league actually produces:
 *
 *   gaps (days)        drawn (px)        true share -> drawn share
 *   1, 1095            92, 268           99.9% -> 74.4%      376x px-per-day disparity
 *   3, 4, 1095         92, 92, 356       99.4% -> 65.9%       94x
 *   1, 1, 2, 1460      92, 92, 92, 444   99.7% -> 61.7%      302x
 *   2, 5, 3, 10, 730   92, 92, 92, 92, 512  97.3% -> 58.2%    66x
 *
 * Read the second column: EVERY short gap collapses to exactly 92, so on real data the
 * row height had already degenerated into a near-binary signal - "floored" versus "the
 * long one" - and two rows of equal height could be one day apart or forty-four. The
 * axis's own unit test made the point without noticing: `[0, 100, 200, 1200]` has a
 * 10x ratio between its longest and shortest gap and drew it at 3.87x, then asserted
 * `> 3` and called itself "proportional". A 1-month-then-3-year chain draws a 36.5x
 * ratio at 2.9x - 8% of the truth.
 *
 * SO THE FLOOR IS GONE, AND THE ROWS ARE CONTENT-SIZED. Each row is
 * `minmax(min-content, <proportional target>)`: where elapsed time earns more space
 * than the words need, the row is exactly proportional; where it does not, the row is
 * exactly as tall as its own content and not one pixel of hand-measured guesswork.
 * Three things follow, and all three are why this beat the alternative:
 *
 *   1. ALIGNMENT IS BY CONSTRUCTION. The dots used to be placed by summing the same px
 *      array the text column used, which worked only as long as JS could predict how
 *      tall rendered text would be. It could not: 74 was the first guess, 92 was the
 *      second, and `HOMECOMING_ROW = 40` was a third patch for one note on one row.
 *      Now every dot lives in its own grid cell, so text height is the browser's
 *      problem, which is the only place it was ever knowable.
 *   2. THE OVERLAP BUG IS STRUCTURALLY IMPOSSIBLE. Two notes on one hop used to
 *      overflow, because only one of them had bought itself a floor. A row that sizes
 *      to its content cannot overflow its content, so there is no per-note constant to
 *      keep in sync and no combination left to get wrong.
 *   3. THE DISTORTION THAT REMAINS IS DRAWN, NOT HIDDEN. Where content wins, the row
 *      is taller than its time deserves - so the gap carries hairlines (below) that
 *      make the compression visible instead of asserting a linearity that is not there.
 *
 * WHAT WAS GIVEN UP, AND WHERE IT WENT. Content-sizing alone would have deleted the
 * "here's how much bigger this gap is" claim outright. It is not deleted; it is moved
 * to the one place it can be told the truth. `OwnershipStrip` above the rail draws
 * TRUE proportional time horizontally, where no text competes for the space, so the
 * proportional reading is now exact rather than 60-75% faithful. The rail keeps
 * ordering and approximate scale; the strip keeps proportion. Neither lies.
 *
 * HAIRLINES: DASHED IS A SCALE, SOLID IS A FACT. Straight from WindowMap, which draws
 * its season gridlines dashed and the current season solid because "it is the only line
 * on the chart that is a fact rather than a scale". Inside a gap: a dashed hairline at
 * every calendar-year boundary, and a SOLID one wherever a real draft actually
 * happened. The dashed lines are what make the compression legible - three of them
 * inside one row and none inside the row above it says "these two rows are not the same
 * scale" far more honestly than a row height that quietly implies they are.
 *
 * Deliberately CALENDAR years, and labelled as such. A league season has no single
 * recorded start timestamp in this corpus, so a line claiming to be a season boundary
 * would be a guess dressed as a gridline. A year boundary is a scale the reader already
 * owns, and dashed already says "scale".
 *
 * NO <text> INSIDE A SCALING viewBox (D96). The year labels sit in an HTML gutter
 * column, absolutely positioned at `top: <fraction>%` inside a cell grid stretches to
 * the gap's own height - the exact idiom WindowMap uses for its ordinals, and for the
 * exact reason: a percentage tracks the scale for free, with no measured height and no
 * resize listener, and the type stays on the type scale instead of being multiplied by
 * whatever the container did to the viewBox. Every mark that IS geometry stays in a
 * FIXED-WIDTH svg or in CSS, so nothing here scales at all.
 *
 * HOUSE SVG RULES (D3 - no chart library): fixed viewBox at a fixed px width, every
 * coordinate an INTEGER, colours from CSS variables so all three themes work with no
 * component knowing a theme exists, and `role="img"` with a full-sentence `aria-label`.
 * The rail is a picture OF the list beside it, so the list is the screen-reader path.
 *
 * NO DIAGONALS CARRYING DATA (D96). The diagonal means refusal everywhere in this
 * product, which is why the resolution node is a square and not a diamond, and why the
 * rug marks below are orthogonal ticks.
 */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LocalDate } from "@/components/LocalDate";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Disclosure } from "@/components/ui";
import { RefusalMark } from "@/components/RefusalMark";
import { DistributionStrip } from "@/components/DistributionStrip";
import { CHART_GRID, CHART_NEUTRAL } from "@/lib/chart-colors";
import { ordinal } from "@/lib/derive/describe";
import { refusal, refusalSentence } from "@/lib/refusal";
import { dealHref } from "@/lib/tradegraph/url";
/**
 * Fewest completed holds before a median means anything.
 *
 * Defined HERE rather than imported from `lib/provenance/source`, deliberately: that
 * module pulls in the draft index and the whole history loader, and a presentational
 * component has no business dragging that graph in behind it. The gate is a rendering
 * decision - "is there enough here to draw" - so it lives with the drawing, and
 * `provenance.test.js` already imports across this boundary to pin it.
 */
const MIN_HOLDS_FOR_MEDIAN = 5;
/**
 * Ceiling on the proportional part of the axis, in px, and the per-gap budget that
 * usually binds before it.
 *
 * A three-node chain - "taken in the 2022 startup draft, still here" - spans nearly
 * four years across two gaps, and spending a whole-screen budget on it drew about 900px
 * of empty rail inside an expanded roster row. The long gap IS the story for that
 * player, so it is not flattened; it is given a budget sized to how much there is to
 * say. Proportionality WITHIN a chain is untouched, since this scales every gap in it
 * by the same factor.
 *
 * These are now TARGETS rather than heights: a row never shrinks below its content, so
 * a small budget compresses the drawing and never clips a word.
 */
const SPAN_PX = 880;
const PER_GAP_PX = 180;
/** The rail's own column, in px. One SVG unit is one pixel; nothing here scales. */
const RAIL_W = 20;
const CX = 10;
/**
 * The dot box, and why it is 20 and not 18.
 *
 * A repeat-holder ring is `r=9` on a dot of `r=5` (see `HolderRing`), so the ring's
 * 1px stroke reaches 9.5 from centre. An 18px box centred at 9 clipped it at both
 * sides - the same class of bug as the original `CAP` inset, caught the same way.
 */
const DOT = 20;
/** Where a node's dot centre sits below the top of its row, in px. */
const DOT_CY = 10;
/** The year-label gutter, in CSS px. 26 holds four tabular digits at 10px. */
const YEAR_W = 26;
const DAY = 86_400_000;
/** Elapsed time in the coarsest unit that still says something true. */
export function formatGap(ms) {
  const days = Math.round(ms / DAY);
  if (days <= 0) return "same day";
  if (days === 1) return "1 day";
  if (days < 45) return `${days} days`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}
/**
 * TWO DURATIONS IN ONE UNIT, because a comparison in two units is not a comparison.
 *
 * `formatGap` switches unit at a threshold, which is right for one number standing
 * alone and wrong for two standing side by side: "41 days" against "3 months" makes the
 * reader do the conversion the sentence was supposed to save them, and a reader who
 * does it wrong has been misled by a format rather than by a number.
 *
 * The unit is chosen from the SMALLER of the two, never the larger. Choosing from the
 * larger rounds the smaller into uselessness - 41 days against 400 would print "1
 * month" against "13 months", and 41 days is not a month. Choosing from the smaller
 * prints "41 days" against "400 days": long-winded, exactly true, and directly
 * comparable, which is the whole job.
 *
 * @param {number} aDays
 * @param {number} bDays
 * @returns {[string, string]}
 */
export function formatDaysPair(aDays, bDays) {
  const f = daysFormatter(Math.min(aDays, bDays));
  return [f(aDays), f(bDays)];
}
/**
 * One formatter, one unit, for every number in one comparison.
 *
 * Takes the SMALLEST value in the population and fixes the unit from it, then formats
 * everything else in that unit - so the strip's own range labels, its median and the
 * highlighted hold are all directly comparable. A formatter that re-chose per value
 * would put "41 days" at one end of an axis and "1.4 years" at the other and call it a
 * scale.
 */
export function daysFormatter(minDays) {
  if (minDays < 45)
    return (d) => `${Math.round(d)} ${Math.round(d) === 1 ? "day" : "days"}`;
  if (minDays < 730)
    return (d) => {
      const m = Math.round(d / 30.44);
      return `${m} ${m === 1 ? "month" : "months"}`;
    };
  return (d) => `${(d / 365.25).toFixed(1)} years`;
}
/**
 * Which seat holds the asset once this node has happened.
 *
 * The one place the four node kinds are reduced to a single question, so
 * `repeatHolders` and the gap scenes cannot disagree about who was holding what.
 */
function holderOf(n) {
  if (n.node === "hop") return n.to;
  if (n.node === "resolution") return n.usedByRoster;
  return n.rosterId ?? null;
}
/**
 * The holder's own name. `names` is the page's roster-id map (`ctx.names`), needed
 * because an ORIGIN node carries only a `rosterId` - its sentence names the manager in
 * prose ("Marcus's own 2025 1st") and there is no field to read it back out of.
 */
function holderNameOf(n, names) {
  if (n.node === "hop") return n.toName;
  if (n.node === "resolution") return n.usedByName;
  const seat = holderOf(n);
  return n.name ?? (seat != null ? names?.[seat] : null) ?? null;
}
/**
 * DID THIS ASSET COME BACK TO SOMEBODY WHO ALREADY HAD IT? Generalized off the old
 * pick-only `isHomecoming`.
 *
 * The old check parsed the ORIGINAL ROSTER out of a pick's asset key
 * (`k:<season>-<round>-<orig>`) and asked whether this hop returned it there. That is a
 * real fact and it only ever fired for picks, because only a pick key carries an
 * original owner - so a PLAYER traded away and later reacquired by the same manager,
 * which is the more human version of the same story, went unmarked. This asks the
 * general question instead: does any holder appear twice in the chain?
 *
 * Strictly more general than what it replaces. A pick's origin node carries
 * `rosterId = originalRoster`, so a pick returning to its original owner is a holder
 * appearing twice and is still caught - with no key parsing, and now with the earlier
 * appearance identified rather than merely implied.
 *
 * CONSECUTIVE IS NOT A RETURN. The holder sequence is de-duplicated before the check,
 * because a resolution node inherits the seat that held the pick (the manager who used
 * it) and "you still have it" is not "it came back to you".
 *
 * Says WHAT happened, never why (D19). No verdict, no "loyalty", no pattern claim from
 * two data points.
 *
 * @returns {Map<number, number>} node index -> the earlier node index where that same
 *   holder already had it. Both ends of every pair appear as keys, so the rail can ring
 *   the node it came back to AND the node it was at before.
 */
export function repeatHolders(nodes) {
  /** @type {{seat: number, i: number}[]} */
  const seq = [];
  for (let i = 0; i < nodes.length; i++) {
    const seat = holderOf(nodes[i]);
    if (seat == null) continue;
    if (seq.length && seq[seq.length - 1].seat === seat) continue;
    seq.push({ seat, i });
  }
  const out = new Map();
  const firstAt = new Map();
  for (const { seat, i } of seq) {
    const earlier = firstAt.get(seat);
    if (earlier != null) {
      out.set(i, earlier);
      if (!out.has(earlier)) out.set(earlier, earlier);
    } else {
      firstAt.set(seat, i);
    }
  }
  return out;
}
/**
 * More than two rosters touched the same transaction.
 *
 * `HopBody`'s sentence only ever names the two seats on THIS asset's own end of the
 * hop - `from`/`to` - and that is the right predecessor to walk regardless of how many
 * parties the trade had. But a real three-team deal has OTHER assets moving between
 * OTHER seats in the SAME transaction, and a bare "traded to X by Y" reads exactly like
 * an ordinary two-team trade - the third party's half is invisible unless the reader
 * already knows to open the receipt.
 */
function isMultiTeam(h) {
  return typeof h.parties === "number" && h.parties > 2;
}
/**
 * EVERY EXTRA SENTENCE A HOP CAN CARRY, COMPUTED ONCE.
 *
 * This array replaced two hand-measured row-height constants. `MIN_ROW` was measured
 * against a row WITHOUT a note, `HOMECOMING_ROW = 40` bought one row one note's worth
 * of room, and `isMultiTeam`'s note bought nothing at all - so a hop that was both a
 * homecoming AND a three-team deal overflowed onto the row below it, which is exactly
 * what shipped. The fix is not a third constant. It is that nothing measures text
 * height in JS any more: the row sizes to whatever this array renders as, so a fourth
 * note would need no arithmetic anywhere.
 *
 * Order is fixed and tested: it is the order the notes render in, and a sweep over
 * every combination pins it (see provenance.test.js).
 *
 * @returns {{kind: string, text: string, tone: string}[]}
 */
export function hopNotes(h, repeat) {
  const notes = [];
  if (repeat) {
    notes.push({
      kind: "repeat-holder",
      // MUTED, not accent-text. The old homecoming line was the loudest thing on the
      // rail, and it is not the loudest fact on it - it is a coincidence of ownership
      // worth one plain sentence. Accent in this app means "you" (see
      // DistributionStrip's own note on why its highlight never gives that away), and
      // this is not about the viewer.
      tone: "muted",
      text: repeat.forDays
        ? `Back to ${h.toName}, who had already held this ${formatGap(repeat.forDays * DAY)}.`
        : `Back to ${h.toName}, who had held this before.`,
    });
  }
  if (isMultiTeam(h)) {
    notes.push({
      kind: "multi-team",
      tone: "info",
      text: `Part of a ${h.parties}-team deal - the receipt has the rest.`,
    });
  }
  if (h.commissionerExecuted) {
    notes.push({
      kind: "commissioner",
      tone: "warn",
      // VERBATIM the deal receipt's own lede, because it is the same condition. One
      // condition gets one sentence everywhere it appears - the register's whole
      // argument (D95) applied to a plain-prose caveat.
      text: "Pick record missing. The commissioner executed this deal by hand, and Sleeper records no picks against commissioner moves.",
    });
  }
  return notes;
}
const TONE_CLASS = {
  muted: "text-muted",
  info: "text-info",
  warn: "text-warn",
};
/**
 * Calendar-year boundaries strictly inside a window, as fractions of it.
 *
 * Returns at most one entry per year, so a long gap gets one hairline per year and a
 * gap inside a single year gets none - which is itself the reading: a row with no
 * hairline in it did not cross a year, however tall the row happens to be.
 */
function yearMarksBetween(from, to) {
  if (!(to > from)) return [];
  const out = [];
  const span = to - from;
  const startYear = new Date(from).getUTCFullYear();
  const endYear = new Date(to).getUTCFullYear();
  for (let y = startYear + 1; y <= endYear; y++) {
    const at = Date.UTC(y, 0, 1);
    if (at <= from || at >= to) continue;
    out.push({ year: y, frac: (at - from) / span });
  }
  return out;
}
/** Real draft dates strictly inside a window, as fractions of it. */
function draftMarksBetween(drafts, from, to) {
  if (!drafts?.length || !(to > from)) return [];
  const span = to - from;
  return drafts
    .filter((d) => d.at > from && d.at < to)
    .map((d) => ({ season: d.season, at: d.at, frac: (d.at - from) / span }));
}
const pct = (f) => `${Math.round(f * 1000) / 10}%`;
export function ProvenanceRail({
  chain,
  showTitle,
  className,
  scenes,
  drafts,
  holdDurations,
  names,
}) {
  const nodes = [...chain.events, chain.today];
  const times = nodes.map((n) => n.at);
  const repeats = repeatHolders(nodes);
  /**
   * THE PROPORTIONAL TARGET PER GAP - a target, never a floor.
   *
   * The budget is spread across the gaps in proportion to elapsed time, exactly as
   * before. What changed is what happens when the share is small: it used to be raised
   * to `MIN_ROW` and the axis lost its meaning, and now it is simply passed to CSS as
   * the MAX of a `minmax(min-content, ...)`, where a share smaller than the content is
   * ignored and the row is content-tall. Nothing is floored, so nothing is distorted by
   * a floor; where the target wins, it is exactly proportional.
   */
  const gapCount = Math.max(1, nodes.length - 1);
  const totalSpan = times[times.length - 1] - times[0];
  const budget = Math.min(SPAN_PX, PER_GAP_PX * gapCount);
  const gapTarget = (i) =>
    totalSpan > 0
      ? Math.round((budget * (times[i + 1] - times[i])) / totalSpan)
      : 0;
  /**
   * THE TRACK LIST: node, gap, node, gap, ..., node.
   *
   * A gap is a first-class row now rather than the top padding of the row after it,
   * which is what lets the gap own its holder's scene, its hairlines and its own
   * disclosure. Node rows are `auto`; gap rows carry the proportional target as a max.
   */
  const tracks = [];
  for (let i = 0; i < nodes.length; i++) {
    if (i > 0) tracks.push(`minmax(min-content, ${gapTarget(i - 1)}px)`);
    tracks.push("auto");
  }
  const rowOfNode = (i) => i * 2 + 1;
  const rowOfGap = (i) => i * 2 + 2;
  /*
   * WHICH MARKS ACTUALLY APPEAR, so the legend below names only those.
   *
   * A drawn mark whose meaning is stated nowhere is colour-and-shape as the only
   * encoding, which D47's first rule forbids for a chart and there is no reason to
   * exempt a 20px rail from it: a solid hairline and a dashed one are two different
   * claims about time, and a reader cannot be expected to infer which is which. A
   * legend that lists marks the chain does not contain is its own small dishonesty, so
   * this is computed rather than hardcoded.
   */
  const marksPresent = { year: false, draft: false, rug: false };
  for (let i = 0; i < nodes.length - 1; i++) {
    if (!nodes[i].dated || !nodes[i + 1].dated) continue;
    if (yearMarksBetween(times[i], times[i + 1]).length) marksPresent.year = true;
    if (draftMarksBetween(drafts, times[i], times[i + 1]).length)
      marksPresent.draft = true;
    if (scenes?.[i + 1]?.state === "active") marksPresent.rug = true;
  }
  const legend = [
    marksPresent.year &&
      "a dashed line is a year boundary, a scale rather than an event",
    marksPresent.draft && "a solid line is a draft that actually happened",
    marksPresent.rug &&
      "each tick right of the rail is one move the holder made elsewhere",
  ].filter(Boolean);
  return (
    <div className={className}>
      {showTitle && (
        <p className="mb-1 text-meta font-semibold uppercase tracking-[0.16em] text-accent-text">
          {chain.kind === "pick" ? "Pick provenance" : "Provenance"}
        </p>
      )}
      {/*
        THE SHAPE, IN A SENTENCE, FOR A LISTENER. The rail's marks are all
        `aria-hidden` now - they are a picture OF the list beside them, and a screen
        reader reading both would hear every event twice. What a listener loses that way
        is ORIENTATION: how many events, over how long, in which direction. So the
        summary the old single-SVG `aria-label` carried survives as the one thing on
        this component that is text for a listener and nothing for a viewer.
      */}
      <p className="sr-only">{railLabel(chain)}</p>
      <OwnershipStrip nodes={nodes} names={names} />
      <div
        className="grid gap-x-2"
        style={{
          gridTemplateColumns: `${YEAR_W}px ${RAIL_W}px minmax(0,1fr)`,
          gridTemplateRows: tracks.join(" "),
        }}
      >
        {nodes.map((n, i) => {
          const repeat = repeats.has(i);
          return (
            <div
              key={`rail-${i}`}
              aria-hidden="true"
              className="relative"
              style={{ gridColumn: 2, gridRow: rowOfNode(i) }}
            >
              {/* The spine through this node. It starts at the first dot and stops at
                  the last, so the rail has two ends rather than bleeding off the card. */}
              <span
                className="absolute bg-border-strong"
                style={{
                  left: CX - 1,
                  width: 2,
                  top: i === 0 ? DOT_CY : 0,
                  bottom: i === nodes.length - 1 ? `calc(100% - ${DOT_CY}px)` : 0,
                }}
              />
              <NodeMark
                node={n}
                last={i === nodes.length - 1}
                ring={repeat}
              />
            </div>
          );
        })}

        {nodes.map((n, i) => (
          <div
            key={`body-${i}`}
            style={{ gridColumn: 3, gridRow: rowOfNode(i), paddingTop: 1 }}
            className="min-w-0"
          >
            <NodeBody node={n} repeat={repeatNote(nodes, times, repeats, i)} />
          </div>
        ))}

        {nodes.slice(0, -1).map((_, i) => {
          const from = times[i];
          const to = times[i + 1];
          const scene = scenes?.[i + 1] ?? null;
          const dated = nodes[i].dated && nodes[i + 1].dated;
          const years = dated ? yearMarksBetween(from, to) : [];
          const draftHits = dated ? draftMarksBetween(drafts, from, to) : [];
          return (
            <GapRow
              key={`gap-${i}`}
              index={i}
              rowOfGap={rowOfGap}
              from={from}
              to={to}
              dated={dated}
              years={years}
              drafts={draftHits}
              scene={scene}
              holdDurations={holdDurations}
            />
          );
        })}
      </div>
      {legend.length > 0 && (
        <p className="mt-1.5 text-micro leading-snug text-faint">
          On the rail: {legend.join("; ")}.
        </p>
      )}
    </div>
  );
}
/**
 * One gap: the year gutter, the spine segment with its hairlines and rug, and the text.
 *
 * Every mark in here is placed by PERCENTAGE of the row, which is the whole reason the
 * hairlines are honest: within one gap the map from time to pixels is exactly linear,
 * so a percentage IS the true position. The nonlinearity lives only BETWEEN rows, and
 * that is precisely what the hairlines expose - a row with three of them next to a row
 * with none is a reader being told, correctly, that the two rows are not the same scale.
 */
function GapRow({
  index,
  rowOfGap,
  from,
  to,
  dated,
  years,
  drafts,
  scene,
  holdDurations,
}) {
  const row = rowOfGap(index);
  return (
    <>
      {/* THE YEAR GUTTER. Grid stretches it to the gap row's height, so a `top`
          percentage lands in the right place at every height with no measurement -
          WindowMap's ordinal-gutter idiom, and the reason no year is an SVG <text>. */}
      <div
        aria-hidden="true"
        className="relative"
        style={{ gridColumn: 1, gridRow: row }}
      >
        {years.map((y) => (
          <span
            key={y.year}
            className="figure absolute right-0 -translate-y-1/2 text-micro leading-none text-faint"
            style={{ top: pct(y.frac) }}
          >
            {y.year}
          </span>
        ))}
      </div>

      <div
        aria-hidden="true"
        className="relative"
        style={{ gridColumn: 2, gridRow: row }}
      >
        <span
          className="absolute inset-y-0 bg-border-strong"
          style={{ left: CX - 1, width: 2 }}
        />
        {/*
          TWO CHANNELS, ONE EITHER SIDE OF THE SPINE, and the split is not decorative.
          Both the scale marks and the rug are short horizontal ticks in a 20px column,
          and the first render had them overlapping in the same few pixels - a dashed
          1px gridline and a solid 2px activity tick are genuinely hard to tell apart at
          that size, which meant the rail was drawing "a year passed" and "the manager
          made a trade" as very nearly the same mark. So: LEFT of the spine is the
          SCALE, and it lines up with its own year label in the gutter immediately left
          of it. RIGHT of the spine is what the HOLDER did. Nothing has to be
          distinguished by weight, because nothing shares a channel.
        */}
        {/* DASHED IS A SCALE. A calendar-year boundary the reader brought with them. */}
        {years.map((y) => (
          <span
            key={`y${y.year}`}
            className="absolute"
            style={{
              top: pct(y.frac),
              left: 0,
              width: CX - 1,
              borderTop: `1px dashed ${CHART_GRID}`,
            }}
          />
        ))}
        {/* SOLID IS A FACT. A draft that actually happened on a recorded day. Drawn on
            the scale side because it is a mark on the axis, not an act of the holder -
            and solid against dashed is exactly WindowMap's own distinction. */}
        {drafts.map((d) => (
          <span
            key={`d${d.season}`}
            className="absolute"
            style={{
              top: pct(d.frac),
              left: 0,
              width: CX - 1,
              borderTop: `1px solid ${CHART_NEUTRAL}`,
            }}
          />
        ))}
        {scene?.state === "active" &&
          scene.marks.map((m, k) => (
            /*
             * THE RUG - one tick per move the holder made elsewhere, positioned in
             * time. DistributionStrip's peer-tick discipline exactly: FLAT, never the
             * magnitude ramp, because a tick's POSITION is its value and ramping it
             * would fade the sparse end of a rug whose whole job is showing where the
             * moves were not. Neutral rather than the strip's accent, because accent
             * means "you" in this app and these are somebody else's ordinary weeks.
             */
            <span
              key={k}
              className="absolute"
              style={{
                top: pct(m.frac),
                left: CX + 2,
                width: 8,
                height: 2,
                borderRadius: 1,
                backgroundColor: CHART_NEUTRAL,
                opacity: 0.75,
              }}
            />
          ))}
      </div>

      <div
        style={{ gridColumn: 3, gridRow: row, paddingTop: 2 }}
        className="min-w-0"
      >
        {dated && to > from && (
          <p className="figure text-micro leading-normal text-faint">
            {formatGap(to - from)} later
          </p>
        )}
        <GapScene scene={scene} holdDurations={holdDurations} />
      </div>
    </>
  );
}
/**
 * THE GAP'S THREE STATES, and none of them is an empty cell.
 *
 * The page-level disclosure this replaces asked one league-wide question about one gap
 * per chain, and the answer was the same paragraph on every never-traded player's page
 * because the window was the same window. A gap belongs to whoever was holding the
 * thing, so that is who it now reports on - and every gap gets its own, not just the
 * longest.
 */
function GapScene({ scene, holdDurations }) {
  if (!scene) return null;
  if (scene.state === "undated") {
    // NOT AN EMPTY CELL, AND NOT A ZERO. There is no window here, so there is nothing
    // to have counted - which is a different statement from "nothing happened", and
    // the register exists so the difference is sayable (D95).
    return (
      <RefusalMark className="mt-0.5">
        {refusalSentence(scene.refusal)}
      </RefusalMark>
    );
  }
  const who = scene.holderName ?? "the holder";
  const span = formatGap(scene.days * DAY);
  if (scene.state === "idle") {
    /*
     * A TRUE ZERO IS REAL INFORMATION (D40). "They did nothing for two years" is one of
     * the more interesting things this rail can say, and the league's own count is
     * printed beside it so the zero has a scale - without it, a quiet stretch and a
     * quiet manager are indistinguishable.
     */
    return (
      <p className="text-meta leading-snug text-muted">
        {who} made no other move in those {span}, while the league recorded{" "}
        <span className="figure">{scene.leagueTotal}</span>.
      </p>
    );
  }
  return (
    <div className="min-w-0">
      <p className="text-meta leading-snug text-muted">
        While {who} held this - {span} - they made {countPhrase(scene)}.
      </p>
      <HoldComparison scene={scene} holdDurations={holdDurations} />
    </div>
  );
}
/** "3 other trades and 11 waiver moves" - omits any kind that was zero. */
function countPhrase(a) {
  const parts = [];
  if (a.trades)
    parts.push(`${a.trades} other trade${a.trades === 1 ? "" : "s"}`);
  if (a.waivers)
    parts.push(`${a.waivers} waiver move${a.waivers === 1 ? "" : "s"}`);
  if (a.freeAgents)
    parts.push(
      `${a.freeAgents} free-agent signing${a.freeAgents === 1 ? "" : "s"}`,
    );
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
/**
 * THIS HOLD AGAINST THE SAME MANAGER'S OTHER COMPLETED HOLDS - two numbers, no verdict.
 *
 * BOTH NUMBERS, NO THIRD ONE. D45's precedent, applied exactly: print what this hold
 * was and print what their others run, and compute NO delta, NO ratio and NO
 * comparative adjective. "Shorter than usual" is a verdict about a manager built out of
 * two numbers that do not support one - a hold ends when a trade happens, and a trade
 * needs a counterparty, so a short hold is at least as much a fact about the rest of
 * the league as about the holder.
 *
 * Both numbers are printed in ONE unit (`formatDaysPair`), because "41 days" against
 * "3 months" is a comparison the reader has to finish themselves.
 *
 * TWO GATES, both of which print something rather than nothing:
 *   (a) Below `MIN_HOLDS_FOR_MEDIAN` prior holds the median is one or two holds wearing
 *       a statistic's clothes, so the strip is replaced by `INSUFFICIENT_SAMPLE` with
 *       the count that disqualified it - a refusal that shows its own arithmetic.
 *   (b) An OPEN hold (the asset has not moved since) has no duration yet, only elapsed
 *       time. Comparing it to a median would let the passage of time alone turn a
 *       "short" hold into a "long" one. So the comparison is shown only once elapsed
 *       time has ALREADY passed the median, where the reading is true regardless of
 *       when the hold eventually ends; before that it prints elapsed time and stops.
 */
function HoldComparison({ scene, holdDurations }) {
  if (!holdDurations || scene.holderRosterId == null) return null;
  const all = holdDurations.get(scene.holderRosterId) ?? [];
  // This hold is not one of its own peers: remove one instance of it so the median it
  // is read against is genuinely "their OTHER holds".
  const others = [...all];
  const self = others.indexOf(scene.days);
  if (self >= 0) others.splice(self, 1);
  const who = scene.holderName ?? "The holder";
  if (others.length < MIN_HOLDS_FOR_MEDIAN) {
    return (
      <RefusalMark className="mt-1">
        {refusalSentence(
          refusal(
            "INSUFFICIENT_SAMPLE",
            `${who} has ${others.length} other completed trade-to-trade hold${
              others.length === 1 ? "" : "s"
            } on record, under the ${MIN_HOLDS_FOR_MEDIAN} this comparison needs, so no median is published`,
          ),
        )}
      </RefusalMark>
    );
  }
  const sorted = [...others].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const open = scene.open === true;
  if (open && scene.days <= median) {
    return (
      <p className="mt-1 text-meta leading-snug text-muted">
        {formatGap(scene.days * DAY)} so far, and still theirs - no comparison
        while the hold is open and could still run to any length.
      </p>
    );
  }
  const [mineText, medianText] = formatDaysPair(scene.days, median);
  return (
    <Disclosure
      summary={`How long ${who} usually holds one`}
      className="mt-1.5"
    >
      <DistributionStrip
        label="This hold, against their others"
        values={[...others, scene.days]}
        mine={scene.days}
        noun="completed holds"
        format={daysFormatter(Math.min(...others, scene.days))}
        sub={`${who} held this ${mineText}${open ? " so far" : ""}. Their other ${others.length} completed holds run a median of ${medianText}. Neither end is better: a hold ends when a trade happens, and that takes a counterparty.`}
      />
    </Disclosure>
  );
}
/**
 * TRUE PROPORTIONAL TIME, once, where nothing competes for the space.
 *
 * This is where the rail's old claim went. One horizontal bar per holder, width exactly
 * proportional to how long they held it - no floor, no budget, no content fighting for
 * the same pixels - so the one thing the y-axis could never honestly say ("this stretch
 * was four times that one") is said here exactly. Renders only when every boundary it
 * needs is dated and there is more than one holder, because a strip with a guessed
 * segment would be worse than no strip.
 *
 * No labels inside it: at 320px a fourteen-character team name does not fit a 12%
 * segment, and a truncated name in a chart is a name nobody can read. The rail beside
 * it names every holder in full, in order, which is the same information with room.
 */
function OwnershipStrip({ nodes, names }) {
  /*
   * ONLY THE DATED PART, AND IT SAYS SO.
   *
   * The first version returned null if ANY boundary was undated, which sounded
   * conservative and was actually a bug: measured on the corpus, 118 gaps carry an
   * undated end - overwhelmingly a `pre-record` or `pick-original` origin, i.e. the
   * FIRST node - so suppressing the whole strip on that basis deleted it from most of
   * the chains that have anything to show. An undated segment cannot be drawn to
   * width, but the dated ones can, and dropping them too is not caution; it is
   * throwing away a measurement because a different one was missing.
   *
   * So an undated segment is SKIPPED and the omission is stated in the caption. The
   * bar is exactly proportional over the span it claims, and it claims only that span.
   */
  const segs = [];
  let skipped = 0;
  for (let i = 0; i < nodes.length - 1; i++) {
    if (!nodes[i].dated || !nodes[i + 1].dated) {
      skipped++;
      continue;
    }
    const ms = nodes[i + 1].at - nodes[i].at;
    if (ms <= 0) continue;
    segs.push({
      name: holderNameOf(nodes[i], names) ?? "this seat",
      ms,
    });
  }
  if (segs.length < 2) return null;
  const total = segs.reduce((s, x) => s + x.ms, 0);
  if (total <= 0) return null;
  const longest = segs.reduce((a, b) => (b.ms > a.ms ? b : a));
  return (
    <div className="mb-2">
      <div
        className="flex h-2 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={
          `Ownership over time, drawn in exact proportion: ` +
          segs.map((s) => `${s.name} ${formatGap(s.ms)}`).join(", ") +
          `. Longest single hold: ${longest.name}, ${formatGap(longest.ms)} of the ${formatGap(total)} covered here.` +
          (skipped
            ? ` ${skipped} earlier stretch${skipped === 1 ? "" : "es"} had no recorded date and ${skipped === 1 ? "is" : "are"} not drawn.`
            : "")
        }
      >
        {segs.map((s, i) => (
          <span
            key={i}
            /* The longest holder is the reading this strip exists to give away, so it
               is the one segment drawn at full strength. Every other segment is the
               same hue at the same weaker strength - not a ramp, because the WIDTHS
               already carry the ordering and a ramp would restate it (D48).
               
               THE SURFACE-COLOURED SEPARATOR is load-bearing, not trim. Without it the
               five weaker segments composited into one uninterrupted band and the strip
               stopped being countable - it showed "the longest one" and lost "how many
               there were", which is half of what a proportional bar is for. Same trick
               CoherenceFragilityQuadrant uses to keep two overlapping dots reading as
               two dots. Deliberately NO minimum width: a two-week hold really is a
               hairline here, and widening it to be visible would be the exact
               distortion this strip exists to avoid. */
            style={{
              width: pct(s.ms / total),
              backgroundColor: CHART_NEUTRAL,
              opacity: s === longest ? 1 : 0.4,
              borderRight:
                i === segs.length - 1
                  ? undefined
                  : "1px solid var(--color-surface)",
            }}
          />
        ))}
      </div>
      <p className="mt-1 text-micro leading-snug text-faint">
        Proportional time, unlike the rail below. Longest hold:{" "}
        <span className="text-muted">{longest.name}</span>,{" "}
        {formatGap(longest.ms)} of {formatGap(total)}
        {skipped
          ? `, and ${skipped} undated stretch${skipped === 1 ? "" : "es"} left out.`
          : "."}
      </p>
    </div>
  );
}
/** The dot, the square, and the ring - all in a fixed-width box, so nothing scales. */
function NodeMark({ node, last, ring }) {
  const isResolution = node.node === "resolution";
  const fill = last
    ? "var(--color-accent)"
    : isResolution
      ? "var(--color-info)"
      : node.dated
        ? "var(--color-ink)"
        : "var(--color-bg)";
  const stroke = last
    ? "var(--color-accent)"
    : isResolution
      ? "var(--color-info)"
      : "var(--color-border-strong)";
  return (
    <svg
      width={DOT}
      height={DOT}
      viewBox={`0 0 ${DOT} ${DOT}`}
      aria-hidden="true"
      className="absolute"
      style={{ left: CX - DOT / 2, top: DOT_CY - DOT / 2 }}
    >
      {/*
       * THE REPEAT-HOLDER RING - CoherenceFragilityQuadrant's own "this one again"
       * idiom, at its exact geometry: r=9 around an r=5 dot, 1px stroke, 0.75 opacity.
       * The one deliberate change is the hue. That chart rings the VIEWER'S dot and
       * uses accent, and accent means "you" everywhere in this app; a returning holder
       * is a fact about the asset, not about who is reading. So the ring is neutral and
       * the sentence beside it is muted.
       */}
      {ring && (
        <circle
          cx={CX}
          cy={CX}
          r={9}
          fill="none"
          stroke={CHART_NEUTRAL}
          strokeWidth={1}
          opacity={0.75}
        />
      )}
      {isResolution ? (
        // The species change gets a different SHAPE, not only a different colour: it is
        // the one node that is a different kind of event, and hue alone would not say so
        // to every reader.
        //
        // A SQUARE, NOT A DIAMOND (D96). This was `rotate(45)` - a diamond - and it was
        // the last mark in the app carrying DATA on the reserved angle. The diagonal now
        // means one thing everywhere in this product: a refusal, something Parquet
        // declines to state. A resolution node is the opposite of a refusal; it is the
        // most stated thing on the rail. Dropping the rotation costs nothing the mark
        // was using: square against circle is still a shape difference, still
        // categorical, still legible with every colour deleted, and it now sits square
        // to the orthogonal seams the rest of the rail is built from.
        <rect
          x={CX - 5}
          y={CX - 5}
          width={10}
          height={10}
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
        />
      ) : (
        <circle
          cx={CX}
          cy={CX}
          r={last ? 6 : 5}
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
        />
      )}
    </svg>
  );
}
/**
 * The repeat-holder note for node `i`, with the earlier hold's length when it is
 * knowable. Returns null for the EARLIER end of a pair: that node gets the ring, and
 * the sentence belongs at the return, where the reader is when the fact becomes true.
 */
function repeatNote(nodes, times, repeats, i) {
  const earlier = repeats.get(i);
  if (earlier == null || earlier === i) return null;
  const datedRun =
    nodes[earlier].dated && nodes[earlier + 1]?.dated
      ? Math.round((times[earlier + 1] - times[earlier]) / DAY)
      : null;
  return { forDays: datedRun };
}
function NodeBody({ node, repeat }) {
  if (node.node === "origin") return <OriginBody o={node} />;
  if (node.node === "hop") return <HopBody h={node} repeat={repeat} />;
  if (node.node === "resolution") return <ResolutionBody r={node} />;
  return (
    <div>
      <p className="text-body font-semibold leading-snug text-accent-text">
        Today
      </p>
      {/* A pending pick is a genuine D19 refusal, not a fact yet to arrive: nobody
          knows when this draft happens, and the app will not guess. `node.text` still
          prints verbatim (D44: /drafts and this rail must describe the same unresolved
          pick in the same words), only wrapped. */}
      {node.pending ? (
        <RefusalMark className="mt-0.5">{node.text}</RefusalMark>
      ) : (
        <p className="text-meta leading-snug text-muted">{node.text}</p>
      )}
    </div>
  );
}
function OriginBody({ o }) {
  return (
    <div>
      <p className="text-body font-semibold leading-snug text-ink">{o.text}</p>
      <p className="figure text-micro leading-normal text-faint">
        {o.dated ? <LocalDate ts={o.at} /> : "on or before the record opens"}
      </p>
    </div>
  );
}
function HopBody({ h, repeat }) {
  const notes = hopNotes(h, repeat);
  return (
    <div className="min-w-0">
      <Link
        href={dealHref(h.tradeId)}
        className="group inline-flex min-h-11 max-w-full items-start gap-1 text-left"
        aria-label={`Traded to ${h.toName} in ${h.season}. ${notes
          .map((n) => n.text)
          .join(" ")} Open the deal.`}
      >
        <span className="min-w-0">
          <span className="block truncate text-body font-semibold leading-snug text-ink group-hover:text-accent-text">
            Traded to {h.toName}
          </span>
          <span className="block truncate text-meta leading-snug text-muted">
            by {h.fromName} · as {h.assetLabel}
          </span>
        </span>
        <ChevronRight
          size={13}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-faint group-hover:text-accent-text"
        />
      </Link>
      {notes.map((n) => (
        <p
          key={n.kind}
          className={`text-meta leading-snug ${TONE_CLASS[n.tone]}`}
        >
          {n.text}
        </p>
      ))}
      <p className="figure text-micro leading-normal text-faint">
        <LocalDate ts={h.at} /> · {h.season} wk {h.week}
      </p>
    </div>
  );
}
function ResolutionBody({ r }) {
  return (
    <div className="min-w-0">
      <Link
        href={
          r.pickNo
            ? `/drafts/${r.season}?pick=${r.pickNo}#pick-${r.pickNo}`
            : `/drafts/${r.season}`
        }
        className="group inline-flex min-h-11 max-w-full items-start gap-1.5 text-left"
        aria-label={`The pick became ${r.playerName}. Open the ${r.season} draft board.`}
      >
        {/* The one face on this rail: the moment a pick - an abstraction with no face of
            its own - resolves into an actual person. Every other node here is a fantasy
            manager or a date, so this is also the only place `PlayerAvatar` earns a spot
            rather than making a five-node time axis into a second player list. */}
        <PlayerAvatar
          name={r.playerName}
          playerId={r.playerId}
          size="sm"
          className="mt-0.5"
        />
        <span className="min-w-0">
          <span className="block truncate text-body font-semibold leading-snug text-info group-hover:underline">
            The pick became {r.playerName}
          </span>
          <span className="block truncate text-meta leading-snug text-muted">
            {r.season} {ordinal(r.round)}
            {r.pickNo ? ` · pick #${r.pickNo}` : ""}
            {r.usedByName ? ` · used by ${r.usedByName}` : ""}
          </span>
        </span>
        <ChevronRight
          size={13}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-faint group-hover:text-info"
        />
      </Link>
      <p className="figure text-micro leading-normal text-faint">
        {r.dated ? <LocalDate ts={r.at} /> : `${r.season} draft`}
      </p>
    </div>
  );
}
/** A full sentence describing the SHAPE, since the list beside it carries the detail. */
function railLabel(chain) {
  const hops =
    chain.hops === 0
      ? "no trades"
      : `${chain.hops} trade${chain.hops === 1 ? "" : "s"}`;
  const draft = chain.crossesDraft ? ", crossing one draft" : "";
  return `Time rail for ${chain.label}: ${chain.events.length + 1} events over ${formatGap(chain.spanDays * DAY)}, oldest at the top, read top to bottom, involving ${hops}${draft}. The same events are listed below.`;
}
/**
 * The one-line summary of a chain, for a row that has not opened the rail yet.
 *
 * Written as a SENTENCE rather than a stat line because it is the sales pitch for
 * tapping: "three trades and a draft over 4.1 years" is a story, "3 hops" is a count.
 */
export function chainSummary(chain) {
  const parts = [];
  if (chain.hops > 0)
    parts.push(`${chain.hops} trade${chain.hops === 1 ? "" : "s"}`);
  if (chain.crossesDraft) parts.push("a draft");
  if (parts.length === 0) return "Never traded";
  const joined =
    parts.length === 1
      ? parts[0]
      : `${parts[0]} and ${parts.slice(1).join(", ")}`;
  return `${joined} over ${formatGap(chain.spanDays * DAY)}`;
}
