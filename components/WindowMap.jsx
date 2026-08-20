/**
 * THE WINDOW MAP - every roster's value delivery, ordered against everyone else's.
 *
 * The chart /league needed and never had. Timeline Coherence tells a manager when
 * THEIR OWN value pays off; it cannot tell them who else pays off then, and that is
 * the number that decides a trade. Fourteen rosters, fourteen spans, one shared axis,
 * and the viewer's own marked - see lib/metrics/window.ts for the derivation and why
 * it refuses to draw a window for a straddled roster.
 *
 * ---------------------------------------------------------------------------------
 * WHAT THE AXIS IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------
 * READ THIS BEFORE ADDING COPY TO THIS CHART. The seasons on the axis are labels on a
 * RELATIVE ORDERING. They are not a forecast that a roster is good in a named year.
 *
 * The span is quartiles of `AssetDuration`, which is Macaulay duration over the age
 * curve's payout profile. Every rostered player in a dynasty league is between about
 * 19 and 32, so every roster's value-weighted quartiles land inside a band a few
 * seasons wide, and picks push all fourteen distributions rightward together. On the
 * live league today no roster's span opens before 2029, twelve of fourteen close in
 * 2031, and nine of fourteen peak in 2031. Drawing that on a calendar makes it read
 * like a year-by-year projection. It is not one. It is fourteen rosters sorted from
 * soonest-paying to latest-paying, with the gaps between them genuinely small.
 *
 * THE ARITHMETIC IS SOUND; THE CALENDAR IS THE UNEARNED PART. Duration says when an
 * asset pays out over its remaining career. A competitive window is when a roster is
 * good enough to win now. Those are different questions, and this chart answers only
 * the first - so the copy around it says "dated earlier" and "dated later" and never
 * "contending in 2029". Anything on this surface implying a manager can plan a named
 * season off these bars is claiming more than the derivation supports.
 *
 * It follows that "N rosters overlap yours" is weak on this league BY CONSTRUCTION
 * rather than as a discovery, and the copy says so instead of printing a count that
 * fires on most of the league as though it had singled somebody out. The underlying
 * arithmetic is untouched by any of this (lib/metrics/window.ts); what changed is the
 * framing, which was making a claim the numbers were never making.
 *
 * Hand-rolled inline SVG, no chart library (DECISIONS D3), sized for 375px. Server
 * component: nothing here is tappable, the same contract the duration scatter it
 * replaces had. Every numeric attribute is rounded before it reaches the DOM, because
 * unrounded floats serialize differently server-side and client-side and have killed
 * hydration on this project before.
 *
 * ---------------------------------------------------------------------------------
 * ENCODING, and why colour is doing none of the work (lib/chart-colors.ts rule 1)
 * ---------------------------------------------------------------------------------
 * POSITION carries the season. LENGTH carries the span. SHAPE carries the state:
 *
 *   filled bar with a dot   the middle half of a roster's value, and where it peaks
 *   two ticks, dotted join  the assets disagree; the seasons between are not a window
 *   a dash at the origin    too few valued assets to read quartiles from at all
 *
 * The two refused shapes are the SUBORDINATE half of their own reading. Each refused
 * row carries a code from the closed register (lib/refusal.js) in its data, and that
 * code is what `rowSentence` reads out and what the list under the chart prints in its
 * window column. The dotted join and the dash are how the refusal looks; they are not
 * what it is, because a shape does not survive being exported, grepped or read aloud.
 *
 * Delete every colour and all three still read, which is the acceptance test. The
 * accent appears exactly twice - the viewer's own row, and the vertical band marking
 * their window across everyone else's - because the one thing a reader came here to
 * see is who is standing in their seasons. The magnitude ramp is not used: nothing on
 * this chart is a magnitude.
 *
 * ---------------------------------------------------------------------------------
 * SELECTION, AND WHY IT SPENDS NO COLOUR
 * ---------------------------------------------------------------------------------
 * A roster can be selected on this chart, and the selection is shared with the
 * quadrant board and the power ranking through `?roster=` (lib/league/url.js). There
 * was no hue available to spend on it: the accent is already the viewer's own identity
 * here and on every other surface in the app, and adding a second one would break the
 * rule that the moment two things are accent, neither is (lib/chart-colors.js).
 *
 * So selection is carried by WEIGHT and by a MARK, in four places, none of them a hue:
 *
 *   the bar grows          BAR_H to BAR_SEL_H, and its peak dot with it
 *   a surface halo         a surface-coloured stroke on the selected mark only, which
 *                          lifts it off the rows immediately above and below
 *   everything recedes     every row that is neither the selection nor the viewer
 *                          drops to DIM. Both of those two stay at full weight, because
 *                          the intersection below is a claim about the PAIR and dimming
 *                          half of a pair makes the drawing unreadable.
 *   an ink rule            in the ordinal gutter, outside the plot, so the selection
 *                          survives grayscale, a print, and a screenshot pasted into a
 *                          group chat. Orthogonal, per D96: the 45-degree diagonal is
 *                          reserved for a refusal and a selection is not one.
 *
 * ---------------------------------------------------------------------------------
 * THE INTERSECTION BLOCK - the one drawing that answers the question twice over
 * ---------------------------------------------------------------------------------
 * The accent band says "these are my seasons". A selected roster's bar says "these are
 * theirs". Two overlapping ranges leave the reader to do the arithmetic by eye, and the
 * arithmetic is the whole point of the chart: not "where are they" but "HOW MUCH OF MY
 * WINDOW IS ALSO THEIRS". So the overlap is drawn as its own geometry - a real block at
 * `[max(opens), min(closes)]`, full plot height, denser accent than the band it sits
 * inside, with an orthogonal rule down each edge.
 *
 * IT IS DRAWN ONLY BETWEEN TWO READABLE SINGLE WINDOWS, and that restraint is the
 * derivation's, not a rendering convenience. A split roster publishes `open` and `close`
 * (the chart draws both ends) but `lib/metrics/window.js` refuses the claim that the
 * seasons between them are a window - so intersecting the viewer's window with a split
 * roster's two ends would manufacture exactly the agreement the metric just declined to
 * assert (D19). On the live league seven of fourteen rosters are split, so this is the
 * common case rather than an edge one, and it renders as no block plus a stated refusal
 * in the panel under the board rather than as a block nobody should trust.
 *
 * Selecting your own roster draws no block either: the intersection of the viewer's
 * window with itself is the accent band, already on the chart, and painting it twice
 * would be a second mark making no second claim.
 *
 * ---------------------------------------------------------------------------------
 * NO <text> INSIDE A SCALING viewBox. THIS IS A RULE NOW, NOT A PREFERENCE (D96)
 * ---------------------------------------------------------------------------------
 * This chart used to set its own labels in SVG `<text>` at `fontSize="8"` and
 * `fontSize="7.5"`, inside a `viewBox="0 0 320 H"` stretched to the container by
 * `w-full`. That is not a small type choice; it is type NOBODY CHOSE, at a size NO
 * TOKEN CAN REACH. A user unit is only a real pixel at scale 1, and this chart never
 * renders at scale 1: on a 390pt phone the card gives the plot about 338px, so every
 * unit is multiplied by ~1.056 and the axis rendered at roughly 8.4px and 7.9px -
 * under this app's own 10px `--text-micro` floor, off the six-step scale entirely, and
 * unreachable by `text-micro` or any other utility because the number lives in a
 * presentation attribute measured in user units. `vector-effect` does not help: it
 * fixes strokes, not glyphs, and there is no native way to opt text out of viewBox
 * scaling.
 *
 * There are exactly two clean fixes - move the text out into HTML siblings, or stop
 * the viewBox scaling - and this file takes the first, because the second would pin
 * the chart at a fixed 320px and it would then overflow a 320pt viewport and waste
 * ~18px on a 390pt one. Fluid marks with fixed type is the combination that is
 * actually wanted, and it is only available by separating them.
 *
 * SO THE LAYOUT IS NOW A CSS GRID AND THE SVG IS ONLY THE PLOT.
 *
 *   column 1  the ordinal gutter. Fixed CSS px, so `text-micro` means 10px.
 *   column 2  row 1 is the plot (one <svg>, zero <text> nodes)
 *             row 2 is the season axis, a `repeat(bands, 1fr)` grid whose columns are
 *             the bands, so a label centres in its own band with no arithmetic at all.
 *
 * The ordinals cannot use a column grid the way the axis does, because their pitch is
 * a fraction of the SVG's SCALED height rather than of its width. They are absolutely
 * positioned at `top: y/plotH%` inside a gutter that grid stretches to exactly the
 * SVG's rendered height, so the percentage tracks the scale for free and there is no
 * resize listener and no measured height anywhere.
 *
 * WHAT THE LABELS GAINED BEYOND SIZE. Each one is now on the token it should always
 * have been on: `--text-micro` is documented as chrome - axis labels and rank ordinals
 * by name - and `--color-faint` is documented as the ink for exactly those two jobs,
 * so both labels are finally legal uses of the scale rather than exceptions to it.
 * Every figure carries `.figure` (tabular + slashed zero), which is what keeps four
 * digit years optically identical down a centred axis and the ordinals aligned down a
 * 24px gutter. And the viewer's own ordinal moves from `--color-accent` to
 * `--color-accent-text`: accent is the FILL gold and accent-text is the same gold
 * tuned to be READ at 10-12px, a distinction an SVG `fill` attribute could state but
 * an 8px glyph could not honour.
 *
 * `paint-order: stroke fill` is deliberately absent, and its absence is the point: no
 * label overlaps a mark any more. The gutter sits outside the plot and the axis sits
 * under it, so there is nothing to halo. Making an overlapping label survive is the
 * second-best answer to the same problem.
 *
 * The label layers are `aria-hidden`. The SVG's `aria-label` already reads out every
 * roster by name and states the season range in a sentence, so exposing a bare
 * "1 2 3 ... 2028 2029 2030" after it would be the same facts a second time with the
 * meaning stripped out.
 */
