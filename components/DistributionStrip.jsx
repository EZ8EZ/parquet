/**
 * THE DISTRIBUTION STRIP - the shape a bare number needs to mean anything.
 *
 * The round-8 metrics audit found this app printing TCI, RFI, total value, pick
 * capital and start rate as bare figures. "Your TCI is 61" is unanswerable: 61 out of
 * what, against whom, and is 61 the good end? Every one of those numbers is scored
 * against the same fourteen managers, and the app already holds all fourteen every
 * time it prints one of them - so the comparison was never missing data, only a
 * drawing.
 *
 * One tick per manager, positioned by value. Yours is taller, accented, and carries
 * its own rank in words underneath. The reader gets the answer three ways at once:
 * where the tick sits, how the crowd is bunched around it, and the printed rank.
 *
 * COLOUR (see lib/chart-colors.ts for the rules and their measurements):
 * - The crowd is ONE HUE AT ONE STRENGTH. It briefly rode the magnitude ramp, which
 *   was a mistake twice over: a tick's position already states its value, so the ramp
 *   restated it, and the ramp's weak steps fall under 3:1 on every ground, so the low
 *   tail faded toward its own background. A strip that quietly loses its tail is worse
 *   than a strip with no colour variation at all.
 * - A `signed` strip uses the CVD-safe diverging pair instead, split at zero.
 * - Nothing is encoded in colour alone. Delete every fill and the position, the
 *   height difference and the printed rank still carry the whole reading.
 *
 * NO VALENCE. The strip never says which end is good. D23 is explicit that low
 * fragility is not the same as good, and D6 forbids grades outright, so `betterEnd`
 * exists only to word the rank sentence ("4th highest" / "4th lowest") and is
 * omitted wherever the direction is genuinely not a judgement.
 *
 * Hand-rolled inline SVG (D3). Every coordinate is rounded before it reaches an
 * attribute - unrounded floats serialize differently server-side and client-side and
 * have broken hydration on this project before.
 */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  CHART_ACCENT,
  CHART_FIELD,
  CHART_GRID,
  CHART_NEUTRAL,
  divergingFill,
} from "@/lib/chart-colors";
import { ordinal } from "@/lib/derive/describe";
import { cn } from "@/lib/ui";
const W = 320;
const H = 30;
/** The rail the ticks stand on. */
const BASE = 26;
const PAD = 6;
const r1 = (v) => Math.round(v * 10) / 10;
/**
 * `noun` NAMES THE POPULATION, and it defaults to the only one this strip used to have.
 *
 * All five original callers compare one roster against the other thirteen, so "rosters"
 * was written into the spoken sentence and the rank reading. The provenance rail
 * compares one HOLD against the same manager's other completed holds - same drawing,
 * same discipline, a different population - and a strip that said "across 23 rosters"
 * about 23 holds would state something false to exactly the reader who cannot see the
 * picture. So the noun is a prop rather than a second copy of this component: one
 * strip, one set of rules, and the sentence stays true wherever it is pointed.
 * Defaulted, so every existing call site renders byte-identically.
 */
