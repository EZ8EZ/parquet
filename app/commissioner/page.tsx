import Link from "next/link";
import {
  ChevronRight,
  Hourglass,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getTradedPickLineages } from "@/lib/lineage";
import { getAuditLog, getStaleRosters, type AuditEntry } from "@/lib/commissioner";
import { notableWaiverLabel } from "@/lib/ledger";
import { EmptyState, PageHeader, SectionHeader, Tag } from "@/components/ui";
import { cn, fmtValue } from "@/lib/ui";
import { LineageCard } from "../drafts/parts";
import { SeatLinks } from "./seats";

export const dynamic = "force-dynamic";

const TYPE_TONE: Record<string, "accent" | "info" | "neutral"> = {
  trade: "accent",
  waiver: "info",
};

/** One audit-log row: date, type, the ledger's own neutral copy, and a link to
 *  wherever this transaction actually lives - the trade web for a trade, the
 *  manager who made the move for everything else. No inline detail beyond that
 *  one line, on purpose - see lib/commissioner.ts for why this isn't a second
 *  ledger. */
function AuditRow({ e }: { e: AuditEntry }) {
  const href = e.tradeHref ?? (e.rosterId != null ? `/managers/${e.rosterId}` : null);
  const inner = (
    <>
      <span className="w-11 shrink-0 font-mono text-[11px] tnum text-faint">
        wk {e.week}
      </span>
      <Tag tone={TYPE_TONE[e.type] ?? "neutral"} className="shrink-0">
        {e.type.replace("_", " ")}
      </Tag>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
        {e.description}
      </span>
      {href && <ChevronRight size={13} className="shrink-0 text-faint" aria-hidden="true" />}
    </>
  );
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="flex min-h-11 items-center gap-2 px-2.5 py-1 transition-colors hover:bg-surface-2"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex min-h-11 items-center gap-2 px-2.5 py-1">{inner}</div>
      )}
    </li>
  );
}

