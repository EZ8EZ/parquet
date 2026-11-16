import { Activity, GitBranch, ScrollText, ShieldQuestion, Trophy } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { ordinal } from "@/lib/derive/describe";
import { loadSeasonRecap } from "@/lib/recap";
import { notableWaiverLabel } from "@/lib/ledger";
import { fragilityTone } from "@/lib/metrics/fragility";
import { refusalShort } from "@/lib/refusal";
import {
  Card,
  Chip,
  Disclosure,
  EmptyState,
  List,
  ListRow,
  PageHeader,
  RankStrip,
  StatTile,
  Tabs,
} from "@/components/ui";
import { MetricGloss } from "@/components/MetricGloss";
import { iconForAward } from "@/components/AwardBadge";
import { AwardMiniCard } from "@/components/AwardTitleCard";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { photosEnabled } from "@/lib/photos";
import { fmtValue } from "@/lib/ui";
import { Onward } from "@/components/Onward";
export const dynamic = "force-dynamic";
/*
 * SEASON RECAP. The page answers "how did the last finished season go?": who won it,
 * then this roster's record, finish and lineup rate as tiles. The season's decisions,
 * the traded picks that became players, the awards held and today's readings sit in
 * tabs. Everything comes from lib/recap; this page only composes. A recap states what
 * happened, never whether it was a good idea (D6). Awards and the two indexes are
 * present-day readings and say so (no per-season snapshots exist, D19).
 */
function DecisionItem({ d }) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <span className="w-9 shrink-0 figure text-meta text-secondary">wk {d.week}</span>
      <span className="min-w-0 flex-1">
        {/* A full transaction sentence (`describeTransaction`): wraps, never clipped. */}
        <span className="block text-note text-ink">{d.description}</span>
        {d.annotation && (
          <span className="mt-0.5 block text-meta text-secondary">&ldquo;{d.annotation.reasoning}&rdquo;</span>
        )}
      </span>
    </li>
  );
}

