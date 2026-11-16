/**
 * Hand-rolled charts (DECISIONS.md D3: no chart library), redrawn to DESIGN.md's chart
 * rules. The props of every export are unchanged.
 *
 * LABELS ARE HTML, NEVER SVG <text> IN A SCALING viewBox (D96). Each chart is a
 * relative box of fixed pixel height: marks are SVG drawn with percentage x and pixel
 * y (or, for a path, a viewBox with preserveAspectRatio="none" and non-scaling strokes,
 * so it stretches horizontally without distorting), and every label is an absolutely
 * positioned span at a real type size (11px ticks, 12px values) on the same x. Text
 * therefore stays on the type scale at any width.
 *
 * Colour from lib/chart-colors.js only: one subject in CHART_ACCENT, rules in
 * CHART_GRID, numbers in CHART_INK. A printed number or a position carries every
 * value; colour never does alone. Every computed dimension is clamped so nothing
 * renders a negative or NaN attribute (the smoke e2e fails on that console error).
 */
import {
  CHART_ACCENT,
  CHART_FIELD,
  CHART_GRID,
  CHART_FAINT,
  CHART_NEUTRAL,
  divergingFill,
  magnitudeOpacity,
} from "@/lib/chart-colors";
const ACCENT = CHART_ACCENT;
const GRID = CHART_GRID;
const MUTED = CHART_FAINT;
/**
 * Trend direction keeps the semantic tokens on the sparkline only: a line that rises
 * is saying something went up. Signed bar fills use the diverging pair instead.
 */
const POS = "var(--color-positive)";
const NEG = "var(--color-negative)";

/** Round to 2dp so server and client serialise coordinates identically. */
function r2(v) {
  return Math.round(v * 100) / 100;
}
/** A finite, non-negative number or the fallback. */
function safe(v, fallback = 0) {
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}
/** x on a 0..W design axis, as a CSS/SVG percentage. */
function pct(x, W) {
  return `${r2((safe(x) / W) * 100)}%`;
}

/** A label centred on an x (percentage) at a pixel top. */
function Label({ left, top, children, className = "", align = "center" }) {
  const shift = align === "center" ? "-50%" : align === "end" ? "-100%" : "0";
  return (
    <span
      className={`pointer-events-none absolute whitespace-nowrap leading-none ${className}`}
      style={{ left, top, transform: `translateX(${shift})` }}
    >
      {children}
    </span>
  );
}

