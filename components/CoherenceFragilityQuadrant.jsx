"use client";
/**
 * THE COHERENCE x FRAGILITY BOARD.
 *
 * Every roster in the league on both proprietary metrics at once:
 *
 *   y = Timeline Coherence Index  (do the assets agree about WHEN this team wins)
 *   x = Roster Fragility Index    (how much of the season is load-bearing on a few names)
 *
 * Nowhere else in the app can you see both at once for more than two managers, which
 * means the intersection that actually decides seasons - straddling AND top-heavy -
 * has never been visible. It is the bottom-right corner here, and it is the only
 * region that gets a tint.
 *
 * Hand-rolled inline SVG, no chart library (DECISIONS D3), sized for 390px.
 *
 * COLOUR. Only the y axis is coloured, on the four-step red-to-green ramp defined per
 * theme in globals.css as --tci-1..4. Fragility gets position and nothing else,
 * because low fragility is not the same as good (D23) and a green low-RFI end would
 * be a lie. The ramp carries its ordering in LIGHTNESS as well as hue, so it survives
 * red-green colour blindness; see the verification note above the tokens.
 *
 * Client component because the board is tappable. Every coordinate is rounded before
 * it reaches an attribute - unrounded floats serialize differently server-side and
 * client-side and have killed hydration on this project before.
 *
 * ---------------------------------------------------------------------------------
 * NO <text> INSIDE A SCALING viewBox (D96) - this chart was the last violation
 * ---------------------------------------------------------------------------------
 * Every label here used to be an SVG `<text>` at `fontSize` 7.5, 8 or 8.5, inside a
 * `viewBox="0 0 320 236"` stretched by `w-full`. D96 fixed WindowMap and made the rule
 * product-wide (DESIGN.md); this file kept the bug for a round. A user unit is only a
 * real pixel at scale 1, and this chart never renders at scale 1 - on a 390pt phone the
 * card gives the plot about 338px, so every label rendered ~5.6% larger than the number
 * written here, at a size off the six-step type scale entirely and unreachable by any
 * token, because the number lived in a presentation attribute measured in user units.
 *
 * All of it is now HTML in an overlay, positioned as a PERCENTAGE of the same viewBox
 * coordinates the marks use. The viewBox has a fixed aspect ratio, so a percentage
 * tracks the scale for free: no resize listener, no measured box, and the labels stay
 * in register with the geometry at every width. Four label layers, all `aria-hidden`
 * (the SVG's own `aria-label` and the panel below it carry the reading):
 *
 *   corner captions   the four quadrant names, at the four corners of the plot
 *   tick values       x under the frame, y outside its left edge
 *   axis titles       one under the plot, one rotated up its left side
 *   dot ordinals      each roster's row number, placed by `placeLabels`
 *
 * `placeLabels` still does the collision avoidance in viewBox units, because that is
 * the space the dots are in. Its `dy` is a BASELINE offset (it was written for
 * `<text>`), so an HTML label positioned at that y has to be pulled up by its own
 * height - `translateY(-100%)` - and anchored horizontally by its `anchor`. That
 * translation is the entire adaptation; the placement algorithm is untouched.
 *
 * THE RADII PASSED TO `placeLabels` DO NOT DEPEND ON THE SELECTION, deliberately. They
 * reserve room for the widest ring a dot can ever wear, so selecting a roster never
 * reflows fourteen labels - a chart whose text jumps on every tap is harder to read
 * than one whose labels sit slightly further out than they strictly need to.
 *
 * ---------------------------------------------------------------------------------
 * TWO RINGS THAT HAVE TO COMPOSE, AND A DOT THAT CAN STATE ITS OWN NUMBERS
 * ---------------------------------------------------------------------------------
 * "You" and "selected" are different facts and are frequently the same roster, so they
 * cannot share a mark. They are two concentric rings at different radii and weights:
 *
 *   selected   a SOLID ink ring at the dot's own edge. It was dashed and muted, and
 *              dashed reads as provisional - a selection is chosen, not tentative.
 *   you        a thinner accent ring further out, unchanged in colour because the
 *              accent is the viewer's identity everywhere in this app.
 *
 * Both at once renders as dot, ink ring, accent ring, outward - which is legible as
 * "this is me and I have it selected" rather than as one ambiguous blob.
 *
 * Colour does none of the selection work, because colour on this chart is the Y AXIS:
 * the TCI ramp is the altitude, and a selected dot keeps its ramp fill untouched.
 *
 * THE LEADER LINES ARE NOT DECORATION. A scatter plot cannot let one dot state its own
 * numbers - a reader can see that a dot is high and right, and cannot read that it is
 * 62 and 55 - so the selected dot drops a dashed rule to each axis with the actual
 * value printed at the axis end. Dashed, matching the median dividers, because both are
 * reference lines rather than data; orthogonal, per D96.
 */
