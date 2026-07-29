/**
 * The Dynasty Duration x TCI quadrant - the conceptual core of the timeline metric
 * (lib/metrics/duration.ts) as one picture.
 *
 * x = roster duration (seasons until value arrives, value-weighted)
 * y = Timeline Coherence Index (do the assets agree about when?)
 *
 * Coherent-short is contending, coherent-long is rebuilding, coherent-middle is
 * ascending, and everything below the coherence floor is straddling - the only bad
 * region. Hand-rolled SVG per DECISIONS D3, legible at 390px.
 *
 * Server component. Every numeric SVG attribute is rounded (integers), because
 * unrounded floats serialize differently server vs client and have previously
 * killed hydration on this project.
 */

const GRID = "var(--color-border)";
const FAINT = "var(--color-faint)";
const ACCENT = "var(--color-accent)";
const NEG = "var(--color-negative)";
const MUTED = "var(--color-muted)";

export interface TimelinePoint {
  /** Small label rendered beside the dot (keys the dot to a list row). */
  n: number;
  duration: number;
  tci: number;
  isMe?: boolean;
}

export function TimelineQuadrant({
  points,
  coherenceFloor = 55,
}: {
  points: TimelinePoint[];
  coherenceFloor?: number;
}) {
  if (points.length === 0) return null;
  const W = 320;
  const H = 216;
  const padL = 30;
  const padR = 12;
  const padT = 14;
  const padB = 30;

  const ds = points.map((p) => p.duration);
  const ts = points.map((p) => p.tci);
  const xMin = Math.min(...ds) - 0.4;
  const xMax = Math.max(...ds) + 0.4;
  const yMin = Math.min(coherenceFloor - 15, Math.min(...ts) - 8);
  const yMax = 100;

  const x = (d: number) =>
    Math.round(padL + ((d - xMin) / (xMax - xMin || 1)) * (W - padL - padR));
  const y = (t: number) =>
    Math.round(padT + (1 - (t - yMin) / (yMax - yMin || 1)) * (H - padT - padB));

  // League-median duration divides "shorter-dated than the league" from longer.
  const sorted = [...ds].sort((a, b) => a - b);
  const median =
    sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const floorY = y(coherenceFloor);
  const medianX = x(median);

  // Integer-duration x ticks inside the visible range.
  const xTicks: number[] = [];
  for (let d = Math.ceil(xMin); d <= Math.floor(xMax); d++) xTicks.push(d);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Timeline quadrant: roster duration in seasons against timeline coherence index. Teams below TCI ${coherenceFloor} are straddling.`}
    >
      {/* Straddling band - the only bad region gets the only tint. */}
      <rect
        x={padL}
        y={floorY}
        width={W - padL - padR}
        height={H - padB - floorY}
        fill={NEG}
        opacity={0.06}
      />
      {/* Frame */}
      <rect
        x={padL}
        y={padT}
        width={W - padL - padR}
        height={H - padT - padB}
        fill="none"
        stroke={GRID}
        strokeWidth={1}
      />
      {/* Coherence floor */}
      <line
        x1={padL}
        y1={floorY}
        x2={W - padR}
        y2={floorY}
        stroke={NEG}
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.7}
      />
      {/* League-median duration */}
      <line
        x1={medianX}
        y1={padT}
        x2={medianX}
        y2={floorY}
        stroke={GRID}
        strokeWidth={1}
        strokeDasharray="2 3"
      />
      {/* Region captions */}
      <text x={padL + 5} y={padT + 11} fontSize="8" fill={FAINT} className="font-mono">
        CONTEND
      </text>
      <text
        x={W - padR - 5}
        y={padT + 11}
        fontSize="8"
        fill={FAINT}
        textAnchor="end"
        className="font-mono"
      >
        REBUILD
      </text>
      <text
        x={padL + 5}
        y={H - padB - 6}
        fontSize="8"
        fill={NEG}
        opacity={0.85}
        className="font-mono"
      >
        STRADDLE
      </text>
      {/* Axis ticks */}
      {xTicks.map((d) => (
        <g key={d}>
          <line
            x1={x(d)}
            y1={H - padB}
            x2={x(d)}
            y2={H - padB + 4}
            stroke={FAINT}
            strokeWidth={1}
          />
          <text
            x={x(d)}
            y={H - padB + 14}
            textAnchor="middle"
            fontSize="9"
            fill={FAINT}
            className="font-mono"
          >
            {d}
          </text>
        </g>
      ))}
      <text
        x={Math.round((padL + W - padR) / 2)}
        y={H - 4}
        textAnchor="middle"
        fontSize="8.5"
        fill={FAINT}
      >
        roster duration (seasons until value arrives)
      </text>
      {[coherenceFloor, 75, 100].map((t) => (
        <text
          key={t}
          x={padL - 4}
          y={y(t) + 3}
          textAnchor="end"
          fontSize="9"
          fill={t === coherenceFloor ? NEG : FAINT}
          className="font-mono"
        >
          {t}
        </text>
      ))}
      <text
        x={9}
        y={Math.round((padT + H - padB) / 2)}
        fontSize="8.5"
        fill={FAINT}
        textAnchor="middle"
        transform={`rotate(-90 9 ${Math.round((padT + H - padB) / 2)})`}
      >
        TCI
      </text>
      {/* Dots, numbered to match the list below the chart. */}
      {points.map((p) => {
        const cx = x(p.duration);
        const cy = y(p.tci);
        const labelLeft = cx > W - padR - 22;
        return (
          <g key={p.n}>
            <circle
              cx={cx}
              cy={cy}
              r={p.isMe ? 5 : 4}
              fill={p.isMe ? ACCENT : "var(--color-elevated)"}
              stroke={p.isMe ? ACCENT : MUTED}
              strokeWidth={1}
            />
            <text
              x={labelLeft ? cx - 8 : cx + 8}
              y={cy + 3}
              textAnchor={labelLeft ? "end" : "start"}
              fontSize="8.5"
              fill={p.isMe ? ACCENT : MUTED}
              className="font-mono"
            >
              {p.n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
