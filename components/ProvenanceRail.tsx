/**
 * THE PROVENANCE RAIL - why this asset is here, drawn against real time.
 *
 * One vertical rail, oldest at the top, today at the bottom, and the y-axis is TIME.
 * That is the whole design. `AssetMove.created` has existed since the first version of
 * this feature and was used only for sorting; drawing it is what turns "it sat
 * unresolved for eighteen months" from a subtraction the reader has to perform into a
 * gap they can see. Every other encoding here is typeset text.
 *
 * LAYOUT. The SVG and the text are two columns of one CSS grid sharing ONE set of
 * computed row heights (`layoutRows`), so the dots cannot drift out of alignment with
 * the sentences beside them: the grid's total height is the sum of its explicit px
 * tracks, which is exactly the SVG's height. Row heights are proportional to elapsed
 * time, floored at `MIN_ROW` so two events days apart still have room for their own
 * words - proportional where there is room, legible where there is not.
 *
 * HOUSE SVG RULES (D3 - no chart library): fixed viewBox, every coordinate an
 * INTEGER (this codebase learned the unrounded-float hydration lesson twice - see
 * `r2` in components/charts.tsx), colours from CSS variables so all three themes work
 * with no component knowing a theme exists, and `role="img"` with a full-sentence
 * `aria-label`. The rail is a picture OF the list beside it, so the list is the
 * screen-reader path and the label describes the shape rather than restating it.
 */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LocalDate } from "@/components/LocalDate";
import { ordinal } from "@/lib/derive/describe";
import { dealHref } from "@/lib/tradegraph/url";
import type {
  ProvenanceChain,
  ProvenanceEvent,
  ProvenanceHop,
  ProvenanceOrigin,
  ProvenanceResolution,
} from "@/lib/provenance";

/**
 * The floor on a row, in px. Measured against the tallest block a row can hold: a
 * gap caption, a two-line 44px tap target, and a date line. 74 was the first guess and
 * the live render at 375px showed one row's date sitting on the next row's caption.
 */
const MIN_ROW = 92;
/**
 * Ceiling on the proportional part of the axis, in px. Comfortably above `MIN_ROW` x
 * the longest chain in this league (5 hops, so 7 nodes and 6 gaps), which is what
 * keeps the floor from quietly flattening the whole axis into even spacing.
 */
const SPAN_PX = 880;
/**
 * Per-gap budget, and the reason the total is not simply `SPAN_PX`.
 *
 * A three-node chain - "taken in the 2022 startup draft, still here" - spans nearly
 * four years across two gaps, and spending the full budget on it drew about 900px of
 * empty rail inside an expanded roster row. The long gap IS the story for that player,
 * so it is not flattened; it is just given a budget sized to how much there is to say.
 * Proportionality WITHIN a chain is untouched, since this scales every gap in it by
 * the same factor.
 */
const PER_GAP_PX = 180;
/** The rail's own column, in px and in SVG units - one unit is one pixel. */
const RAIL_W = 18;
const CX = 9;
/**
 * Vertical inset for the first dot. Without it the top node sits at y=0 and the
 * viewBox clips its upper half - caught on the first live render, at 375px.
 */
const CAP = 7;

const DAY = 86_400_000;

/** Elapsed time in the coarsest unit that still says something true. */
export function formatGap(ms: number): string {
  const days = Math.round(ms / DAY);
  if (days <= 0) return "same day";
  if (days === 1) return "1 day";
  if (days < 45) return `${days} days`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}

/**
 * Row heights from timestamps: proportional, then floored.
 *
 * One forward pass. A row can only ever be pushed DOWN by the floor, never up, so the
 * ordering is preserved and the largest gaps stay the largest gaps - the floor
 * compresses the relative difference between two close events, it never inverts it.
 */
export function layoutRows(times: number[]): number[] {
  const n = times.length;
  if (n <= 1) return [MIN_ROW];
  const first = times[0];
  const span = times[n - 1] - first;
  const budget = Math.min(SPAN_PX, PER_GAP_PX * (n - 1));
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const raw = span > 0 ? Math.round((budget * (times[i] - first)) / span) : i * MIN_ROW;
    y.push(i === 0 ? 0 : Math.max(raw, y[i - 1] + MIN_ROW));
  }
  // The last row still needs height of its own - it holds the terminus.
  const rows: number[] = [];
  for (let i = 0; i < n - 1; i++) rows.push(y[i + 1] - y[i]);
  rows.push(MIN_ROW);
  return rows;
}

