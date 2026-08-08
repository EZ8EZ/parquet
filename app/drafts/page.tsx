import Link from "next/link";
import { ChevronRight, GitBranch, GraduationCap, Hourglass, Layers } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import {
  buildDraftIndex,
  getDraftSeasons,
  getTradedPickLineages,
} from "@/lib/lineage";
import { EmptyState, SectionHeader, Tag } from "@/components/ui";
import { cn } from "@/lib/ui";
import { LineageCard, SeasonTile, boardHref } from "./parts";
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
  const leagueResolved = all.filter((l) => l.resolved && !mine.has(l));

  const noDrafts = !index.supported || seasons.length === 0;

  return (
    <div>
      <header className="mb-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-meta font-semibold uppercase tracking-[0.18em] text-accent-text">
            Pick lineage
          </p>
          <Link
            href="/values"
            className="-my-2 inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-muted transition-colors hover:text-accent-text"
          >
            pick values
            <ChevronRight size={12} aria-hidden="true" />
          </Link>
        </div>
        <h1 className="font-display text-display font-semibold leading-[1.1] text-ink">
          What that pick became
        </h1>
        <p className="mt-0.5 text-note leading-snug text-muted">
          Every traded pick, traced to the player it turned into. Tap one to land on
          it in its own draft.
        </p>
      </header>

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
          {gaveResolved.length === 0 ? (
            <EmptyState icon={<GitBranch size={26} />} title="Nothing traced yet">
              None of the picks you&apos;ve traded away have been used in a draft yet.
              Once they are, they show up here with the player they became.
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
                    perspective={me != null && l.fromRoster === me ? "gave" : "got"}
                  />
                ))}
              </div>
            </>
          )}

          {leagueResolved.length > 0 && (
            <>
              <SectionHeader
                title="Around the league"
                action={
                  <span className="figure text-meta text-secondary">
                    {Math.min(12, leagueResolved.length)} of {leagueResolved.length}
                  </span>
                }
              />
              <div className="overflow-hidden rounded-[--radius] border border-border bg-surface">
                <ul className="divide-y divide-border">
                  {leagueResolved.slice(0, 12).map((l) => (
                    <li key={`${l.season}-${l.round}-${l.originalRoster}`}>
                      <Link
                        href={boardHref(l.season, l.pickNo)}
                        aria-label={`${l.season} round ${l.round}: ${l.playerName}, taken by ${l.usedByName}`}
                        className="flex min-h-11 items-center gap-2 px-2.5 py-1 transition-colors hover:bg-surface-2"
                      >
                        <span className="w-14 shrink-0 figure text-meta text-muted">
                          {l.season} R{l.round}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-note text-ink">
                          {l.playerName}
                        </span>
                        <span className="min-w-0 max-w-[34%] shrink truncate text-meta text-secondary">
                          {l.usedByName}
                        </span>
                        <span className="shrink-0 figure text-meta text-accent-text">
                          #{l.pickNo}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </>
      )}
      <Onward from="/drafts" />
    </div>
  );
}
