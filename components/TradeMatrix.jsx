/**
 * THE PAIR MATRIX - drawn from `lib/tradegraph`'s `pairMatrix`. See that function's
 * docstring for why a GRID, and not a network layout, is the one hand-rolled shape
 * (D3: no chart library) this app can draw here without implying a closeness the data
 * does not support (D19).
 *
 * Hand-rolled inline SVG, fixed 320-unit viewBox, every coordinate an integer (this
 * codebase has hydration-mismatched on an unrounded float twice - see `r1` /
 * ProvenanceRail's own comment on the same lesson). Binary encoding only: a traded
 * pair is a FILLED square, a never-traded pair is a HOLLOW dashed square - shape, not
 * shade, so the read survives with every colour deleted (D47 rule 1's own acceptance
 * test). No magnitude anywhere on this chart; see the derivation's own docstring for
 * why deal count is deliberately not drawn.
 */
import { CHART_ACCENT, CHART_FAINT, CHART_GRID } from "@/lib/chart-colors";
const W = 320;
const PAD_L = 15;
const PAD_R = 3;
const PAD_T = 3;
const PAD_B = 15;
const r = Math.round;
/** One full sentence describing the shape, since a grid of squares says nothing to a screen reader on its own. */
function matrixLabel(matrix) {
  return (
    `Trade matrix among ${matrix.order.length} managers, ordered alphabetically: a filled square marks a pair ` +
    `that has traded, a hollow dashed square marks a pair that never has. ${matrix.traded} of ` +
    `${matrix.possible} possible pairs have traded; ${matrix.never} never have. The full list of ` +
    `pairs that have never traded is printed below the chart.`
  );
}
export function TradeMatrix({ matrix }) {
  const n = matrix.order.length;
  if (n < 2) return null;
  const cell = (W - PAD_L - PAD_R) / n;
  const H = r(PAD_T + n * cell + PAD_B);
  const sq = Math.max(2, cell - 1.5);
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={matrixLabel(matrix)}
        className="select-none"
      >
        {matrix.cells.map((c) => {
          const x = r(PAD_L + c.col * cell + (cell - sq) / 2);
          const y = r(PAD_T + c.row * cell + (cell - sq) / 2);
          const highlight = c.a.isMe || c.b.isMe;
          return (
            <rect
              key={`${c.row}-${c.col}`}
              x={x}
              y={y}
              width={r(sq)}
              height={r(sq)}
              rx={1.5}
              fill={c.traded ? (highlight ? CHART_ACCENT : "var(--color-ink)") : "none"}
              opacity={c.traded ? (highlight ? 1 : 0.72) : 1}
              stroke={c.traded ? "none" : CHART_GRID}
              strokeWidth={c.traded ? 0 : 1}
              strokeDasharray={c.traded ? undefined : "1.5 1.5"}
            />
          );
        })}
        {/* Row and column tick numbers - a position in the ordered list below, never a
            name (there is no room to set fifteen team names legibly in an SVG cell). */}
        {matrix.order.map((m, i) => (
          <text
            key={`row${i}`}
            x={r(PAD_L - 3)}
            y={r(PAD_T + i * cell + cell / 2 + 2.5)}
            textAnchor="end"
            fontSize="6.5"
            fill={m.isMe ? CHART_ACCENT : CHART_FAINT}
            fontWeight={m.isMe ? 700 : 400}
            className="figure"
          >
            {i + 1}
          </text>
        ))}
        {matrix.order.map((m, i) => (
          <text
            key={`col${i}`}
            x={r(PAD_L + i * cell + cell / 2)}
            y={r(PAD_T + n * cell + 11)}
            textAnchor="middle"
            fontSize="6.5"
            fill={m.isMe ? CHART_ACCENT : CHART_FAINT}
            fontWeight={m.isMe ? 700 : 400}
            className="figure"
          >
            {i + 1}
          </text>
        ))}
      </svg>
      {/* The ordered legend - the SAME numbering the axes use, so a reader can look up
          any row or column. Real HTML, not SVG text, so it wraps and stays legible at
          any width (the same reasoning WindowMap's own docstring gives for range
          labels being HTML rather than SVG). */}
      <ol className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-micro leading-snug text-secondary sm:grid-cols-3">
        {matrix.order.map((m, i) => (
          <li key={m.ownerId} className="truncate">
            <span className="figure text-faint">{i + 1}.</span>{" "}
            <span className={m.isMe ? "font-semibold text-accent-text" : ""}>
              {m.name}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
/** Every never-traded pair, by name - the actionable half this chart exists for. */
export function NeverTradedList({ matrix }) {
  const rows = matrix.cells.filter((c) => !c.traded);
  if (rows.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-note leading-snug text-muted">
      {rows.map((c) => (
        <li key={`${c.row}-${c.col}`}>
          <span className="text-ink">{c.a.name}</span>
          <span className="text-faint"> &harr; </span>
          <span className="text-ink">{c.b.name}</span>
        </li>
      ))}
    </ul>
  );
}
