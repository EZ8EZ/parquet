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

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar";
import { Sparkline } from "./charts";
import { cn, fmtValue, fold } from "@/lib/ui";
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
          : "border-border bg-surface/60 hover:border-border-strong",
        justArrived && "ring-2 ring-accent",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${name}, value ${fmtValue(value)}. Show details`}
        className="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left"
      >
        {rank != null && (
          <span className="w-5 shrink-0 text-right font-mono text-[11px] tnum text-faint">
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
              <span className="shrink-0 rounded bg-negative/15 px-1 text-[11px] font-semibold leading-tight text-negative">
                {injury}
              </span>
            )}
          </span>
          <span className="mt-px block truncate font-mono text-[11px] tnum text-faint">
            {position ?? "-"}
            {team ? ` · ${team}` : ""}
            {age != null ? ` · ${age}y` : ""}
            {meta ? ` · ${meta}` : ""}
          </span>
          {share != null && (
            <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-elevated">
              <span
                className="block h-full rounded-full bg-accent/70"
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
          <span className="block font-mono text-[13px] font-semibold leading-tight tnum text-ink">
            {fmtValue(value)}
          </span>
          {tier && (
            <span className="block whitespace-nowrap text-[11px] leading-tight text-faint">
              {tier}
            </span>
          )}
        </span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn(
            "shrink-0 text-faint transition-transform",
            open && "rotate-180 text-accent",
          )}
        />
      </button>

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
          </dl>
          <p className="mt-1.5 text-[11px] leading-snug text-faint">
            Value is built from consensus rank, then bent by age, injury, role and
            position.{" "}
            <Link
              href="/methodology"
              className="font-semibold text-accent underline-offset-2 hover:underline"
            >
              How this is built
            </Link>
          </p>
        </div>
      )}
    </li>
  );
}

/** One fact about the player. Deliberately not one factor of the model. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] uppercase tracking-wide text-faint">
        {label}
      </dt>
      <dd className="truncate font-mono text-[11px] font-semibold tnum text-ink">
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
  // for /web's `useWebUrl`, and it applies unchanged to this page's cost profile.
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
            className="h-11 w-full rounded-full border border-border bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
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
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-muted hover:border-border-strong",
              )}
            >
              {f}
              <span className="font-mono text-[11px] tnum opacity-60">
                {counts[f] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Count and sort share a line: always visible, unlike a control parked at
          the end of the horizontally scrolling filter row. */}
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-mono text-[11px] tnum text-faint">
          {filtered.length} match{filtered.length === 1 ? "" : "es"} ·{" "}
          {Math.min(limit, filtered.length)} shown
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-[11px] uppercase tracking-wide text-faint">sort</span>
          {(["value", "age"] as Sort[]).map((s) => (
            <button
              key={s}
              onClick={() => reset(() => setSort(s))}
              aria-pressed={sort === s}
              className={cn(
                "rounded-full border px-2.5 text-xs font-medium transition-colors",
                sort === s
                  ? "border-accent bg-accent/15 text-accent"
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
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-border bg-surface/60 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Show {Math.min(PAGE, filtered.length - shown.length)} more
          <span className="font-mono text-[11px] tnum text-faint">
            of {filtered.length}
          </span>
        </button>
      )}
    </div>
  );
}
