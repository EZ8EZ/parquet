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
import {
  QUADRANTS,
  TCI_BANDS,
  axisDomain,
  axisTicks,
  placeLabels,
  type QuadrantKey,
  type QuadrantView,
} from "@/lib/metrics/quadrant";

const GRID = "var(--color-border)";
const FAINT = "var(--color-faint)";
const MUTED = "var(--color-muted)";
const ACCENT = "var(--color-accent)";
const NEG = "var(--color-negative)";
const SURFACE = "var(--color-surface)";

const STEP_INK = ["var(--tci-1)", "var(--tci-2)", "var(--tci-3)", "var(--tci-4)"];

/** Reading order: the corner with no good reading leads, the comfortable one closes. */
const GROUP_ORDER: QuadrantKey[] = [
  "splitTopHeavy",
  "splitSpread",
  "agreedTopHeavy",
  "agreedSpread",
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

const r1 = (v: number) => Math.round(v * 10) / 10;

export function CoherenceFragilityQuadrant({ view }: { view: QuadrantView }) {
  const { points, tciMid, fragilityMid, counts } = view;
  const me = points.find((p) => p.isMe) ?? null;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected =
    points.find((p) => p.rosterId === selectedId) ?? me ?? points[0] ?? null;

  const geom = useMemo(() => {
    // Domains come off whatever the metrics return today. TCI is documented 0..100 so
    // it may clamp; RFI gets a floor and NO ceiling, because its scale is still being
    // worked on and an assumed 100 would silently crop a roster off the board.
    const [yLo, yHi] = axisDomain(points.map((p) => p.tci), {
      pad: 4,
      minSpan: 30,
      hardMin: 0,
      hardMax: 100,
    });
    const [xLo, xHi] = axisDomain(points.map((p) => p.fragility), {
      pad: 4,
      minSpan: 30,
      hardMin: 0,
    });
    const x = (v: number) => r1(X0 + ((v - xLo) / (xHi - xLo || 1)) * (X1 - X0));
    const y = (v: number) => r1(Y0 + (1 - (v - yLo) / (yHi - yLo || 1)) * (Y1 - Y0));
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
      <div className="rounded-[--radius] border border-border bg-surface/60 p-2.5">
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
          <text x={X0 + 4} y={Y0 - 6} fontSize="7.5" fill={FAINT} className="font-mono">
            {QUADRANTS.agreedSpread.label}
          </text>
          <text
            x={X1 - 4}
            y={Y0 - 6}
            fontSize="7.5"
            fill={FAINT}
            textAnchor="end"
            className="font-mono"
          >
            {QUADRANTS.agreedTopHeavy.label}
          </text>
          <text x={X0 + 4} y={Y1 + 11} fontSize="7.5" fill={FAINT} className="font-mono">
            {QUADRANTS.splitSpread.label}
          </text>
          <text
            x={X1 - 4}
            y={Y1 + 11}
            fontSize="7.5"
            fill={NEG}
            textAnchor="end"
            className="font-mono"
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
                className="font-mono"
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
              className="font-mono"
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
                  className="font-mono"
                >
                  {p.n}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Scale legend. A multi-hue ramp always ships one. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-faint">
            TCI
          </span>
          {TCI_BANDS.map((b) => (
            <span key={b.step} className="inline-flex items-center gap-1">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: STEP_INK[b.step - 1] }}
              />
              <span className="font-mono text-[10px] tnum text-faint">{b.range}</span>
            </span>
          ))}
        </div>

        <p className="mt-1.5 text-[11px] leading-snug text-faint">
          Dashed lines are this league&rsquo;s medians, not pass marks - half the board
          sits under each by construction. Colour reads coherence only. Fragility is
          deliberately uncoloured, because a low score there is not a good score: a
          torn-down roster has little to lose because there is little left on it, not
          because it is insulated.
        </p>
      </div>

      {/* The selected roster. Defaults to yours, so the board opens on the reading
          you actually came for rather than on an empty state. */}
      {selected && (
        <div
          className={`mt-1.5 rounded-[--radius] border p-2.5 ${
            selected.isMe ? "border-accent/40 bg-accent/[0.06]" : "border-border bg-surface/60"
          }`}
        >
          <p className="truncate text-[14px] font-semibold leading-tight text-ink">
            <span className="mr-1.5 font-mono text-[11px] tnum text-faint">
              {selected.n}
            </span>
            {selected.name}
            {selected.isMe && (
              <span className="ml-1.5 font-mono text-[11px] text-accent">you</span>
            )}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Tag tone={selected.quadrant === "splitTopHeavy" ? "negative" : "neutral"}>
              {q.label}
            </Tag>
            <span className="font-mono text-[11px] tnum text-faint">
              {selected.tci} TCI · {selected.posture}
            </span>
            <span className="font-mono text-[11px] tnum text-faint">
              {selected.fragility} RFI · {selected.fragilityBand}
            </span>
          </div>
          {/* The RFI number on its own means nothing without the league it was scored
              against, and the axis has no colour to carry that. So it is said. */}
          {points.length > 1 && (
            <p className="mt-1 text-[11px] leading-snug text-faint">
              More fragile than{" "}
              {Math.round(selected.fragilityPercentile * (points.length - 1))} of the
              other {points.length - 1} rosters.
            </p>
          )}

          {selected.spofName && (
            <p className="mt-1.5 text-[11px] leading-snug text-muted">
              breaks first:{" "}
              <span className="font-semibold text-ink">{selected.spofName}</span>
              {selected.spofShare != null && (
                <>
                  {" "}
                  <span className="font-mono tnum">
                    ({Math.round(selected.spofShare * 100)}% of startable value)
                  </span>
                </>
              )}
            </p>
          )}

          <p className="mt-1.5 text-[12px] leading-snug text-muted">{q.thesis}</p>

          <Link
            href={`/managers/${selected.rosterId}`}
            className="mt-1 inline-flex min-h-11 items-center gap-0.5 text-[11px] font-semibold text-accent"
          >
            Open the dossier
            <ChevronRight size={13} aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Grouped list. Also the screen-reader path: a scatter of fourteen dots is not
          one, and every dot is a real button here. */}
      <div className="mt-1.5 space-y-1.5">
        {GROUP_ORDER.map((key) => {
          const meta = QUADRANTS[key];
          const rows = points.filter((p) => p.quadrant === key);
          if (rows.length === 0) return null;
          return (
            <div
              key={key}
              className="overflow-hidden rounded-[--radius-sm] border border-border bg-surface/60"
            >
              <div className="border-b border-border px-2.5 py-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink">
                    {meta.label}
                    <span className="ml-1.5 font-normal text-faint">
                      {rows.length} of {points.length}
                    </span>
                  </p>
                  <p className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-faint">
                    tci / rfi
                  </p>
                </div>
                <p className="mt-px text-[11px] leading-snug text-faint">{meta.gist}</p>
              </div>
              <ul className="divide-y divide-border">
                {rows.map((p) => (
                  <li key={p.rosterId}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.rosterId)}
                      aria-pressed={selected?.rosterId === p.rosterId}
                      className={`flex w-full min-h-11 items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-surface-2 ${
                        selected?.rosterId === p.rosterId ? "bg-surface-2" : ""
                      } ${p.isMe ? "bg-accent/[0.06]" : ""}`}
                    >
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: STEP_INK[p.tciStep - 1] }}
                      />
                      <span className="w-4 shrink-0 text-center font-mono text-[11px] tnum text-faint">
                        {p.n}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-ink">
                        {p.name}
                        {p.isMe && (
                          <span className="ml-1.5 font-mono text-[11px] font-normal text-accent">
                            you
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tnum text-faint">
                        {p.tci} / {p.fragility}
                      </span>
                      {/* The band as plain text, not as the coloured pill the rest of
                          the app gives it. A green "resilient" chip on a torn-down
                          roster is the exact claim this board exists to refuse. */}
                      <span className="w-[52px] shrink-0 text-right text-[11px] text-muted">
                        {p.fragilityBand}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
