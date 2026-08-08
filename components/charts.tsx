/**
 * Hand-rolled SVG charts (DECISIONS.md D3 — no chart library). Designed to be
 * legible at 390px: bold strokes, few labels, tabular-figure captions. All use a
 * viewBox so they scale fluidly.
 */

import {
  CHART_ACCENT,
  CHART_GRID,
  CHART_FAINT,
  divergingFill,
  magnitudeOpacity,
} from "@/lib/chart-colors";

const ACCENT = CHART_ACCENT;
const GRID = CHART_GRID;
const MUTED = CHART_FAINT;
/**
 * Trend direction keeps the SEMANTIC tokens - a sparkline that rises is telling you
 * something went up, which is the job `--color-positive` exists for. Signed CHART
 * FILLS do not: `BarChart signed` used the same two tokens as bar colours, and a
 * red/green bar pair is the one encoding that is unreadable to the ~8% of men with a
 * red-green deficiency. Those moved to the diverging pair in lib/chart-colors.ts.
 */
const POS = "var(--color-positive)";
const NEG = "var(--color-negative)";

export interface Point {
  label: string;
  value: number;
}

/**
 * Round to 2dp. Every computed SVG coordinate below goes through this - an
 * unrounded float can serialize differently between the server render and the
 * client hydration pass, which React reports as a hydration mismatch (same fix
 * the deleted trade web used for its curved edges).
 */