import {
  CHART_ACCENT,
  CHART_FAINT,
  CHART_GRID,
  CHART_NEUTRAL,
} from "@/lib/chart-colors";
import { windowRefusalCode } from "@/lib/metrics/window";
import { refusalSentence } from "@/lib/refusal";
const W = 320;
/**
 * The plot's own insets, and they are now the ONLY padding inside the viewBox. The old
 * `PAD_L: 17` reserved a gutter for the ordinals and `PAD_B: 25` reserved a strip for
 * the axis; both of those are real CSS boxes outside the SVG now, so the plot gets the
 * 17 units back as chart width - which is the highest-ranked encoding channel there is
 * at this size, spent on the one axis that carries the season.
 *
 * 2 units each side is not decorative: a gridline is a 1-unit stroke centred on a band
 * edge, and the first and last band edges are the viewBox edges, so without an inset
 * half of each of those two strokes renders outside the box and the chart looks like it
 * has thinner rules at both ends than in the middle.
 */
const INSET = 2;
const PAD_T = 4;
const PAD_B = 4;
const ROW_H = 12.5;
const BAR_H = 5;
/**
 * The selected row's bar. Still well inside ROW_H, so selection never reflows the plot.
 *
 * 7.5 rather than 6.5 because the halo is a STROKE, and a stroke straddles the path it
 * is on: 1.4 of surface centred on the edge spends 0.7 of the bar's own height at each
 * end, so a 6.5 bar with a halo renders 5.1 of ink against a neighbour's 5 and the
 * selection reads as nothing. At 7.5 the ink comes out at 6.1 with a 0.7 surface ring
 * outside it - visibly heavier, and the 8.9 total footprint still clears the 12.5 pitch.
 */
