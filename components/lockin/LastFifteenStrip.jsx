"use client";
import { useState } from "react";
import { CHART_ACCENT, CHART_FAINT, CHART_GRID, CHART_INK, CHART_MARK, CHART_NEUTRAL } from "@/lib/chart-colors";
import { AnnotationKey, AnnotationMark } from "./StateIcon";

const pctX = (v, W) => `${(v / W) * 100}%`;
const pctY = (v, H) => `${(v / H) * 100}%`;

function defaultIndex(g) {
  for (let i = g.dots.length - 1; i >= 0; i--) if (g.dots[i].annotations.length) return i;
  return g.now ? g.now.i : g.dots.length - 1;
}

/** Last-15 strip. `g` is stripChart() output; tap or focus a column for that game. */
export function LastFifteenStrip({ g, name }) {
  const [sel, setSel] = useState(() => defaultIndex(g));
  const d = g.dots[sel] ?? g.dots[g.dots.length - 1];
  const nowAbove = g.now && g.now.cy - 16 > g.plot.lane;
  return (
    <figure className="m-0">
      <p className="sr-only">{g.alt}</p>
      <div className="relative" style={{ aspectRatio: `${g.W} / ${g.H}` }}>
        <svg viewBox={`0 0 ${g.W} ${g.H}`} className="absolute inset-0 block h-full w-full" aria-hidden="true">
          {g.ticks.map((t) => (
            <line key={t.value} x1={g.plot.x0} x2={g.plot.x1} y1={t.y} y2={t.y} stroke={CHART_GRID} strokeWidth="0.6" />
          ))}
          {g.band && <rect x={g.plot.x0} y={g.band.y} width={Math.max(0, g.plot.x1 - g.plot.x0)} height={g.band.h} fill={CHART_NEUTRAL} opacity="0.32" />}
          {g.rule && <line x1={g.plot.x0} x2={g.plot.x1} y1={g.rule.y} y2={g.rule.y} stroke={CHART_INK} strokeWidth="1.2" strokeDasharray="4 3" />}
          {d && <rect x={d.hitX} y={g.plot.lane} width={d.hitW} height={Math.max(0, g.H - g.plot.lane)} fill={CHART_NEUTRAL} opacity="0.18" />}
          <g color={CHART_INK}>
            {g.markers.map((m) => (
              <AnnotationMark key={`${m.i}-${m.code}`} code={m.code} cx={m.cx} cy={m.cy} />
            ))}
          </g>
          {g.dots.map((p) =>
            p.now ? null : <circle key={p.i} cx={p.cx} cy={p.cy} r={p.i === sel ? 4.2 : 3.4} fill={CHART_MARK} stroke={p.i === sel ? CHART_INK : "none"} strokeWidth="1.2" />,
          )}
          {g.now && (
            <>
              <circle cx={g.now.cx} cy={g.now.cy} r="6.5" fill="none" stroke={CHART_ACCENT} strokeWidth="1.6" />
              <circle cx={g.now.cx} cy={g.now.cy} r="4" fill={CHART_ACCENT} />
            </>
          )}
        </svg>
        {g.ticks.map((t) => (
          <span key={t.value} className="figure pointer-events-none absolute left-0 -translate-y-1/2 text-micro leading-none" style={{ top: pctY(t.y, g.H), color: CHART_FAINT }} aria-hidden="true">
            {t.value}
          </span>
        ))}
        {g.labels.map((l) => (
          <span key={l.key} className="figure pointer-events-none absolute -translate-y-1/2 whitespace-nowrap text-micro leading-none text-ink" style={{ top: pctY(l.y, g.H), left: pctX(g.plot.x1 + 10, g.W) }} aria-hidden="true">
            {l.text}
          </span>
        ))}
        {g.now && (
          <span
            className="figure pointer-events-none absolute whitespace-nowrap text-micro font-semibold leading-none text-ink"
            style={{ top: pctY(nowAbove ? g.now.cy - 10 : g.now.cy + 10, g.H), left: pctX(g.now.cx, g.W), transform: "translate(-100%, -50%)" }}
            aria-hidden="true"
          >
            {g.now.text}
          </span>
        )}
        {g.dots.map((p) => (
          <button
            key={p.i}
            type="button"
            aria-pressed={p.i === sel}
            aria-label={p.text + (p.annotations.length ? `. ${p.annotations.map((a) => a.text).join(". ")}` : "")}
            onClick={() => setSel(p.i)}
            onFocus={() => setSel(p.i)}
            className="absolute top-0 h-full rounded-sm focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
            style={{ left: pctX(p.hitX, g.W), width: pctX(p.hitW, g.W) }}
          />
        ))}
      </div>
      <p aria-live="polite" className="mt-1.5 min-h-8 text-meta leading-snug text-ink">
        <span className="figure">{d?.text}</span>
        {d?.annotations.map((a) => (
          <span key={a.code + a.text} className="text-muted"> · {a.text}</span>
        ))}
      </p>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-micro text-muted" aria-label="Key">
        {g.now && (
          <li className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <circle cx="6" cy="6" r="4.8" fill="none" stroke={CHART_ACCENT} strokeWidth="1.3" />
              <circle cx="6" cy="6" r="2.8" fill={CHART_ACCENT} />
            </svg>
            score on the table
          </li>
        )}
        {g.rule && (
          <li className="flex items-center gap-1">
            <svg width="14" height="6" viewBox="0 0 14 6" aria-hidden="true">
              <line x1="0" x2="14" y1="3" y2="3" stroke={CHART_INK} strokeWidth="1.2" strokeDasharray="4 3" />
            </svg>
            expected if held
          </li>
        )}
        {g.band && (
          <li className="flex items-center gap-1">
            <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true">
              <rect width="12" height="10" fill={CHART_NEUTRAL} opacity="0.5" />
            </svg>
            next game, 8 in 10
          </li>
        )}
        {g.legend.map((l) => (
          <li key={l.code} className="flex items-center gap-1 text-ink">
            <AnnotationKey code={l.code} />
            {l.label}
          </li>
        ))}
      </ul>
      <figcaption className="sr-only">Last {g.dots.length} played games for {name}</figcaption>
    </figure>
  );
}
