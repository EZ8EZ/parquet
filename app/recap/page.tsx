import Link from "next/link";
import {
  Activity,
  ChevronRight,
  GitBranch,
  History,
  ScrollText,
  ShieldQuestion,
  Trophy,
} from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { ordinal } from "@/lib/derive/describe";
import { loadSeasonRecap } from "@/lib/recap";
import { notableWaiverLabel } from "@/lib/ledger";
import { EmptyState, PageHeader, SectionHeader, Stat, Tag } from "@/components/ui";
import { AwardBadge, GROUP_TONE, iconForAward } from "@/components/AwardBadge";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { fmtValue } from "@/lib/ui";

export const dynamic = "force-dynamic";

// Same three-way mapping `/managers/compare` and the trade web already use for a
// fragility band - "balanced" is deliberately neutral, not a color judgment.
const FRAGILITY_TONE = {
  resilient: "positive",
  balanced: "neutral",
  brittle: "negative",
} as const;

export default async function RecapPage() {
  const h = await getLeagueHistory();
  const recap = await loadSeasonRecap(h);

  if (!recap) {
    return (
      <div>
        <PageHeader kicker="Season recap" title="No season to recap yet" />
        <EmptyState icon={<ShieldQuestion size={28} />} title="Nothing's finished">
          This league doesn&apos;t have a completed season on record yet - come back
          once one wraps.
        </EmptyState>
      </div>
    );
  }

  const {
    season,
    currentSeasonNote,
    viewerWasOwner,
    record,
    startRate,
    decisions,
    picksResolved,
    awardsHeld,
    timelineToday,
    fragilityToday,
    champion,
  } = recap;

  const possessive = viewerWasOwner ? "Your" : "The";
  const subject = viewerWasOwner ? "you" : "this roster";
  // Same bar as /ledger and the commissioner audit log: trades lead, plus whichever
  // waiver signal actually applies to this league (see notableWaiverLabel) - every
  // small waiver claim is real too but would drown the notable ones, so it's
  // tucked behind a disclosure instead of dropped.
  const waiverLabel = notableWaiverLabel(h);
  const notableDecisions = decisions.filter((d) => d.notable);
  const routineDecisions = decisions.filter((d) => !d.notable);

  return (
    <div>
      <PageHeader
        kicker="Season recap · private"
        title={`The ${season} season`}
        subtitle={
          currentSeasonNote
            ? `This recaps the last season that actually finished. ${currentSeasonNote}`
            : "This recaps the season that just finished."
        }
      />

      {!viewerWasOwner && (
        <p className="-mt-1 mb-2 rounded-[--radius-sm] border border-info/30 bg-info/10 px-2.5 py-1.5 text-[11.5px] leading-snug text-muted">
          You weren&apos;t managing this roster yet in {season} - the numbers below are
          the team&apos;s, not yours, from before you took over.
        </p>
      )}

      {/* How the season ENDED, above the viewer's own numbers on purpose: a recap that
          opens with your record before saying who won the thing buries the headline. */}
      {champion && (
        <div
          className={
            champion.isViewer
              ? "mb-1 rounded-[--radius] border border-accent/45 bg-accent/[0.09] p-3"
              : "mb-1 rounded-[--radius] border border-border bg-surface/60 p-3"
          }
        >
          <div className="flex items-start gap-2.5">
            <Trophy
              size={18}
              aria-hidden="true"
              className={champion.isViewer ? "mt-0.5 shrink-0 text-accent" : "mt-0.5 shrink-0 text-faint"}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
                {season} champion
              </div>
              <div className="mt-0.5 font-display text-[19px] font-semibold leading-tight text-ink">
                {champion.isViewer ? `${champion.name} - you won it` : champion.name}
              </div>
              <p className="mt-0.5 text-[12px] leading-snug text-muted">
                {champion.runnerUpName
                  ? `Beat ${champion.runnerUpName} in the final.`
                  : "Took the title."}
                {champion.viewerPlace != null &&
                  !champion.isViewer &&
                  ` You finished ${ordinal(champion.viewerPlace)} in the playoffs.`}
              </p>
            </div>
          </div>
        </div>
      )}

      <SectionHeader title={`${possessive} record`} />
      <div className="grid grid-cols-3 gap-2.5">
        <Stat
          label="record"
          value={`${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ""}`}
        />
        <Stat
          label="finish"
          value={ordinal(record.rank)}
          sub={`of ${record.teams}`}
        />
        <Stat
          label="lineup mgmt"
          value={startRate ? `${(startRate.rate * 100).toFixed(1)}%` : "-"}
          sub={startRate ? `${fmtValue(startRate.fpts)} of ${fmtValue(startRate.ppts)} pts` : "no data"}
        />
      </div>

      <SectionHeader
        title={`${possessive} decisions that season`}
        action={
          <span className="font-mono text-[11px] tnum text-faint">
            {notableDecisions.length} of {decisions.length}
          </span>
        }
      />
      {notableDecisions.length === 0 ? (
        <EmptyState icon={<ScrollText size={26} />} title="No notable moves">
          No trades or {waiverLabel} recorded for {subject} in {season}
          {routineDecisions.length > 0 ? " - just the smaller moves below." : "."}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-[--radius] border border-border bg-surface/60">
          <ul className="divide-y divide-border">
            {notableDecisions.map((d) => (
              <li key={d.transactionId} className="px-2.5 py-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="w-9 shrink-0 font-mono text-[11px] tnum text-faint">
                    wk {d.week}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                    {d.description}
                  </span>
                </div>
                {d.annotation && (
                  <p className="mt-0.5 pl-11 text-[11px] italic leading-snug text-muted">
                    &quot;{d.annotation.reasoning}&quot;
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {routineDecisions.length > 0 && (
        <details className="mt-2 rounded-[--radius] border border-border bg-surface/60">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12px] font-semibold text-muted">
            <History size={14} className="shrink-0 text-faint" aria-hidden="true" />
            {routineDecisions.length} smaller waiver move
            {routineDecisions.length === 1 ? "" : "s"} this season
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {routineDecisions.map((d) => (
              <li key={d.transactionId} className="px-2.5 py-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="w-9 shrink-0 font-mono text-[11px] tnum text-faint">
                    wk {d.week}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                    {d.description}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <SectionHeader
        title="Traded picks that became players"
        action={
          <span className="font-mono text-[11px] tnum text-faint">
            {picksResolved.length}
          </span>
        }
      />
      {picksResolved.length === 0 ? (
        <EmptyState icon={<GitBranch size={26} />} title="Nothing resolved">
          No traded pick turned into a player during the {season} draft.
        </EmptyState>
      ) : (
        <div className="space-y-1.5">
          {picksResolved.map((p) => (
            <Link
              key={p.key}
              href={`/drafts/${season}`}
              className="flex min-h-11 items-center gap-2 rounded-[--radius-sm] border border-border bg-surface/60 px-2.5 py-1.5 transition-colors hover:bg-surface-2"
            >
              <PlayerAvatar name={p.playerName} team={null} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
                  {p.playerName}
                </span>
                <span className="block truncate text-[11px] leading-tight text-faint">
                  {p.label}
                  {p.position ? ` · ${p.position}` : ""}
                  {" · "}
                  {p.ownerName}
                </span>
              </span>
              <ChevronRight size={13} className="shrink-0 text-faint" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}

      <SectionHeader
        title="Awards you hold"
        href="/awards"
        cta="all awards"
      />
      <p className="-mt-1 mb-1.5 text-[11px] leading-snug text-muted">
        Career standings as of today, not wins from {season} specifically - Superlatives
        has no per-season snapshot.
      </p>
      {awardsHeld.length === 0 ? (
        <EmptyState icon={<Trophy size={26} />} title="No award right now">
          Nothing on the league leaderboard has {subject} in first place at the moment.
        </EmptyState>
      ) : (
        <div className="space-y-1.5">
          {awardsHeld.map((a) => (
            <Link
              key={a.id}
              href="/awards"
              className="flex min-h-11 items-center gap-2 rounded-[--radius-sm] border border-accent/30 bg-surface/60 px-2.5 py-1.5 transition-colors hover:bg-surface-2"
            >
              <AwardBadge icon={iconForAward(a.id)} tone={GROUP_TONE[a.group]} rank="winner" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
                  {a.title}
                </span>
                <span className="block truncate text-[11px] leading-tight text-faint">
                  {a.statLine}
                </span>
              </span>
              <ChevronRight size={13} className="shrink-0 text-faint" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}

      <SectionHeader title="Where things stand today" />
      <p className="-mt-1 mb-1.5 text-[11px] leading-snug text-muted">
        Present-day readings, not a {season} snapshot - this app has no historical
        roster data to recompute either index as of a past date.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        <Link
          href="/league"
          className="rounded-[--radius-sm] border border-border bg-surface/60 p-3 transition-colors hover:bg-surface-2"
        >
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-faint">
            <Activity size={12} aria-hidden="true" />
            timeline
          </div>
          <div className="mt-0.5 font-mono text-xl font-semibold tnum text-ink">
            {timelineToday ? timelineToday.tci.toFixed(0) : "-"}
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted">
            {timelineToday ? (
              <>
                <Tag tone="accent" className="mb-1">
                  {timelineToday.posture}
                </Tag>
                <br />
                {timelineToday.read}
              </>
            ) : (
              "no roster data"
            )}
          </div>
        </Link>
        <Link
          href="/roster"
          className="rounded-[--radius-sm] border border-border bg-surface/60 p-3 transition-colors hover:bg-surface-2"
        >
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-faint">
            <ShieldQuestion size={12} aria-hidden="true" />
            fragility
          </div>
          <div className="mt-0.5 font-mono text-xl font-semibold tnum text-ink">
            {fragilityToday ? fragilityToday.fragility.toFixed(0) : "-"}
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted">
            {fragilityToday ? (
              <Tag tone={FRAGILITY_TONE[fragilityToday.band]}>{fragilityToday.band}</Tag>
            ) : (
              "no roster data"
            )}
          </div>
        </Link>
      </div>
    </div>
  );
}