function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Line chart with dots and axis labels. Good for trends over seasons. */
export function LineChart({
  data,
  height = 140,
  yLabel,
  color = ACCENT,
  format = (n) => `${n}`,
}: {
  data: Point[];
  height?: number;
  yLabel?: string;
  color?: string;
  format?: (n: number) => string;
}) {
  const W = 320;
  const H = height;
  const padX = 30;
  const padY = 22;
  if (data.length === 0) return null;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) =>
    padX + (i * (W - padX * 2)) / Math.max(1, data.length - 1);
  const y = (v: number) => padY + (1 - (v - min) / span) * (H - padY * 2);
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={yLabel ?? "line chart"}>
      <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke={GRID} strokeWidth={1} />
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.value)} r={3.5} fill={color} />
          <text x={x(i)} y={y(d.value) - 9} textAnchor="middle" fontSize="10" fill="var(--color-ink)" className="font-mono">
            {format(d.value)}
          </text>
          <text x={x(i)} y={H - padY + 14} textAnchor="middle" fontSize="10" fill={MUTED}>
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Vertical bar chart; bars can be tinted per sign. */
export function BarChart({
  data,
  height = 140,
  signed = false,
  format = (n) => `${n}`,
}: {
  data: Point[];
  height?: number;
  signed?: boolean;
  format?: (n: number) => string;
}) {
  const W = 320;
  const H = height;
  const padY = 20;
  const padX = 8;
  if (data.length === 0) return null;
  const values = data.map((d) => d.value);
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const zeroY = signed ? padY + (H - padY * 2) / 2 : H - padY;
  const barW = (W - padX * 2) / data.length - 8;
  const scale = signed ? (H - padY * 2) / 2 / maxAbs : (H - padY * 2) / maxAbs;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="bar chart">
      {signed && <line x1={padX} y1={zeroY} x2={W - padX} y2={zeroY} stroke={GRID} strokeWidth={1} />}
      {data.map((d, i) => {
        const cx = padX + i * ((W - padX * 2) / data.length) + 4;
        const h = Math.abs(d.value) * scale;
        const yTop = d.value >= 0 ? zeroY - h : zeroY;
        // Diverging pair for the sign (CVD-safe, see lib/chart-colors.ts rule 3);
        // the bar's own length and its printed number carry the same value, so the
        // hue is the third encoding rather than the only one.
        const color = signed ? divergingFill(d.value) : ACCENT;
        const labelY = d.value >= 0 ? yTop - 5 : yTop + h + 12;
        return (
          <g key={i}>
            <rect
              x={cx}
              y={yTop}
              width={barW}
              height={Math.max(1, h)}
              rx={3}
              fill={color}
              // Unsigned bars ride the single-hue magnitude ramp: same hue, five
              // strengths, so a chart of one tall bar and five stubs reads as a
              // distribution rather than as six identical blocks (rule 2).
              opacity={signed ? 0.9 : magnitudeOpacity(Math.abs(d.value) / maxAbs)}
            />
            <text x={cx + barW / 2} y={labelY} textAnchor="middle" fontSize="10" fill="var(--color-ink)" className="font-mono">
              {format(d.value)}
            </text>
            <text x={cx + barW / 2} y={H - 5} textAnchor="middle" fontSize="10" fill={MUTED}>
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Two (or N) totals as horizontal bars, one per row, labelled in place.
 *
 * The receipt's only chart. Horizontal rather than vertical because the labels are
 * team names: at 390px a vertical bar chart has ~150px of width per side to print
 * "The Terror Twins" under it, and it truncates; a horizontal bar puts the name on
 * its own full-width line above the bar and never does.
 *
 * Deliberately NOT a difference, a ratio or a delta (D6). It draws two lengths and
 * lets the reader do the comparing - the moment this renders "+2,400" it has issued a
 * verdict, which is the one thing this app does not do.
 *
 * `max` is taken from the caller rather than derived here so several of these can
 * share one scale when they need to.
 */
export function SideBars({
  data,
  max,
  height = 26,
  format = (n) => `${n}`,
}: {
  data: Point[];
  max: number;
  /** Row height, in the same unit space as the viewBox. */
  height?: number;
  format?: (n: number) => string;
}) {
  const W = 320;
  const rowH = height;
  const barH = 10;
  const H = rowH * data.length;
  if (data.length === 0 || max <= 0) return null;
  const barW = (v: number) => Math.max(2, r2((v / max) * W));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Value today: ${data.map((d) => `${d.label} ${format(d.value)}`).join("; ")}.`}
    >
      {data.map((d, i) => {
        const top = i * rowH;
        return (
          <g key={`${d.label}-${i}`}>
            <text x={0} y={top + 10} fontSize="11" fontWeight={600} fill="var(--color-ink)">
              {d.label}
            </text>
            <text
              x={W}
              y={top + 10}
              textAnchor="end"
              fontSize="11"
              fill="var(--color-accent)"
              className="font-mono"
            >
              {format(d.value)}
            </text>
            <rect x={0} y={top + 15} width={W} height={barH} rx={3} fill={GRID} opacity={0.5} />
            <rect
              x={0}
              y={top + 15}
              width={barW(d.value)}
              height={barH}
              rx={3}
              fill={ACCENT}
              // Magnitude ramp (rule 2), which on a receipt is deliberately the ONLY
              // thing the colour adds: it restates the length it is already drawing.
              // A diverging pair here would be a verdict about which side won, and
              // this chart computes no difference on purpose (D45).
              opacity={magnitudeOpacity(d.value / max)}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Age distribution as a horizontal dot strip (roster age curve). */
export function AgeStrip({
  ages,
  height = 64,
}: {
  ages: number[];
  height?: number;
}) {
  const W = 320;
  const H = height;
  const min = 18;
  const max = 42;
  const x = (a: number) => 20 + ((a - min) / (max - min)) * (W - 40);
  const ticks = [20, 25, 30, 35, 40];
  const avg = ages.length ? ages.reduce((s, v) => s + v, 0) / ages.length : 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="age distribution">
      <line x1={20} y1={H / 2} x2={W - 20} y2={H / 2} stroke={GRID} strokeWidth={1} />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} y1={H / 2 - 4} x2={x(t)} y2={H / 2 + 4} stroke={MUTED} strokeWidth={1} />
          <text x={x(t)} y={H - 4} textAnchor="middle" fontSize="9" fill={MUTED}>{t}</text>
        </g>
      ))}
      {ages.map((a, i) => (
        <circle key={i} cx={x(a)} cy={H / 2} r={4} fill={ACCENT} opacity={0.55} />
      ))}
      {avg > 0 && (
        <g>
          <line x1={x(avg)} y1={8} x2={x(avg)} y2={H / 2 + 8} stroke="var(--color-info)" strokeWidth={1.5} strokeDasharray="3 2" />
          <text x={x(avg)} y={6} textAnchor="middle" fontSize="9" fill="var(--color-info)" className="font-mono">
            avg {avg.toFixed(1)}
          </text>
        </g>
      )}
    </svg>
  );
}

/**
 * Inline trend line with no axes, sized to sit next to a single row rather than
 * stand on its own as a section. Direction is read off the first-vs-last value
 * (rising = positive tint, falling = negative) unless a color is forced by the
 * caller - useful when the series being drawn isn't itself a "good/bad" quantity.
 */
export function Sparkline({
  values,
  width = 64,
  height = 22,
  color,
  label = "trend",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  label?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const x = (i: number) => r2(pad + (i * (width - pad * 2)) / (values.length - 1));
  const y = (v: number) => r2(pad + (1 - (v - min) / span) * (height - pad * 2));
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  const rising = values[values.length - 1] >= values[0];
  const stroke = color ?? (rising ? POS : NEG);
  const lastX = x(values.length - 1);
  const lastY = y(values[values.length - 1]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="shrink-0"
      role="img"
      aria-label={label}
    >
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={2} fill={stroke} />
    </svg>
  );
}

/**
 * Positional strength as a radar/spider shape. A bar chart answers "which position
 * is biggest"; a radar answers the question a bar chart can't - is value balanced
 * across the roster's positions, or is the whole team really one deep position and
 * four thin ones. Needs at least 3 axes to read as a shape, so callers with fewer
 * distinct positions should fall back to BarChart instead.
 */
export function PositionRadar({
  data,
  height = 210,
  format = (n) => `${n}`,
}: {
  data: Point[];
  height?: number;
  format?: (n: number) => string;
}) {
  const W = 320;
  const H = height;
  const cx = W / 2;
  const cy = H / 2;
  const radius = Math.min(cx, cy) - 40;
  const n = data.length;
  if (n < 3) return null;

  const maxVal = Math.max(1, ...data.map((d) => d.value));
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pointAt = (i: number, r: number) => ({
    x: r2(cx + r * Math.cos(angle(i))),
    y: r2(cy + r * Math.sin(angle(i))),
  });
  const ring = (f: number) =>
    Array.from({ length: n }, (_, i) => {
      const p = pointAt(i, f * radius);
      return `${p.x},${p.y}`;
    }).join(" ");
  const shape = data
    .map((d, i) => pointAt(i, (d.value / maxVal) * radius))
    .map((p) => `${p.x},${p.y}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="positional strength radar">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={ring(f)} fill="none" stroke={GRID} strokeWidth={1} />
      ))}
      {data.map((_, i) => {
        const p = pointAt(i, radius);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={GRID} strokeWidth={1} />;
      })}
      <polygon
        points={shape}
        fill={ACCENT}
        fillOpacity={0.22}
        stroke={ACCENT}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {data.map((d, i) => {
        const vp = pointAt(i, (d.value / maxVal) * radius);
        const lp = pointAt(i, radius + 16);
        return (
          <g key={d.label}>
            <circle cx={vp.x} cy={vp.y} r={3} fill={ACCENT} />
            <text x={lp.x} y={lp.y} textAnchor="middle" fontSize="11" fontWeight={600} fill="var(--color-ink)">
              {d.label}
            </text>
            <text x={lp.x} y={lp.y + 12} textAnchor="middle" fontSize="9" fill={MUTED} className="font-mono">
              {format(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
