"use client";

/**
 * The asset-value list, plus `ValueAssetRow` - the one dense, tappable asset row
 * shared by /values and /roster.
 *
 * There is deliberately no player detail page (see the scope note in DECISIONS):
 * a player's only interesting story is WHY the model values it the way it does, and
 * that is five numbers. So the row expands in place to show the exact multiplier
 * chain `lib/valuation` returned, and links out to /methodology for the model
 * itself. Expanding beats navigating here - you can open three rows and compare.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar";
import { Sparkline } from "./charts";
import { cn, fmtValue, fold } from "@/lib/ui";

/** The multiplier chain `valuePlayer()` returns, flattened for display. */
export interface AssetBreakdown {
  base: number;
  age: number;
  injury: number;
  role: number;
  position: number;
}

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
  injuryStatus?: string | null;
  breakdown?: AssetBreakdown;
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
  injuryStatus,
  breakdown,
  meta,
  share,
  trajectory,
}: {
  rank?: number;
  name: string;
  team?: string | null;
  position?: string | null;
  age?: number | null;
  value: number;
  tier?: string;
  playerId?: string | null;
  injuryStatus?: string | null;
  breakdown?: AssetBreakdown;
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
}) {
  const [open, setOpen] = useState(false);

  return (
    <li
      className={cn(
        "overflow-hidden rounded-[--radius-sm] border transition-colors",
        open
          ? "border-border-strong bg-surface-2"
          : "border-border bg-surface/60 hover:border-border-strong",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${name}, value ${fmtValue(value)}. Show value breakdown`}
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
            {injuryStatus && (
              <span className="shrink-0 rounded bg-negative/15 px-1 text-[11px] font-semibold leading-tight text-negative">
                {injuryStatus}
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
            <Sparkline values={trajectory} width={48} height={20} />
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
          {breakdown ? (
            <>
              <dl className="grid grid-cols-6 gap-1">
                <Factor label="base" value={fmtValue(breakdown.base)} />
                <Factor label="age" value={`×${breakdown.age.toFixed(2)}`} />
                <Factor label="inj" value={`×${breakdown.injury.toFixed(2)}`} />
                <Factor label="role" value={`×${breakdown.role.toFixed(2)}`} />
                <Factor label="pos" value={`×${breakdown.position.toFixed(2)}`} />
                <Factor label="value" value={fmtValue(value)} accent />
              </dl>
              <p className="mt-1.5 text-[11px] leading-snug text-faint">
                base(rank) x age x injury x role x position.{" "}
                <Link
                  href="/methodology"
                  className="font-semibold text-accent underline-offset-2 hover:underline"
                >
                  How this is built
                </Link>
              </p>
            </>
          ) : (
            <p className="text-[11px] text-faint">
              No breakdown available for this asset.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function Factor({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] uppercase tracking-wide text-faint">
        {label}
      </dt>
      <dd
        className={cn(
          "truncate font-mono text-[11px] font-semibold tnum",
          accent ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

const FILTERS = ["All", "PG", "SG", "SF", "PF", "C"];
const PAGE = 60;

type Sort = "value" | "age";

export function ValuesList({ rows }: { rows: ValueRow[] }) {
  const [pos, setPos] = useState("All");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("value");
  const [limit, setLimit] = useState(PAGE);

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
            injuryStatus={r.injuryStatus}
            breakdown={r.breakdown}
            meta={r.owner ?? undefined}
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
