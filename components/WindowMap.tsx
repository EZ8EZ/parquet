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
 * Delete every colour and all three still read, which is the acceptance test. The
 * accent appears exactly twice - the viewer's own row, and the vertical band marking
 * their window across everyone else's - because the one thing a reader came here to
 * see is who is standing in their seasons. The magnitude ramp is not used: nothing on
 * this chart is a magnitude.
 */

import {
  CHART_ACCENT,
  CHART_FAINT,
  CHART_GRID,
  CHART_NEUTRAL,
} from "@/lib/chart-colors";
import type { WindowState } from "@/lib/metrics/window";

export interface WindowMapRow {
  rosterId: number;
  /** Keys the row to the list under the chart. Same numbering as the power ranking. */
  n: number;
  name: string;
  isMe: boolean;
  state: WindowState;
  open: number | null;
  peak: number | null;
  close: number | null;
}

const W = 320;
const PAD_L = 17;
const PAD_R = 6;
const PAD_T = 13;
const PAD_B = 25;
const ROW_H = 12.5;
const BAR_H = 5;

const r1 = (v: number) => Math.round(v * 10) / 10;

/** What a row says out loud, since a span in an SVG says nothing to a screen reader. */
function rowSentence(r: WindowMapRow): string {
  if (r.state === "unreadable") return `${r.name}: too few valued assets to place at all.`;
  if (r.state === "split")
    return `${r.name}: value spread across ${r.open} to ${r.close}, with the assets disagreeing, so no single span.`;
  return `${r.name}: middle half of their value dated ${r.open} to ${r.close}, heaviest ${r.peak}.`;
}

export function WindowMap({
  rows,
  first,
  last,
  currentSeason,
}: {
  rows: WindowMapRow[];
  first: number;
  last: number;
  currentSeason: number;
}) {
  if (rows.length === 0) return null;

  const bands = Math.max(1, last - first + 1);
  const H = Math.round(PAD_T + rows.length * ROW_H + PAD_B);
  const plotW = W - PAD_L - PAD_R;
  const bandW = plotW / bands;
  const xOf = (season: number) => r1(PAD_L + (season - first) * bandW);
  const yOf = (i: number) => r1(PAD_T + i * ROW_H + ROW_H / 2);

  // Every season gets a gridline; only every other gets a label once the axis grows
  // past what eight-pixel type can hold side by side.
  const labelStep = bands > 8 ? 2 : 1;
  const seasons = Array.from({ length: bands }, (_, i) => first + i);

  const me = rows.find((r) => r.isMe && r.state === "window") ?? null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full select-none"
      role="img"
      aria-label={
        `Every roster ordered by when its value is dated, ${first} to ${last}. The ` +
        `seasons label a relative ordering inside a narrow band, not a forecast for a ` +
        `named year. ` +
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
        return (
          <g key={row.rosterId}>
            {/* The row number, which is the row of the list under the chart. */}
            <text
              x={PAD_L - 4}
              y={r1(y + 3)}
              textAnchor="end"
              fontSize="8"
              fontWeight={row.isMe ? 700 : 400}
              fill={row.isMe ? CHART_ACCENT : CHART_FAINT}
              className="figure"
            >
              {row.n}
            </text>

            {row.state === "unreadable" && (
              <line
                x1={PAD_L + 1}
                y1={y}
                x2={r1(PAD_L + bandW * 0.5)}
                y2={y}
                stroke={CHART_FAINT}
                strokeWidth={1}
                strokeDasharray="1 2"
              />
            )}

            {row.state === "split" && row.open != null && row.close != null && (
              <>
                {/* Two ends and nothing between them: the seasons in the middle are a
                    hole this roster's assets disagree about, not a window. */}
                <line
                  x1={r1(xOf(row.open) + bandW / 2)}
                  y1={y}
                  x2={r1(xOf(row.close) + bandW / 2)}
                  y2={y}
                  stroke={ink}
                  strokeWidth={1}
                  strokeDasharray="1.5 2.5"
                />
                {[row.open, row.close].map((s, k) => (
                  <line
                    key={k}
                    x1={r1(xOf(s) + bandW / 2)}
                    y1={r1(y - BAR_H / 2)}
                    x2={r1(xOf(s) + bandW / 2)}
                    y2={r1(y + BAR_H / 2)}
                    stroke={ink}
                    strokeWidth={2}
                  />
                ))}
              </>
            )}

            {row.state === "window" && row.open != null && row.close != null && (
              <>
                <rect
                  x={r1(xOf(row.open) + 1)}
                  y={r1(y - BAR_H / 2)}
                  width={r1((row.close - row.open + 1) * bandW - 2)}
                  height={BAR_H}
                  rx={2.5}
                  fill={ink}
                  opacity={row.isMe ? 1 : 0.85}
                />
                {row.peak != null && (
                  // The peak season, as a shape rather than a shade: a dot the surface
                  // ring lifts off the bar it sits on.
                  <circle
                    cx={r1(xOf(row.peak) + bandW / 2)}
                    cy={y}
                    r={2.6}
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

      {/* Season axis. */}
      {seasons.map((s, i) =>
        i % labelStep === 0 ? (
          <text
            key={`t${s}`}
            x={r1(xOf(s) + bandW / 2)}
            y={r1(PAD_T + rows.length * ROW_H + 11)}
            textAnchor="middle"
            fontSize="8"
            fill={s === currentSeason ? "var(--color-muted)" : CHART_FAINT}
            className="figure"
          >
            {s}
          </text>
        ) : null,
      )}
      <text
        x={r1(xOf(currentSeason) + bandW / 2)}
        y={r1(PAD_T + rows.length * ROW_H + 20)}
        textAnchor="middle"
        fontSize="7.5"
        fill={CHART_FAINT}
      >
        now
      </text>
    </svg>
  );
}
