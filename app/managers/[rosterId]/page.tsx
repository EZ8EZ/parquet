import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lightbulb } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { buildDossier } from "@/lib/dossier";
import { PageHeader, Card, Stat, SectionHeader, Tag, DeltaValue } from "@/components/ui";
import { BarChart } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function ManagerDetailPage({
  params,
}: {
  params: Promise<{ rosterId: string }>;
}) {
  const { rosterId: rid } = await params;
  const rosterId = parseInt(rid, 10);
  const h = await getLeagueHistory();
  if (!h.rostersById.has(rosterId)) notFound();

  const d = buildDossier(h, rosterId);
  const p = d.profile;
  const tradesData = p.tradesBySeason.map((s) => ({ label: s.season, value: s.count }));

  return (
    <div>
      <Link href="/managers" className="mb-3 inline-flex items-center gap-1 text-xs text-faint hover:text-accent">
        <ArrowLeft size={14} /> all dossiers
      </Link>
      <PageHeader
        kicker="Dossier"
        title={p.teamName ?? p.displayName}
        subtitle={p.displayName}
      />

      {d.tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {d.tags.map((t) => (
            <Tag key={t} tone="accent">{t}</Tag>
          ))}
        </div>
      )}

      <Card className="mb-4">
        <p className="text-[15px] leading-relaxed text-ink">{d.read}</p>
      </Card>

      <SectionHeader title="How to approach them" />
      <div className="space-y-2">
        {d.approachTips.map((t, i) => (
          <div key={i} className="flex items-start gap-2.5 rounded-[--radius-sm] border border-border bg-surface/60 p-3">
            <Lightbulb size={15} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-sm leading-relaxed text-ink/90">{t}</p>
          </div>
        ))}
      </div>

      <SectionHeader title="The numbers" />
      <div className="grid grid-cols-2 gap-2.5">
        <Stat label="Trades" value={p.trades} sub={`${p.tradesInitiated} initiated, ${p.tradesResponded} responded`} />
        <Stat label="Pick capital" value={<DeltaValue n={p.picks.net} />} sub={`${p.picks.firstsAcquired} firsts in / ${p.picks.firstsSpent} out`} tone={p.picks.net >= 0 ? "positive" : "negative"} />
        <Stat label="Avg acq. age" value={p.acquisitions.avgAge ?? "-"} />
        <Stat label="Waiver/FA moves" value={p.waivers + p.freeAgents} sub={p.faabAggression != null ? `~$${p.faabAggression} avg bid` : undefined} />
      </div>

      {p.afterLoss && p.afterLoss.total > 0 && (
        <Card className="mt-3">
          <div className="text-[11px] uppercase tracking-wide text-faint">After a loss</div>
          <p className="mt-1 text-sm text-ink">
            {p.afterLoss.afterLoss} of {p.afterLoss.total} self-initiated trades came the week after a loss
            {p.afterLoss.afterLoss > p.afterLoss.afterWin ? " - a possible tilt tell." : "."}
          </p>
        </Card>
      )}

      {tradesData.length > 0 && (
        <>
          <SectionHeader title="Trade activity by season" />
          <Card>
            <BarChart data={tradesData} />
          </Card>
        </>
      )}

      {p.tradePartners.length > 0 && (
        <>
          <SectionHeader title="Favorite trade partners" />
          <div className="space-y-1.5">
            {p.tradePartners.slice(0, 5).map((tp) => (
              <div key={tp.rosterId} className="flex items-center justify-between rounded-[--radius-sm] border border-border bg-surface/60 px-3 py-2 text-sm">
                <span className="text-ink">{tp.displayName}</span>
                <span className="font-mono text-muted">{tp.count} deals</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
