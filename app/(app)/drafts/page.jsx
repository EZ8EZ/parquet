import Link from "next/link";
import { GitBranch, GraduationCap, Layers } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { buildDraftIndex, getDraftSeasons, getTradedPickLineages } from "@/lib/lineage";
import { Chip, EmptyState, List, ListRow, PageHeader, SectionHeader, StatTile, Tabs } from "@/components/ui";
import { LineageCard } from "./parts";
import { Onward } from "@/components/Onward";
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
  const noDrafts = !index.supported || seasons.length === 0;
  const lineageList = (list, perspectiveOf, empty, showBadge = false) =>
    list.length === 0 ? (
      empty
    ) : (
      <List>
        {list.map((l) => (
          <LineageCard key={`${l.season}-${l.round}-${l.originalRoster}`} l={l} perspective={perspectiveOf(l)} inList showBadge={showBadge} />
        ))}
      </List>
    );
  return (
    <div>
      <PageHeader title="Drafts" subtitle="Every traded pick, traced to the player it became" />

      {noDrafts ? (
        <EmptyState icon={<Layers size={28} />} title="No draft data">
          {!index.supported
            ? "The active data source doesn't expose drafts, so pick lineage can't be traced right now."
            : "This league has no drafts on record yet."}
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatTile size="sm" label="You gave up" value={String(gaveResolved.length)} sub="became players" />
            <StatTile size="sm" label="You acquired" value={String(gotResolved.length)} sub="became players" />
            <StatTile size="sm" label="In flight" value={String(mineOpen.length)} sub="not drafted yet" />
          </div>

          <h2 className="sr-only">Your traded picks</h2>
          <Tabs
            className="mt-4"
            label="Your traded picks"
            items={[
              {
                id: "gave",
                label: "Gave up",
                count: gaveResolved.length,
                content: lineageList(
                  gaveResolved,
                  () => "gave",
                  <EmptyState icon={<GitBranch size={26} />} title="Nothing traced yet">
                    None of the picks you traded away has been used in a draft yet.
                  </EmptyState>,
                ),
              },
              {
                id: "got",
                label: "Acquired",
                count: gotResolved.length,
                content: lineageList(
                  gotResolved,
                  () => "got",
                  <EmptyState icon={<GitBranch size={26} />} title="Nothing traced yet">
                    None of the picks you acquired has been used in a draft yet.
                  </EmptyState>,
                ),
              },
              {
                id: "open",
                label: "In flight",
                count: mineOpen.length,
                content: lineageList(
                  mineOpen,
                  (l) => (me != null && l.fromRoster === me ? "gave" : "got"),
                  <EmptyState icon={<GitBranch size={26} />} title="Nothing in flight">
                    Every pick you traded has been drafted.
                  </EmptyState>,
                  true,
                ),
              },
            ]}
          />

          <SectionHeader title="Draft boards" href="/drafts/grades" cta="Report cards" />
          <List aria-label="Draft boards by season">
            {seasons.map((s) => (
              <li key={s.draftId}>
                <ListRow
                  href={`/drafts/${s.season}`}
                  title={
                    <>
                      <span className="figure">{s.season}</span>
                      <span className="sr-only"> draft board</span>
                    </>
                  }
                  badge={
                    <>
                      {s.pickCount === 0 && <Chip size="sm">upcoming</Chip>}
                      {s.mineCount > 0 && (
                        <Chip size="sm" tone="accent">
                          {s.mineCount} yours
                        </Chip>
                      )}
                    </>
                  }
                  meta={`${s.rounds} rounds · ${s.teams} teams${s.tradedCount > 0 ? ` · ${s.tradedCount} traded` : ""}`}
                  value={s.pickCount === 0 ? null : s.pickCount}
                  valueSub={s.pickCount === 0 ? null : "picks"}
                />
              </li>
            ))}
          </List>
          <Link
            href="/values"
            className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-note font-semibold text-accent-text"
          >
            <GraduationCap size={16} aria-hidden="true" />
            What each pick is worth
          </Link>
        </>
      )}
      <Onward from="/drafts" />
    </div>
  );
}
