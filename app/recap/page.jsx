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
import { fragilityTone } from "@/lib/metrics/fragility";
import {
  EmptyState,
  PageHeader,
  SectionHeader,
  Stat,
  Tag,
} from "@/components/ui";
import { MetricGloss } from "@/components/MetricGloss";
import { iconForAward } from "@/components/AwardBadge";
import { AwardMiniCard } from "@/components/AwardTitleCard";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { photosEnabled } from "@/lib/photos";
import { fmtValue } from "@/lib/ui";
import { Onward } from "@/components/Onward";
export const dynamic = "force-dynamic";
export default async function RecapPage() {
  const h = await getLeagueHistory();
  const recap = await loadSeasonRecap(h);
  if (!recap) {
    return (
      <div>
        <PageHeader kicker="Season recap" title="No season to recap yet" />
        <EmptyState
          icon={<ShieldQuestion size={28} />}
          title="Nothing's finished"
        >
          This league doesn&apos;t have a completed season on record yet - come
          back once one wraps.
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
          You weren&apos;t managing this roster yet in {season} - the numbers
          below are the team&apos;s, not yours, from before you took over.
        </p>
      )}

      {/* How the season ENDED, above the viewer's own numbers on purpose: a recap that
            opens with your record before saying who won the thing buries the headline. */}
      {champion && (
        <div
          className={
            champion.isViewer
              ? "mb-1 rounded-[--radius] border border-accent-edge bg-accent-wash p-3"
              : "mb-1 rounded-[--radius] border border-border bg-surface p-3"
          }
        >
          <div className="flex items-start gap-2.5">
            <Trophy
              size={18}
              aria-hidden="true"
              className={
                champion.isViewer
                  ? "mt-0.5 shrink-0 text-accent-text"
                  : "mt-0.5 shrink-0 text-faint"
              }
            />
            <div className="min-w-0 flex-1">
              <div className="text-meta font-semibold uppercase tracking-[0.16em] text-secondary">
                {season} champion
              </div>
              <div className="mt-0.5 font-display text-[19px] font-semibold leading-tight text-ink">
                {champion.isViewer
                  ? `${champion.name} - you won it`
                  : champion.name}
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
          sub={
            startRate
              ? `${fmtValue(startRate.fpts)} of ${fmtValue(startRate.ppts)} pts`
              : "no data"
          }
        />
      </div>

      <SectionHeader
        title={`${possessive} decisions that season`}
        action={
          <span className="figure text-meta text-secondary">
            {notableDecisions.length} of {decisions.length}
          </span>
        }
      />
      {notableDecisions.length === 0 ? (
        <EmptyState icon={<ScrollText size={26} />} title="No notable moves">
          No trades or {waiverLabel} recorded for {subject} in {season}
          {routineDecisions.length > 0
            ? " - just the smaller moves below."
            : "."}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-[--radius] border border-border bg-surface">
          <ul className="divide-y divide-border">
            {notableDecisions.map((d) => (
              <li key={d.transactionId} className="px-2.5 py-1.5">
                {/* `d.description` is a full transaction sentence (`describeTransaction`),
                    the same string /commissioner's audit log prints - and the same reason
                    it does not get `truncate`: a one-line cap was cutting real decisions
                    mid-word ("Parquet Kings claimed Rashad Petrov ($25), d...", "You
                    acquired Khris Middleton for Cam Thoma...", screenshotted live). The
                    row has no fixed height, so it wraps instead of losing the sentence. */}
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 w-9 shrink-0 figure text-meta text-secondary">
                    wk {d.week}
                  </span>
                  <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink">
                    {d.description}
                  </span>
                </div>
                {d.annotation && (
                  <p className="mt-0.5 pl-11 font-display text-meta italic leading-snug text-secondary">
                    &quot;{d.annotation.reasoning}&quot;
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {routineDecisions.length > 0 && (
        <details className="mt-2 rounded-[--radius] border border-border bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12px] font-semibold text-muted">
            <History
              size={14}
              className="shrink-0 text-faint"
              aria-hidden="true"
            />
            {routineDecisions.length} smaller waiver move
            {routineDecisions.length === 1 ? "" : "s"} this season
          </summary>
          <ul className="disclosure-body divide-y divide-border border-t border-border">
            {routineDecisions.map((d) => (
              <li key={d.transactionId} className="px-2.5 py-1.5">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 w-9 shrink-0 figure text-meta text-secondary">
                    wk {d.week}
                  </span>
                  <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink">
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
          <span className="figure text-meta text-secondary">
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
              className="flex min-h-11 items-center gap-2 rounded-[--radius-sm] border border-border bg-surface px-2.5 py-1.5 transition-colors hover:bg-surface-2"
            >
              {/* Same D73 gate as ValueAssetRow and /rank: a monogram disc repeated
                  identically across every resolved pick (31 on a real trade-heavy
                  season here) is decoration, not signal, so it renders only when this
                  deploy has real photos on. */}
              {photosEnabled() && (
                <PlayerAvatar
                  name={p.playerName}
                  team={p.team}
                  playerId={p.playerId}
                  size="sm"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block line-clamp-1 text-[13px] font-semibold leading-tight text-ink">
                  {p.playerName}
                </span>
                {/* Was `truncate`: label + position + owner on one line clipped real
                    team names on this real league ("...Giddler on the Ro...",
                    "...Sweet Home Wembanyama) · SF · Ol...", screenshotted live). */}
                <span className="block text-meta leading-snug text-secondary line-clamp-2">
                  {p.label}
                  {p.position ? ` · ${p.position}` : ""}
                  {" · "}
                  {p.ownerName}
                </span>
              </span>
              <ChevronRight
                size={13}
                className="shrink-0 text-faint"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      )}

      <SectionHeader title="Awards you hold" href="/awards" cta="all awards" />
      <p className="-mt-1 mb-1.5 text-meta leading-snug text-muted">
        Career standings as of today, not wins from {season} specifically -
        Superlatives has no per-season snapshot.
      </p>
      {awardsHeld.length === 0 ? (
        <EmptyState icon={<Trophy size={26} />} title="No award right now">
          Nothing on the league leaderboard has {subject} in first place at the
          moment.
        </EmptyState>
      ) : (
        /*
          The held awards as MINI TITLE CARDS - the same family /awards' posters use
          (VISION M7), at mini scale, so recap and awards read as one system. These
          were already the most fun square inches in the app; now they are small
          posters instead of rows, and nothing on them changed in content: the same
          award title, the same statLine, the same link to /awards. The award's icon
          survives as a gold watermark rather than a toned badge, because a title
          card is monochrome + gold by the family's own rule.
        */
        <div className="grid grid-cols-2 gap-1.5">
          {awardsHeld.map((a) => (
            <AwardMiniCard
              key={a.id}
              href="/awards"
              icon={iconForAward(a.id)}
              title={a.title}
              deck={a.statLine}
            />
          ))}
        </div>
      )}

      <SectionHeader title="Where things stand today" />
      <p className="-mt-1 mb-1.5 text-meta leading-snug text-muted">
        Present-day readings, not a {season} snapshot - this app has no
        historical roster data to recompute either index as of a past date.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        <Link
          href="/league"
          className="rounded-[--radius-sm] border border-border bg-surface p-3 transition-colors hover:bg-surface-2"
        >
          <div className="flex items-center gap-1.5 text-meta uppercase tracking-wide text-faint">
            <Activity size={12} aria-hidden="true" />
            timeline
          </div>
          <div className="mt-0.5 figure text-xl font-semibold text-ink">
            {timelineToday ? timelineToday.tci.toFixed(0) : "-"}
          </div>
          {/*
              The tile keeps its DATA - the index and the posture - and nothing
              else. It used to also print `timelineToday.read`, a five-sentence
              explanation, into this half-width column: ~40 lines of 12px text in a
              ~165px gutter, the worst single tile in the app (VISION kill-list #6).
              The explanation was never wrong, just misplaced - what TCI means lives
              behind the "What TCI and RFI measure" disclosure directly below, and
              the full reading lives on /league where the tile already links.
            */}
          <div className="mt-0.5 text-meta leading-snug text-muted">
            {timelineToday ? (
              <Tag tone="accent">{timelineToday.posture}</Tag>
            ) : (
              "no roster data"
            )}
          </div>
        </Link>
        <Link
          href="/roster"
          className="rounded-[--radius-sm] border border-border bg-surface p-3 transition-colors hover:bg-surface-2"
        >
          <div className="flex items-center gap-1.5 text-meta uppercase tracking-wide text-faint">
            <ShieldQuestion size={12} aria-hidden="true" />
            fragility
          </div>
          <div className="mt-0.5 figure text-xl font-semibold text-ink">
            {fragilityToday ? fragilityToday.fragility.toFixed(0) : "-"}
          </div>
          <div className="mt-0.5 text-meta leading-snug text-muted">
            {fragilityToday ? (
              // Posture-conditioned: brittle is an alarm on a roster playing for this
              // season and a plain description on one that has already sold (D23).
              <Tag
                tone={fragilityTone(
                  fragilityToday.band,
                  timelineToday?.posture,
                )}
              >
                {fragilityToday.band}
              </Tag>
            ) : (
              "no roster data"
            )}
          </div>
        </Link>
      </div>
      {/* Both indexes land here as bare numbers - define them in place, quietly. */}
      <MetricGloss className="mt-1" />
      <Onward from="/recap" />
    </div>
  );
}
