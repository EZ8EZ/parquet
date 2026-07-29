import { CheckCircle2 } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getLedgerEntries, getLedgerSummary } from "@/lib/ledger";
import { LedgerItem } from "@/components/LedgerItem";
import { PageHeader, SectionHeader, Stat, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const h = await getLeagueHistory();
  const entries = getLedgerEntries(h);
  const summary = getLedgerSummary(h);

  const toCapture = entries.filter((e) => e.notable && !e.annotation);
  const captured = entries.filter((e) => e.annotation);

  return (
    <div>
      <PageHeader
        kicker="Decision ledger"
        title="Capture the why"
        subtitle="Record your reasoning at the moment of conviction — not later, when memory has already rewritten it."
      />

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="To capture" value={summary.unannotatedNotable} tone={summary.unannotatedNotable ? "accent" : "neutral"} />
        <Stat label="Captured" value={summary.annotated} tone="positive" />
        <Stat label="Notable" value={summary.notable} />
      </div>

      <SectionHeader title="To capture — newest first" />
      {toCapture.length === 0 ? (
        <EmptyState icon={<CheckCircle2 size={28} />} title="All caught up">
          Every notable decision has your reasoning attached. Come back after your
          next trade.
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
            />
          ))}
        </div>
      )}

      <SectionHeader title="Captured" />
      {captured.length === 0 ? (
        <p className="text-sm text-muted">Nothing captured yet. Start above.</p>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
