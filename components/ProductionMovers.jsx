import { CHART_ACCENT, CHART_GRID, CHART_MARK } from "@/lib/chart-colors";
/**
 * WHAT A 23% WEIGHT ACTUALLY MOVED - the ten largest moves in one list, over a strip
 * showing what it did to everybody else.
 *
 * ---------------------------------------------------------------------------------
 * ONE LIST, NOT TWO COLUMNS
 * ---------------------------------------------------------------------------------
 * This replaced two side-by-side lists, "production says higher" and "production says
 * lower", five names each. Two columns of five look balanced and the data is not: the
 * largest drop in this league is about twice the largest gain. Side-by-side, each column
 * was implicitly scaled to its own worst case, so the two five-row lists appeared to
 * describe two effects of similar size. They do not.
 *
 * One list, sorted by absolute move across both directions, on ONE axis, states the
 * asymmetry as the first thing a reader sees - the drops simply are longer. That is a
 * fact about the measurement (production penalises absence, and absence is what a lost
 * season looks like) and hiding it inside a layout was the error.
 *
 * ---------------------------------------------------------------------------------
 * THE AXIS IS THE REAL VALUE CEILING, NOT THE LIST'S OWN MAX
 * ---------------------------------------------------------------------------------
 * `ceiling` is the top value this league actually prices, passed in from the same map
 * /values ranks. Scaling to the ten drawn rows instead would make the largest of them
 * touch the end of the axis and read as "the maximum this can move", which is not a
 * thing this chart measured. On the real ceiling a 1,917-point drop is a visibly large
 * move on a scale that goes much further, which is what it is.
 *
 * ---------------------------------------------------------------------------------
 * THE POPULATION STRIP, AND WHY IT IS ON THE SAME SCALE
 * ---------------------------------------------------------------------------------
 * Every rostered player's move, drawn as a segment from his counterfactual value to his
 * priced one, on the IDENTICAL axis the ten rows use. The result is deliberately
 * anticlimactic: almost every segment is too short to resolve, because the median move
 * is a small number of points on a scale that runs to the ceiling.
 *
 * That is the honest frame for the ten below it. Without it, a list of the ten largest
 * moves reads as "what production did to this league"; with it, the ten are visibly the
 * tail of a distribution that is mostly nothing. Same axis, so the comparison needs no
 * caption to be trusted - though it gets one anyway, with the real quantiles.
 *
 * ---------------------------------------------------------------------------------
 * THE INJURY OVERLAP TRAVELS WITH THE GRAPHIC (D19)
 * ---------------------------------------------------------------------------------
 * A player hurt for eleven weeks banked eleven zeros, so production charges him for an
 * absence the injury multiplier is also pricing. On this league the overlap is heavy and
 * concentrated exactly where this chart looks: most of the largest drops carry a current
 * injury flag, far more than chance.
 *
 * So the flag is marked ON THE ROW and the counts are captioned ABOVE THE LIST, not
 * filed as a caveat in a different section. A reader who sees these ten names and does
 * not learn that most of the drops are injuries has been shown a real number and led to
 * the wrong conclusion about what it measures.
 *
 * THE MARK IS THE BODY PART, IN WORDS, and deliberately not the app's injury chip. The
 * chip is `bg-negative-wash text-negative`, which inside a chart would make injury the
 * only colour-encoded quantity on the page and imply the flag is the bad end of a scale
 * this chart does not have. `app/depth/[team]/page.jsx` already states injury as a plain
 * `·`-joined fact in a secondary meta line; that is the convention borrowed here.
 * Nothing on this chart is colour-coded by valence.
 *
 * ---------------------------------------------------------------------------------
 * LABELS ARE HTML (D96)
 * ---------------------------------------------------------------------------------
 * Player names do not fit a fixed gutter at this width, so each row is a name line with
 * its own full-width strip underneath rather than a gutter-plus-plot grid. Every strip
 * shares one viewBox and one scale function, and the axis is printed once at the bottom.
 * No `<text>` anywhere inside a scaling viewBox.
 */
const W = 320;
const INSET = 2;
/** One dumbbell's own strip. */
const ROW_H = 11;
/**
 * The population strip, tall enough to jitter ~250 segments apart.
 *
 * FIRST DRAWN AT 18 WITH EVERY SEGMENT ON ONE LINE, and it was wrong in a way only a
 * screenshot showed: 250 short segments at the same y merge into one continuous bar,
 * and a continuous bar on a value axis reads as ONE ENORMOUS MOVE - the exact opposite
 * of the point. Spreading them over a few rows makes the same marks read as a population
 * again, with the isolated long ones visibly separate out at the right.
 *
 * VERTICAL POSITION CARRIES NO DATA. It is anti-overplotting and nothing else, which is
 * why the band comes from a hash of the player id rather than from anything about him:
 * an index-derived offset over a value-sorted list would draw a diagonal, and a diagonal
 * is both a false pattern and a reserved mark (D96).
 */
