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
/**
 * Round to 2dp. Every computed SVG coordinate below goes through this - an
 * unrounded float can serialize differently between the server render and the
 * client hydration pass, which React reports as a hydration mismatch (same fix
 * the deleted trade web used for its curved edges).
 */
function r2(v) {
  return Math.round(v * 100) / 100;
}
/** Line chart with dots and axis labels. Good for trends over seasons. */
export function LineChart({
  data,
  height = 140,
  yLabel,
  color = ACCENT,
  format = (n) => `${n}`,
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
  const x = (i) => padX + (i * (W - padX * 2)) / Math.max(1, data.length - 1);
  const y = (v) => padY + (1 - (v - min) / span) * (H - padY * 2);
  const path = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value)}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={yLabel ?? "line chart"}
    >
      <line
        x1={padX}
        y1={H - padY}
        x2={W - padX}
        y2={H - padY}
        stroke={GRID}
        strokeWidth={1}
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.value)} r={3.5} fill={color} />
          <text
            x={x(i)}
            y={y(d.value) - 9}
            textAnchor="middle"
            fontSize="10"
            fill="var(--color-ink)"
            className="figure"
          >
            {format(d.value)}
          </text>
          <text
            x={x(i)}
            y={H - padY + 14}
            textAnchor="middle"
            fontSize="10"
            fill={MUTED}
          >
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
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="bar chart"
    >
      {signed && (
        <line
          x1={padX}
          y1={zeroY}
          x2={W - padX}
          y2={zeroY}
          stroke={GRID}
          strokeWidth={1}
        />
      )}
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
              opacity={
                signed ? 0.9 : magnitudeOpacity(Math.abs(d.value) / maxAbs)
              }
            />
            <text
              x={cx + barW / 2}
              y={labelY}
              textAnchor="middle"
              fontSize="10"
              fill="var(--color-ink)"
              className="figure"
            >
              {format(d.value)}
            </text>
            <text
              x={cx + barW / 2}
              y={H - 5}
              textAnchor="middle"
              fontSize="10"
              fill={MUTED}
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
/*
 * `SideBars` - the receipt's two horizontal totals-as-bars - lived here until the
 * deal receipt became a real two-sided document (components/DealReceipt.jsx), which
 * prints every ledger line and both totals as text. Its one caller went with it, so
 * the drawing went too rather than sitting here uncalled (the D19 discipline:
 * zero-caller code is deleted, not kept warm).
 */
