import Link from "next/link";
import {
  ChevronRight,
  GitBranch,
  GraduationCap,
  Hourglass,
  Layers,
} from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import {
  buildDraftIndex,
  getDraftSeasons,
  getTradedPickLineages,
} from "@/lib/lineage";
import { EmptyState, PageHeader, SectionHeader, Tag } from "@/components/ui";
import { cn } from "@/lib/ui";
import { LineageCard, SeasonTile } from "./parts";
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
  return (
    <div>
      <PageHeader
        kicker="Pick lineage"
        kickerAction={
          <Link
            href="/values"
            className="-my-2 inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-muted transition-colors hover:text-accent-text"
          >
            pick values
            <ChevronRight size={12} aria-hidden="true" />
          </Link>
        }
        title="What that pick became"
        subtitle="Every traded pick, traced to the player it turned into. Tap one to land on it in its own draft."
      />

      {noDrafts ? (
        <EmptyState icon={<Layers size={28} />} title="No draft data">
          {!index.supported
            ? "The active data source doesn't expose drafts, so pick lineage can't be traced right now."
            : "This league has no drafts on record yet."}
        </EmptyState>
      ) : (
        <>
          <div className="flex items-stretch divide-x divide-border rounded-[--radius] border border-border bg-surface">
            {[
              {
                v: gaveResolved.length,
                l: "gave up",
                s: "became players",
                tone: gaveResolved.length ? "text-negative" : "text-ink",
              },
              {
                v: gotResolved.length,
                l: "acquired",
                s: "became players",
                tone: gotResolved.length ? "text-positive" : "text-ink",
              },
              {
                v: mineOpen.length,
                l: "in flight",
                s: "not drafted yet",
                tone: "text-ink",
              },
            ].map((s) => (
              <div key={s.l} className="flex-1 px-1.5 py-1.5 text-center">
                <div
                  className={cn(
                    "figure text-lede font-semibold leading-tight",
                    s.tone,
                  )}
                >
                  {s.v}
                </div>
                <div className="text-meta uppercase tracking-wide text-secondary">
                  {s.l}
                </div>
                <div className="text-meta leading-tight text-muted">{s.s}</div>
              </div>
            ))}
          </div>

          {/* Same nav pattern as /values -> /rank: a pill below the header stats
                rather than a header action, since this leads to a different question
                ("how did the drafting go") than the page above it ("what became of
                this pick"). */}
          <nav aria-label="Drafts sections" className="mt-2 flex gap-1.5">
            <Link
              href="/drafts/grades"
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3 text-note leading-snug font-semibold text-muted transition-colors hover:border-accent hover:text-accent-text"
            >
              <GraduationCap size={13} aria-hidden="true" />
              Draft report cards
              <ChevronRight size={13} aria-hidden="true" />
            </Link>
          </nav>

          {/* Boards first: this is the page's navigation, and each tile carries its
                own counts so the shortcut costs no information. */}
          <SectionHeader
            title="Draft boards"
            action={
              <span className="figure text-meta text-secondary">
                {seasons.length} on record
              </span>
            }
          />
          <div className="grid grid-cols-2 gap-1.5">
            {seasons.map((s) => (
              <SeasonTile
                key={s.draftId}
                season={s.season}
                rounds={s.rounds}
                teams={s.teams}
                pickCount={s.pickCount}
                tradedCount={s.tradedCount}
                mineCount={s.mineCount}
              />
            ))}
          </div>

          <SectionHeader
            title="Picks you traded away"
            action={
              gaveResolved.length > 0 ? (
                <span className="figure text-meta text-negative">
                  {gaveResolved.length}
                </span>
              ) : undefined
            }
          />
          {/* SHELVED.md S3: the question a reader actually has on this page is
                "which players did other managers take with my old picks", not a
                truncated sample of somebody else's twelve. This section already IS
                that data - `getTradedPickLineages` filtered to fromRoster === me -
                the one-line frame below just says so, since "drafted by" only
                appears on the card when the last trade partner didn't keep it. */}
          <p className="-mt-1 mb-1.5 text-meta leading-snug text-muted">
            Every pick you sent away that has since been used in a draft, and
            who ended up drafting with it.
          </p>
          {gaveResolved.length === 0 ? (
            <EmptyState
              icon={<GitBranch size={26} />}
              title="Nothing traced yet"
            >
              None of the picks you&apos;ve traded away have been used in a
              draft yet. Once they are, they show up here with the player they
              became.
            </EmptyState>
          ) : (
            <div className="space-y-1.5">
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
              <SectionHeader
                title="Picks you acquired"
                action={
                  <span className="figure text-meta text-positive">
                    {gotResolved.length}
                  </span>
                }
              />
              <div className="space-y-1.5">
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
              <div className="space-y-1.5">
                {mineOpen.map((l) => (
                  <LineageCard
                    key={`${l.season}-${l.round}-${l.originalRoster}`}
                    l={l}
                    perspective={
                      me != null && l.fromRoster === me ? "gave" : "got"
                    }
                  />
                ))}
              </div>
            </>
          )}

          {/* "Around the league" - twelve of the other managers' fifty-six resolved
                picks - sat here until 2026-08-10. Shelved (SHELVED.md, S3): a truncated
                sample with no filter, at the foot of a 5,318px page, that was neither
                complete nor yours. /drafts/grades answers "how did the class go"
                properly. Revived (D-next): "Picks you traded away" above already ran
                the right join (`getTradedPickLineages` filtered to fromRoster === me)
                and it's complete and yours by construction - it only needed the
                "drafted by" fact stated plainly on every row instead of just the
                multi-hop mismatch case, and a line saying what the section answers. */}
        </>
      )}
      <Onward from="/drafts" />
    </div>
  );
}
