import { CHART_ACCENT, CHART_MARK, CHART_NEUTRAL } from "@/lib/chart-colors";
import {
  PRODUCTION_EVIDENCE,
  partialSe,
} from "@/lib/valuation/production";
/**
 * THE MEASUREMENT THAT NEARLY KILLED THE FEATURE, drawn as two panels that share one
 * scale - the one-season question that came back null, and the three-season question
 * that did not.
 *
 * ---------------------------------------------------------------------------------
 * WHY TWO PANELS AND NOT ONE CHART WITH SIX MARKS
 * ---------------------------------------------------------------------------------
 * The two rows of numbers answer DIFFERENT QUESTIONS against DIFFERENT TARGETS with
 * DIFFERENT n. Putting all six marks on one axis would invite exactly the reading that
 * is wrong - that 0.412 "beats" -0.051, as though they were two attempts at one
 * quantity. They are not: one predicts next season, the other predicts the discounted
 * three seasons after it, and a player can easily be well described by one and badly by
 * the other. Small multiples state the separation structurally: same scale, same marks,
 * same order, two captions naming two targets. The only comparison the geometry invites
 * is the only one that is legitimate - whether the interval clears zero.
 *
 * ---------------------------------------------------------------------------------
 * THE WHISKER IS ON ONE MARK, ON PURPOSE
 * ---------------------------------------------------------------------------------
 * Only the PARTIAL correlation carries a +/-2 SE whisker, because that mark's distance
 * from zero is the entire finding and its uncertainty is therefore the thing a reader
 * has to see. The other two marks are context: they say what each predictor scores on
 * its own, and nothing in the argument turns on their precision.
 *
 * Drawing an interval on all three would also be a quiet lie about the top row. The
 * ordinal's rho is not an estimate this work is defending - it is the incumbent, quoted
 * to show what production had to beat - and giving it the same error bar as the finding
 * would imply the two were measured to the same purpose.
 *
 * The interval is computed from n by `partialSe`, never stored, so the whisker cannot
 * drift away from the sample it belongs to.
 *
 * ---------------------------------------------------------------------------------
 * THE NULL PANEL MUST READ AS NULL
 * ---------------------------------------------------------------------------------
 * Panel one's mark sits at -0.051, which at this scale is about 13 user units left of
 * zero - visible, and meaningless. Its whisker spans -0.190 to +0.088 and straddles the
 * zero line, which is the honest render and the one that matters: the reading is "this
 * could be anything from mildly negative to mildly positive", not "slightly negative".
 *
 * The dot is NOT nudged onto zero to make the point. -0.051 is what was measured, and
 * moving a mark to strengthen an argument about that mark is the failure mode this whole
 * file exists to avoid. The whisker does the work, and the caption prints z.
 *
 * ---------------------------------------------------------------------------------
 * ONE GRIDLINE
 * ---------------------------------------------------------------------------------
 * Zero, and nothing else. Every question on this chart is "is it zero", so a 0.2 rule
 * would be furniture. Each panel draws its own zero line at the same x, so the two read
 * as one continuous rule down the chart without either panel depending on the other.
 *
 * ---------------------------------------------------------------------------------
 * LABELS ARE HTML (D96)
 * ---------------------------------------------------------------------------------
 * No `<text>` inside the scaling viewBox - the row names sit in a fixed-px gutter and
 * the axis is a sibling row positioned by percentage, both on the real type scale. Same
 * construction as `components/WindowMap.jsx`, and for the same reason: a user unit is
 * only a pixel at scale 1 and this chart never renders at scale 1.
 */
const W = 320;
const INSET = 2;
const ROW_H = 15;
const PAD_T = 4;
const PAD_B = 4;
/** Correlation units. Wide enough to hold panel one's whole lower whisker (-0.190). */
const LO = -0.2;
const HI = 1.0;
/** Holds "production" at 10px with the 6px right padding below. */
const GUTTER = 68;
const r1 = (v) => Math.round(v * 10) / 10;
const plotW = W - INSET * 2;
const xOf = (rho) => r1(INSET + ((rho - LO) / (HI - LO)) * plotW);
const plotH = PAD_T + 3 * ROW_H + PAD_B;
const yOf = (i) => r1(PAD_T + i * ROW_H + ROW_H / 2);
/** The axis, labelled where a reader needs a number and nowhere else. */
const TICKS = [LO, 0, 0.5, HI];
/**
 * One panel: three marks on the shared scale, the middle one carrying its interval.
 * @param {{ row: typeof PRODUCTION_EVIDENCE[number] }} props
 */
