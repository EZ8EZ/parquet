import { CHART_FAINT, CHART_GRID, CHART_INK, CHART_MARK } from "@/lib/chart-colors";
import { fmt } from "@/lib/lockin/view";
import { AnnotationKey, AnnotationMark } from "./StateIcon";

const pctX = (v, W) => `${(v / W) * 100}%`;
const pctY = (v, H) => `${(v / H) * 100}%`;

/** Minutes per played game as stems from his last-10 average. `g` is minutesChart() output. */
export function MinutesChart({ g }) {
  const jumps = g.points.some((p) => p.jump);
  return (
    <figure className="m-0">
      <div className="relative" style={{ aspectRatio: `${g.W} / ${g.H}` }} role="img" aria-label={g.alt}>
        <svg viewBox={`0 0 ${g.W} ${g.H}`} className="absolute inset-0 block h-full w-full" aria-hidden="true">
          {g.ticks.map((t) => (
            <line key={t.value} x1={g.plot.x0} x2={g.plot.x1} y1={t.y} y2={t.y} stroke={CHART_GRID} strokeWidth="0.6" />
          ))}
          <line x1={g.plot.x0} x2={g.plot.x1} y1={g.avg.y} y2={g.avg.y} stroke={CHART_INK} strokeWidth="1.2" strokeDasharray="4 3" />
          {g.points.map((p, i) => (
            <line key={`s${i}`} x1={p.cx} x2={p.cx} y1={g.avg.y} y2={p.cy} stroke={CHART_MARK} strokeWidth="1.2" />
          ))}
          <g color={CHART_INK}>
            {g.points.map((p, i) => (p.jump ? <AnnotationMark key={i} code="minutes_jump" cx={p.cx} cy={p.cy} size={3.6} /> : <circle key={i} cx={p.cx} cy={p.cy} r="3" fill={CHART_MARK} />))}
          </g>
        </svg>
        {g.ticks.map((t) => (
          <span key={t.value} className="figure absolute left-0 -translate-y-1/2 text-micro leading-none" style={{ top: pctY(t.y, g.H), color: CHART_FAINT }} aria-hidden="true">
            {t.value}
          </span>
        ))}
        <span className="figure absolute -translate-y-1/2 whitespace-nowrap text-micro leading-none text-ink" style={{ top: pctY(g.avg.y, g.H), left: pctX(g.plot.x1 + 5, g.W) }} aria-hidden="true">
          {fmt(g.avg.value)} avg
        </span>
      </div>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-muted">
        <span className="flex items-center gap-1">
          <svg width="14" height="6" viewBox="0 0 14 6" aria-hidden="true">
            <line x1="0" x2="14" y1="3" y2="3" stroke={CHART_INK} strokeWidth="1.2" strokeDasharray="4 3" />
          </svg>
          average of his last {g.avg.n}
        </span>
        {jumps && (
          <span className="flex items-center gap-1 text-ink">
            <AnnotationKey code="minutes_jump" /> 5+ over his previous-10 average
          </span>
        )}
      </figcaption>
    </figure>
  );
}
