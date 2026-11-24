import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Disclosure, SectionHeader } from "@/components/ui";
import { CHART_FIELD, CHART_MARK } from "@/lib/chart-colors";
import { fmt } from "@/lib/lockin/view";
import { historyView } from "@/lib/lockin/matchupView";
import { Habits } from "./Habits";

/**
 * "Your lock history": points per week left on the table against each player's best
 * game that week, split into scores locked before a bigger game and scores held past
 * a bigger one, with n weeks; then how you play, the same facts shown for an
 * opponent. Describes past weeks; never grades them (D6).
 */
export function LockHistory({ history, season }) {
  const v = historyView(history);
  if (!v) return null;
  return (
    <section aria-labelledby="lock-history-title" id="lock-history" className="scroll-mt-20" data-lock-history>
      <SectionHeader id="lock-history-title" title="Your lock history" />
      {!v.ok ? (
        <p className="text-note text-muted">{v.missing}</p>
      ) : (
        <div className="rounded-card bg-surface p-3">
          <p className="flex items-baseline gap-2">
            <span className="figure text-display font-bold text-ink">{fmt(v.perWeek)}</span>
            <span className="text-note text-muted">points a week left on the table</span>
          </p>
          <p className="text-meta text-secondary">{v.nText}, against each player&apos;s best game that week</p>
          {v.earlyPct != null && v.latePct != null && (
            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-elevated" aria-hidden="true">
              <span style={{ width: `${v.earlyPct}%`, background: CHART_MARK }} />
              <span style={{ width: `${v.latePct}%`, background: CHART_FIELD }} />
            </div>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-control bg-surface-2 p-3">
              <dt className="flex items-center gap-1.5 text-meta text-secondary">
                <span aria-hidden="true" className="inline-block size-2.5 rounded-sm" style={{ background: CHART_MARK }} />
                Locked before a bigger game
              </dt>
              <dd className="mt-1 figure text-lede font-bold text-ink">
                {fmt(v.early)} <span className="text-meta font-normal text-muted">a week</span>
              </dd>
            </div>
            <div className="rounded-control bg-surface-2 p-3">
              <dt className="flex items-center gap-1.5 text-meta text-secondary">
                <span aria-hidden="true" className="inline-block size-2.5 rounded-full" style={{ background: CHART_FIELD }} />
                Held past a bigger score
              </dt>
              <dd className="mt-1 figure text-lede font-bold text-ink">
                {fmt(v.late)} <span className="text-meta font-normal text-muted">a week</span>
              </dd>
            </div>
          </dl>
          {v.weeks.length > 0 && (
            <ul className="mt-3 space-y-1.5" aria-label="Points left on the table by week">
              {v.weeks.map((w) => (
                <li key={w.label} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-meta">
                  <span className="text-secondary">{w.label}</span>
                  <span className="h-2 rounded-full bg-elevated" aria-hidden="true">
                    <span className="block h-2 rounded-full" style={{ width: `${Math.max(w.widthPct, 1)}%`, background: CHART_MARK }} />
                  </span>
                  <span className="figure font-semibold text-ink">{fmt(w.value)}</span>
                </li>
              ))}
            </ul>
          )}
          {history.note && (
            <Disclosure summary="How this is counted" className="mt-1">
              <p>{history.note}</p>
              {Number.isFinite(history.slotsCounted) && (
                <p className="mt-1">
                  {history.slotsCounted} slots counted{history.slotsMissing ? `, ${history.slotsMissing} left out (data missing)` : ""}.
                </p>
              )}
            </Disclosure>
          )}
        </div>
      )}
      <h3 className="mt-4 text-body font-semibold text-ink">How you play</h3>
      <div className="mt-2">
        <Habits profile={history.profile} season={season} self emptyText="Too few past weeks to describe your habits yet." />
      </div>
    </section>
  );
}

/** One line for Home linking to the history on /lockin. */
export function LockHistoryLink({ history, href = "/lockin#lock-history" }) {
  const v = historyView(history);
  if (!v?.ok) return null;
  return (
    <Link href={href} className="mt-2 flex min-h-11 items-center justify-between gap-2 text-note text-muted">
      <span>
        Your lock history: <span className="figure font-semibold text-ink">{fmt(v.perWeek)}</span> pts a week left on the table, {v.nText}
      </span>
      <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-accent-text" />
    </Link>
  );
}
