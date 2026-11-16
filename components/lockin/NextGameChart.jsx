import { CHART_ACCENT, CHART_FAINT, CHART_GRID, CHART_INK, CHART_MARK } from "@/lib/chart-colors";
import { fmt, pct } from "@/lib/lockin/view";

const pctX = (v, W) => `${(v / W) * 100}%`;
const pctY = (v, H) => `${(v / H) * 100}%`;

/** Next-game quantile dot plot. `g` is distChart() output. */
export function NextGameChart({ g }) {
  const lineLeft = g.xLine ? g.xLine.x / g.W > 0.6 : false;
  return (
    <figure className="m-0">
      <div className="relative" style={{ aspectRatio: `${g.W} / ${g.H}` }} role="img" aria-label={g.alt}>
        <svg viewBox={`0 0 ${g.W} ${g.H}`} className="absolute inset-0 block h-full w-full" aria-hidden="true">
          <line x1={g.plot.x0} x2={g.plot.x1} y1={g.plot.y1 + 1} y2={g.plot.y1 + 1} stroke={CHART_GRID} strokeWidth="0.8" />
          {g.dots.map((d, i) =>
            d.above ? (
              <circle key={i} cx={d.cx} cy={d.cy} r={Math.max(0, d.r - 0.5)} fill={CHART_ACCENT} />
            ) : (
              <circle key={i} cx={d.cx} cy={d.cy} r={Math.max(0, d.r - 1)} fill="none" stroke={CHART_MARK} strokeWidth="1.2" />
            ),
          )}
          {g.xLine && <line x1={g.xLine.x} x2={g.xLine.x} y1={g.plot.y0 - 6} y2={g.plot.y1 + 4} stroke={CHART_INK} strokeWidth="1.4" />}
        </svg>
        {g.ticks.map((t) => (
          <span key={t.value} className="figure absolute -translate-x-1/2 text-micro leading-none" style={{ left: pctX(t.x, g.W), top: pctY(g.plot.y1 + 12, g.H), color: CHART_FAINT }} aria-hidden="true">
            {t.value}
          </span>
        ))}
        {g.xLine && (
          <span
            className="figure absolute whitespace-nowrap text-micro font-semibold leading-none text-ink"
            style={{ left: pctX(g.xLine.x, g.W), top: pctY(g.plot.y0 - 12, g.H), transform: lineLeft ? "translateX(calc(-100% - 4px))" : "translateX(4px)" }}
            aria-hidden="true"
          >
            {fmt(g.xLine.value)} now{g.above != null ? ` · ${g.above} of ${g.n} above` : ""}
          </span>
        )}
      </div>
      <figcaption className="mt-1.5 text-meta leading-snug text-muted">
        {g.xLine ? (
          <>
            <span className="text-ink">Filled dots beat {fmt(g.xLine.value)}.</span> Chance a later game beats it, if he plays:{" "}
            <span className="figure font-semibold text-ink">{pct(g.pIfPlays)}</span> ({g.k} {g.k === 1 ? "game" : "games"} left).
          </>
        ) : (
          <>Each dot is one of {g.n} equally likely outcomes.</>
        )}
        {g.basis === "thin" ? " Spread borrowed from the league: under 10 games of his own." : ""}
      </figcaption>
    </figure>
  );
}