export interface ProvenanceRailProps {
  chain: ProvenanceChain;
  /** Print the asset's own name above the rail. Off inside a row that already names it. */
  showTitle?: boolean;
  className?: string;
}

export function ProvenanceRail({ chain, showTitle, className }: ProvenanceRailProps) {
  const nodes: (ProvenanceEvent | ProvenanceChain["today"])[] = [
    ...chain.events,
    chain.today,
  ];
  const times = nodes.map((n) => n.at);
  const rows = layoutRows(times);
  // Integer offsets, shared by both columns. Every SVG coordinate below derives from
  // this array and nothing else, which is what keeps them all integers.
  const tops: number[] = [];
  let acc = CAP;
  for (const r of rows) {
    tops.push(acc);
    acc += r;
  }
  const total = acc;

  const label = railLabel(chain);

  return (
    <div className={className}>
      {showTitle && (
        <p className="mb-1 text-meta font-semibold uppercase tracking-[0.16em] text-accent-text">
          {chain.kind === "pick" ? "Pick provenance" : "Provenance"}
        </p>
      )}
      <div
        className="grid gap-x-2.5"
        style={{
          gridTemplateColumns: `${RAIL_W}px minmax(0,1fr)`,
          // The `CAP` inset is on the FIRST track so the text column starts level
          // with the dot beside it, and the sum of the tracks still equals the SVG's
          // own height - which is what keeps the two columns locked together.
          gridTemplateRows: rows
            .map((r, i) => `${i === 0 ? r + CAP : r}px`)
            .join(" "),
        }}
      >
        {/* The rail: one SVG spanning every row of the left column. */}
        <svg
          viewBox={`0 0 ${RAIL_W} ${total}`}
          width={RAIL_W}
          height={total}
          role="img"
          aria-label={label}
          style={{ gridColumn: 1, gridRow: `1 / ${rows.length + 1}` }}
          className="shrink-0"
        >
          <line
            x1={CX}
            y1={tops[0]}
            x2={CX}
            y2={tops[tops.length - 1]}
            stroke="var(--color-border-strong)"
            strokeWidth={2}
          />
          {nodes.map((n, i) => {
            const y = tops[i];
            const last = i === nodes.length - 1;
            const isResolution = n.node === "resolution";
            const fill = last
              ? "var(--color-accent)"
              : isResolution
                ? "var(--color-info)"
                : n.dated
                  ? "var(--color-ink)"
                  : "var(--color-bg)";
            const stroke = last
              ? "var(--color-accent)"
              : isResolution
                ? "var(--color-info)"
                : "var(--color-border-strong)";
            return isResolution ? (
              // The species change gets a different SHAPE, not only a different
              // colour: it is the one node that is a different kind of event, and
              // hue alone would not say so to every reader.
              <rect
                key={i}
                x={CX - 5}
                y={y - 5}
                width={10}
                height={10}
                transform={`rotate(45 ${CX} ${y})`}
                fill={fill}
                stroke={stroke}
                strokeWidth={2}
              />
            ) : (
              <circle
                key={i}
                cx={CX}
                cy={y}
                r={last ? 6 : 5}
                fill={fill}
                stroke={stroke}
                strokeWidth={2}
              />
            );
          })}
        </svg>

        {nodes.map((n, i) => (
          <div
            key={i}
            style={{ gridColumn: 2, gridRow: i + 1, paddingTop: i === 0 ? CAP : 0 }}
            className="min-w-0 -mt-1.5"
          >
            {i > 0 && times[i] > times[i - 1] && (
              <p className="figure text-micro leading-normal text-faint">
                {formatGap(times[i] - times[i - 1])} later
              </p>
            )}
            <NodeBody node={n} />
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeBody({
  node,
}: {
  node: ProvenanceEvent | ProvenanceChain["today"];
}) {
  if (node.node === "origin") return <OriginBody o={node} />;
  if (node.node === "hop") return <HopBody h={node} />;
  if (node.node === "resolution") return <ResolutionBody r={node} />;
  return (
    <div>
      <p className="text-body font-semibold leading-snug text-accent-text">Today</p>
      <p className="text-meta leading-snug text-muted">{node.text}</p>
    </div>
  );
}

function OriginBody({ o }: { o: ProvenanceOrigin }) {
  return (
    <div>
      <p className="text-body font-semibold leading-snug text-ink">{o.text}</p>
      <p className="figure text-micro leading-normal text-faint">
        {o.dated ? <LocalDate ts={o.at} /> : "on or before the record opens"}
      </p>
    </div>
  );
}

function HopBody({ h }: { h: ProvenanceHop }) {
  return (
    <div className="min-w-0">
      <Link
        href={dealHref(h.tradeId)}
        className="group inline-flex min-h-11 max-w-full items-start gap-1 text-left"
        aria-label={`Traded to ${h.toName} in ${h.season}. Open the deal.`}
      >
        <span className="min-w-0">
          <span className="block truncate text-body font-semibold leading-snug text-ink group-hover:text-accent-text">
            Traded to {h.toName}
          </span>
          <span className="block truncate text-meta leading-snug text-muted">
            by {h.fromName} · as {h.assetLabel}
          </span>
        </span>
        <ChevronRight
          size={13}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-faint group-hover:text-accent-text"
        />
      </Link>
      <p className="figure text-micro leading-normal text-faint">
        <LocalDate ts={h.at} /> · {h.season} wk {h.week}
        {h.inferred && <span className="ml-1 text-warn">pick inferred</span>}
      </p>
    </div>
  );
}

function ResolutionBody({ r }: { r: ProvenanceResolution }) {
  return (
    <div className="min-w-0">
      <Link
        href={
          r.pickNo
            ? `/drafts/${r.season}?pick=${r.pickNo}#pick-${r.pickNo}`
            : `/drafts/${r.season}`
        }
        className="group inline-flex min-h-11 max-w-full items-start gap-1 text-left"
        aria-label={`The pick became ${r.playerName}. Open the ${r.season} draft board.`}
      >
        <span className="min-w-0">
          <span className="block truncate text-body font-semibold leading-snug text-info group-hover:underline">
            The pick became {r.playerName}
          </span>
          <span className="block truncate text-meta leading-snug text-muted">
            {r.season} {ordinal(r.round)}
            {r.pickNo ? ` · pick #${r.pickNo}` : ""}
            {r.usedByName ? ` · used by ${r.usedByName}` : ""}
          </span>
        </span>
        <ChevronRight
          size={13}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-faint group-hover:text-info"
        />
      </Link>
      <p className="figure text-micro leading-normal text-faint">
        {r.dated ? <LocalDate ts={r.at} /> : `${r.season} draft`}
      </p>
    </div>
  );
}

/** A full sentence describing the SHAPE, since the list beside it carries the detail. */
function railLabel(chain: ProvenanceChain): string {
  const hops =
    chain.hops === 0
      ? "no trades"
      : `${chain.hops} trade${chain.hops === 1 ? "" : "s"}`;
  const draft = chain.crossesDraft ? ", crossing one draft" : "";
  return `Time rail for ${chain.label}: ${chain.events.length + 1} events over ${formatGap(chain.spanDays * DAY)}, oldest at the top, involving ${hops}${draft}. The same events are listed beside it.`;
}

/**
 * The one-line summary of a chain, for a row that has not opened the rail yet.
 *
 * Written as a SENTENCE rather than a stat line because it is the sales pitch for
 * tapping: "three trades and a draft over 4.1 years" is a story, "3 hops" is a count.
 */
export function chainSummary(chain: ProvenanceChain): string {
  const parts: string[] = [];
  if (chain.hops > 0) parts.push(`${chain.hops} trade${chain.hops === 1 ? "" : "s"}`);
  if (chain.crossesDraft) parts.push("a draft");
  if (parts.length === 0) return "Never traded";
  const joined =
    parts.length === 1 ? parts[0] : `${parts[0]} and ${parts.slice(1).join(", ")}`;
  return `${joined} over ${formatGap(chain.spanDays * DAY)}`;
}