const POP_H = 27;
const POP_BANDS = 5;
/**
 * A stable band for one player. Deterministic across server and client - `Math.random`
 * here would be a hydration mismatch and an unreproducible chart.
 * @param {string} id
 */
function bandOf(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash) % POP_BANDS;
}
const r1 = (v) => Math.round(v * 10) / 10;
const plotW = W - INSET * 2;
const TICKS = [0, 2000, 4000, 6000, 8000];
const fmt = (n) => Math.round(n).toLocaleString();
/**
 * @typedef {Object} Move
 * @property {string} id
 * @property {string} name
 * @property {number} now the value this app publishes
 * @property {number} was the same model with the production weight at zero
 * @property {number} move now - was
 * @property {string|null} injury body part, or null when there is no current flag
 */
/**
 * @param {{ moves: Move[], population: Move[], ceiling: number, flaggedTotal: number,
 *   pricedTotal: number }} props
 */
export function ProductionMovers({
  moves,
  population,
  ceiling,
  flaggedTotal,
  pricedTotal,
}) {
  if (ceiling <= 0) return null;
  // NOTHING MOVED. Reachable whenever the production table does not cover the corpus
  // being priced (the fixture provider; any pool under `MIN_BLEND_POOL`), and it gets a
  // sentence rather than an empty card or ten zero-length marks - "no player moved" is
  // a real reading of the model and the honest thing to print.
  if (moves.length === 0)
    return (
      <p className="text-meta leading-relaxed text-secondary">
        No player&apos;s price moved: nobody being priced here has a production record in
        this league, so every rank is the consensus ordinal and the blend has nothing to
        reorder.
      </p>
    );
  const xOf = (v) => r1(INSET + (Math.min(v, ceiling) / ceiling) * plotW);
  // EVERY FIGURE IN THE CAPTIONS IS DERIVED FROM THE ARRAY THIS CHART DRAWS. A caption
  // holding a hand-copied quantile is a caption that can disagree with its own marks.
  const movedAtAll = population.filter((m) => m.move !== 0);
  const abs = movedAtAll.map((m) => Math.abs(m.move)).sort((a, b) => a - b);
  const at = (p) => (abs.length ? abs[Math.floor(abs.length * p)] : 0);
  const median = at(0.5);
  const p90 = at(0.9);
  const biggest = abs.length ? abs[abs.length - 1] : 0;
  const rose = movedAtAll.filter((m) => m.move > 0).length;
  const fell = movedAtAll.filter((m) => m.move < 0).length;
  const flagged = population.filter((m) => m.injury);
  const unflagged = population.filter((m) => !m.injury);
  const meanOf = (a) =>
    a.length ? a.reduce((s, m) => s + m.move, 0) / a.length : 0;
  const drops = [...population]
    .filter((m) => m.move < 0)
    .sort((a, b) => a.move - b.move)
    .slice(0, 20);
  const dropsFlagged = drops.filter((m) => m.injury).length;
  const expected = pricedTotal
    ? (flaggedTotal / pricedTotal) * drops.length
    : 0;
  const flaggedInTen = moves.filter((m) => m.injury).length;
  return (
    <div>
      {/* THE POPULATION, FIRST, so the ten below are read as a tail rather than as the
          effect. */}
      <p className="text-meta leading-snug text-secondary">
        Every rostered player&apos;s move, on the axis the ten below share
      </p>
      <svg
        viewBox={`0 0 ${W} ${POP_H}`}
        className="mt-1 block w-full"
        role="img"
        aria-label={
          `${movedAtAll.length} of ${population.length} rostered players moved at all: ` +
          `${rose} up, ${fell} down. The median move is ${fmt(median)} points on a scale ` +
          `that runs to ${fmt(ceiling)}, the 90th percentile is ${fmt(p90)}, and the ` +
          `largest is ${fmt(biggest)}. Most moves are too small to draw at this scale.`
        }
      >
        <line
          x1={INSET}
          y1={POP_H - 1.5}
          x2={W - INSET}
          y2={POP_H - 1.5}
          stroke={CHART_GRID}
          strokeWidth={1}
        />
        {/* One segment per player, was -> now, jittered onto a few rows so the strip
            reads as a population rather than as one long bar. Neutral: at these lengths
            a diverging fill would be the ONLY readable encoding of direction, which
            rule 1 of lib/chart-colors forbids. The split is in the caption instead. */}
        {population.map((m) => {
          const y = r1(3 + bandOf(m.id) * 3.4);
          return (
            <line
              key={m.id}
              x1={xOf(Math.min(m.was, m.now))}
              y1={y}
              x2={xOf(Math.max(m.was, m.now))}
              y2={y}
              stroke={CHART_MARK}
              strokeWidth={1.8}
              strokeLinecap="round"
              opacity={0.55}
            />
          );
        })}
      </svg>
      <p className="mt-1 text-micro leading-snug text-faint">
        <span className="figure text-secondary">
          {movedAtAll.length} of {population.length}
        </span>{" "}
        moved at all - <span className="figure">{rose}</span> up,{" "}
        <span className="figure">{fell}</span> down, one mark each and stacked only to
        keep them apart. The typical move is too small to draw here: median{" "}
        <span className="figure text-secondary">{fmt(median)}</span>, p90{" "}
        <span className="figure text-secondary">{fmt(p90)}</span>, largest{" "}
        <span className="figure text-secondary">{fmt(biggest)}</span>, against a value
        ceiling of <span className="figure text-secondary">{fmt(ceiling)}</span>. The ten
        named below are the tail of this, not a summary of it.
      </p>

      {/* THE INJURY OVERLAP, ABOVE THE LIST IT QUALIFIES. */}
      <p className="mt-3 text-meta leading-relaxed text-secondary">
        <span className="text-ink">
          Most of the largest drops are injuries, and that is a limit of the measurement
          rather than a finding.
        </span>{" "}
        Of the {drops.length} largest drops,{" "}
        <span className="figure text-ink">{dropsFlagged}</span> carry a current injury
        flag against <span className="figure">{expected.toFixed(1)}</span> expected by
        chance ({flaggedTotal} of {pricedTotal} rostered players are flagged). Mean move:{" "}
        <span className="figure text-ink">{fmt(meanOf(flagged))}</span> for a flagged
        player against{" "}
        <span className="figure text-ink">
          {meanOf(unflagged) > 0 ? "+" : ""}
          {fmt(meanOf(unflagged))}
        </span>{" "}
        for an unflagged one. A player hurt for eleven weeks banked eleven zeros, so
        production charges him for an absence the injury multiplier is also pricing.{" "}
        {flaggedInTen} of these {moves.length} rows carry a flag.
      </p>

      <ol className="mt-2 space-y-1.5">
        {moves.map((m) => (
          <li key={m.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 line-clamp-1 text-body font-semibold leading-tight text-ink">
                {m.name}
                {m.injury ? (
                  <span className="font-normal text-secondary"> · {m.injury}</span>
                ) : null}
              </span>
              <span className="shrink-0 figure text-meta text-secondary">
                {fmt(m.was)} → <span className="text-ink">{fmt(m.now)}</span>
                <span className="text-faint">
                  {" "}
                  ({m.move > 0 ? "+" : "−"}
                  {fmt(Math.abs(m.move))})
                </span>
              </span>
            </div>
            <svg
              viewBox={`0 0 ${W} ${ROW_H}`}
              className="block w-full"
              role="img"
              aria-label={
                `${m.name}: priced at ${fmt(m.now)}, against ${fmt(m.was)} with the ` +
                `production weight at zero, a move of ${m.move > 0 ? "up" : "down"} ` +
                `${fmt(Math.abs(m.move))}.` +
                (m.injury ? ` Current injury flag: ${m.injury}.` : "")
              }
            >
              <line
                x1={xOf(Math.min(m.was, m.now))}
                y1={ROW_H / 2}
                x2={xOf(Math.max(m.was, m.now))}
                y2={ROW_H / 2}
                stroke={CHART_MARK}
                strokeWidth={1.5}
              />
              {/* HOLLOW = the counterfactual, the value with no production in it. */}
              <circle
                cx={xOf(m.was)}
                cy={ROW_H / 2}
                r={3}
                fill="var(--color-surface)"
                stroke={CHART_MARK}
                strokeWidth={1.5}
              />
              {/* FILLED = what this app actually publishes. */}
              <circle
                cx={xOf(m.now)}
                cy={ROW_H / 2}
                r={3.4}
                fill={CHART_ACCENT}
              />
            </svg>
          </li>
        ))}
      </ol>

      {/* THE SHARED AXIS, once, positioned by percentage of the same width. */}
      <div aria-hidden="true" className="relative mt-0.5 h-4">
        {TICKS.map((t) => (
          <span
            key={t}
            className="figure absolute top-0.5 -translate-x-1/2 text-micro leading-none text-faint"
            style={{ left: `${r1((xOf(t) / W) * 100)}%` }}
          >
            {t.toLocaleString()}
          </span>
        ))}
      </div>
      <p className="mt-1 text-micro leading-snug text-faint">
        Dynasty value.{" "}
        <span className="text-secondary">Hollow</span> is the same model with the
        production weight at zero; <span className="text-secondary">filled</span> is the
        price this app publishes. Both come from the model itself rather than from an
        arithmetic shortcut, so the two dots are the two runs.
      </p>
    </div>
  );
}