export default async function RecapPage() {
  const h = await getLeagueHistory();
  const recap = await loadSeasonRecap(h);
  if (!recap) {
    return (
      <div>
        <PageHeader kicker="Season recap" title="No season to recap yet" />
        <EmptyState icon={<ShieldQuestion size={28} />} title="Nothing's finished">
          This league has no completed season on record yet.
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
  const subject = viewerWasOwner ? "you" : "this roster";
  const waiverLabel = notableWaiverLabel(h);
  const notableDecisions = decisions.filter((d) => d.notable);
  const routineDecisions = decisions.filter((d) => !d.notable);

  const decisionsPanel = (
    <>
      <h2 className="sr-only">Moves in {season}</h2>
      {notableDecisions.length === 0 ? (
        <EmptyState icon={<ScrollText size={26} />} title="No notable moves">
          No trades or {waiverLabel} recorded for {subject} in {season}.
        </EmptyState>
      ) : (
        <List aria-label={`Notable decisions in ${season}`}>
          {notableDecisions.map((d) => (
            <DecisionItem key={d.transactionId} d={d} />
          ))}
        </List>
      )}
      {routineDecisions.length > 0 && (
        <Disclosure
          className="mt-1"
          summary={`${routineDecisions.length} smaller waiver ${routineDecisions.length === 1 ? "move" : "moves"}`}
          bodyClassName="p-0 bg-transparent"
        >
          <List>
            {routineDecisions.map((d) => (
              <DecisionItem key={d.transactionId} d={d} />
            ))}
          </List>
        </Disclosure>
      )}
    </>
  );

  const picksPanel = (
    <>
      <h2 className="sr-only">Traded picks that became players</h2>
      {picksResolved.length === 0 ? (
      <EmptyState icon={<GitBranch size={26} />} title="Nothing resolved">
        No traded pick turned into a player during the {season} draft.
      </EmptyState>
    ) : (
      <List aria-label="Traded picks that became players">
        {picksResolved.map((p) => (
          <li key={p.key}>
            <ListRow
              href={`/drafts/${season}`}
              avatar={
                photosEnabled() ? (
                  <PlayerAvatar name={p.playerName} team={p.team} playerId={p.playerId} size="sm" />
                ) : null
              }
              title={p.playerName}
              meta={`${p.label}${p.position ? ` · ${p.position}` : ""} · ${p.ownerName}`}
            />
          </li>
        ))}
      </List>
      )}
    </>
  );

  const awardsPanel = (
    <>
      <h2 className="mb-2 text-meta font-normal text-secondary">Awards held: career standings as of today, not {season} wins</h2>
      {awardsHeld.length === 0 ? (
        <EmptyState icon={<Trophy size={26} />} title="No award right now" cta={{ href: "/awards", label: "All awards" }}>
          Nothing on the leaderboard has {subject} in first place.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {awardsHeld.map((a) => (
            <AwardMiniCard key={a.id} href="/awards" icon={iconForAward(a.id)} title={a.title} deck={a.statLine} />
          ))}
        </div>
      )}
    </>
  );

  const fragValue = fragilityToday
    ? fragilityToday.fragility != null
      ? fragilityToday.fragility.toFixed(0)
      : refusalShort(fragilityToday.refusal)
    : "unknown";
  const todayPanel = (
    <>
      <h2 className="mb-2 text-meta font-normal text-secondary">Today: present-day readings, not a {season} snapshot</h2>
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          href="/league"
          label="Timeline (TCI)"
          value={timelineToday ? timelineToday.tci.toFixed(0) : "unknown"}
          visual={
            timelineToday ? (
              <Chip size="sm" tone="accent" icon={Activity}>
                {timelineToday.posture}
              </Chip>
            ) : null
          }
          sub={timelineToday ? null : "no roster data"}
        />
        <StatTile
          href="/roster"
          label="Fragility"
          value={fragValue}
          visual={
            fragilityToday?.fragility != null ? (
              <Chip size="sm" tone={fragilityTone(fragilityToday.band, timelineToday?.posture)}>
                {fragilityToday.band}
              </Chip>
            ) : null
          }
          sub={fragilityToday ? (fragilityToday.fragility != null ? null : "no reading") : "no roster data"}
        />
      </div>
      <MetricGloss className="mt-1" />
    </>
  );

  return (
    <div>
      <PageHeader
        kicker="Season recap · private"
        title={`The ${season} season`}
        subtitle={viewerWasOwner ? "The last season that finished" : `Before you took over this roster`}
      />
      {(currentSeasonNote || !viewerWasOwner) && (
        <Disclosure className="-mt-3 mb-1" summary="Which season this is">
          {currentSeasonNote && <p>This recaps the last season that actually finished. {currentSeasonNote}</p>}
          {!viewerWasOwner && (
            <p className={currentSeasonNote ? "mt-2" : undefined}>
              You weren&apos;t managing this roster yet in {season}; the numbers are the team&apos;s, not yours.
            </p>
          )}
        </Disclosure>
      )}

      {champion && (
        <Card tone={champion.isViewer ? "accent" : "default"} className="mb-2">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent-text">
              <Trophy size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-meta font-medium text-secondary">{season} champion</p>
              <p className="text-lede font-bold text-ink">
                {champion.name}
                {champion.isViewer && (
                  <Chip size="sm" tone="accent" className="ml-2 align-middle">
                    You
                  </Chip>
                )}
              </p>
              <p className="mt-0.5 text-note text-muted">
                {champion.runnerUpName ? `Beat ${champion.runnerUpName} in the final.` : "Took the title."}
                {champion.viewerPlace != null &&
                  !champion.isViewer &&
                  ` You finished ${ordinal(champion.viewerPlace)} in the playoffs.`}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-2">
        <StatTile
          size="sm"
          label="Record"
          value={`${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ""}`}
        />
        <StatTile
          size="sm"
          label="Finish"
          value={ordinal(record.rank)}
          sub={`of ${record.teams}`}
          visual={<RankStrip rank={record.rank} of={record.teams} />}
        />
        <StatTile
          size="sm"
          label="Lineup rate"
          value={startRate ? `${(startRate.rate * 100).toFixed(1)}%` : "unknown"}
          sub={startRate ? `${fmtValue(startRate.fpts)} of ${fmtValue(startRate.ppts)}` : "no data"}
        />
      </div>

      <Tabs
        className="mt-4"
        label="Season detail"
        items={[
          { id: "moves", label: "Moves", count: notableDecisions.length, content: decisionsPanel },
          { id: "picks", label: "Picks", count: picksResolved.length, content: picksPanel },
          { id: "awards", label: "Awards", count: awardsHeld.length, content: awardsPanel },
          { id: "today", label: "Today", content: todayPanel },
        ]}
      />
      <Onward from="/recap" />
    </div>
  );
}