/** Age distribution as a horizontal dot strip (roster age curve). */
export function AgeStrip({ ages, height = 64 }) {
  const W = 320;
  const H = height;
  const min = 18;
  const max = 42;
  const x = (a) => 20 + ((a - min) / (max - min)) * (W - 40);
  const ticks = [20, 25, 30, 35, 40];
  const avg = ages.length ? ages.reduce((s, v) => s + v, 0) / ages.length : 0;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="age distribution"
    >
      <line
        x1={20}
        y1={H / 2}
        x2={W - 20}
        y2={H / 2}
        stroke={GRID}
        strokeWidth={1}
      />
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={x(t)}
            y1={H / 2 - 4}
            x2={x(t)}
            y2={H / 2 + 4}
            stroke={MUTED}
            strokeWidth={1}
          />
          <text
            x={x(t)}
            y={H - 4}
            textAnchor="middle"
            fontSize="9"
            fill={MUTED}
          >
            {t}
          </text>
        </g>
      ))}
      {ages.map((a, i) => (
        <circle
          key={i}
          cx={x(a)}
          cy={H / 2}
          r={4}
          fill={ACCENT}
          opacity={0.55}
        />
      ))}
      {avg > 0 && (
        <g>
          <line
            x1={x(avg)}
            y1={8}
            x2={x(avg)}
            y2={H / 2 + 8}
            stroke="var(--color-info)"
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />
          <text
            x={x(avg)}
            y={6}
            textAnchor="middle"
            fontSize="9"
            fill="var(--color-info)"
            className="figure"
          >
            avg {avg.toFixed(1)}
          </text>
        </g>
      )}
    </svg>
  );
}
/**
 * TWO DURATION STRIPS - the roster's timeline today, and the same timeline after a
 * proposed package. `AgeStrip`'s idiom (one horizontal axis, one dot per asset, a
 * dashed line for the weighted centre) with three deliberate differences: the x-axis is
 * SEASONS OUT rather than age, dots are SIZED BY VALUE because the metric behind this
 * is value-weighted, and there is a band.
 *
 * THE BAND IS THE TCI NUMBER. Not an illustration of it - the same arithmetic.
 * `coherenceOf` (lib/metrics/duration.js) computes
 *
 *     dispersion = sqrt( Σ value·(duration - mean)² / Σ value )      // value-weighted σ
 *     TCI        = round( 100 · (1 - min(1, dispersion / SIGMA_REF)) )
 *
 * so the band drawn here, `mean ± dispersion`, has width `2·dispersion` seasons, and
 * therefore - for every roster below the clamp - width `2·SIGMA_REF·(1 - TCI/100)`, i.e.
 * exactly 6·(1 - TCI/100) seasons at the shipped SIGMA_REF of 3. A band that visibly
 * narrows between the two strips IS the TCI going up, by identity rather than by
 * analogy, and lib/metrics/metrics.test.js pins that identity so a recalibration of
 * SIGMA_REF cannot leave this drawing quietly lying.
 *
 * Above the clamp (dispersion ≥ SIGMA_REF, TCI pinned at 0) the identity stops holding
 * in one direction: the band keeps widening while the number cannot fall further. The
 * caption prints both numbers, so the reader is never asked to infer one from the other.
 *
 * NO COLOUR CARRIES DIRECTION. Departing assets are hollow, arriving assets are filled,
 * and both are the same hue as everything else - a trade that lowers TCI is not being
 * marked wrong (D6, and the same reasoning `FragilityLine` already keeps for a number
 * that moves both ways). No animation.
 */
