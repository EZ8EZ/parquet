import Link from "next/link";
import { ArrowRight, GitBranch, Hourglass, Layers } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import {
  buildDraftIndex,
  getDraftSeasons,
  getTradedPickLineages,
} from "@/lib/lineage";
import {
  Card,
  EmptyState,
  PageHeader,
  SectionHeader,
  Stat,
  Tag,
} from "@/components/ui";
import { LineageCard } from "./parts";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const h = await getLeagueHistory();
  // One index, shared by all three reads below - drafts are the expensive part.
  const index = await buildDraftIndex(h);
  const [seasons, all] = await Promise.all([
    getDraftSeasons(h, { index }),
    getTradedPickLineages(h, { index }),
  ]);

  const me = h.me.rosterId;
  // Direction matters more than involvement: "what did the pick I traded away
  // become?" is a different (and more interesting) question than "what did the pick
  // I acquired become?".
  const gave = all.filter((l) => me != null && l.fromRoster === me);
  const got = all.filter((l) => me != null && l.toRoster === me);
  const mine = new Set([...gave, ...got]);

  const gaveResolved = gave.filter((l) => l.resolved);
  const gotResolved = got.filter((l) => l.resolved);
  const mineOpen = [...mine].filter((l) => !l.resolved);
  const leagueResolved = all.filter((l) => l.resolved && !mine.has(l));

  const noDrafts = !index.supported || seasons.length === 0;

  return (
    <div>
      <PageHeader
        kicker="Pick lineage"
        title="What that pick became"
        subtitle="Every traded pick, traced to the player it actually turned into - then straight into that draft to see the picks around it."
      />

      {noDrafts ? (
        <EmptyState icon={<Layers size={28} />} title="No draft data">
          {!index.supported
            ? "The active data source doesn't expose drafts. Switch to the Sleeper or fixture provider to trace pick lineage."
            : "This league has no drafts on record yet."}
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <Stat
              label="Gave up"
              value={gaveResolved.length}
              tone={gaveResolved.length ? "negative" : "neutral"}
              sub="became players"
            />
            <Stat
              label="Acquired"
              value={gotResolved.length}
              tone={gotResolved.length ? "positive" : "neutral"}
              sub="became players"
            />
            <Stat label="In flight" value={mineOpen.length} sub="not drafted yet" />
          </div>

          <SectionHeader title="Picks you traded away" />
          {gaveResolved.length === 0 ? (
            <EmptyState icon={<GitBranch size={26} />} title="Nothing traced yet">
              None of the picks you&apos;ve traded away have been used in a draft yet.
              Once they are, they show up here with the player they became.
            </EmptyState>
          ) : (
            <div className="space-y-2.5">
              {gaveResolved.map((l) => (
                <LineageCard
                  key={`${l.season}-${l.round}-${l.originalRoster}`}
                  l={l}
                  perspective="gave"
                />
              ))}
            </div>
          )}

          {gotResolved.length > 0 && (
            <>
              <SectionHeader title="Picks you acquired" />
              <div className="space-y-2.5">
                {gotResolved.map((l) => (
                  <LineageCard
                    key={`${l.season}-${l.round}-${l.originalRoster}`}
                    l={l}
                    perspective="got"
                  />
                ))}
              </div>
            </>
          )}

          {mineOpen.length > 0 && (
            <>
              <SectionHeader
                title="Still in flight"
                action={
                  <Tag tone="warn">
                    <Hourglass size={11} aria-hidden="true" />
                    {mineOpen.length}
                  </Tag>
                }
              />
              <div className="space-y-2.5">
                {mineOpen.map((l) => (
                  <LineageCard
                    key={`${l.season}-${l.round}-${l.originalRoster}`}
                    l={l}
                    perspective={me != null && l.fromRoster === me ? "gave" : "got"}
                  />
                ))}
              </div>
            </>
          )}

          <SectionHeader title="Draft boards" />
          <ul className="space-y-2.5">
            {seasons.map((s) => (
              <li key={s.draftId}>
                <Link
                  href={`/drafts/${s.season}`}
                  className="flex items-center gap-3 rounded-[--radius] border border-border bg-surface/60 p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-lg font-semibold text-ink">
                        {s.season}
                      </span>
                      {s.pickCount === 0 && <Tag tone="warn">Upcoming</Tag>}
                      {s.tradedCount > 0 && (
                        <Tag tone="info">{s.tradedCount} traded</Tag>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] tnum text-faint">
                      <span>{s.rounds} rd</span>
                      <span>{s.teams} tm</span>
                      <span>{s.pickCount} picks</span>
                      <span className="uppercase tracking-wide">{s.type}</span>
                      {s.mineCount > 0 && (
                        <span className="text-accent">{s.mineCount} yours</span>
                      )}
                    </div>
                  </div>
                  <ArrowRight size={16} className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>

          {leagueResolved.length > 0 && (
            <>
              <SectionHeader title="Around the league" />
              <Card className="p-0">
                <ul className="divide-y divide-border">
                  {leagueResolved.slice(0, 12).map((l) => (
                    <li key={`${l.season}-${l.round}-${l.originalRoster}`}>
                      <Link
                        href={`/drafts/${l.season}?pick=${l.pickNo}#pick-${l.pickNo}`}
                        className="flex items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-surface-2"
                      >
                        <span className="w-14 shrink-0 font-mono text-[11px] tnum text-muted">
                          {l.season} R{l.round}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">
                          {l.playerName}
                        </span>
                        <span className="shrink-0 truncate text-[11px] text-faint">
                          {l.usedByName}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
