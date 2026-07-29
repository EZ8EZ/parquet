/**
 * Hand-rolled SVG charts (DECISIONS.md D3 — no chart library). Designed to be
 * legible at 390px: bold strokes, few labels, tabular-figure captions. All use a
 * viewBox so they scale fluidly.
 */

const ACCENT = "var(--color-accent)";
const POS = "var(--color-positive)";
const NEG = "var(--color-negative)";
const GRID = "var(--color-border)";
const MUTED = "var(--color-faint)";

export interface Point {
  label: string;
  value: number;
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
        const color = signed ? (d.value >= 0 ? POS : NEG) : ACCENT;
        const labelY = d.value >= 0 ? yTop - 5 : yTop + h + 12;
        return (
          <g key={i}>
            <rect x={cx} y={yTop} width={barW} height={Math.max(1, h)} rx={3} fill={color} opacity={0.9} />
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
