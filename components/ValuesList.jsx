"use client";
/**
 * The asset-value list (/values) and `ValueAssetDetail`, the facts behind one asset,
 * shared by /values' and /roster's bottom sheets.
 *
 * There is deliberately no player detail page (see the scope note in DECISIONS): a
 * row opens a sheet with the facts, and the model's internals stay on /methodology
 * rather than sitting as bare factors next to a name.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronRight, Search } from "lucide-react";
import { cn, fmtValue, fold } from "@/lib/ui";
import { playerLineageHref } from "@/lib/tradegraph/url";
import { firstCliffAge, pastFirstCliff } from "@/lib/valuation/ageCurve";
import { PlayerAvatar, photosEnabled } from "@/components/PlayerAvatar";
import { RefusalMark } from "@/components/RefusalMark";
import { Button, Chip, Disclosure, List, ListRow, Segmented, Sheet } from "@/components/ui";
import {
  VALUE_FILTERS,
  parseValuesParams,
  valuesQueryString,
} from "@/lib/values/url";
/**
 * The facts behind one asset: both ranks, tier, injury, depth chart, age curve and
 * where he came from. Facts only: never a multiplier of the model.
 */
export function ValueAssetDetail({
  name,
  age,
  tier,
  playerId,
  injury,
  injuryDetail,
  consensusRank,
  pricedRank,
  productionBacked,
  productionRefusal,
  rankAxisMax,
  provenance,
  depth,
}) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-2">
        {/* TWO RANKS, NOT ONE. `consensus` is what the market thinks; `priced` is the
            rank this value was computed from. The gap between them is the production
            term, so both are facts and neither is the model's internals. */}
        <Fact label="Consensus rank" value={consensusRank != null ? `#${consensusRank}` : "unranked"} />
        <Fact
          label="Priced rank"
          value={
            pricedRank != null
              ? `#${pricedRank}${
                  productionBacked && consensusRank != null
                    ? ` · ${pricedRank === consensusRank ? "no move" : `${pricedRank < consensusRank ? "up" : "down"} ${Math.abs(consensusRank - pricedRank)}`}`
                    : ""
                }`
              : "-"
          }
        />
        <Fact label="Tier" value={tier ?? "-"} />
        {(injuryDetail ?? injury) && <Fact label="Injury" value={injuryDetail ?? injury} />}
        {/* A COUNT, never an ordinal: Sleeper's depth orders are non-contiguous and
            duplicated (lib/depth's header has the measurement). */}
        {depth && <Fact label="Depth chart" value={depthFact(depth)} />}
        {age != null && <Fact label="Age" value={`${age}`} />}
        {pastFirstCliff(age) && <Fact label="Age curve" value={`Downslope, past ${firstCliffAge()}`} />}
      </dl>
      {/* The two ranks as a mark on a scale shared by every row; only where production
          actually moved him. An unbacked row gets the refusal instead. */}
      {productionBacked && consensusRank != null && pricedRank != null && rankAxisMax > 1 && (
        <RankDumbbell consensusRank={consensusRank} pricedRank={pricedRank} axisMax={rankAxisMax} name={name} />
      )}
      {/* The refusal arrives as a finished sentence from lib/valuation/production.js,
          which owns the condition; never built here. */}
      {productionBacked === false && productionRefusal && (
        <RefusalMark className="mt-3 text-note text-muted">{productionRefusal}</RefusalMark>
      )}

      <List className="mt-3 bg-surface-2">
        {depth?.href && (
          <li>
            <ListRow href={depth.href} title={`Where he sits on ${depth.team}`} className="hover:bg-elevated" />
          </li>
        )}
        {/* Every asset has an answer, including "never traded" (lib/provenance). */}
        {playerId && !provenance && (
          <li>
            <ListRow href={playerLineageHref(playerId)} title="Where he came from" className="hover:bg-elevated" />
          </li>
        )}
      </List>

      {playerId && provenance && (
        <div className="mt-3">
          {provenance}
          <Link
            href={playerLineageHref(playerId)}
            className="mt-1 inline-flex min-h-11 items-center gap-1 text-note font-semibold text-accent-text"
          >
            This chain on its own page
            <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}

      <Disclosure className="mt-2" summary="How this value is built">
        {pastFirstCliff(age) && (
          <p className="mb-2">
            Turning {firstCliffAge()} costs more dynasty value than any other single year
            before 34, measured across 4,587 NBA player-seasons. That discount is already
            inside the number. What this league will pay is a separate question, and five
            seasons of trades cannot answer it.
          </p>
        )}
        <p>
          Value is built from consensus rank, then bent by age, injury, role and position.{" "}
          <Link href="/methodology" className="font-semibold text-accent-text underline underline-offset-2">
            Methodology
          </Link>
        </p>
      </Disclosure>
    </>
  );
}
/**
 * The depth-chart datum, in the width of half a row.
 *
 * Every branch is a count or a refusal, because those are the only two things the
 * source supports: a player level with someone on the same order has no ordinal, and a
 * player the chart places without an order cannot be compared to anyone at all.
 *
 * @param {import('@/lib/depth').DepthLine} d
 */