import { useMemo } from "react";
import { MetricGloss } from "@/components/MetricGloss";
import {
  QUADRANTS,
  TCI_BANDS,
  axisDomain,
  axisTicks,
  placeLabels,
} from "@/lib/metrics/quadrant";
const GRID = "var(--color-border)";
const FAINT = "var(--color-faint)";
const MUTED = "var(--color-muted)";
const INK = "var(--color-ink)";
const ACCENT = "var(--color-accent)";
const NEG = "var(--color-negative)";
const SURFACE = "var(--color-surface)";
const STEP_INK = [
  "var(--tci-1)",
  "var(--tci-2)",
  "var(--tci-3)",
  "var(--tci-4)",
];
const W = 320;
/**
 * THE PADDING GREW WHEN THE LABELS BECAME REAL TYPE, and that is the honest cost of
 * D96's rule rather than a regression.
 *
 * Every inset here used to be sized against SVG `<text>` at `fontSize="8.5"`, which
 * rendered at roughly 9px and, on the left, let the rotated axis title at x=8 sit a
 * hair inside the y tick values ending at x=22. At the real `--text-micro` 10px the two
 * genuinely collide, so `PAD_L` goes 26 -> 34 (ticks now end at 30, the rotated title
 * occupies about 2 to 14, and the two clear each other) and `PAD_B` goes 38 -> 48 to
 * hold three 10px lines below the frame - corner captions, tick values, axis title -
 * that were three ~9px lines packed into 38.
 *
 * `H` follows `PAD_B`. The plot loses 8 units of width and gains none of height; what
 * it buys is labels on the type scale, which is the trade D96 already made for the
 * window map.
 */
const H = 248;
const PAD_L = 34;
const PAD_R = 10;
const PAD_T = 24;
const PAD_B = 48;
const X0 = PAD_L;
const X1 = W - PAD_R;
const Y0 = PAD_T;
const Y1 = H - PAD_B;
const r1 = (v) => Math.round(v * 10) / 10;
/** Baselines for the three HTML label rows below the frame, in viewBox units. */
const CAPTION_BASE = Y1 + 12;
const TICK_BASE = Y1 + 25;
const TITLE_BASE = H - 3;
/*
 * viewBox coordinates as percentages of the box.
 *
 * This is the whole mechanism that lets HTML labels track a scaling SVG: the viewBox
 * has a fixed aspect ratio, so a percentage of the box resolves to the same point at
 * every rendered width, with no measurement and no resize listener.
 */
const pctX = (x) => `${r1((x / W) * 100)}%`;
const pctY = (y) => `${r1((y / H) * 100)}%`;
/**
 * The transform that makes an HTML label land where a `<text>` node would have.
 *
 * `placeLabels` returns a BASELINE offset and an SVG `text-anchor`, because it was
 * written for `<text>`. An HTML box positioned at that point has its TOP there, so it
 * is pulled up by its own height; horizontally, `start` / `middle` / `end` become 0 /
 * -50% / -100% of its own width.
 */