export function DurationStrips({ assets, before, after, label }) {
  const W = 320;
  const rowH = 58;
  const H = rowH * 2 + 16;
  if (!assets.length) return null;
  const maxValue = Math.max(1, ...assets.map((a) => a.value));
  const edge = (c) => c.rosterDuration + c.dispersion;
  const domain = Math.min(
    12,
    Math.max(
      8,
      Math.ceil(Math.max(...assets.map((a) => a.duration), edge(before), edge(after))),
    ),
  );
  const padL = 8;
  const padR = 8;
  const x = (d) =>
    r2(padL + (Math.max(0, Math.min(domain, d)) / domain) * (W - padL - padR));
  // Area-proportional within a 2-6px range: a $20,000 core asset should read as
  // heavier than a $200 bench body without swallowing the strip.
  const radius = (v) => r2(2 + 4 * Math.sqrt(Math.max(0, v) / maxValue));
  const ticks = [];
  for (let t = 0; t <= domain; t += 2) ticks.push(t);
  const strips = [
    {
      title: "today",
      c: before,
      dots: assets.filter((a) => a.role !== "arriving"),
    },
    { title: "after", c: after, dots: assets },
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
      {strips.map((s, si) => {
        const top = si * rowH;
        const base = top + 36;
        const lo = x(s.c.rosterDuration - s.c.dispersion);
        const hi = x(s.c.rosterDuration + s.c.dispersion);
        return (
          <g key={s.title}>
            <text x={padL} y={top + 11} fontSize="9" fill={MUTED}>
              {s.title}
            </text>
            <text
              x={W - padR}
              y={top + 11}
              textAnchor="end"
              fontSize="9"
              fill="var(--color-ink)"
              className="figure"
            >
              TCI {s.c.tci} · ±{s.c.dispersion.toFixed(2)}s
            </text>
            {/* The ±1σ band, and the whole point of the drawing. */}
            <rect
              x={lo}
              y={base - 13}
              width={Math.max(0.75, r2(hi - lo))}
              height={26}
              rx={2}
              fill={ACCENT}
              fillOpacity={0.13}
            />
            {[lo, hi].map((edgeX, i) => (
              <line
                key={i}
                x1={edgeX}
                y1={base - 13}
                x2={edgeX}
                y2={base + 13}
                stroke={ACCENT}
                strokeOpacity={0.45}
                strokeWidth={1}
              />
            ))}
            <line
              x1={padL}
              y1={base}
              x2={W - padR}
              y2={base}
              stroke={GRID}
              strokeWidth={1}
            />
            {/* Value-weighted mean duration, the band's own centre. */}
            <line
              x1={x(s.c.rosterDuration)}
              y1={base - 16}
              x2={x(s.c.rosterDuration)}
              y2={base + 16}
              stroke="var(--color-info)"
              strokeWidth={1.5}
              strokeDasharray="3 2"
            />
            {s.dots.map((a, i) => {
              // On "today" a departing asset is still here, so it draws normally; on
              // "after" it is hollow, which is what makes the gap it left visible.
              const departed = si === 1 && a.role === "leaving";
              const arriving = si === 1 && a.role === "arriving";
              return (
                <circle
                  key={`${a.id}-${i}`}
                  cx={x(a.duration)}
                  cy={base}
                  r={radius(a.value)}
                  fill={departed ? "none" : ACCENT}
                  fillOpacity={arriving ? 1 : 0.5}
                  stroke={departed ? MUTED : arriving ? "var(--color-bg)" : "none"}
                  strokeWidth={departed ? 1 : 0.75}
                  strokeDasharray={departed ? "2 1.5" : undefined}
                />
              );
            })}
          </g>
        );
      })}
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={x(t)}
            y1={H - 15}
            x2={x(t)}
            y2={H - 11}
            stroke={MUTED}
            strokeWidth={1}
          />
          <text x={x(t)} y={H - 3} textAnchor="middle" fontSize="9" fill={MUTED}>
            {t}
          </text>
        </g>
      ))}
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
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const x = (i) => r2(pad + (i * (width - pad * 2)) / (values.length - 1));
  const y = (v) => r2(pad + (1 - (v - min) / span) * (height - pad * 2));
  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`)
    .join(" ");
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
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
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
export function PositionRadar({ data, height = 210, format = (n) => `${n}` }) {
  const W = 320;
  const H = height;
  const cx = W / 2;
  const cy = H / 2;
  const radius = Math.min(cx, cy) - 40;
  const n = data.length;
  if (n < 3) return null;
  const maxVal = Math.max(1, ...data.map((d) => d.value));
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pointAt = (i, r) => ({
    x: r2(cx + r * Math.cos(angle(i))),
    y: r2(cy + r * Math.sin(angle(i))),
  });
  const ring = (f) =>
    Array.from({ length: n }, (_, i) => {
      const p = pointAt(i, f * radius);
      return `${p.x},${p.y}`;
    }).join(" ");
  const shape = data
    .map((d, i) => pointAt(i, (d.value / maxVal) * radius))
    .map((p) => `${p.x},${p.y}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="positional strength radar"
    >
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon
          key={f}
          points={ring(f)}
          fill="none"
          stroke={GRID}
          strokeWidth={1}
        />
      ))}
      {data.map((_, i) => {
        const p = pointAt(i, radius);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke={GRID}
            strokeWidth={1}
          />
        );
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
            <text
              x={lp.x}
              y={lp.y}
              textAnchor="middle"
              fontSize="11"
              fontWeight={600}
              fill="var(--color-ink)"
            >
              {d.label}
            </text>
            <text
              x={lp.x}
              y={lp.y + 12}
              textAnchor="middle"
              fontSize="9"
              fill={MUTED}
              className="figure"
            >
              {format(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