function Panel({ row }) {
  const se = partialSe(row.n);
  const lo = row.partial - 2 * se;
  const hi = row.partial + 2 * se;
  const z = row.partial / se;
  const marks = [
    { key: "ordinal", label: "ordinal", rho: row.ordinal, subject: false },
    { key: "alone", label: "production", rho: row.alone, subject: false },
    { key: "partial", label: "partial", rho: row.partial, subject: true },
  ];
  const crossesZero = lo <= 0 && hi >= 0;
  return (
    <div>
      <p className="text-meta leading-snug text-secondary">
        <span className="text-ink">{row.target}</span>
        <span className="figure"> · n={row.n}</span>
      </p>
      <div
        className="mt-1 grid select-none"
        style={{ gridTemplateColumns: `${GUTTER}px minmax(0, 1fr)` }}
      >
        {/* Row names, absolutely positioned as a percentage of the SVG's own scaled
            height, so they track the scale with no measurement and no effect. */}
        <div aria-hidden="true" className="relative">
          {marks.map((m, i) => (
            <span
              key={m.key}
              className={
                `absolute right-1.5 -translate-y-1/2 text-micro leading-none ` +
                (m.subject ? "font-semibold text-accent-text" : "text-faint")
              }
              style={{ top: `${r1((yOf(i) / plotH) * 100)}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${W} ${plotH}`}
          className="block w-full"
          role="img"
          aria-label={
            `Predicting ${row.target}, n equals ${row.n}. ` +
            `The consensus ordinal alone scores rho ${row.ordinal}. ` +
            `Production alone scores rho ${row.alone}. ` +
            `Production's partial correlation once the ordinal is already in the model ` +
            `is ${row.partial}, with a two standard error interval from ` +
            `${lo.toFixed(3)} to ${hi.toFixed(3)}, z ${z.toFixed(2)} - ` +
            (crossesZero
              ? `an interval that contains zero, so this measurement is null.`
              : `an interval clear of zero.`)
          }
        >
          {/* ZERO, the only gridline either panel needs. */}
          <line
            x1={xOf(0)}
            y1={0}
            x2={xOf(0)}
            y2={plotH}
            stroke={CHART_NEUTRAL}
            strokeWidth={1}
          />
          {marks.map((m, i) => {
            const y = yOf(i);
            const ink = m.subject ? CHART_ACCENT : CHART_MARK;
            return (
              <g key={m.key}>
                {/* The interval, on the subject mark only. Orthogonal caps - a
                    45-degree tick is reserved for a refusal (D96). */}
                {m.subject && (
                  <>
                    <line
                      x1={xOf(lo)}
                      y1={y}
                      x2={xOf(hi)}
                      y2={y}
                      stroke={ink}
                      strokeWidth={1.5}
                    />
                    <line
                      x1={xOf(lo)}
                      y1={r1(y - 3.5)}
                      x2={xOf(lo)}
                      y2={r1(y + 3.5)}
                      stroke={ink}
                      strokeWidth={1.5}
                    />
                    <line
                      x1={xOf(hi)}
                      y1={r1(y - 3.5)}
                      x2={xOf(hi)}
                      y2={r1(y + 3.5)}
                      stroke={ink}
                      strokeWidth={1.5}
                    />
                  </>
                )}
                <circle
                  cx={xOf(m.rho)}
                  cy={y}
                  r={m.subject ? 3.6 : 3}
                  fill={ink}
                  stroke="var(--color-surface)"
                  strokeWidth={m.subject ? 1.2 : 0}
                />
              </g>
            );
          })}
        </svg>
      </div>
      {/* EVERY MARK'S VALUE IN PRINT, not just the subject's. The two context dots
          state their value in POSITION alone, and rule 1 of lib/chart-colors is that a
          mark is never the only encoding of its own value - so the numbers go here and
          the dots become the second reading rather than the only one. */}
      <p className="mt-1 text-micro leading-snug text-faint">
        ordinal{" "}
        <span className="figure text-secondary">{row.ordinal.toFixed(3)}</span> ·{" "}
        production{" "}
        <span className="figure text-secondary">{row.alone.toFixed(3)}</span>
        <br />
        partial{" "}
        <span className="figure text-secondary">
          {row.partial.toFixed(3)}
        </span>{" "}
        ±2 SE{" "}
        <span className="figure text-secondary">
          {lo.toFixed(3)} to {hi.toFixed(3)}
        </span>{" "}
        · z <span className="figure text-secondary">{z.toFixed(2)}</span> ·{" "}
        {crossesZero ? "contains zero" : "clear of zero"}
      </p>
    </div>
  );
}
/** The pair, sharing one axis printed once underneath. */
export function ProductionEvidence() {
  return (
    <div>
      <div className="space-y-3">
        {PRODUCTION_EVIDENCE.map((row) => (
          <Panel key={row.id} row={row} />
        ))}
      </div>
      {/* THE SHARED AXIS, printed once. Same two-column shell as the panels so the
          scale lands in register with both plots, and positioned by percentage of the
          same width rather than by coordinate arithmetic. */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `${GUTTER}px minmax(0, 1fr)` }}
      >
        <div aria-hidden="true" />
        <div aria-hidden="true" className="relative h-4">
          {TICKS.map((t) => (
            <span
              key={t}
              className={
                `figure absolute top-0.5 -translate-x-1/2 text-micro leading-none ` +
                (t === 0 ? "text-secondary" : "text-faint")
              }
              style={{ left: `${r1((xOf(t) / W) * 100)}%` }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-1 text-micro leading-snug text-faint">
        Rank correlation. <span className="text-secondary">ordinal</span> is the
        consensus redraft ordinal on its own;{" "}
        <span className="text-secondary">production</span> is the in-league index on its
        own; <span className="text-secondary">partial</span> is what production still
        adds once the ordinal is already in the model - the only one of the three that
        the weight rests on, and the only one drawn with its interval.
      </p>
    </div>
  );
}