export function DistributionStrip({
  label,
  values,
  mine,
  format = (n) => `${n}`,
  signed = false,
  betterEnd,
  sub,
  href,
  className,
  noun = "rosters",
  /**
   * HERO WEIGHT (round 10). One strip per surface may carry the page's anchor
   * number at display weight: the value moves out of the 12px caption slot and
   * onto its own line at --text-hero, with the rank reading beside it. Same
   * facts, same ticks, same rules - only the typographic weight of a number the
   * strip already printed. Defaulted off, so every existing call site renders
   * byte-identically.
   */
  hero = false,
}) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 3) return null;
  const lo = Math.min(...clean);
  const hi = Math.max(...clean);
  const span = hi - lo || 1;
  const x = (v) => r1(PAD + ((v - lo) / span) * (W - PAD * 2));
  // Rank is computed from the raw values, never from a pixel position - two rosters
  // a hair apart round to the same x and must not round to the same rank.
  const sorted = [...clean].sort((a, b) =>
    betterEnd === "low" ? a - b : b - a,
  );
  const rank = mine == null ? null : sorted.indexOf(mine) + 1;
  const median = sorted.length
    ? [...clean].sort((a, b) => a - b)[Math.floor(clean.length / 2)]
    : 0;
  const reading =
    rank && rank > 0
      ? betterEnd
        ? `${ordinal(rank)} ${betterEnd === "high" ? "highest" : "lowest"} of ${clean.length}`
        : `${ordinal(rank)} of ${clean.length}`
      : `${clean.length} ${noun}`;
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-0.5 truncate text-meta uppercase tracking-wide text-secondary">
          {label}
          {href && (
            <ChevronRight size={11} aria-hidden="true" className="shrink-0" />
          )}
        </span>
        <span className="shrink-0 figure text-meta">
          {!hero && mine != null && (
            <span className="font-semibold text-ink">{format(mine)}</span>
          )}
          <span className="text-secondary">
            {" "}
            {!hero && mine != null ? "· " : ""}
            {reading}
          </span>
        </span>
      </div>
      {hero && mine != null && (
        <div className="mb-0.5 mt-1 figure text-hero font-semibold leading-none text-ink">
          {format(mine)}
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={
          `${label}: ${mine != null ? `yours is ${format(mine)}, ${reading}. ` : ""}` +
          `Across ${clean.length} ${noun} the range runs ${format(lo)} to ${format(hi)}, ` +
          `median ${format(median)}.`
        }
      >
        <line
          x1={PAD}
          y1={BASE}
          x2={W - PAD}
          y2={BASE}
          stroke={CHART_GRID}
          strokeWidth={1}
        />
        {/* Median, dashed, never labelled as a pass mark - half the league is under
            it by construction. */}
        <line
          x1={x(median)}
          y1={BASE - 13}
          x2={x(median)}
          y2={BASE + 4}
          stroke={CHART_NEUTRAL}
          strokeWidth={1}
          strokeDasharray="2 2"
        />
        {clean.map((v, i) => {
          const isMine = mine != null && v === mine;
          if (isMine) return null;
          return (
            <rect
              key={`${v}-${i}`}
              x={r1(x(v) - 1)}
              y={BASE - 10}
              width={2}
              height={10}
              rx={1}
              // COURT BLUE (VISION M4): the peers are the FIELD's side of this
              // comparison, so they take the field hue - gold stays yours alone.
              // Both sides used to be the same gold, which made the one chart
              // whose whole job is you-against-the-league monochrome.
              fill={signed ? divergingFill(v) : CHART_FIELD}
              // FLAT, not the magnitude ramp. A peer tick's position IS its value,
              // so ramping opacity with position adds nothing - and it subtracts
              // something real: the ramp's bottom steps sit under 3:1 on every
              // ground (see lib/chart-colors.ts rule 2), so the left tail of the
              // distribution faded out. "Nobody is down there" is the one thing this
              // strip must never say by accident.
              opacity={0.75}
            />
          );
        })}
        {mine != null && (
          <g>
            <rect
              x={r1(x(mine) - 1.5)}
              y={BASE - 18}
              width={3}
              height={18}
              rx={1.5}
              /* ALWAYS accent, including in signed mode. Accent means "you"
           everywhere else in this app, and the one chart where "you" matters
           most was the one place that gave the viewer's own tick away to the
           diverging ramp - so on a signed strip the reader had to find
           themselves by shape alone while every other mark on screen still
           used colour for identity. The sign is already carried twice over: by
           the tick's position relative to the midline and by the diverging fill
           on every OTHER tick. */
              fill={CHART_ACCENT}
            />
            {/* A shape as well as a colour, so "which one is mine" never rests on
                the accent alone. */}
            {/* Points DOWN at the tick from above. It used to sit under the rail,
                where it collided with the range label whenever the viewer held the
                lowest or highest value in the league - which is exactly the case a
                reader most wants to see clearly. */}
            <polygon
              points={`${r1(x(mine) - 3.5)},${BASE - 24} ${r1(x(mine) + 3.5)},${BASE - 24} ${r1(x(mine))},${BASE - 19}`}
              fill={CHART_ACCENT}
            />
          </g>
        )}
      </svg>
      {/*
       * THE RANGE IS HTML, NOT SVG TEXT, and that is not a style preference.
       * This viewBox is 320 units wide and the layout caps the column at 672px, so
       * everything inside the drawing renders at up to 2x - an 8px SVG label lands
       * at 16px on a wide phone in landscape, larger than the body type it is
       * supposed to sit under. Geometry should scale with the chart; a caption
       * should stay on the type scale. So the ticks stay in the SVG and the two
       * numbers came out of it.
       */}
      <div className="-mt-0.5 flex items-baseline justify-between gap-2 figure text-micro text-secondary">
        <span>{format(lo)}</span>
        <span>{format(hi)}</span>
      </div>
      {sub && (
        <p className="-mt-0.5 text-meta leading-snug text-secondary">{sub}</p>
      )}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "block min-w-0 rounded-[--radius-sm] px-1.5 py-1 transition-colors hover:bg-surface-2",
          className,
        )}
      >
        {body}
      </Link>
    );
  }
  return <div className={cn("min-w-0 px-1.5 py-1", className)}>{body}</div>;
}