const BAR_SEL_H = 7.5;
/**
 * What a row recedes to when something else is selected.
 *
 * 0.35 rather than something fainter: the receded rows are still the CONTEXT the
 * selection is being read against - "who else is in these seasons" needs the others to
 * remain countable - so this is a recession and not a hide. Legibility is not at stake
 * because position and length carry the reading and the list under the chart prints
 * every row in text regardless.
 */
const DIM = 0.35;
/** The ordinal gutter, in CSS px. 30 holds the selection rule at the left edge plus
 *  three tabular digits at 10px with the 6px right padding below, which is one more
 *  digit than a fourteen-roster league can produce - the ordinals are 1-based row
 *  numbers, not ids. It was 24 before the rule needed a lane of its own. */
const GUTTER = 30;
const r1 = (v) => Math.round(v * 10) / 10;
/** The seasons two readable spans share, or null. Both ends inclusive. */
function sharedSeasons(a, b) {
  if (!a || !b) return null;
  if (a.state !== "window" || b.state !== "window") return null;
  if (a.open == null || a.close == null || b.open == null || b.close == null)
    return null;
  const lo = Math.max(a.open, b.open);
  const hi = Math.min(a.close, b.close);
  return lo <= hi ? { lo, hi } : null;
}
/**
 * What a row says out loud, since a span in an SVG says nothing to a screen reader.
 *
 * A REFUSED ROW READS ITS CODE. This function used to paraphrase `state` in its own
 * words, which meant the dotted line at the origin was described one way here, another
 * way in the sentence underneath the chart, and a third way on /plan - three sentences
 * for one condition, none of them the same, and a listener with no way to tell that the
 * dash and the phrase were the same fact. The row's `refusal` carries the code and the
 * proof already (lib/refusal.js), so this prints them: the code is the part that is
 * identical everywhere, which is the part that makes it learnable.
 */
