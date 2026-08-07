import Link from "next/link";
import { CheckCircle2, ChevronRight, Eye, KeyRound } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getLedgerEntries, getLedgerSummary, notableWaiverLabel } from "@/lib/ledger";
import { captureBlock, readSeat } from "@/lib/auth/server";
import { LedgerItem } from "@/components/LedgerItem";
import { PageHeader, SectionHeader, Stat, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const h = await getLeagueHistory();
  const seat = await readSeat();
  // Two different reasons a reader cannot write here, and they need two different
  // sentences: one is "nobody has given you a link", the other is "you are looking
  // at someone else's team right now". In legacy mode this is null and the page is
  // exactly what it always was.
  const blocked = captureBlock(seat, h.me.userId);
  const entries = getLedgerEntries(h);
  const summary = getLedgerSummary(h);
  const waiverLabel = notableWaiverLabel(h);

  const toCapture = entries.filter((e) => e.notable && !e.annotation);
  const captured = entries.filter((e) => e.annotation);

  return (
    <div>
      <PageHeader
        kicker="Decision ledger"
        title={blocked ? "The record" : "Capture the why"}
        subtitle={
          blocked
            ? "Every notable move this team has made. The reasoning behind them is private to the manager who wrote it, so none of it is shown here."
            : "Record your reasoning at the moment of conviction - not later, when memory has already rewritten it."
        }
      />

      {blocked === "other-lens" && (
        <div className="mb-3 flex items-start gap-2.5 rounded-[--radius-sm] border border-border bg-surface/60 px-2.5 py-2">
          <Eye size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-faint" />
          <p className="min-w-0 text-[11px] leading-relaxed text-muted">
            You are viewing {h.me.teamName ?? h.me.displayName}. Captured reasoning
            belongs to whoever wrote it, so yours is hidden here too - switch back to
            your own team to see and edit it.
          </p>
        </div>
      )}

      {blocked === "unclaimed" && (
        <div className="mb-3 flex items-start gap-2.5 rounded-[--radius-sm] border border-border bg-surface/60 px-2.5 py-2">
          <KeyRound size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-faint" />
          <p className="min-w-0 text-[11px] leading-relaxed text-muted">
            This browser has not claimed a seat, so it cannot write as anyone. Ask the
            commissioner for your claim link - it takes one tap and no password.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <Stat
          label={blocked ? "Uncaptured" : "To capture"}
          value={summary.unannotatedNotable}
          tone={!blocked && summary.unannotatedNotable ? "accent" : "neutral"}
        />
        <Stat label="Captured" value={summary.annotated} tone="positive" />
        <Stat label="Notable" value={summary.notable} />
      </div>
      <p className="-mt-1 mb-2 text-[11px] leading-snug text-muted">
        Notable means every trade, plus {waiverLabel} - the same bar the
        commissioner audit log and season recap use.
      </p>

      <SectionHeader
        title={blocked ? "Uncaptured - newest first" : "To capture - newest first"}
      />
      {toCapture.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={28} />}
          title={blocked ? "Nothing notable yet" : "All caught up"}
        >
          {blocked
            ? "This team has made no trades or notable waiver claims."
            : "Every notable decision has your reasoning attached. Come back after your next trade."}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {toCapture.map((e) => (
            <LedgerItem
              key={e.transactionId}
              transactionId={e.transactionId}
              description={e.description}
              season={e.season}
              week={e.week}
              type={e.type}
              initialReasoning={null}
              initialPosture={null}
              readOnly={blocked != null}
            />
          ))}
        </div>
      )}

      <SectionHeader title="Captured" />
      {captured.length === 0 ? (
        <p className="text-sm text-muted">
          {blocked
            ? "Nothing of yours is readable from here."
            : "Nothing captured yet. Start above."}
        </p>
      ) : (
        <div className="space-y-3">
          {captured.map((e) => (
            <LedgerItem
              key={e.transactionId}
              transactionId={e.transactionId}
              description={e.description}
              season={e.season}
              week={e.week}
              type={e.type}
              initialReasoning={e.annotation!.reasoning}
              initialPosture={e.annotation!.posture}
              readOnly={blocked != null}
            />
          ))}
        </div>
      )}

      {blocked === "unclaimed" && (
        <p className="mt-4 text-center text-[11px] leading-relaxed text-faint">
          Everything else in Parquet is public league data.{" "}
          <Link
            href="/about"
            className="inline-flex min-h-11 items-center gap-0.5 font-semibold text-muted underline-offset-2 hover:text-accent hover:underline"
          >
            What this is
            <ChevronRight size={12} aria-hidden="true" />
          </Link>
        </p>
      )}
    </div>
  );
}
