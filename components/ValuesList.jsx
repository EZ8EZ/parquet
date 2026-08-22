"use client";
/**
 * The asset-value list, plus `ValueAssetRow` - the one dense, tappable asset row
 * shared by /values and /roster.
 *
 * There is deliberately no player detail page (see the scope note in DECISIONS). The
 * original rationale was that a player's only interesting story is WHY the model
 * values it the way it does, and that the row could tell that story in place by
 * showing the multiplier chain `lib/valuation` returned.
 *
 * THAT RATIONALE NO LONGER HOLDS AS WRITTEN. Per-player multiplier readouts are
 * deliberately not shown any more: the model's internals belong on /methodology,
 * where they are explained, rather than scattered as bare factors next to a name
 * where "×0.73" invites being read as a fact about the player instead of an output
 * of a tunable config. What the row shows now are FACTS - what is wrong with him,
 * where consensus has him ranked - and it links to /methodology for the model.
 *
 * The honest consequence: the expansion is thinner than it was, and the argument for
 * having no player page is correspondingly weaker. It still holds on the "expanding
 * beats navigating, you can open three rows and compare" half, which was always the
 * better half.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Route, Search } from "lucide-react";
import { Sparkline } from "./charts";
import { cn, fmtValue, fold } from "@/lib/ui";
import { playerLineageHref } from "@/lib/tradegraph/url";
import { firstCliffAge, pastFirstCliff } from "@/lib/valuation/ageCurve";
import { PlayerAvatar, photosEnabled } from "@/components/PlayerAvatar";
import { RefusalMark } from "@/components/RefusalMark";
import {
  VALUE_FILTERS,
  parseValuesParams,
  valuesQueryString,
} from "@/lib/values/url";
/* ------------------------------------------------------------------ */
/* Row                                                                 */
/* ------------------------------------------------------------------ */
export function ValueAssetRow({
  rank,
  name,
  team,
  position,
  age,
  value,
  tier,
  playerId,
  injury,
  injuryDetail,
  consensusRank,
  pricedRank,
  productionBacked,
  productionRefusal,
  rankAxisMax,
  meta,
  share,
  trajectory,
  trajectoryColor,
  focused,
  provenance,
  depth,
  /**
   * THE PODIUM (round 10). "lead" for the #1 asset on a value-ordered list,
   * "podium" for #2-3, undefined for everyone else. A ranking where row #1 and
   * row #40 carry identical visual weight is a spreadsheet, not a board -
   * Sofascore/FotMob put the top of a rating list in a visibly heavier frame,
   * and that is hierarchy restating the SORT the list already performs, never a
   * verdict (D6): the value column, not this styling, is the claim. Everything
   * behavioural - expansion, the lineage door, the injury chip - is identical
   * across all three weights.
   */
  hero,
}) {
  const [open, setOpen] = useState(!!focused);
  const [justArrived, setJustArrived] = useState(!!focused);
  const liRef = useRef(null);
  useEffect(() => {
    if (!focused) return;
    liRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setJustArrived(false), 1600);
    return () => clearTimeout(t);
  }, [focused]);
  return (
    <li
      ref={liRef}
      id={playerId ? `value-row-${playerId}` : undefined}
      className={cn(
        "overflow-hidden border transition-colors duration-700",
        hero ? "rounded-[--radius]" : "rounded-[--radius-sm]",
        // The podium ground: the shared hero-card wash (gradient-within-hue) and
        // the accent-edge border. `open` still wins the ground for both weights so
        // an expanded hero reads as expanded, not merely as gold.
        hero && !open && "hero-card border-accent-edge",
        open
          ? "border-border-strong bg-surface-2"
          : !hero && "border-border bg-surface hover:border-border-strong",
        justArrived && "ring-2 ring-accent",
      )}
    >
      {/*
          THE ROW HAS TWO ACTIONS NOW, and the second one is the fix for the app's
          clearest good-and-undiscoverable feature. The provenance rail
          (/lineage/[assetKey]) answers "how did I end up with this guy", which is a
          question you have while looking at a roster, and until now the only doors to
          it were a link repeated thirty-one times on /drafts, a deal receipt, and the
          search panel. This is the door on the page where the question occurs.
  
          `self-stretch` rather than `min-h-11`: the link takes the row's own height
          instead of setting one, so the tap column is as tall as the row and the list
          does not grow by a single pixel at rest. That mattered - /values renders sixty
          of these and /roster seventeen, so anything that added even 8px per row would
          have cost more than the feature is worth.
  
          It carries its own accessible name because the glyph is the whole label; the
          expanded row keeps the written "Where he came from" link, which is where a
          reader learns what the glyph means.
        */}
      <div className="relative flex items-stretch">
        {/* The oversized ordinal BEHIND a podium row - depth by layering, not by
            shadow. aria-hidden decoration restating the rank the row already
            prints, at an alpha (--ghost-ink) that never competes with the text
            painted over it. */}
        {hero === "lead" && rank != null && (
          <span aria-hidden="true" className="ghost-rank figure">
            {rank}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${name}, value ${fmtValue(value)}. Show details`}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 px-2.5 text-left",
            hero === "lead" ? "py-3.5" : hero ? "py-2.5" : "py-1.5",
          )}
        >
          {rank != null && (
            <span
              className={cn(
                "shrink-0 text-right figure",
                hero
                  ? "w-6 text-lede font-semibold leading-none text-accent-text"
                  : "w-5 text-meta text-secondary",
              )}
            >
              {rank}
            </span>
          )}
          {/* Only rendered when this deploy has real photos on (`photosEnabled`).
              A monogram repeated across sixty rows was removed as pure decoration
              (D72); a real photo repeated sixty times is the opposite - recognition
              a reader actually uses - so the column returns for exactly that case
              and stays gone otherwise. Photos default ON as of D90, so this is now
              the normal path rather than the opt-in one; a fork that opts out still
              gets D72's monogram-free row. */}
          {photosEnabled() && (
            <PlayerAvatar
              name={name}
              team={team}
              playerId={playerId}
              size="sm"
              className="shrink-0"
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "truncate font-semibold leading-tight text-ink",
                  hero === "lead" ? "text-lede" : "text-[13px]",
                )}
              >
                {name}
              </span>
              {injury && (
                <span className="shrink-0 rounded bg-negative-wash px-1 text-meta font-semibold leading-tight text-negative">
                  {injury}
                </span>
              )}
            </span>
            {/*
          THE MARKER, and it is deliberately a word in this line rather than a chip
          beside it. A chip has to be `shrink-0` to keep its shape, and on the
          tightest real row here - a long name and "High-End Rotation" in the value
          column - a shrink-0 anything eats the position code on its way. As plain
          text it wraps with everything else instead.

          One word, in the same secondary voice as the rest of the line. Not a badge,
          not red, and not competing with the injury chip above it: the injury chip
          is a warning, this is a coordinate on a published curve. It sits before
          `meta` so the owner's name is what gives way first, and colour does no
          encoding at all here, which is the point.

          THIS USED TO BE `truncate` (single line, CSS ellipsis). At 390px, a row
          carrying position + team + age + "downslope" routinely ran past its own
          width and cut off mid-word ("SF · 35y · ▾ d...", "C · 30y · ▾ do...",
          screenshotted on the live 260-row list). A caption clipping mid-word is a
          bug, not density - the fix is to let it wrap rather than shrink anything
          further; `line-clamp-2` bounds the row's height instead of letting an
          unbounded wrap grow it indefinitely, which two lines of "position · team
          · age · downslope" never needs to exceed in practice.
        */}
            <span className="mt-px line-clamp-2 block figure text-meta text-secondary">
              {position ?? "-"}
              {team ? ` · ${team}` : ""}
              {age != null ? ` · ${age}y` : ""}
              {pastFirstCliff(age) ? (
                <span
                  className="font-semibold"
                  title={`Past ${firstCliffAge()}: the steepest single year in the measured age curve`}
                >
                  {" · "}
                  <span aria-hidden="true">▾</span> downslope
                </span>
              ) : null}
              {/*
                THE EXCEPTION, MARKED - AND ONLY THE EXCEPTION.

                Most rows here rest on a real in-league production record, and the
                temptation was to badge those. That is exactly backwards: a mark that
                is present on most rows and absent on some reads as a grade the absent
                rows failed (D6), and it would put a decoration on ~200 rows to carry
                information about ~50.

                So the mark goes on the rows where the claim is WEAKER, it is three
                words of plain text in the same secondary voice as the position code
                beside it, and it costs no row height because it joins a line that is
                already there and already wraps.

                NOT HATCHED, and not drawn as a refusal on the value itself. These
                players have real published prices; what is missing is the provenance
                behind the rank, not the number. The full sentence - with his own
                rostered-week count against the floor - is one tap down in the
                expansion, which is where there is room to say it properly.
              */}
              {productionBacked === false ? " · consensus only" : ""}
              {meta ? ` · ${meta}` : ""}
            </span>
            {share != null && (
              <span
                className={cn(
                  "mt-1 block w-full overflow-hidden rounded-full bg-elevated",
                  hero ? "h-[4px]" : "h-[3px]",
                )}
              >
                {/* Gradient WITHIN the accent (dim -> full) rather than a flat
                    fill: length still carries the whole value (geometry, never
                    valence), the ramp just makes sixty bars read as one lit
                    material instead of sixty identical rectangles. */}
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.max(2, Math.round(share * 100))}%`,
                    backgroundImage:
                      "linear-gradient(90deg, var(--color-accent-dim), var(--color-accent))",
                  }}
                />
              </span>
            )}
          </span>
          {trajectory && trajectory.length > 1 && (
            <span className="shrink-0" aria-hidden="true">
              <Sparkline
                values={trajectory}
                width={48}
                height={20}
                color={trajectoryColor}
              />
            </span>
          )}
          <span
            className={cn(
              "shrink-0 text-right",
              hero === "lead" ? "w-[6.5rem]" : "w-[4.5rem]",
            )}
          >
            {/* On the lead row the value is TYPOGRAPHY, not a table cell - the one
                number this whole page ranks by, set at display size (the same jolt
                logic as the masthead's own 25->30px raise). */}
            <span
              className={cn(
                "block figure font-semibold text-ink",
                hero === "lead"
                  ? "text-display leading-none"
                  : hero
                    ? "text-lede leading-none"
                    : "text-[13px] leading-tight",
              )}
            >
              {fmtValue(value)}
            </span>
            {/* Was `whitespace-nowrap`, which sizes this shrink-0 column to fit its
                LONGEST tier name ("High-End Rotation") on one line - the single
                biggest fixed-width cost in the row, and the reason names truncated
                ("Bennedict...", "Deandre Ay...", "Damian Lill...", all screenshotted
                on the live list) even after the row lost its avatar disc below.
                Wrapping a two-word tier onto two lines costs nothing: the name/meta
                block beside it is already two lines tall at rest. */}
            {tier && (
              <span className="block text-meta leading-tight text-secondary">
                {tier}
              </span>
            )}
          </span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={cn(
              "disclosure-chevron shrink-0 text-faint",
              open && "rotate-180 text-accent-text",
            )}
          />
        </button>
        {playerId && (
          <Link
            href={playerLineageHref(playerId)}
            aria-label={`How ${name} got here`}
            title={`How ${name} got here`}
            className="flex shrink-0 items-center self-stretch border-l border-border px-2.5 text-secondary transition-colors hover:bg-surface-2 hover:text-accent-text"
          >
            <Route size={14} aria-hidden="true" />
          </Link>
        )}
      </div>

      {open && (
        <div className="border-t border-border bg-bg/40 px-2.5 py-2">
          {/*
              FACTS ONLY. What the model knows about this player, never what it did with
              it: the multipliers are the model's internals and they live on
              /methodology, where there is room to explain them, rather than sitting as
              a bare "×0.73" next to a name where it reads as a property of the player.
            */}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            {/* TWO RANKS, NOT ONE. `consensus` is what the market thinks; `priced` is
                the rank this value was actually computed from, after production
                reordered the pool. The row used to print only the first, which meant
                the one number a reader could check was the one the model had already
                stopped using. The gap between them IS the production term, so both are
                facts and neither is the model's internals. */}
            <Fact
              label="consensus"
              value={consensusRank != null ? `#${consensusRank}` : "unranked"}
            />
            <Fact
              label="priced"
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
            <Fact label="tier" value={tier ?? "-"} />
            {(injuryDetail ?? injury) && (
              <Fact label="injury" value={injuryDetail ?? injury} />
            )}
            {/* WHERE HIS REAL TEAM HAS HIM, as one datum among the other facts.
                Deliberately a COUNT and never an ordinal: Sleeper's depth orders are
                non-contiguous and duplicated (lib/depth's header has the measurement),
                so "1 ahead" is a fact and "2nd string" would be a guess. The whole
                chart is a tap away rather than in this row - fifteen names in five
                groups is a page, not a row (see app/depth/[team]/page.jsx). */}
            {depth && <Fact label="depth chart" value={depthFact(depth)} />}
            {age != null && <Fact label="age" value={`${age}`} />}
            {pastFirstCliff(age) && (
              <Fact
                label="age curve"
                value={`downslope, past ${firstCliffAge()}`}
              />
            )}
          </dl>
          {/* THE TWO RANKS AS A MARK, on a scale shared by every row in the list, so
              "down 31" is a length a reader can compare across two open rows rather
              than two numbers he has to subtract. Only drawn where production actually
              moved him; for an unbacked row the two ranks are the same number by
              construction and a dumbbell of two coincident dots would assert a
              measurement that was never made. That case gets the refusal below. */}
          {productionBacked &&
            consensusRank != null &&
            pricedRank != null &&
            rankAxisMax > 1 && (
              <RankDumbbell
                consensusRank={consensusRank}
                pricedRank={pricedRank}
                axisMax={rankAxisMax}
                name={name}
              />
            )}
          {/* THE SECOND FACT, WHEN THERE IS NO SECOND FACT.
              ARRIVES AS A FINISHED SENTENCE, and deliberately is not built here. The
              words belong to lib/valuation/production.js, which owns the condition
              (eight rostered weeks, `productionBacked`) and the rostered-week count
              behind it - a row that writes its own reason string is a row that can
              drift from the flag it is describing. It is also RefusalMark's own
              contract: the refusal-object-to-string boundary sits at the call site,
              never inside the component. This row is a client component, so building
              it here would additionally pull the refusal register and the derivation's
              own tables into the browser to render one line of text. */}
          {productionBacked === false && productionRefusal && (
            <RefusalMark className="mt-1.5">{productionRefusal}</RefusalMark>
          )}
          {/* The marker's whole explanation, in the one place there is room for it.
                Says what was measured and what it does not claim; no advice (D6). */}
          {pastFirstCliff(age) && (
            <p className="mt-1.5 text-meta leading-snug text-secondary">
              Turning {firstCliffAge()} costs more dynasty value than any other
              single year before 34, measured across 4,587 NBA player-seasons.
              That discount is already inside the number on the left. What this
              league will pay is a separate question, and five seasons of trades
              cannot answer it.
            </p>
          )}
          <p className="mt-1.5 text-meta leading-snug text-secondary">
            Value is built from consensus rank, then bent by age, injury, role
            and position.{" "}
            <Link
              href="/methodology"
              className="font-semibold text-accent-text underline-offset-2 hover:underline"
            >
              How this is built
            </Link>
          </p>

          {depth?.href && (
            <Link
              href={depth.href}
              className="mt-2 flex min-h-11 items-center justify-between gap-2 rounded-[--radius-sm] border border-border bg-surface px-2.5 text-meta font-semibold text-muted transition-colors hover:border-accent hover:text-accent-text"
            >
              {`Where he sits on ${depth.team}`}
              <ChevronRight size={13} aria-hidden="true" />
            </Link>
          )}

          {/* WHERE HE CAME FROM. Every asset has an answer, including "never traded",
                which is why this link is unconditional and there is no empty state to
                guard against - see lib/provenance's header. */}
          {playerId && (
            <>
              {provenance ? (
                <div className="mt-2 border-t border-border pt-2">
                  {provenance}
                  {/* The rail is already the whole answer here, so this is not a
                        second copy of it - it is the ADDRESS of the answer, which is
                        the one thing an in-row rail cannot be. That address is the
                        thing anybody would paste into a league chat, and until now
                        /roster was the only surface that showed the chain and offered
                        no way to link to it. */}
                  <Link
                    href={playerLineageHref(playerId)}
                    className="mt-1 inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-accent-text"
                  >
                    This chain on its own page
                    <ChevronRight size={13} aria-hidden="true" />
                  </Link>
                </div>
              ) : (
                <Link
                  href={playerLineageHref(playerId)}
                  className="mt-2 flex min-h-11 items-center justify-between gap-2 rounded-[--radius-sm] border border-border bg-surface px-2.5 text-meta font-semibold text-muted transition-colors hover:border-accent hover:text-accent-text"
                >
                  Where he came from
                  <ChevronRight size={13} aria-hidden="true" />
                </Link>
              )}
            </>
          )}
        </div>
      )}
    </li>
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
/** One fact about the player. Deliberately not one factor of the model. */
function Fact({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-meta uppercase tracking-wide text-secondary">
        {label}
      </dt>
      <dd className="truncate figure text-meta font-semibold text-ink">
        {value}
      </dd>
    </div>
  );
}
/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */
const FILTERS = VALUE_FILTERS;
const PAGE = 60;
export function ValuesList({ rows }) {
  // Filters, sort, query and page size all live in the address bar (DECISIONS
  // D30's pattern, applied here): getting back to row 200 after checking a
  // player's dossier used to mean paging all the way back down. Read once at
  // mount via `useState`'s lazy initializer - this never re-derives from a later
  // change to `searchParams` (the mirror below is write-only, on purpose: nothing
  // on this page needs a second render just because it moved the address bar).
  const searchParams = useSearchParams();
  const [initial] = useState(() => {
    const parsed = parseValuesParams(searchParams, PAGE);
    // A `?focus=` link (from search - see lib/values/url.ts) has to land inside
    // the visible page even when the focused player sits below the first PAGE
    // rows, or the deep link would silently show nothing.
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
  // Write-only mirror to the address bar. `history.replaceState` rather than
  // `router.replace`: /values is force-dynamic and its server render reloads the
  // league and revalues every player, so routing on every keystroke or filter tap
  // would pay that whole render again per tap - the exact reasoning D30 recorded
  // for the deleted /web's own URL sync, and it applies unchanged to this page.
  useEffect(() => {
    const state = { pos, q, sort, limit, focus: focusId };
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${valuesQueryString(state, PAGE)}`,
    );
  }, [pos, q, sort, limit, focusId]);
  const counts = useMemo(() => {
    const m = { All: rows.length };
    for (const r of rows) {
      if (!r.position) continue;
      m[r.position] = (m[r.position] ?? 0) + 1;
    }
    return m;
  }, [rows]);
  // ONE RANK SCALE FOR THE WHOLE LIST, off `rows` and never off the filtered subset -
  // a dumbbell has to mean the same thing in two open rows, and an axis that rescaled
  // when somebody typed a name into the search box would make the same 30-place move
  // draw at two different lengths in one session.
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
    const out = rows.filter(
      (r) =>
        (pos === "All" || r.position === pos) &&
        (!s || fold(r.name).includes(s)),
    );
    if (sort === "age") {
      out.sort((a, b) => (a.age ?? 99) - (b.age ?? 99) || b.value - a.value);
    }
    return out;
  }, [rows, pos, q, sort]);
  const shown = filtered.slice(0, limit);
  // The board's own #1 value, the shared scale every row's bar is drawn against.
  // League-wide (from `rows`, not `filtered`) on purpose: a PG-only view keeps the
  // same scale as the full board, so filtering never silently re-inflates the bars.
  const maxValue = useMemo(
    () => Math.max(...rows.map((r) => r.value), 1),
    [rows],
  );
  function reset(fn) {
    fn();
    setLimit(PAGE);
  }
  return (
    <div>
      {/* `.glass` (round 10): the one piece of chrome that genuinely floats over
          scrolling data earns the blur+saturate treatment - see the depth kit's
          note in globals.css. */}
      <div className="glass sticky top-0 z-10 -mx-4 border-b border-border px-4 pb-2 pt-1 sm:-mx-6 sm:px-6">
        <div className="relative">
          <Search
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            value={q}
            onChange={(e) => reset(() => setQ(e.target.value))}
            placeholder={`Search ${rows.length} valued players`}
            aria-label="Search players"
            className="h-11 w-full rounded-full border border-border bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-secondary focus:border-accent focus:outline-none"
          />
        </div>
        <div className="scroll-x mt-1.5 flex items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => reset(() => setPos(f))}
              aria-pressed={pos === f}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors",
                pos === f
                  ? "border-accent bg-accent-wash text-accent-text"
                  : "border-border text-muted hover:border-border-strong",
              )}
            >
              {f}
              {/* Only dimmed against the plain default ground: on the active pill's
                accent-wash fill, opacity-60 pushes text-accent-text's already-tighter
                contrast margin below WCAG AA (caught by axe-core, see e2e/a11y.spec.ts). */}
              <span
                className={cn("figure text-meta", pos !== f && "opacity-60")}
              >
                {counts[f] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Count and sort share a line: always visible, unlike a control parked at
            the end of the horizontally scrolling filter row. */}
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate figure text-meta text-secondary">
          {filtered.length} match{filtered.length === 1 ? "" : "es"} ·{" "}
          {Math.min(limit, filtered.length)} shown
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-meta uppercase tracking-wide text-secondary">
            sort
          </span>
          {["value", "age"].map((s) => (
            <button
              key={s}
              onClick={() => reset(() => setSort(s))}
              aria-pressed={sort === s}
              className={cn(
                "rounded-full border px-2.5 text-xs font-medium transition-colors",
                sort === s
                  ? "border-accent bg-accent-wash text-accent-text"
                  : "border-border text-muted hover:border-border-strong",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-1 space-y-1">
        {shown.map((r, i) => (
          <Fragment key={r.id}>
            {/* TIER SEAMS (round 10). The tiers are computed from where the value
                distribution actually cliffs (this page's own header says so) and
                until now the list rendered straight across them - 260 rows at one
                unbroken rhythm. A labelled seam where the tier changes gives the
                scroll the whitespace beat the data already contains. Value order
                only: under the age sort tiers are not contiguous and a seam would
                lie. aria-hidden - each row already announces its own tier. */}
            {sort === "value" && i > 0 && shown[i - 1].tier !== r.tier && (
              <li
                aria-hidden="true"
                className="flex items-center gap-2 px-1 pb-0.5 pt-2.5"
              >
                <span className="text-meta font-semibold uppercase tracking-[0.16em] text-accent-text">
                  {r.tier}
                </span>
                <span className="rule min-w-0 flex-1" />
              </li>
            )}
            <ValueAssetRow
              rank={i + 1}
              name={r.name}
              team={r.team}
              position={r.position}
              age={r.age}
              value={r.value}
              tier={r.tier}
              playerId={r.id}
              injury={r.injury}
              injuryDetail={r.injuryDetail}
              consensusRank={r.consensusRank}
              pricedRank={r.pricedRank}
              productionBacked={r.productionBacked}
              productionRefusal={r.productionRefusal}
              rankAxisMax={rankAxisMax}
              meta={r.owner ?? undefined}
              depth={r.depth}
              focused={r.id === focusId}
              /* Value as geometry on every row, against the board's own #1 - the
                 whole 260-row curve becomes scannable as bar lengths. And the top
                 of a value-ordered board gets the podium weights: rank #1 is the
                 page's own headline datum and now looks like it. */
              share={r.value / maxValue}
              hero={
                sort === "value"
                  ? i === 0
                    ? "lead"
                    : i < 3
                      ? "podium"
                      : undefined
                  : undefined
              }
            />
          </Fragment>
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">No players match.</p>
      )}

      {filtered.length > shown.length && (
        <button
          onClick={() => setLimit((l) => l + PAGE)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-border bg-surface text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent-text"
        >
          Show {Math.min(PAGE, filtered.length - shown.length)} more
          <span className="figure text-meta text-secondary">
            of {filtered.length}
          </span>
        </button>
      )}
    </div>
  );
}
