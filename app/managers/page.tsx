import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getAllDossiers } from "@/lib/dossier";
import { PageHeader, Card, Tag } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ManagersPage() {
  const h = await getLeagueHistory();
  const dossiers = getAllDossiers(h);

  return (
    <div>
      <PageHeader
        kicker="Manager dossiers"
        title="Scout the managers"
        subtitle="Behavioral profiles from transaction history. This is manager scouting - how they act - not roster scouting."
      />

      <Card className="mb-5 border-warn/30 bg-warn/[0.06]">
        <div className="flex items-start gap-2.5">
          <Lock size={16} className="mt-0.5 shrink-0 text-warn" />
          <p className="text-xs leading-relaxed text-muted">
            <span className="font-semibold text-ink">Private to you.</span> These
            reads are inferred from public transactions but are not meant to be
            shared or exported. Keep your edge to yourself.
          </p>
        </div>
      </Card>

      <div className="space-y-2.5">
        {dossiers.map((d) => (
          <Link
            key={d.profile.rosterId}
            href={`/managers/${d.profile.rosterId}`}
            className="block rounded-[--radius] border border-border bg-surface/60 p-4 transition-colors hover:border-border-strong hover:bg-surface-2"
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">
                  {d.profile.teamName ?? d.profile.displayName}
                </div>
                <div className="text-[11px] text-faint">{d.profile.displayName}</div>
              </div>
              <ArrowRight size={16} className="shrink-0 text-faint" />
            </div>
            {d.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {d.tags.slice(0, 3).map((t) => (
                  <Tag key={t} tone="neutral">{t}</Tag>
                ))}
              </div>
            )}
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">
              {d.read}
            </p>
            <div className="mt-2 flex gap-3 text-[11px] text-faint">
              <span>{d.profile.trades} trades</span>
              <span>{d.tradesPerSeason}/season</span>
              <span>{d.profile.totalTransactions} total moves</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