function anchorTransform(anchor) {
  const x = anchor === "end" ? "-100%" : anchor === "middle" ? "-50%" : "0";
  return `translate(${x}, -100%)`;
}
/**
 * @param {Object} props
 * @param {Object} props.view the joined board from `buildQuadrantView`
 * @param {number|null} props.selectedId the roster selected page-wide, or null
 * @param {(rosterId: number) => void} props.onSelect
 */
export function CoherenceFragilityQuadrant({ view, selectedId, onSelect }) {
  const { points, tciMid, fragilityMid, counts } = view;
  const me = points.find((p) => p.isMe) ?? null;
  /*
   * SELECTION IS NOT THIS COMPONENT'S STATE ANY MORE.
   *
   * It held its own `useState` and its own dot rail, which made it the only surface on
   * /league that knew which roster the reader was looking at - so switching to the window
   * map lost the selection, and the power ranking under both charts had no idea one
   * existed. Selection is now page state in `?roster=` (lib/league/url.js), owned by
   * LeagueBoard, and this component renders it. The fallback chain is unchanged: an
   * unresolvable selection lands on the viewer's own roster rather than on an empty board.
   */
  const selected =
    points.find((p) => p.rosterId === selectedId) ?? me ?? points[0] ?? null;
  const geom = useMemo(() => {
    // Domains come off whatever the metrics return today. TCI is documented 0..100 so
    // it may clamp; RFI gets a floor and NO ceiling, because its scale is still being
    // worked on and an assumed 100 would silently crop a roster off the board.
    const [yLo, yHi] = axisDomain(
      points.map((p) => p.tci),
      {
        pad: 4,
        minSpan: 30,
        hardMin: 0,
        hardMax: 100,
      },
    );
    const [xLo, xHi] = axisDomain(
      points.map((p) => p.fragility),
      {
        pad: 4,
        minSpan: 30,
        hardMin: 0,
      },
    );
    const x = (v) => r1(X0 + ((v - xLo) / (xHi - xLo || 1)) * (X1 - X0));
    const y = (v) => r1(Y0 + (1 - (v - yLo) / (yHi - yLo || 1)) * (Y1 - Y0));
    const placed = points.map((p) => ({ x: x(p.fragility), y: y(p.tci) }));
    /*
     * ROOM FOR THE WIDEST RING A DOT CAN EVER WEAR, not for the one it wears right now.
     *
     * The viewer's dot carries the outer accent ring (r 11.5), and any dot can become
     * the selected one and grow the ink ring (r 8). Sizing these off the CURRENT
     * selection would relayout fourteen labels on every tap, and a chart whose text
     * jumps when you touch it is harder to read than one whose labels sit a unit or two
     * further out than they strictly need to. So `selectedId` is deliberately not a
     * dependency of this memo, and the geometry is stable for the life of the board.
     */
    const radii = points.map((p) => (p.isMe ? 13 : 9.5));
    const labels = placeLabels(placed, {
      // 11 x 10 user units is a two-digit tabular figure at the real 10px, measured
      // rather than guessed: `h` was 8 when these were ~9px SVG glyphs.
      w: 11,
      h: 10,
      gap: 2.5,
      bounds: [X0 + 1, Y0 + 1, X1 - 1, Y1 - 1],
      radii,
    });
    return {
      x,
      y,
      placed,
      labels,
      midX: x(fragilityMid),
      midY: y(tciMid),
      xTicks: axisTicks(xLo, xHi, 4),
      yTicks: axisTicks(yLo, yHi, 4),
    };
  }, [points, tciMid, fragilityMid]);
  // Null only when the league has no scored roster at all, which is also the only
  // case where the board has nothing to say.
  if (!selected) return null;
  const selIndex = points.findIndex((p) => p.rosterId === selected.rosterId);
  const selAt = selIndex >= 0 ? geom.placed[selIndex] : null;
  return (
    <div className="rounded-[--radius] border border-border bg-surface p-2.5">
      {/*
          THE PLOT AND ITS LABEL LAYER, in one aspect-locked box.

          `relative` on the wrapper plus percentage positions on the children is what
          keeps HTML type in register with a scaling viewBox - see the header. The SVG
          establishes the box's height (it is the only thing in normal flow here), so
          every overlay child measures against exactly the rendered plot.
        */}
      <div className="relative select-none">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          role="img"
          aria-label={
            `Every roster plotted on timeline coherence against roster fragility. ` +
            `${counts.splitTopHeavy} of ${points.length} sit below the median on coherence ` +
            `and above it on fragility, the quadrant with no good reading. ` +
            `Selected: ${selected.name}, coherence ${selected.tci}, fragility ${selected.fragility}. ` +
            `The same figures are listed under the chart.`
          }
        >
          {/* The one region that is bad on both counts gets the only tint, the same
            way the straddling band is the only tint on the duration board. */}
          <rect
            x={geom.midX}
            y={geom.midY}
            width={r1(X1 - geom.midX)}
            height={r1(Y1 - geom.midY)}
            fill={NEG}
            opacity={0.07}
          />
          <rect
            x={X0}
            y={Y0}
            width={X1 - X0}
            height={Y1 - Y0}
            fill="none"
            stroke={GRID}
            strokeWidth={1}
          />

          {/* Median dividers. Labelled as medians in the caption below, never as a
            pass mark - half the league is under either one by construction. */}
          <line
            x1={geom.midX}
            y1={Y0}
            x2={geom.midX}
            y2={Y1}
            stroke={GRID}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <line
            x1={X0}
            y1={geom.midY}
            x2={X1}
            y2={geom.midY}
            stroke={GRID}
            strokeWidth={1}
            strokeDasharray="3 3"
          />

          {/* Axis ticks. Marks only - every value is HTML, outside the viewBox (D96). */}
          {geom.xTicks.map((t) => (
            <line
              key={`x${t}`}
              x1={geom.x(t)}
              y1={Y1}
              x2={geom.x(t)}
              y2={Y1 + 3}
              stroke={FAINT}
              strokeWidth={1}
            />
          ))}

          {/*
              THE LEADER LINES. Drawn before the dots so a dot always sits on top of its
              own rules, and dashed to match the median dividers - both are reference
              lines rather than data. They exist because a scatter plot cannot otherwise
              let one dot state its own two numbers; the numbers themselves are printed
              at the axis ends in the overlay below.
            */}
          {selAt && (
            <g>
              <line
                x1={selAt.x}
                y1={selAt.y}
                x2={selAt.x}
                y2={Y1}
                stroke={MUTED}
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              <line
                x1={X0}
                y1={selAt.y}
                x2={selAt.x}
                y2={selAt.y}
                stroke={MUTED}
                strokeWidth={1}
                strokeDasharray="2 2"
              />
            </g>
          )}

          {/* Dots. The viewer's own and the selected one wear rings at different radii
            and weights, so the two facts compose when they are the same roster. */}
          {points.map((p, i) => {
            const c = geom.placed[i];
            const isSel = selected.rosterId === p.rosterId;
            const ink = STEP_INK[p.tciStep - 1];
            return (
              <g
                key={p.rosterId}
                onClick={() => onSelect(p.rosterId)}
                style={{ cursor: "pointer" }}
                // Nothing drawn inside this group may become the pointer target: a
                // thumb landing on the printed number has to count as a tap on the
                // dot, not as the start of a text drag over an eight-pixel glyph.
                pointerEvents="none"
              >
                {/* Finger-sized hit area over a thumb-sized mark. Painted first and
                    left as the only pointer-eventful thing here, so the target of a
                    tap is the same shape wherever inside the circle it lands.
                    NOT the accessibility path: fourteen unlabelled SVG groups never
                    were one, which is why the power ranking rows are the real
                    selectors and the rail of fourteen 44px buttons that used to sit
                    under this chart is gone. */}
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={15}
                  fill="transparent"
                  pointerEvents="auto"
                />
                {/* "You": thinner, further out, accent - the viewer's identity colour
                    everywhere in this app. Drawn outside the selection ring so the two
                    read as concentric rather than as one thick ambiguous edge. */}
                {p.isMe && (
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={11.5}
                    fill="none"
                    stroke={ACCENT}
                    strokeWidth={1}
                    opacity={0.8}
                  />
                )}
                {/* "Selected": SOLID, ink, at the dot's own edge. It was dashed and
                    muted; dashed reads as provisional and this is a choice. */}
                {isSel && (
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={8}
                    fill="none"
                    stroke={INK}
                    strokeWidth={1.5}
                  />
                )}
                {/* A surface-coloured ring so two dots that land on top of each
                    other still read as two dots. The fill is the TCI ramp and stays
                    exactly as it is when selected: colour here is the y axis. */}
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={5}
                  fill={ink}
                  stroke={SURFACE}
                  strokeWidth={1.5}
                />
              </g>
            );
          })}
        </svg>

        {/* ---------------- THE LABEL LAYER. All HTML, all aria-hidden. ------------- */}

        {/* Corner captions, one per quadrant, at the corner they name. */}
        <div aria-hidden="true">
          {[
            {
              q: QUADRANTS.agreedSpread,
              x: X0 + 4,
              y: Y0 - 6,
              anchor: "start",
              tone: "text-faint",
            },
            {
              q: QUADRANTS.agreedTopHeavy,
              x: X1 - 4,
              y: Y0 - 6,
              anchor: "end",
              tone: "text-faint",
            },
            {
              q: QUADRANTS.splitSpread,
              x: X0 + 4,
              y: CAPTION_BASE,
              anchor: "start",
              tone: "text-faint",
            },
            {
              q: QUADRANTS.splitTopHeavy,
              x: X1 - 4,
              y: CAPTION_BASE,
              anchor: "end",
              tone: "text-negative",
            },
          ].map((c) => (
            <span
              key={c.q.key}
              className={`absolute whitespace-nowrap text-micro leading-none ${c.tone}`}
              style={{
                left: pctX(c.x),
                top: pctY(c.y),
                transform: anchorTransform(c.anchor),
              }}
            >
              {c.q.label}
            </span>
          ))}
        </div>

        {/* Tick values. x under the frame, y outside its left edge. */}
        <div aria-hidden="true">
          {geom.xTicks.map((t) => (
            <span
              key={`xt${t}`}
              className="absolute figure text-micro leading-none text-faint"
              style={{
                left: pctX(geom.x(t)),
                top: pctY(TICK_BASE),
                transform: anchorTransform("middle"),
              }}
            >
              {t}
            </span>
          ))}
          {geom.yTicks.map((t) => (
            <span
              key={`yt${t}`}
              className="absolute figure text-micro leading-none text-faint"
              style={{
                left: pctX(X0 - 4),
                top: pctY(geom.y(t) + 4),
                transform: anchorTransform("end"),
              }}
            >
              {t}
            </span>
          ))}
        </div>

        {/*
            THE SELECTED DOT'S OWN TWO NUMBERS, at the end of each leader line.

            Each carries `bg-surface` and a hair of padding on purpose: it sits in the
            same row as the faint tick values and will land on top of one whenever the
            dot is near a tick. Occluding the scale at the exact point the value is
            printed is the right resolution - the reader is being told what this dot
            reads, and the tick it covers said the same thing less precisely.
          */}
        {selAt && (
          <div aria-hidden="true">
            <span
              className="absolute rounded-[2px] bg-surface px-[2px] figure text-micro font-semibold leading-none text-ink"
              style={{
                left: pctX(selAt.x),
                top: pctY(TICK_BASE),
                transform: anchorTransform("middle"),
              }}
            >
              {selected.fragility}
            </span>
            <span
              className="absolute rounded-[2px] bg-surface px-[2px] figure text-micro font-semibold leading-none text-ink"
              style={{
                left: pctX(X0 - 4),
                top: pctY(selAt.y + 4),
                transform: anchorTransform("end"),
              }}
            >
              {selected.tci}
            </span>
          </div>
        )}

        {/* Axis titles. The y one is rotated in CSS, which is the one place a label may
            leave the horizontal - it is chrome naming an axis, not a mark carrying data,
            so D96's reserved diagonal is not in play (and 90 degrees is not 45). */}
        <div aria-hidden="true">
          <span
            className="absolute whitespace-nowrap text-micro leading-none text-faint"
            style={{
              left: pctX((X0 + X1) / 2),
              top: pctY(TITLE_BASE),
              transform: anchorTransform("middle"),
            }}
          >
            fragility (RFI) - right is more load-bearing
          </span>
          <span
            className="absolute whitespace-nowrap text-micro leading-none text-faint"
            style={{
              left: pctX(9),
              top: pctY((Y0 + Y1) / 2),
              transform: "translate(-50%, -50%) rotate(-90deg)",
            }}
          >
            coherence (TCI) - up is agreed
          </span>
        </div>

        {/* The dot ordinals. `placeLabels` chose these positions in viewBox units; the
            transform converts its baseline-and-anchor convention into a CSS box. */}
        <div aria-hidden="true">
          {points.map((p, i) => {
            const c = geom.placed[i];
            const lab = geom.labels[i];
            const isSel = selected.rosterId === p.rosterId;
            return (
              <span
                key={`n${p.rosterId}`}
                className={
                  `absolute figure text-micro leading-none ` +
                  (p.isMe
                    ? "font-bold text-accent-text"
                    : isSel
                      ? "font-bold text-ink"
                      : "font-normal text-muted")
                }
                style={{
                  left: pctX(c.x + lab.dx),
                  top: pctY(c.y + lab.dy),
                  transform: anchorTransform(lab.anchor),
                }}
              >
                {p.n}
              </span>
            );
          })}
        </div>
      </div>

      {/* Scale legend. A multi-hue ramp always ships one. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-micro uppercase tracking-wide text-faint">
          TCI
        </span>
        {TCI_BANDS.map((b) => (
          <span key={b.step} className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: STEP_INK[b.step - 1] }}
            />
            <span className="figure text-micro text-faint">{b.range}</span>
          </span>
        ))}
      </div>

      {/* Only the half of this caption that describes THIS CHART is permanent. The
            other half - what fragility refuses to mean - was the same paragraph the app
            already prints in MetricGloss, on /about and on /methodology, so it now
            arrives the way every other index caveat in this app does: collapsed, one
            faint line, opened once by whoever needs it. */}
      <p className="mt-1.5 text-meta leading-snug text-secondary">
        Dashed lines are this league&rsquo;s medians, not pass marks - half the
        board sits under each by construction. Colour reads coherence only.
      </p>

      {/*
          THE ONE LEAGUE-WIDE TALLY THAT EARNS ITS SLOT, and it is here rather than at
          the top of the page because its two axes are three inches above it.

          A posture census used to lead /league with four counts, three of which were
          counts of QUARTILE MEMBERSHIP - `classify` hands out contending / ascending /
          rebuilding by percentile, so a census of them counts where the quartile lines
          fell rather than anything about this league (SHELVED.md S11). This count is not
          that. It is the INTERSECTION of two median splits, and an intersection is free:
          the medians guarantee half the board below each line and guarantee nothing about
          how many rosters are below both, so this is genuinely allowed to come out 0.
        */}
      <p className="mt-1 text-meta leading-snug text-secondary">
        <span className="figure font-semibold text-ink">
          {counts.splitTopHeavy}
        </span>{" "}
        of {points.length} rosters sit below the median on coherence and above
        it on fragility - the tinted corner. Both lines are medians, so half the
        board is under each one; how many are under both is not fixed by
        anything, and can be none.
      </p>

      <MetricGloss metrics={["tci", "rfi"]} className="mt-0.5" />
    </div>
  );
}
