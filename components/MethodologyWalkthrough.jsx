"use client";
import { useEffect, useRef, useState } from "react";
import { CHART_ACCENT, CHART_GRID, CHART_MARK } from "@/lib/chart-colors";
import { cn } from "@/lib/ui";
/**
 * THE VALUE MODEL, DRAWN ONCE - a pinned pipeline chart over a stepped walkthrough
 * (VISION.md M9, the Pudding grammar: the number in the prose is the mark in the
 * chart).
 *
 * The chart stays `position: sticky` at the top of the viewport while the reader
 * scrolls the steps below it; an IntersectionObserver over the step sections moves
 * `active`, and the chart component whose step is active takes the accent while the
 * rest hold the neutral mark ink. That is the whole mechanism: no scroll listener, no
 * animation library, no canvas - the same observer idiom the tier sheen already uses
 * (ValuesList.jsx), driving a class swap instead of an animation.
 *
 * WHAT THE HIGHLIGHT IS, in the house's own terms: lib/chart-colors rule that
 * CHART_ACCENT is "the subject - one per chart at most". A pipeline has six parts and
 * only one can be the subject at a time; the scroll position says which. The swap is a
 * STATE CHANGE, not a choreography, so it does not join D105's closed motion register:
 * the only transition on it is a short colour fade (`transition-colors`), disabled
 * under `prefers-reduced-motion` via Tailwind's motion-reduce variant. Nothing
 * translates, nothing scales, nothing replays.
 *
 * EVERY NUMBER ON THE PANEL IS PRINTED IN HTML TEXT beside its mark (rule 1: colour -
 * and here, geometry - is never the only encoding), which is also why every SVG in the
 * panel is aria-hidden: the row label + printed figure ARE the accessible reading, in
 * document order, and a screen reader gets the pipeline as six short lines rather than
 * six chart descriptions. Labels live in HTML outside the scaling viewBoxes (D96 -
 * a user unit is only a pixel at scale 1, and these render at ~0.7).
 *
 * NO VERDICT ANYWHERE (D6): the panel prints ranks, multipliers and a value - the
 * model's published intermediate outputs for one real player - and the final step's
 * prose says out loud that a value is not a grade. Nothing here is computed that
 * `cachedValuePlayers` did not already publish (D19); this component only draws the
 * props the server computed from the live corpus.
 */
/** Full-width rows (the decay curve). */
const W = 320;
/** Gutter rows (the grid's middle column is ~220px at the 390px design width, so
 *  strokes and dots render near their stated size instead of at 0.7 scale). */
const RW = 220;
const r1 = (v) => Math.round(v * 10) / 10;
/** The pipeline's parts, in causal order. Ids double as step keys. */
export const WALKTHROUGH_STEPS = [
  "rank",
  "production",
  "age",
  "injury",
  "rolepos",
  "value",
];
const swap = "transition-colors duration-200 motion-reduce:transition-none";
function RowLabel({ live, children }) {
  return (
    <span
      className={cn(
        "text-micro font-semibold uppercase tracking-[0.12em]",
        swap,
        live ? "text-accent-text" : "text-faint",
      )}
    >
      {children}
    </span>
  );
}
/** One multiplier: its distance from x1.00, on the shared axis. */
function MultRow({ label, live, m, x }) {
  const ink = live ? CHART_ACCENT : CHART_MARK;
  return (
    <>
      <RowLabel live={live}>{label}</RowLabel>
      <svg viewBox={`0 0 ${RW} 14`} className="block h-3.5 w-full" aria-hidden="true">
        {/* The x1.00 rule: the "this term did nothing" line every row shares. */}
        <line x1={x(1)} y1={1} x2={x(1)} y2={13} stroke={CHART_GRID} strokeWidth={1} />
        {m !== 1 && (
          <line
            x1={x(1)}
            y1={7}
            x2={x(m)}
            y2={7}
            className={swap}
            stroke={ink}
            strokeWidth={2.5}
          />
        )}
        <circle cx={x(m)} cy={7} r={3.4} className={swap} fill={ink} />
      </svg>
      <span
        className={cn(
          "figure text-right text-meta",
          swap,
          live ? "font-semibold text-accent-text" : "text-secondary",
        )}
      >
        ×{m.toFixed(2)}
      </span>
    </>
  );
}
/**
 * The pinned panel. Pure render of (model, active) - all data arrives computed.
 * @param {{ model: WalkthroughModel, active: string }} props
 */
