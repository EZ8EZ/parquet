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

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Route, Search } from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar";
import { Sparkline } from "./charts";
import { cn, fmtValue, fold } from "@/lib/ui";
import { playerLineageHref } from "@/lib/tradegraph/url";
import { firstCliffAge, pastFirstCliff } from "@/lib/valuation/ageCurve";
import {
  VALUE_FILTERS,
  parseValuesParams,
  valuesQueryString,
  type ValueFilter,
  type ValueSort,
} from "@/lib/values/url";

export interface ValueRow {
  id: string;
  name: string;
  team: string | null;
  position: string | null;
  age: number | null;
  value: number;
  tier: string;
  espnId: string | null;
  owner?: string | null;
  /**
   * SHORT `injuryLabel()` output ("Knee"), for the collapsed badge. Short because the
   * badge sits beside the name on a 390px row and "Hamstring · Strain" truncates the
   * name to make room; the full version lives in `injuryDetail`, one tap away.
   */
  injury?: string | null;
  /** Full `injuryLabel()` output ("Knee · Surgery"), for the expanded row. */
  injuryDetail?: string | null;
  /** Sleeper's consensus rank. A fact about the player, not a model output. */
  consensusRank?: number | null;
}

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
  meta,
  share,
  trajectory,
  trajectoryColor,
  focused,
  provenance,
}: {
  rank?: number;
  name: string;
  team?: string | null;
  position?: string | null;
  age?: number | null;
  value: number;
  tier?: string;
  playerId?: string | null;
  /** SHORT injury label ("Knee") - the badge shares a 390px row with the name. */
  injury?: string | null;
  /** Full injury label ("Knee · Surgery"), shown in the expanded row. */
  injuryDetail?: string | null;
  /** Sleeper's consensus rank. A fact about the player, not a model output. */
  consensusRank?: number | null;
  /** Extra fact for the meta line (e.g. an owner name). */
  meta?: string | null;
  /** Share of the parent roster's player value, 0-1. Renders as a spine bar. */
  share?: number;
  /**
   * Optional value trajectory (present-day first) for an inline sparkline.
   * Nobody is required to pass this - there is no stored value history, so a
   * caller only supplies it when it has a real, defensible series to show.
   */
  trajectory?: number[];
  /** Optional override color for the trajectory sparkline (CSS variable). */
  trajectoryColor?: string;
  /**
   * This is the row a `?focus=` link landed on (see lib/values/url.ts). Arrives
   * open, scrolls itself into view once, and carries a brief highlight ring that
   * fades on its own - `open`/`justArrived` both seed from this prop instead of
   * always starting closed, which is the one-time nudge a deep link needs and
   * nothing more (it never re-fires just because the row re-renders).
   */
  focused?: boolean;
  /**
   * A pre-rendered provenance rail (components/ProvenanceRail.tsx), shown inside the
   * expansion. This row is a CLIENT component and the rail is a server one, so it
   * arrives as a node rather than being built here - which is also the reason /values
   * passes nothing: that list is assembled client-side from `ValueRow` data, so there
   * is no server render to hang a rail off. Those rows get the link below instead,
   * which every row gets regardless.
   */
  provenance?: ReactNode;
}) {
  const [open, setOpen] = useState(!!focused);
  const [justArrived, setJustArrived] = useState(!!focused);
  const liRef = useRef<HTMLLIElement>(null);

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
        "overflow-hidden rounded-[--radius-sm] border transition-colors duration-700",
        open
          ? "border-border-strong bg-surface-2"
          : "border-border bg-surface hover:border-border-strong",
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
      <div className="flex items-stretch">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${name}, value ${fmtValue(value)}. Show details`}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1.5 text-left"
      >
        {rank != null && (
          <span className="w-5 shrink-0 text-right figure text-meta text-secondary">
            {rank}
          </span>
        )}
        <PlayerAvatar name={name} team={team} playerId={playerId} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold leading-tight text-ink">
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
            tightest real row here - a long name, a sparkline, and "High-End Rotation"
            in the value column - a shrink-0 anything overruns the sparkline and eats
            the position code on its way. As plain text it truncates with everything
            else and cannot break the row at any width.

            One word, in the same secondary voice as the rest of the line. Not a badge,
            not red, and not competing with the injury chip above it: the injury chip
            is a warning, this is a coordinate on a published curve. It sits before
            `meta` so the owner's name is what gives way first, and colour does no
            encoding at all here, which is the point.
          */}
          <span className="mt-px block truncate figure text-meta text-secondary">
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
            {meta ? ` · ${meta}` : ""}
          </span>
          {share != null && (
            <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-elevated">
              <span
                className="block h-full rounded-full bg-accent-strong"
                style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
              />
            </span>
          )}
        </span>
        {trajectory && trajectory.length > 1 && (
          <span className="shrink-0" aria-hidden="true">
            <Sparkline values={trajectory} width={48} height={20} color={trajectoryColor} />
          </span>
        )}
        <span className="shrink-0 text-right">
          <span className="block figure text-[13px] font-semibold leading-tight text-ink">
            {fmtValue(value)}
          </span>
          {tier && (
            <span className="block whitespace-nowrap text-meta leading-tight text-secondary">
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
            <Fact
              label="consensus"
              value={consensusRank != null ? `#${consensusRank}` : "unranked"}
            />
            <Fact label="tier" value={tier ?? "-"} />
            {(injuryDetail ?? injury) && (
              <Fact label="injury" value={(injuryDetail ?? injury)!} />
            )}
            {age != null && <Fact label="age" value={`${age}`} />}
            {pastFirstCliff(age) && (
              <Fact
                label="age curve"
                value={`downslope, past ${firstCliffAge()}`}
              />
            )}
          </dl>
          {/* The marker's whole explanation, in the one place there is room for it.
              Says what was measured and what it does not claim; no advice (D6). */}
          {pastFirstCliff(age) && (
            <p className="mt-1.5 text-meta leading-snug text-secondary">
              Turning {firstCliffAge()} costs more dynasty value than any other single
              year before 34, measured across 4,587 NBA player-seasons. That discount
              is already inside the number on the left. What this league will pay is a
              separate question, and five seasons of trades cannot answer it.
            </p>
          )}
          <p className="mt-1.5 text-meta leading-snug text-secondary">
            Value is built from consensus rank, then bent by age, injury, role and
            position.{" "}
            <Link
              href="/methodology"
              className="font-semibold text-accent-text underline-offset-2 hover:underline"
            >
              How this is built
            </Link>
          </p>

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

/** One fact about the player. Deliberately not one factor of the model. */
function Fact({ label, value }: { label: string; value: string }) {
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

type Sort = ValueSort;

export function ValuesList({ rows }: { rows: ValueRow[] }) {
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
  const [pos, setPos] = useState<ValueFilter>(initial.pos);
  const [q, setQ] = useState(initial.q);
  const [sort, setSort] = useState<Sort>(initial.sort);
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
    const m: Record<string, number> = { All: rows.length };
    for (const r of rows) {
      if (!r.position) continue;
      m[r.position] = (m[r.position] ?? 0) + 1;
    }
    return m;
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

  function reset(fn: () => void) {
    fn();
    setLimit(PAGE);
  }

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-4 border-b border-border bg-bg/95 px-4 pb-2 pt-1 backdrop-blur sm:-mx-6 sm:px-6">
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
              <span className={cn("figure text-meta", pos !== f && "opacity-60")}>
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
          <span className="text-meta uppercase tracking-wide text-secondary">sort</span>
          {(["value", "age"] as Sort[]).map((s) => (
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
          <ValueAssetRow
            key={r.id}
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
            meta={r.owner ?? undefined}
            focused={r.id === focusId}
          />
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