function rowSentence(r) {
  if (r.refusal) return `${r.name}: ${refusalSentence(r.refusal)}`;
  if (r.state !== "window")
    return `${r.name}: ${windowRefusalCode(r)}, no single span to place.`;
  return `${r.name}: middle half of their value dated ${r.open} to ${r.close}, heaviest ${r.peak}.`;
}
export function WindowMap({ rows, first, last, currentSeason, selectedId }) {
  if (rows.length === 0) return null;
  const bands = Math.max(1, last - first + 1);
  const plotH = Math.round(PAD_T + rows.length * ROW_H + PAD_B);
  const plotW = W - INSET * 2;
  const bandW = plotW / bands;
  const xOf = (season) => r1(INSET + (season - first) * bandW);
  const yOf = (i) => r1(PAD_T + i * ROW_H + ROW_H / 2);
  /*
   * Every season gets a gridline; only every other gets a label once the axis grows
   * past what the labels can hold side by side.
   *
   * The old reason for this was "what eight-pixel type can hold", which was measuring
   * against a size the app never intended. At the real 10px a four-digit year in Inter
   * tabular is about 24px, and a legible gap is 4px, so a band needs ~28px of its own.
   * The narrowest plot this app renders is a 320pt viewport (268px of plot after the
   * page's 16px gutters, the card's 10px padding and the 24px ordinal column), which
   * fits nine. Eight is therefore now a conservative threshold rather than a forced
   * one, and it is left where it was because the live league has five bands and moving
   * it would be a behaviour change bought with nothing.
   */
  const labelStep = bands > 8 ? 2 : 1;
  const seasons = Array.from({ length: bands }, (_, i) => first + i);
  const me = rows.find((r) => r.isMe && r.state === "window") ?? null;
  const sel = rows.find((r) => r.rosterId === selectedId) ?? null;
  // Null when either side has no readable single window, when they do not overlap, and
  // when the selection IS the viewer - see the header on all three.
  const shared = sel && !sel.isMe ? sharedSeasons(me, sel) : null;
  const anySelected = sel != null;
  /** Full weight for the pair the intersection is about; everything else recedes. */
  const weightOf = (row) =>
    !anySelected || row.isMe || row.rosterId === selectedId ? 1 : DIM;
  return (
    <div
      className="grid select-none"
      style={{ gridTemplateColumns: `${GUTTER}px minmax(0, 1fr)` }}
    >
      {/*
        THE ORDINAL GUTTER. Grid stretches this to the plot row's height, which IS the
        SVG's rendered height, so a `top` percentage computed against the viewBox
        resolves to the right place at every width with no measurement and no effect.
        `-translate-y-1/2` with `leading-none` centres each ordinal on its own row.
      */}
      <div aria-hidden="true" className="relative">
        {rows.map((row, i) => {
          const isSel = row.rosterId === selectedId;
          return (
            <span
              key={row.rosterId}
              className="absolute inset-x-0 flex -translate-y-1/2 items-center justify-end gap-1 pr-1.5"
              style={{ top: `${r1((yOf(i) / plotH) * 100)}%` }}
            >
              {/* THE SELECTION RULE. Outside the plot, so it overlaps nothing, and a
                  plain orthogonal bar rather than a caret or a chevron: D96 reserves the
                  45-degree diagonal for a refusal, and a triangle's edges are the one
                  shape that reads as one. Ink, because it is the only mark in this
                  gutter that is a state rather than a label. */}
              <span
                className={
                  `h-2.5 w-[2px] shrink-0 rounded-full ` +
                  (isSel ? "bg-ink" : "bg-transparent")
                }
              />
              <span
                className={
                  `figure text-micro leading-none ` +
                  (isSel
                    ? "font-bold text-ink"
                    : row.isMe
                      ? "font-bold text-accent-text"
                      : "font-normal text-faint")
                }
              >
                {row.n}
              </span>
            </span>
          );
        })}
      </div>

      <svg
        viewBox={`0 0 ${W} ${plotH}`}
        className="block w-full"
        role="img"
        aria-label={
          `Every roster ordered by when its value is dated, ${first} to ${last}. The ` +
          `seasons label a relative ordering inside a narrow band, not a forecast for a ` +
          `named year. ` +
          // The selection and its arithmetic, first, because it is the thing that just
          // changed. A listener gets no notification from a bar changing weight, and the
          // shared-seasons count is the reading the block draws and nothing else states.
          (sel
            ? `Selected: ${sel.name}. ` +
              (shared
                ? `${shared.hi - shared.lo + 1} of your ${me.close - me.open + 1} ` +
                  `seasons ${shared.hi === shared.lo ? "is" : "are"} also theirs, ` +
                  `${shared.hi === shared.lo ? shared.lo : `${shared.lo} to ${shared.hi}`}. `
                : sel.isMe
                  ? `This is your own roster. `
                  : `No shared seasons are drawn for this pair. `)
            : "") +
          rows.map(rowSentence).join(" ")
        }
      >
        {/* The viewer's own seasons, drawn UNDER everything, so overlap is read by eye
            rather than counted. This is the whole reason the chart exists. */}
        {me && me.open != null && me.close != null && (
          <rect
            x={xOf(me.open)}
            y={PAD_T - 3}
            width={r1((me.close - me.open + 1) * bandW)}
            height={r1(rows.length * ROW_H + 4)}
            fill={CHART_ACCENT}
            opacity={0.09}
          />
        )}

        {/*
            THE INTERSECTION BLOCK. A second accent wash INSIDE the band rather than a
            replacement for it, so the seasons that are shared composite to roughly twice
            the density of the seasons that are only the viewer's - which is the ordering
            the drawing needs, in one hue, with no key. The two edge rules are what make
            it a block with boundaries rather than a gradient: orthogonal marks are data
            (D96), and where the overlap starts and stops is the datum.
          */}
        {shared && (
          <g>
            <rect
              x={xOf(shared.lo)}
              y={PAD_T - 3}
              width={r1((shared.hi - shared.lo + 1) * bandW)}
              height={r1(rows.length * ROW_H + 4)}
              fill={CHART_ACCENT}
              // 0.13 on top of the band's own 0.09 composites to about 0.21 - roughly
              // 2.4x the density of the seasons that are only the viewer's. Checked on
              // the rendered chart at 390px: at 0.10 the two washes were separable but
              // not obviously ORDERED, which is the whole job of the second wash.
              opacity={0.13}
            />
            {[shared.lo, shared.hi + 1].map((s) => (
              <line
                key={`i${s}`}
                x1={xOf(s)}
                y1={PAD_T - 3}
                x2={xOf(s)}
                y2={r1(PAD_T + rows.length * ROW_H + 1)}
                stroke={CHART_ACCENT}
                strokeWidth={1}
                opacity={0.7}
              />
            ))}
          </g>
        )}

        {/* Season gridlines. The current season's is solid; it is the only line on the
            chart that is a fact rather than a scale. */}
        {seasons.map((s) => (
          <line
            key={`g${s}`}
            x1={xOf(s)}
            y1={PAD_T - 3}
            x2={xOf(s)}
            y2={r1(PAD_T + rows.length * ROW_H + 1)}
            stroke={s === currentSeason ? CHART_NEUTRAL : CHART_GRID}
            strokeWidth={1}
            strokeDasharray={s === currentSeason ? undefined : "2 3"}
          />
        ))}

        {rows.map((row, i) => {
          const y = yOf(i);
          const ink = row.isMe ? CHART_ACCENT : CHART_NEUTRAL;
          const isSel = row.rosterId === selectedId;
          const weight = weightOf(row);
          // The halo is the selected mark's own, and only the selected mark's: a
          // surface-coloured stroke around a shape reads as "this one is lifted", and a
          // second one on the row above would flatten both back down.
          const halo = isSel ? "var(--color-surface)" : undefined;
          const barH = isSel ? BAR_SEL_H : BAR_H;
          return (
            <g key={row.rosterId} opacity={weight}>
              {row.state === "unreadable" && (
                <line
                  x1={INSET + 1}
                  y1={y}
                  x2={r1(INSET + bandW * 0.5)}
                  y2={y}
                  stroke={isSel ? CHART_NEUTRAL : CHART_FAINT}
                  strokeWidth={isSel ? 1.5 : 1}
                  strokeDasharray="1 2"
                />
              )}

              {row.state === "split" &&
                row.open != null &&
                row.close != null && (
                  <>
                    {/* Two ends and nothing between them: the seasons in the middle are a
                        hole this roster's assets disagree about, not a window. */}
                    <line
                      x1={r1(xOf(row.open) + bandW / 2)}
                      y1={y}
                      x2={r1(xOf(row.close) + bandW / 2)}
                      y2={y}
                      stroke={ink}
                      strokeWidth={isSel ? 1.5 : 1}
                      strokeDasharray="1.5 2.5"
                    />
                    {[row.open, row.close].map((s, k) => (
                      <line
                        key={k}
                        x1={r1(xOf(s) + bandW / 2)}
                        y1={r1(y - barH / 2)}
                        x2={r1(xOf(s) + bandW / 2)}
                        y2={r1(y + barH / 2)}
                        stroke={ink}
                        strokeWidth={isSel ? 3 : 2}
                        // The halo on a stroked tick has to be a second, wider stroke
                        // underneath, which two ticks do not have room for at this pitch.
                        // The extra width plus the gutter rule carry it instead.
                      />
                    ))}
                  </>
                )}

              {row.state === "window" &&
                row.open != null &&
                row.close != null && (
                  <>
                    <rect
                      x={r1(xOf(row.open) + 1)}
                      y={r1(y - barH / 2)}
                      width={r1((row.close - row.open + 1) * bandW - 2)}
                      height={barH}
                      rx={2.5}
                      fill={ink}
                      opacity={row.isMe || isSel ? 1 : 0.85}
                      stroke={halo}
                      strokeWidth={halo ? 1.4 : undefined}
                    />
                    {row.peak != null && (
                      // The peak season, as a shape rather than a shade: a dot the surface
                      // ring lifts off the bar it sits on.
                      <circle
                        cx={r1(xOf(row.peak) + bandW / 2)}
                        cy={y}
                        r={isSel ? 3.2 : 2.6}
                        fill={ink}
                        stroke="var(--color-surface)"
                        strokeWidth={1.4}
                      />
                    )}
                  </>
                )}
            </g>
          );
        })}
      </svg>

      {/* Nothing sits under the ordinals: the axis belongs to the plot column only, so
          its labels stay centred on the bands rather than on the whole component. */}
      <div aria-hidden="true" />

      {/*
        THE SEASON AXIS, as a band grid rather than as arithmetic.

        `repeat(bands, 1fr)` reproduces the plot's own band division exactly, so a
        centred label is centred in its band with no coordinate maths and no rounding -
        and `paddingInline` restates the plot's INSET as the same fraction of the same
        width, which is what keeps the two in register at every viewport.

        `now` renders whether or not its year did. When `labelStep` elides an odd index
        the word is the label, and adding the year back for that one band would put
        three labels at single-band spacing next to two at double, which is the
        collision the step exists to prevent.
      */}
      <div
        aria-hidden="true"
        className="grid pt-1.5"
        style={{
          gridTemplateColumns: `repeat(${bands}, minmax(0, 1fr))`,
          paddingInline: `${r1((INSET / W) * 100)}%`,
        }}
      >
        {seasons.map((s, i) => (
          <span key={`t${s}`} className="text-center leading-tight">
            {i % labelStep === 0 && (
              <span
                className={
                  `figure block text-micro ` +
                  (s === currentSeason ? "text-muted" : "text-faint")
                }
              >
                {s}
              </span>
            )}
            {s === currentSeason && (
              <span className="block text-micro font-semibold uppercase tracking-[0.12em] text-faint">
                now
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