function ValueModelChart({ model, active }) {
  const ex = model.example;
  const maxRank = model.curve[model.curve.length - 1].rank;
  // Decay curve geometry (full width).
  const CH = 52;
  const cx = (rank) => r1(2 + ((rank - 1) / (maxRank - 1)) * (W - 4));
  const cy = (base) => r1(4 + (1 - base / model.maxBase) * (CH - 10));
  const curvePath = model.curve
    .map((s, i) => `${i === 0 ? "M" : "L"}${cx(s.rank)},${cy(s.base)}`)
    .join(" ");
  // Shared multiplier axis. 1.0 always drawn; bounds stretch only if a real term
  // escapes the default window.
  const mults = [
    ex.ageMultiplier,
    ex.injuryMultiplier,
    ex.roleMultiplier,
    ex.positionMultiplier,
  ];
  const lo = Math.min(0.5, ...mults) - 0.02;
  const hi = Math.max(1.15, ...mults) + 0.02;
  const mx = (v) => r1(4 + ((v - lo) / (hi - lo)) * (RW - 8));
  // The blend bar: the two shares of the rank prior, as two lengths.
  const pw = model.productionWeight;
  const split = r1((1 - pw) * (RW - 4));
  // The value bar: the example's price against the top price on today's board.
  const vw = r1((ex.value / model.ceiling) * (RW - 4));
  const liveCurve = active === "rank";
  const liveBlend = active === "production";
  const liveValue = active === "value";
  const curveInk = liveCurve ? CHART_ACCENT : CHART_MARK;
  return (
    <div className="card-lit rounded-[--radius] border border-border bg-surface px-3 pb-2.5 pt-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-micro font-semibold uppercase tracking-[0.16em] text-muted">
          The value model, drawn once
        </p>
        <p className="min-w-0 line-clamp-1 text-meta text-secondary">
          <span className="font-semibold text-ink">{ex.name}</span>
          {ex.position ? ` · ${ex.position}` : ""}
          {ex.age != null ? ` · ${ex.age}y` : ""}
        </p>
      </div>
      {/* base(rank): the decay curve, with the example's dot(s) on it. A hollow dot
          marks the consensus rank when production moved it - the horizontal gap
          between hollow and filled IS the production term. */}
      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <RowLabel live={liveCurve}>base(rank)</RowLabel>
        <span
          className={cn(
            "figure text-meta",
            swap,
            liveCurve ? "font-semibold text-accent-text" : "text-secondary",
          )}
        >
          #{ex.searchRank}
          {ex.rank !== ex.searchRank ? ` → #${ex.rank}` : ""} · base{" "}
          {ex.base.toLocaleString()}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${CH}`} className="block w-full" aria-hidden="true">
        <line
          x1={2}
          y1={CH - 2}
          x2={W - 2}
          y2={CH - 2}
          stroke={CHART_GRID}
          strokeWidth={1}
        />
        <path
          d={curvePath}
          fill="none"
          className={swap}
          stroke={curveInk}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {ex.rank !== ex.searchRank && (
          <circle
            cx={cx(ex.searchRank)}
            cy={cy(ex.consensusBase)}
            r={3.2}
            fill="var(--color-surface)"
            className={swap}
            stroke={curveInk}
            strokeWidth={1.5}
          />
        )}
        <circle
          cx={cx(ex.rank)}
          cy={cy(ex.base)}
          r={3.6}
          className={swap}
          fill={curveInk}
        />
      </svg>
      <div className="grid grid-cols-[52px_minmax(0,1fr)_64px] items-center gap-x-2 gap-y-1">
        {/* The rank prior's mix: two lengths, weights straight off the config. */}
        <RowLabel live={liveBlend}>rank mix</RowLabel>
        <svg viewBox={`0 0 ${RW} 14`} className="block h-3.5 w-full" aria-hidden="true">
          <rect
            x={2}
            y={3}
            width={split}
            height={8}
            rx={2}
            fill={CHART_GRID}
          />
          <rect
            x={r1(2 + split + 1.5)}
            y={3}
            width={r1((RW - 4) - split - 1.5)}
            height={8}
            rx={2}
            className={swap}
            fill={liveBlend ? CHART_ACCENT : CHART_MARK}
          />
        </svg>
        <span
          className={cn(
            "figure text-right text-meta",
            swap,
            liveBlend ? "font-semibold text-accent-text" : "text-secondary",
          )}
        >
          {Math.round(pw * 100)}% prod.
        </span>
        <MultRow label="age" live={active === "age"} m={ex.ageMultiplier} x={mx} />
        <MultRow
          label="injury"
          live={active === "injury"}
          m={ex.injuryMultiplier}
          x={mx}
        />
        <MultRow
          label="role"
          live={active === "rolepos"}
          m={ex.roleMultiplier}
          x={mx}
        />
        <MultRow
          label="position"
          live={active === "rolepos"}
          m={ex.positionMultiplier}
          x={mx}
        />
        {/* What comes out: a length against the top price on today's board. */}
        <RowLabel live={liveValue}>value</RowLabel>
        <svg viewBox={`0 0 ${RW} 14`} className="block h-3.5 w-full" aria-hidden="true">
          <rect
            x={2}
            y={3}
            width={RW - 4}
            height={8}
            rx={2}
            fill={CHART_GRID}
            opacity={0.5}
          />
          <rect
            x={2}
            y={3}
            width={Math.max(2, vw)}
            height={8}
            rx={2}
            className={swap}
            fill={liveValue ? CHART_ACCENT : CHART_MARK}
          />
        </svg>
        <span
          className={cn(
            "figure text-right text-lede leading-none",
            swap,
            liveValue ? "font-semibold text-accent-text" : "font-semibold text-ink",
          )}
        >
          {ex.value.toLocaleString()}
        </span>
      </div>
      <p className="mt-1.5 text-micro leading-snug text-faint">
        Each term drawn as its distance from ×1.00; the value bar runs to{" "}
        <span className="figure text-secondary">
          {model.ceiling.toLocaleString()}
        </span>
        , the top price on today&apos;s board. Every figure is the model&apos;s own
        output for this player.
      </p>
    </div>
  );
}
/**
 * @typedef {Object} WalkthroughModel
 * @property {{ name: string, position: string|null, age: number|null,
 *   searchRank: number, rank: number, consensusBase: number, base: number,
 *   ageMultiplier: number, injuryMultiplier: number, roleMultiplier: number,
 *   positionMultiplier: number, value: number }} example
 * @property {{ rank: number, base: number }[]} curve
 * @property {number} maxBase
 * @property {number} productionWeight
 * @property {number} ceiling
 */
/**
 * @param {{ model: WalkthroughModel,
 *   steps: { id: string, kicker: string, title: string, body: import('react').ReactNode }[]
 * }} props
 */
export function MethodologyWalkthrough({ model, steps }) {
  const [active, setActive] = useState(steps[0]?.id ?? "rank");
  const rootRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const sections = [...root.querySelectorAll("[data-step]")];
    if (sections.length === 0) return;
    /** Which steps currently cross the reading band. @type {Map<string, boolean>} */
    const inBand = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          inBand.set(e.target.getAttribute("data-step"), e.isIntersecting);
        }
        // The LAST band-crossing step in document order is the one being read -
        // when two straddle the band the reader has moved on to the later one.
        // Nothing in the band (a gap mid-fling) keeps the previous highlight
        // rather than flickering back to step one.
        let next = null;
        for (const s of sections) {
          const id = s.getAttribute("data-step");
          if (inBand.get(id)) next = id;
        }
        if (next) setActive(next);
      },
      // The reading band: a stripe just under the pinned panel. Percentages of the
      // viewport so it holds from a 660px phone to a desktop window.
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const s of sections) io.observe(s);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={rootRef}>
      {/* z-20: above the page's cards, below the Desk (z-40/50). Solid card surface,
          so scrolled prose never ghosts through. Sticky is scoped to this component's
          root, so the panel un-pins itself once the last step scrolls past - the
          appendix below is read without it. */}
      <div
        className="sticky z-20"
        style={{ top: "max(8px, env(safe-area-inset-top))" }}
      >
        <ValueModelChart model={model} active={active} />
      </div>
      <div className="mt-4 space-y-6">
        {steps.map((step, i) => (
          <section key={step.id} data-step={step.id}>
            <p className="text-meta font-semibold uppercase tracking-[0.18em] text-accent-text">
              Step {i + 1} · {step.kicker}
            </p>
            <h2 className="mt-0.5 font-display text-lede font-semibold leading-tight text-ink">
              {step.title}
            </h2>
            <div className="mt-1.5 space-y-2">{step.body}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
