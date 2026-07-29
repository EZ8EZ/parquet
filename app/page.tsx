import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookText,
  MessageSquareText,
  Repeat,
  ScrollText,
  Target,
  Users,
} from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getStrategyReport } from "@/lib/strategy";
import { getLedgerSummary } from "@/lib/ledger";
import { Wordmark } from "@/components/Brand";
import { Card, Stat, Tag, SectionHeader, DeltaValue } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const h = await getLeagueHistory();
  const report = getStrategyReport(h);
  const ledger = getLedgerSummary(h);
  const p = report.profile;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <Wordmark tagline="Dynasty memory" />
        {/* Who am I? - switch teams / enter a username. */}
        <Link
          href="/teams"
          className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <Repeat size={13} />
          <span className="max-w-[9rem] truncate">
            {h.me.teamName ?? h.me.displayName}
          </span>
        </Link>
      </div>

      {h.provider === "fixture" && (
        <div className="mb-4">
          <Tag tone="info">Demo data - set LEAGUE_PROVIDER=sleeper for your league</Tag>
        </div>
      )}

      {/* Unannotated decisions badge - a to-do to clear, not paperwork. */}
      {ledger.unannotatedNotable > 0 && (
        <Link href="/ledger" className="mb-5 block">
          <div className="flex items-center justify-between rounded-[--radius] border border-accent/30 bg-accent/10 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-accent">
                <ScrollText size={18} />
              </span>
              <div>
                <div className="text-sm font-semibold text-ink">
                  {ledger.unannotatedNotable} decision
                  {ledger.unannotatedNotable > 1 ? "s" : ""} to capture
                </div>
                <div className="text-xs text-muted">
                  Log why you made them - while you still remember.
                </div>
              </div>
            </div>
            <ArrowRight size={18} className="text-accent" />
          </div>
        </Link>
      )}

      {/* Revealed strategy - the headline, first thing on the screen. */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
        Revealed strategy
      </p>
      <h1 className="mt-1 font-display text-[28px] font-semibold leading-[1.15] text-ink">
        {report.headline}
      </h1>

      {report.contradictions.length > 0 && (
        <div className="mt-4 space-y-3">
          {report.contradictions.slice(0, 2).map((c) => (
            <Card key={c.id} className="border-negative/30 bg-negative/[0.06]">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle size={15} className="text-negative" />
                <span className="text-xs font-semibold uppercase tracking-wide text-negative">
                  Stated vs revealed
                </span>
              </div>
              <p className="text-[15px] leading-relaxed text-ink">{c.narrative}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Tag tone="neutral">said: {c.statedSeason}</Tag>
                <Tag tone="neutral">did: {c.revealedSeason}</Tag>
                <Link
                  href="/ledger"
                  className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
                >
                  see the moves →
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Quick stats */}
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <Stat
          label="Record (curr.)"
          value={`${h.rostersById.get(p.rosterId)?.settings.wins ?? 0}-${
            h.rostersById.get(p.rosterId)?.settings.losses ?? 0
          }`}
        />
        <Stat label="Trades made" value={p.trades} sub={`${p.tradesInitiated} you started`} />
        <Stat
          label="Pick capital"
          value={<DeltaValue n={p.picks.net} />}
          sub={`${p.picks.firstsAcquired} firsts in / ${p.picks.firstsSpent} out`}
          tone={p.picks.net >= 0 ? "positive" : "negative"}
        />
        <Stat
          label="Avg acq. age"
          value={p.acquisitions.avgAge ?? "-"}
          sub={p.overpaysForAge ? "leans veteran" : "leans young"}
        />
      </div>

      {/* Findings */}
      {report.findings.length > 0 && (
        <>
          <SectionHeader title="What your record shows" />
          <ul className="space-y-2.5">
            {report.findings.map((f, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span className="text-ink/90">{f}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Explore */}
      <SectionHeader title="Go deeper" />
      <div className="grid grid-cols-2 gap-2.5">
        <HomeLink href="/plan" icon={<Target size={18} />} title="Game plan" sub="How to improve this team" />
        <HomeLink href="/analyst" icon={<MessageSquareText size={18} />} title="The Analyst" sub="Audit your thinking" />
        <HomeLink href="/managers" icon={<Users size={18} />} title="Dossiers" sub="Scout your rivals" />
        <HomeLink href="/awards" icon={<Award size={18} />} title="League awards" sub="Who's who, statistically" />
        <HomeLink href="/ledger" icon={<ScrollText size={18} />} title="Decision ledger" sub={`${ledger.annotated}/${ledger.notable} annotated`} />
        <HomeLink href="/values" icon={<BookText size={18} />} title="Asset values" sub="Players + picks" />
      </div>

      <p className="mt-8 text-center text-[11px] leading-relaxed text-faint">
        Parquet advises; it can&apos;t act. Sleeper has no write API - every
        recommendation ends in a copyable summary you paste yourself.
      </p>
    </div>
  );
}

function HomeLink({
  href,
  icon,
  title,
  sub,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-2 rounded-[--radius] border border-border bg-surface/70 p-4 transition-colors hover:border-border-strong hover:bg-surface-2"
    >
      <span className="text-accent">{icon}</span>
      <span className="text-sm font-semibold text-ink">{title}</span>
      <span className="text-xs text-faint">{sub}</span>
    </Link>
  );
}
