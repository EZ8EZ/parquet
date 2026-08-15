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
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Tag } from "@/components/ui";
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
const H = 236;
const PAD_L = 26;
const PAD_R = 10;
const PAD_T = 24;
const PAD_B = 38;
const X0 = PAD_L;
const X1 = W - PAD_R;
const Y0 = PAD_T;
const Y1 = H - PAD_B;
const r1 = (v) => Math.round(v * 10) / 10;
export function CoherenceFragilityQuadrant({ view }) {
  const { points, tciMid, fragilityMid, counts } = view;
  const me = points.find((p) => p.isMe) ?? null;
  const [selectedId, setSelectedId] = useState(null);
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
    // The viewer's own dot wears an extra ring, so its number has to start further
    // out or the ring eats it.
    const radii = points.map((p) => (p.isMe ? 10 : 6.5));
    const labels = placeLabels(placed, {
      w: 11,
      h: 8,
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
  const q = QUADRANTS[selected.quadrant];
  return (
    <div>
      <div className="rounded-[--radius] border border-border bg-surface p-2.5">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full select-none"
          role="img"
          aria-label={
            `Every roster plotted on timeline coherence against roster fragility. ` +
            `${counts.splitTopHeavy} of ${points.length} sit below the median on coherence ` +
            `and above it on fragility, the quadrant with no good reading. ` +
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

          {/* Corner captions. Descriptive on the fragility axis ("spread" /
            "top-heavy"), directional only on the coherence axis. */}
          <text x={X0 + 4} y={Y0 - 6} fontSize="7.5" fill={FAINT}>
            {QUADRANTS.agreedSpread.label}
          </text>
          <text
            x={X1 - 4}
            y={Y0 - 6}
            fontSize="7.5"
            fill={FAINT}
            textAnchor="end"
          >
            {QUADRANTS.agreedTopHeavy.label}
          </text>
          <text x={X0 + 4} y={Y1 + 11} fontSize="7.5" fill={FAINT}>
            {QUADRANTS.splitSpread.label}
          </text>
          <text
            x={X1 - 4}
            y={Y1 + 11}
            fontSize="7.5"
            fill={NEG}
            textAnchor="end"
          >
            {QUADRANTS.splitTopHeavy.label}
          </text>

          {/* Axes */}
          {geom.xTicks.map((t) => (
            <g key={`x${t}`}>
              <line
                x1={geom.x(t)}
                y1={Y1}
                x2={geom.x(t)}
                y2={Y1 + 3}
                stroke={FAINT}
                strokeWidth={1}
              />
              <text
                x={geom.x(t)}
                y={Y1 + 21}
                textAnchor="middle"
                fontSize="8.5"
                fill={FAINT}
                className="figure"
              >
                {t}
              </text>
            </g>
          ))}
          {geom.yTicks.map((t) => (
            <text
              key={`y${t}`}
              x={X0 - 4}
              y={geom.y(t) + 3}
              textAnchor="end"
              fontSize="8.5"
              fill={FAINT}
              className="figure"
            >
              {t}
            </text>
          ))}
          <text
            x={Math.round((X0 + X1) / 2)}
            y={H - 4}
            textAnchor="middle"
            fontSize="8.5"
            fill={FAINT}
          >
            fragility (RFI) - right is more load-bearing
          </text>
          <text
            x={8}
            y={Math.round((Y0 + Y1) / 2)}
            fontSize="8.5"
            fill={FAINT}
            textAnchor="middle"
            transform={`rotate(-90 8 ${Math.round((Y0 + Y1) / 2)})`}
          >
            coherence (TCI) - up is agreed
          </text>

          {/* Dots. Drawn least-selected first so the viewer's own roster and the
            selected one are never buried under a neighbour. */}
          {points.map((p, i) => {
            const c = geom.placed[i];
            const lab = geom.labels[i];
            const isSel = selected?.rosterId === p.rosterId;
            const ink = STEP_INK[p.tciStep - 1];
            return (
              <g
                key={p.rosterId}
                onClick={() => setSelectedId(p.rosterId)}
                style={{ cursor: "pointer" }}
                // Nothing drawn inside this group may become the pointer target: a
                // thumb landing on the printed number has to count as a tap on the
                // dot, not as the start of a text drag over an eight-pixel glyph.
                pointerEvents="none"
              >
                {/* Finger-sized hit area over a thumb-sized mark. Painted first and
                    left as the only pointer-eventful thing here, so the target of a
                    tap is the same shape wherever inside the circle it lands. */}
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={15}
                  fill="transparent"
                  pointerEvents="auto"
                />
                {p.isMe && (
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={9}
                    fill="none"
                    stroke={ACCENT}
                    strokeWidth={1}
                    opacity={0.75}
                  />
                )}
                {isSel && (
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={11.5}
                    fill="none"
                    stroke={MUTED}
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                )}
                {/* A surface-coloured ring so two dots that land on top of each
                    other still read as two dots. */}
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={5}
                  fill={ink}
                  stroke={SURFACE}
                  strokeWidth={1.5}
                />
                <text
                  x={r1(c.x + lab.dx)}
                  y={r1(c.y + lab.dy)}
                  textAnchor={lab.anchor}
                  fontSize="8"
                  fontWeight={p.isMe || isSel ? 700 : 400}
                  fill={p.isMe ? ACCENT : isSel ? "var(--color-ink)" : MUTED}
                  className="figure"
                >
                  {p.n}
                </text>
              </g>
            );
          })}
        </svg>

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
          Dashed lines are this league&rsquo;s medians, not pass marks - half
          the board sits under each by construction. Colour reads coherence
          only.
        </p>
        <MetricGloss metrics={["tci", "rfi"]} className="mt-0.5" />
      </div>

      {/* The selected roster. Defaults to yours, so the board opens on the reading
            you actually came for rather than on an empty state. */}
      {selected && (
        <div
          className={`mt-1.5 rounded-[--radius] border p-2.5 ${selected.isMe ? "border-accent-edge bg-accent-wash" : "border-border bg-surface"}`}
        >
          <p className="truncate text-body font-semibold leading-tight text-ink">
            <span className="mr-1.5 figure text-meta text-secondary">
              {selected.n}
            </span>
            {selected.name}
            {selected.isMe && (
              <span className="ml-1.5 text-meta text-accent-text">you</span>
            )}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Tag
              tone={
                selected.quadrant === "splitTopHeavy" ? "negative" : "neutral"
              }
            >
              {q.label}
            </Tag>
            <span className="figure text-meta text-secondary">
              {selected.tci} TCI · {selected.posture}
            </span>
            <span className="figure text-meta text-secondary">
              {selected.fragility} RFI · {selected.fragilityBand}
            </span>
          </div>
          {/* The RFI number on its own means nothing without the league it was scored
                against, and the axis has no colour to carry that. So it is said. */}
          {points.length > 1 && (
            <p className="mt-1 text-meta leading-snug text-secondary">
              More fragile than{" "}
              {Math.round(selected.fragilityPercentile * (points.length - 1))}{" "}
              of the other {points.length - 1} rosters.
            </p>
          )}

          {selected.spofName && (
            <p className="mt-1.5 text-meta leading-snug text-muted">
              breaks first:{" "}
              <span className="font-semibold text-ink">
                {selected.spofName}
              </span>
              {selected.spofShare != null && (
                <>
                  {" "}
                  <span className="figure">
                    ({Math.round(selected.spofShare * 100)}% of startable value)
                  </span>
                </>
              )}
            </p>
          )}

          <p className="mt-1.5 text-note leading-snug text-muted">{q.thesis}</p>

          <Link
            href={`/managers/${selected.rosterId}`}
            className="mt-1 inline-flex min-h-11 items-center gap-0.5 text-meta font-semibold text-accent-text"
          >
            Open the dossier
            <ChevronRight size={13} aria-hidden="true" />
          </Link>
        </div>
      )}

      {/*
          THE DOT RAIL - one tappable, focusable, labelled control per dot.
         *
         * This used to be a grouped list of all fourteen rosters, four quadrant headers
         * deep. It was good, and it was the THIRD rendering of the same fourteen rosters
         * on the same page (round 8 measured the four of them at 87% of /league). What it
         * was actually load-bearing for is not the reading - the page's one roster list
         * carries every number in text - it is that a scatter of fourteen SVG dots has no
         * keyboard path and no screen-reader path unless something else does. So the
         * selectors survive at full strength and the duplicated prose does not.
         */}
      <div
        className="scroll-x mt-1.5 flex gap-1"
        role="group"
        aria-label="Select a roster"
      >
        {points.map((p) => {
          const isSel = selected?.rosterId === p.rosterId;
          return (
            <button
              key={p.rosterId}
              type="button"
              onClick={() => setSelectedId(p.rosterId)}
              aria-pressed={isSel}
              aria-label={`${p.name}: TCI ${p.tci}, ${p.posture}. RFI ${p.fragility}, ${p.fragilityBand}.`}
              className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[--radius-sm] border transition-colors ${
                isSel
                  ? "border-border-strong bg-surface-2"
                  : "border-border bg-surface hover:bg-surface-2"
              } ${p.isMe ? "border-accent-edge" : ""}`}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ background: STEP_INK[p.tciStep - 1] }}
              />
              <span
                aria-hidden="true"
                className={`figure text-meta leading-none ${p.isMe ? "font-semibold text-accent-text" : "text-muted"}`}
              >
                {p.n}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