function depthFact(d) {
  if (d.unplacedInOrder) return `${d.position}, no order`;
  if (d.level > 0) return `${d.position}, level with ${d.level}`;
  if (d.ahead === 0) return `${d.position}, none ahead`;
  return `${d.position}, ${d.ahead} ahead`;
}
/**
 * THE TWO RANKS, ON A SHARED SCALE. Hollow is where consensus has him, filled is where
 * this app prices him, and the bar between them is the production term.
 *
 * ONE GREY, NO VALENCE. Moving up the board is not "good" - the model has no opinion
 * about whether a player should be higher, only a measurement that says he is. A
 * diverging pair here would state a verdict the derivation does not contain (D6), so
 * both dots are the same neutral ink and direction is carried by which one is on the
 * left. Delete the colour and the mark still reads, which is the acceptance test.
 *
 * NO ARROWHEAD, deliberately. An arrow says "he is heading there"; this is a comparison
 * of two present-tense estimates, not a trajectory. The whole point of a dumbbell is
 * that both ends are real values.
 *
 * NO `<text>` (D96): the two ranks are already printed as facts directly above, so the
 * mark carries no label of its own and the axis is stated once in the caption below it.
 * The scale is `axisMax`, shared by every row in the list, so two open rows are directly
 * comparable - a per-row scale would make a 5-place move and a 90-place move the same
 * length.
 */
