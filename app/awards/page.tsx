import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import {
  AWARD_GROUPS,
  awardsSummary,
  computeAwards,
  type Award,
  type AwardEntrant,
} from "@/lib/superlatives";
import { PageHeader, Card, SectionHeader, Tag, EmptyState } from "@/components/ui";
import { cn } from "@/lib/ui";

export const dynamic = "force-dynamic";

const PLACE = ["2nd", "3rd", "4th"];

function AwardCard({ award, meRosterId }: { award: Award; meRosterId: number | null }) {
  const w = award.winner;
  const isMe =
    meRosterId != null &&
    (w.rosterId === meRosterId || w.partnerRosterId === meRosterId);

  return (
    <Card
      as="article"
      className={cn(
        "transition-colors",
        isMe ? "border-accent/40 bg-accent/[0.06]" : "bg-surface/70",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Trophy
          size={16}
          aria-hidden
          className={cn("mt-1 shrink-0", isMe ? "text-accent" : "text-faint")}
        />
        <div className="min-w-0">
          <h3 className="font-display text-xl font-semibold leading-tight text-ink">
            {award.title}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">{award.subtitle}</p>
        </div>
      </div>

      <Link
        href={`/managers/${w.rosterId}`}
        data-tap
        className={cn(
          "mt-3 flex items-center gap-3 rounded-[--radius-sm] border px-3 py-3 transition-colors",
          isMe
            ? "border-accent/40 bg-accent/[0.07] hover:bg-accent/[0.11]"
            : "border-border-strong bg-surface-2 hover:bg-elevated",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-ink">{w.label}</span>
            {isMe && <Tag tone="accent">that&rsquo;s you</Tag>}
          </div>
          <div className="mt-0.5 text-[11px] text-faint">{w.displayName}</div>
          <div className="mt-1.5 font-mono text-sm font-semibold tnum text-accent">
            {award.statLine}
          </div>
        </div>
        <ChevronRight size={16} aria-hidden className="shrink-0 text-faint" />
      </Link>

      {w.partnerRosterId != null && (
        <Link
          href={`/managers/${w.partnerRosterId}`}
          data-tap
          className="mt-1.5 flex items-center gap-1.5 px-3 text-[11px] font-semibold text-accent"
        >
          also see {w.partnerLabel}
          <ChevronRight size={12} aria-hidden />
        </Link>
      )}

      {award.runnersUp.length > 0 && (
        <>
          <h4 className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
            Runners-up
          </h4>
          <ol className="mt-0.5 divide-y divide-border">
            {award.runnersUp.map((r, i) => (
              <li key={`${r.rosterId}-${r.partnerRosterId ?? ""}`}>
                <RunnerUpRow entrant={r} place={PLACE[i] ?? `${i + 2}th`} meRosterId={meRosterId} />
              </li>
            ))}
          </ol>
        </>
      )}
    </Card>
  );
}

function RunnerUpRow({
  entrant,
  place,
  meRosterId,
}: {
  entrant: AwardEntrant;
  place: string;
  meRosterId: number | null;
}) {
  const isMe =
    meRosterId != null &&
    (entrant.rosterId === meRosterId || entrant.partnerRosterId === meRosterId);
  return (
    <Link
      href={`/managers/${entrant.rosterId}`}
      data-tap
      className="flex min-h-11 items-center gap-2.5 py-2 transition-colors hover:bg-surface-2/60"
    >
      <span className="w-6 shrink-0 font-mono text-[10px] uppercase text-faint">
        {place}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-xs",
          isMe ? "font-semibold text-accent" : "text-muted",
        )}
      >
        {entrant.label}
      </span>
      <span className="shrink-0 font-mono text-[11px] tnum text-faint">
        {entrant.stat}
      </span>
    </Link>
  );
}

export default async function AwardsPage() {
  const h = await getLeagueHistory();
  const awards = computeAwards(h);
  const summary = awardsSummary(h);
  const meRosterId = h.me.rosterId;

  const mine = awards.filter(
    (a) =>
      meRosterId != null &&
      (a.winner.rosterId === meRosterId || a.winner.partnerRosterId === meRosterId),
  );

  return (
    <div>
      <PageHeader
        kicker="League awards"
        title="The Superlatives"
        subtitle={`Every award below is earned, not voted. ${summary.managers} managers, ${summary.seasons} seasons, judged purely on what they actually did.`}
      />

      {awards.length === 0 ? (
        <EmptyState
          icon={<Trophy size={22} aria-hidden />}
          title="Not enough history yet"
          cta={{ href: "/league", label: "See the league" }}
        >
          There aren&rsquo;t enough recorded transactions to hand out awards. Come
          back once the league has some deals on the books.
        </EmptyState>
      ) : (
        <>
          <div className="mb-1 grid grid-cols-3 gap-2.5">
            <Card className="text-center">
              <div className="font-mono text-2xl font-semibold tnum text-accent">
                {awards.length}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-faint">
                awards
              </div>
            </Card>
            <Card className="text-center">
              <div className="font-mono text-2xl font-semibold tnum text-ink">
                {summary.trades}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-faint">
                trades
              </div>
            </Card>
            <Card className="text-center">
              <div className="font-mono text-2xl font-semibold tnum text-ink">
                {summary.moves}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-faint">
                moves
              </div>
            </Card>
          </div>

          {mine.length > 0 && (
            <Card className="mt-2.5 border-accent/30 bg-accent/[0.06]">
              <p className="text-xs leading-relaxed text-muted">
                <span className="font-semibold text-ink">Your mantel:</span>{" "}
                {mine.map((a) => a.title).join(", ")}.
              </p>
            </Card>
          )}

          {AWARD_GROUPS.map((group) => {
            const inGroup = awards.filter((a) => a.group === group.id);
            if (inGroup.length === 0) return null;
            return (
              <section key={group.id}>
                <SectionHeader title={group.label} />
                <div className="space-y-2.5">
                  {inGroup.map((a) => (
                    <AwardCard key={a.id} award={a} meRosterId={meRosterId} />
                  ))}
                </div>
              </section>
            );
          })}

          <p className="mt-8 text-[11px] leading-relaxed text-faint">
            Derived from {summary.moves} recorded transactions across{" "}
            {summary.seasons} seasons. Ties break to the lower roster number.
            Awards with no real signal behind them are left unawarded.
          </p>
        </>
      )}
    </div>
  );
}