export default async function CommissionerPage() {
  const h = await getLeagueHistory();
  const lineages = await getTradedPickLineages(h);
  const unresolvedPicks = lineages.filter((l) => !l.resolved);
  // A pick waiting on a future or in-progress draft is completely normal - the actual
  // health signal is a pick that CAN'T resolve: the team that owned the slot left the
  // league, or the recorded pick carries no player. Splitting these keeps "needs a
  // look" from being buried under dozens of routine future picks.
  const stuckPicks = unresolvedPicks.filter(
    (l) => l.reason === "slot-unknown" || l.reason === "no-player",
  );
  // The complement, not a second allowlist: UnresolvedReason has more values than
  // the two "stuck" ones (no-draft, not-yet-drafted, and no-draft-support on a
  // provider without drafts), and a pick that matched neither list would silently
  // vanish from a page whose whole premise is that nothing gets silently dropped.
  const pendingPicks = unresolvedPicks.filter(
    (l) => l.reason !== "slot-unknown" && l.reason !== "no-player",
  );
  const staleRosters = getStaleRosters(h);
  const auditLog = getAuditLog(h);
  const waiverLabel = notableWaiverLabel(h);

  const bySeason = new Map<string, AuditEntry[]>();
  for (const e of auditLog) {
    const list = bySeason.get(e.season) ?? [];
    list.push(e);
    bySeason.set(e.season, list);
  }
  const seasonsDesc = [...bySeason.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <div>
      <PageHeader
        kicker="Commissioner tools"
        title="League health & audit log"
        subtitle="A dashboard, not a second ledger - every row here points at the surface that already owns the full story. Trade-veto history isn't included: Sleeper doesn't expose it reliably enough to show without risking a silent gap."
      />

      {/* First, because handing the app to the league is a one-time act that has to
          be findable, and everything below it is a recurring check. */}
      <SeatLinks h={h} />

      <SectionHeader
        title="Stale rosters"
        action={
          <Tag tone={staleRosters.length ? "warn" : "positive"}>
            {staleRosters.length ? `${staleRosters.length} flagged` : "all clear"}
          </Tag>
        }
      />
      {staleRosters.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={26} />} title="Every roster looks active">
          No empty starting slots and every team has moved this season.
        </EmptyState>
      ) : (
        <>
          {h.rosters.length > 0 && staleRosters.length / h.rosters.length > 0.75 && (
            <p className="mb-2 text-[12px] leading-snug text-muted">
              Most of the league is quiet right now. That is the offseason lull,
              not a pile of separate problems.
            </p>
          )}
          <div className="space-y-1.5">
            {staleRosters.map((r) => (
              <Link
                key={r.rosterId}
                href={`/managers/${r.rosterId}`}
                className="flex min-h-11 items-center gap-2 rounded-[--radius-sm] border border-warn/30 bg-surface/60 px-2.5 py-1.5 transition-colors hover:bg-surface-2"
              >
                <ShieldAlert size={15} className="shrink-0 text-warn" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
                    {r.name}
                  </span>
                  <span className="block truncate text-[11px] leading-tight text-muted">
                    {r.reasons.map((x) => x.detail).join(" · ")}
                  </span>
                </span>
                <ChevronRight size={13} className="shrink-0 text-faint" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </>
      )}

      <SectionHeader
        title="Picks that can't resolve"
        action={
          <Tag tone={stuckPicks.length ? "negative" : "positive"}>
            {stuckPicks.length ? `${stuckPicks.length} need a look` : "all clear"}
          </Tag>
        }
      />
      {stuckPicks.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={26} />} title="Nothing stuck">
          No traded pick is orphaned (the original team left the league) or recorded
          without a player.
        </EmptyState>
      ) : (
        <div className="space-y-1.5">
          {stuckPicks.map((l) => (
            <LineageCard key={`${l.season}-${l.round}-${l.originalRoster}`} l={l} />
          ))}
        </div>
      )}

      {pendingPicks.length > 0 && (
        <details className="mt-2 rounded-[--radius] border border-border bg-surface/60">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12px] font-semibold text-muted">
            <Hourglass size={14} className="shrink-0 text-faint" aria-hidden="true" />
            {pendingPicks.length} more traded pick{pendingPicks.length === 1 ? "" : "s"}{" "}
            waiting on a future or in-progress draft - normal, not a health issue
          </summary>
          <div className="space-y-1.5 border-t border-border p-1.5">
            {pendingPicks.map((l) => (
              <LineageCard key={`${l.season}-${l.round}-${l.originalRoster}`} l={l} />
            ))}
          </div>
        </details>
      )}

      <SectionHeader
        title="Transaction audit log"
        action={
          <span className="font-mono text-[11px] tnum text-faint">
            {fmtValue(auditLog.length)} of {fmtValue(h.transactions.length)}
          </span>
        }
      />
      <p className="-mt-1 mb-1.5 text-[11px] leading-snug text-muted">
        Trades and {waiverLabel}, across every team - the same bar the ledger
        uses for what counts as notable. Everything else is real activity too, just not
        the kind a commissioner needs a checklist for.
      </p>
      {auditLog.length === 0 ? (
        <EmptyState icon={<ScrollText size={26} />} title="No notable moves yet">
          Trades and {waiverLabel} will show up here as they happen.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {seasonsDesc.map((season) => (
            <div
              key={season}
              className="overflow-hidden rounded-[--radius] border border-border bg-surface/60"
            >
              <div className="flex items-center justify-between border-b border-border px-2.5 py-1">
                <span className="font-mono text-[12px] font-semibold tnum text-ink">
                  {season}
                </span>
                <span className="font-mono text-[11px] tnum text-faint">
                  {bySeason.get(season)!.length}
                </span>
              </div>
              <ul className={cn("divide-y divide-border")}>
                {bySeason.get(season)!.map((e) => (
                  <AuditRow key={e.transactionId} e={e} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