function RankDumbbell({ consensusRank, pricedRank, axisMax, name }) {
  const W = 320;
  const H = 11;
  const INSET = 3;
  const r1 = (v) => Math.round(v * 10) / 10;
  const x = (rank) =>
    r1(INSET + ((Math.min(rank, axisMax) - 1) / (axisMax - 1)) * (W - INSET * 2));
  const moved = pricedRank !== consensusRank;
  return (
    <div className="mt-1.5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label={
          `${name}: consensus ranks him #${consensusRank}, and this app prices him at ` +
          `#${pricedRank}` +
          (moved
            ? `, ${pricedRank < consensusRank ? "up" : "down"} ${Math.abs(consensusRank - pricedRank)} places on his in-league production.`
            : ` - production did not move him.`)
        }
      >
        <line
          x1={INSET}
          y1={H - 1.5}
          x2={W - INSET}
          y2={H - 1.5}
          stroke="var(--color-border)"
          strokeWidth={1}
        />
        {moved && (
          <line
            x1={x(Math.min(consensusRank, pricedRank))}
            y1={H / 2 - 1}
            x2={x(Math.max(consensusRank, pricedRank))}
            y2={H / 2 - 1}
            stroke="var(--color-secondary)"
            strokeWidth={1.5}
          />
        )}
        <circle
          cx={x(consensusRank)}
          cy={H / 2 - 1}
          r={3}
          fill="var(--color-surface)"
          stroke="var(--color-secondary)"
          strokeWidth={1.5}
        />
        <circle
          cx={x(pricedRank)}
          cy={H / 2 - 1}
          r={3.2}
          fill="var(--color-secondary)"
        />
      </svg>
      {/* "1 at the left", not "left is better". Rank 1 is the most valuable asset by
          construction, but this app does not tell a reader which end of a scale to
          want (D6, and the same discipline that leaves `betterEnd` unset on
          components/DistributionStrip.jsx wherever the direction is not a judgement).
          The sentence describes the axis; it does not grade a position on it. */}
      <p className="text-micro leading-snug text-faint">
        <span aria-hidden="true">○</span> consensus{" "}
        <span aria-hidden="true">●</span> priced · rank 1 to {axisMax}, 1 at the left
      </p>
    </div>
  );
}
/** One fact about the player, as a small tile. Deliberately not one factor of the model. */
function Fact({ label, value }) {
  return (
    <div className="min-w-0 rounded-control bg-surface-2 px-3 py-2">
      <dt className="text-meta text-secondary">{label}</dt>
      <dd className="figure text-body font-semibold text-ink">{value}</dd>
    </div>
  );
}
/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */
const FILTERS = VALUE_FILTERS;
const PAGE = 30;
const SORTS = [
  { value: "value", label: "By value" },
  { value: "age", label: "By age" },
];
export function ValuesList({ rows }) {
  // Filters, sort, query and page size all live in the address bar (D30's pattern):
  // read once at mount, mirrored write-only with history.replaceState, because this
  // page is force-dynamic and re-rendering it per keystroke would revalue the league.
  const searchParams = useSearchParams();
  const [initial] = useState(() => {
    const parsed = parseValuesParams(searchParams, PAGE);
    // A `?focus=` link has to land inside the visible page even below row PAGE.
    if (parsed.focus) {
      const idx = rows.findIndex((r) => r.id === parsed.focus);
      if (idx >= 0 && idx + 1 > parsed.limit) {
        return { ...parsed, limit: idx + 1 };
      }
    }
    return parsed;
  });
  const focusId = initial.focus;
  const [pos, setPos] = useState(initial.pos);
  const [q, setQ] = useState(initial.q);
  const [sort, setSort] = useState(initial.sort);
  const [limit, setLimit] = useState(initial.limit);
  useEffect(() => {
    const state = { pos, q, sort, limit, focus: focusId };
    window.history.replaceState(null, "", `${window.location.pathname}${valuesQueryString(state, PAGE)}`);
  }, [pos, q, sort, limit, focusId]);
  // A focused row (from search) scrolls into view once.
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`value-row-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId]);
  const counts = useMemo(() => {
    const m = { All: rows.length };
    for (const r of rows) {
      if (!r.position) continue;
      m[r.position] = (m[r.position] ?? 0) + 1;
    }
    return m;
  }, [rows]);
  // ONE RANK SCALE FOR THE WHOLE LIST, off `rows` and never the filtered subset, so a
  // dumbbell means the same length in any two sheets.
  const rankAxisMax = useMemo(() => {
    let max = 1;
    for (const r of rows) {
      if (typeof r.consensusRank === "number") max = Math.max(max, r.consensusRank);
      if (typeof r.pricedRank === "number") max = Math.max(max, r.pricedRank);
    }
    return max;
  }, [rows]);
  const filtered = useMemo(() => {
    const s = fold(q.trim());
    const out = rows.filter((r) => (pos === "All" || r.position === pos) && (!s || fold(r.name).includes(s)));
    if (sort === "age") {
      out.sort((a, b) => (a.age ?? 99) - (b.age ?? 99) || b.value - a.value);
    }
    return out;
  }, [rows, pos, q, sort]);
  const shown = filtered.slice(0, limit);
  function reset(fn) {
    fn();
    setLimit(PAGE);
  }
  return (
    <div>
      <div className="relative">
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => reset(() => setQ(e.target.value))}
          placeholder={`Search ${rows.length} players`}
          aria-label="Search players"
          className="h-11 w-full rounded-full border border-border-strong bg-surface pl-10 pr-4 text-body text-ink placeholder:text-secondary focus:border-accent focus:outline-none"
        />
      </div>
      <div role="group" aria-label="Position" className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => reset(() => setPos(f))}
            aria-pressed={pos === f}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-note font-semibold transition-colors",
              pos === f ? "bg-accent-wash text-accent-text" : "bg-surface text-muted hover:text-ink",
            )}
          >
            {f}
            <span className={cn("figure text-meta", pos === f ? "text-accent-text" : "text-secondary")}>
              {counts[f] ?? 0}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="min-w-0 figure text-meta text-secondary">
          {filtered.length} match{filtered.length === 1 ? "" : "es"}
        </p>
        <Segmented
          label="Sort"
          options={SORTS}
          value={sort}
          onChange={(s) => reset(() => setSort(s))}
          className="w-52 shrink-0"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-body text-muted">No players match.</p>
      ) : (
        <List aria-label="Players by value" className="mt-2">
          {shown.map((r, i) => {
            const meta = [r.position ?? "-", r.team, r.age != null ? `${r.age}` : null, r.owner]
              .filter(Boolean)
              .join(" · ");
            return (
              <li
                key={r.id}
                id={`value-row-${r.id}`}
                className={cn(r.id === focusId && "bg-surface-2")}
              >
                <Sheet
                  // A `?focus=` deep link (search) opens that player's sheet on load.
                  defaultOpen={r.id === focusId}
                  triggerLabel={`${r.name}, value ${fmtValue(r.value)}. Show details`}
                  title={r.name}
                  subtitle={`${meta} · ${fmtValue(r.value)}${r.tier ? ` · ${r.tier}` : ""}`}
                  trigger={
                    <ListRow
                      as="span"
                      chevron
                      leading={i + 1}
                      avatar={
                        photosEnabled() ? (
                          <PlayerAvatar name={r.name} team={r.team} playerId={r.id} size="sm" />
                        ) : null
                      }
                      title={r.name}
                      badge={
                        r.injury ? (
                          <Chip tone="negative" size="sm" icon={AlertTriangle}>
                            {r.injury}
                          </Chip>
                        ) : null
                      }
                      meta={meta}
                      value={fmtValue(r.value)}
                      valueSub={r.tier ? <Chip size="sm">{r.tier}</Chip> : null}
                    />
                  }
                >
                  <ValueAssetDetail
                    name={r.name}
                    age={r.age}
                    tier={r.tier}
                    playerId={r.id}
                    injury={r.injury}
                    injuryDetail={r.injuryDetail}
                    consensusRank={r.consensusRank}
                    pricedRank={r.pricedRank}
                    productionBacked={r.productionBacked}
                    productionRefusal={r.productionRefusal}
                    rankAxisMax={rankAxisMax}
                    depth={r.depth}
                  />
                </Sheet>
              </li>
            );
          })}
        </List>
      )}

      {filtered.length > shown.length && (
        <Button variant="secondary" block className="mt-3" onClick={() => setLimit((l) => l + PAGE)}>
          Show {Math.min(PAGE, filtered.length - shown.length)} more
          <span className="figure text-meta text-secondary">of {filtered.length}</span>
        </Button>
      )}
    </div>
  );
}