/** Line chart with dots and printed values. Good for trends over seasons. */
export function LineChart({ data, height = 140, yLabel, color = ACCENT, format = (n) => `${n}` }) {
  const W = 320;
  const H = Math.max(80, safe(height, 140));
  const padX = 30;
  const top = 26;
  const bottom = 26;
  if (data.length === 0) return null;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => r2(padX + (i * (W - padX * 2)) / Math.max(1, data.length - 1));
  const y = (v) => r2(top + (1 - (v - min) / span) * (H - top - bottom));
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value)}`).join(" ");
  return (
    <div className="relative w-full" style={{ height: H }} role="img" aria-label={yLabel ?? "line chart"}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <line x1={padX} y1={H - bottom} x2={W - padX} y2={H - bottom} stroke={GRID} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {data.map((d, i) => (
        <span key={i} aria-hidden="true">
          <span
            className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: pct(x(i), W), top: y(d.value), background: color }}
          />
          <Label left={pct(x(i), W)} top={Math.max(0, y(d.value) - 20)} className="figure text-meta font-semibold text-ink">
            {format(d.value)}
          </Label>
          <Label left={pct(x(i), W)} top={H - bottom + 8} className="text-micro text-secondary">
            {d.label}
          </Label>
        </span>
      ))}
    </div>
  );
}

/** Vertical bar chart; bars can be tinted per sign (diverging pair, never red/green). */
export function BarChart({ data, height = 140, signed = false, format = (n) => `${n}` }) {
  const W = 320;
  const H = Math.max(80, safe(height, 140));
  const top = 18;
  const bottom = 20;
  const padX = 8;
  if (data.length === 0) return null;
  const values = data.map((d) => d.value);
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const plotH = H - top - bottom;
  const zeroY = signed ? top + plotH / 2 : H - bottom;
  const slot = (W - padX * 2) / data.length;
  const barW = Math.max(4, slot - 8);
  const scale = signed ? plotH / 2 / maxAbs : plotH / maxAbs;
  return (
    <div className="relative w-full" style={{ height: H }} role="img" aria-label="bar chart">
      <svg width="100%" height={H} className="absolute inset-0" aria-hidden="true">
        {signed && <line x1={pct(padX, W)} y1={zeroY} x2={pct(W - padX, W)} y2={zeroY} stroke={GRID} strokeWidth={1} />}
        {data.map((d, i) => {
          const cx = padX + i * slot + 4;
          const h = r2(Math.max(1, Math.abs(d.value) * scale));
          const yTop = r2(d.value >= 0 ? zeroY - h : zeroY);
          return (
            <rect
              key={i}
              x={pct(cx, W)}
              y={yTop}
              width={pct(barW, W)}
              height={h}
              rx={3}
              fill={signed ? divergingFill(d.value) : ACCENT}
              opacity={signed ? 0.9 : magnitudeOpacity(Math.abs(d.value) / maxAbs)}
            />
          );
        })}
      </svg>
      {data.map((d, i) => {
        const mid = padX + i * slot + 4 + barW / 2;
        const h = Math.abs(d.value) * scale;
        const labelTop = d.value >= 0 ? zeroY - h - 15 : zeroY + h + 3;
        return (
          <span key={i} aria-hidden="true">
            <Label left={pct(mid, W)} top={Math.max(0, labelTop)} className="figure text-meta font-semibold text-ink">
              {format(d.value)}
            </Label>
            <Label left={pct(mid, W)} top={H - 14} className="text-micro text-secondary">
              {d.label}
            </Label>
          </span>
        );
      })}
    </div>
  );
}

/** Age distribution as a horizontal dot strip (roster age curve). */
export function AgeStrip({ ages, height = 64 }) {
  const W = 320;
  const H = Math.max(56, safe(height, 64));
  const min = 18;
  const max = 42;
  const x = (a) => r2(20 + ((Math.max(min, Math.min(max, a)) - min) / (max - min)) * (W - 40));
  const ticks = [20, 25, 30, 35, 40];
  const avg = ages.length ? ages.reduce((s, v) => s + v, 0) / ages.length : 0;
  const mid = Math.round(H / 2);
  return (
    <div
      className="relative w-full"
      style={{ height: H }}
      role="img"
      aria-label={`age distribution${avg > 0 ? `, average ${avg.toFixed(1)}` : ""}`}
    >
      <svg width="100%" height={H} className="absolute inset-0" aria-hidden="true">
        <line x1={pct(20, W)} y1={mid} x2={pct(W - 20, W)} y2={mid} stroke={GRID} strokeWidth={1} />
        {ticks.map((t) => (
          <line key={t} x1={pct(x(t), W)} y1={mid - 4} x2={pct(x(t), W)} y2={mid + 4} stroke={MUTED} strokeWidth={1} />
        ))}
        {avg > 0 && (
          <line
            x1={pct(x(avg), W)}
            y1={16}
            x2={pct(x(avg), W)}
            y2={mid + 8}
            stroke={CHART_FIELD}
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />
        )}
        {ages.map((a, i) => (
          <circle key={i} cx={pct(x(a), W)} cy={mid} r={4} fill={ACCENT} opacity={0.55} />
        ))}
      </svg>
      {ticks.map((t) => (
        <Label key={t} left={pct(x(t), W)} top={H - 12} className="figure text-micro text-secondary">
          {t}
        </Label>
      ))}
      {avg > 0 && (
        <Label left={pct(x(avg), W)} top={0} className="figure text-micro font-semibold text-info">
          avg {avg.toFixed(1)}
        </Label>
      )}
    </div>
  );
}

/**
 * Two strips (today, after a proposed package) on a SEASONS-OUT axis: one dot per asset
 * sized by value, the value-weighted mean as a dashed line, and the band `mean ±
 * dispersion`, which IS the TCI number (`coherenceOf`, lib/metrics/duration.js: width
 * 2·dispersion = 6·(1 - TCI/100) seasons below the clamp; lib/metrics/metrics.test.js
 * pins the identity). Departing assets are hollow, arriving ones filled; no colour
 * carries direction (D6). The caption prints both numbers.
 */
export function DurationStrips({ assets, before, after, label }) {
  const W = 320;
  const rowH = 58;
  const H = rowH * 2 + 18;
  if (!assets.length) return null;
  const maxValue = Math.max(1, ...assets.map((a) => a.value));
  const edge = (c) => c.rosterDuration + c.dispersion;
  const domain = Math.min(
    12,
    Math.max(8, Math.ceil(Math.max(...assets.map((a) => a.duration), edge(before), edge(after)))),
  );
  const padL = 8;
  const padR = 8;
  const x = (d) => r2(padL + (Math.max(0, Math.min(domain, safe(d))) / domain) * (W - padL - padR));
  const radius = (v) => r2(2 + 4 * Math.sqrt(Math.max(0, v) / maxValue));
  const ticks = [];
  for (let t = 0; t <= domain; t += 2) ticks.push(t);
  const strips = [
    { title: "today", c: before, dots: assets.filter((a) => a.role !== "arriving") },
    { title: "after", c: after, dots: assets },
  ];
  return (
    <div className="relative w-full" style={{ height: H }} role="img" aria-label={label}>
      <svg width="100%" height={H} className="absolute inset-0" aria-hidden="true">
        {strips.map((s, si) => {
          const base = si * rowH + 38;
          const lo = x(s.c.rosterDuration - s.c.dispersion);
          const hi = x(s.c.rosterDuration + s.c.dispersion);
          return (
            <g key={s.title}>
              <rect x={pct(lo, W)} y={base - 13} width={pct(Math.max(0.75, hi - lo), W)} height={26} rx={2} fill={ACCENT} fillOpacity={0.16} />
              {[lo, hi].map((edgeX, i) => (
                <line key={i} x1={pct(edgeX, W)} y1={base - 13} x2={pct(edgeX, W)} y2={base + 13} stroke={ACCENT} strokeOpacity={0.5} strokeWidth={1} />
              ))}
              <line x1={pct(padL, W)} y1={base} x2={pct(W - padR, W)} y2={base} stroke={GRID} strokeWidth={1} />
              <line
                x1={pct(x(s.c.rosterDuration), W)}
                y1={base - 16}
                x2={pct(x(s.c.rosterDuration), W)}
                y2={base + 16}
                stroke={CHART_FIELD}
                strokeWidth={1.5}
                strokeDasharray="3 2"
              />
              {s.dots.map((a, i) => {
                const departed = si === 1 && a.role === "leaving";
                const arriving = si === 1 && a.role === "arriving";
                return (
                  <circle
                    key={`${a.id}-${i}`}
                    cx={pct(x(a.duration), W)}
                    cy={base}
                    r={Math.max(3, radius(a.value))}
                    fill={departed ? "none" : ACCENT}
                    fillOpacity={arriving ? 1 : 0.5}
                    stroke={departed ? CHART_NEUTRAL : arriving ? "var(--color-bg)" : "none"}
                    strokeWidth={departed ? 1 : 0.75}
                    strokeDasharray={departed ? "2 1.5" : undefined}
                  />
                );
              })}
            </g>
          );
        })}
        {ticks.map((t) => (
          <line key={t} x1={pct(x(t), W)} y1={H - 17} x2={pct(x(t), W)} y2={H - 13} stroke={MUTED} strokeWidth={1} />
        ))}
      </svg>
      {strips.map((s, si) => (
        <span key={s.title} aria-hidden="true">
          <Label left="0%" top={si * rowH + 6} align="start" className="text-micro text-secondary">
            {s.title}
          </Label>
          <Label left="100%" top={si * rowH + 6} align="end" className="figure text-micro font-semibold text-ink">
            TCI {s.c.tci} · ±{s.c.dispersion.toFixed(2)}s
          </Label>
        </span>
      ))}
      {ticks.map((t) => (
        <Label key={t} left={pct(x(t), W)} top={H - 11} className="figure text-micro text-secondary">
          {t}
        </Label>
      ))}
    </div>
  );
}

/** A tiny fixed-size trend line (no labels, so a fixed viewBox is fine). */
export function Sparkline({ values, width = 64, height = 22, color, label = "trend" }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const x = (i) => r2(pad + (i * (width - pad * 2)) / (values.length - 1));
  const y = (v) => r2(pad + (1 - (v - min) / span) * (height - pad * 2));
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  const rising = values[values.length - 1] >= values[0];
  const stroke = color ?? (rising ? POS : NEG);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="shrink-0" role="img" aria-label={label}>
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2} fill={stroke} />
    </svg>
  );
}

/**
 * Positional strength as a radar shape (prefer BarList; DESIGN.md "Charts"). Drawn at
 * a fixed pixel size so nothing scales, with HTML labels. Needs at least 3 axes.
 */
export function PositionRadar({ data, height = 210, format = (n) => `${n}` }) {
  const W = 320;
  const H = Math.max(160, safe(height, 210));
  const cx = W / 2;
  const cy = H / 2;
  const radius = Math.max(10, Math.min(cx, cy) - 40);
  const n = data.length;
  if (n < 3) return null;
  const maxVal = Math.max(1, ...data.map((d) => d.value));
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pointAt = (i, r) => ({ x: r2(cx + r * Math.cos(angle(i))), y: r2(cy + r * Math.sin(angle(i))) });
  const ring = (f) =>
    Array.from({ length: n }, (_, i) => {
      const p = pointAt(i, f * radius);
      return `${p.x},${p.y}`;
    }).join(" ");
  const shape = data
    .map((d, i) => pointAt(i, (safe(d.value) / maxVal) * radius))
    .map((p) => `${p.x},${p.y}`)
    .join(" ");
  return (
    <div className="relative mx-auto" style={{ width: W, maxWidth: "100%", height: H }} role="img" aria-label="positional strength radar">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 max-w-full" aria-hidden="true">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon key={f} points={ring(f)} fill="none" stroke={GRID} strokeWidth={1} />
        ))}
        {data.map((_, i) => {
          const p = pointAt(i, radius);
          return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={GRID} strokeWidth={1} />;
        })}
        <polygon points={shape} fill={ACCENT} fillOpacity={0.22} stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" />
        {data.map((d, i) => {
          const vp = pointAt(i, (safe(d.value) / maxVal) * radius);
          return <circle key={d.label} cx={vp.x} cy={vp.y} r={3} fill={ACCENT} />;
        })}
      </svg>
      {data.map((d, i) => {
        const lp = pointAt(i, radius + 18);
        return (
          <span key={d.label} aria-hidden="true">
            <Label left={pct(lp.x, W)} top={Math.max(0, lp.y - 10)} className="text-micro font-semibold text-ink">
              {d.label}
            </Label>
            <Label left={pct(lp.x, W)} top={lp.y + 3} className="figure text-micro text-secondary">
              {format(d.value)}
            </Label>
          </span>
        );
      })}
    </div>
  );
}
