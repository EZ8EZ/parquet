import Link from "next/link";
import { ChevronRight, GitBranch, Hourglass, Layers } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import {
  buildDraftIndex,
  getDraftSeasons,
  getTradedPickLineages,
} from "@/lib/lineage";
import { EmptyState, Tag } from "@/components/ui";
import { cn } from "@/lib/ui";
import { LineageCard, SeasonTile, boardHref } from "./parts";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

/** Tight section rule (the shared SectionHeader carries mt-8). */
function Rail({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-1.5 mt-4 flex items-baseline justify-between gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        {title}
      </h2>
      {action}
    </div>
  );
}

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
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Pick lineage
          </p>
          <Link
            href="/values"
            className="-my-2 inline-flex min-h-11 items-center gap-1 text-[11px] font-semibold text-muted transition-colors hover:text-accent"
          >
            pick values
            <ChevronRight size={12} aria-hidden="true" />
          </Link>
        </div>
        <h1 className="font-display text-[26px] font-semibold leading-[1.1] text-ink">
          What that pick became
        </h1>
        <p className="mt-0.5 text-[12px] leading-snug text-muted">
          Every traded pick, traced to the player it turned into. Tap one to land on
          it in its own draft.
        </p>
      </header>

      {noDrafts ? (
        <EmptyState icon={<Layers size={28} />} title="No draft data">
          {!index.supported
            ? "The active data source doesn't expose drafts. Switch to the Sleeper or fixture provider to trace pick lineage."
            : "This league has no drafts on record yet."}
        </EmptyState>
      ) : (
        <>
          <div className="flex items-stretch divide-x divide-border rounded-[--radius] border border-border bg-surface/60">
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
                    "font-mono text-[17px] font-semibold leading-tight tnum",
                    s.tone,
                  )}
                >
                  {s.v}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-faint">
                  {s.l}
                </div>
                <div className="text-[11px] leading-tight text-muted">{s.s}</div>
              </div>
            ))}
          </div>

          {/* Boards first: this is the page's navigation, and each tile carries its
              own counts so the shortcut costs no information. */}
          <Rail
            title="Draft boards"
            action={
              <span className="font-mono text-[11px] tnum text-faint">
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

          <Rail
            title="Picks you traded away"
            action={
              gaveResolved.length > 0 ? (
                <span className="font-mono text-[11px] tnum text-negative">
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
              <Rail
                title="Picks you acquired"
                action={
                  <span className="font-mono text-[11px] tnum text-positive">
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
              <Rail
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
              <Rail
                title="Around the league"
                action={
                  <span className="font-mono text-[11px] tnum text-faint">
                    {Math.min(12, leagueResolved.length)} of {leagueResolved.length}
                  </span>
                }
              />
              <div className="overflow-hidden rounded-[--radius] border border-border bg-surface/60">
                <ul className="divide-y divide-border">
                  {leagueResolved.slice(0, 12).map((l) => (
                    <li key={`${l.season}-${l.round}-${l.originalRoster}`}>
                      <Link
                        href={boardHref(l.season, l.pickNo)}
                        aria-label={`${l.season} round ${l.round}: ${l.playerName}, taken by ${l.usedByName}`}
                        className="flex min-h-11 items-center gap-2 px-2.5 py-1 transition-colors hover:bg-surface-2"
                      >
                        <span className="w-14 shrink-0 font-mono text-[11px] tnum text-muted">
                          {l.season} R{l.round}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                          {l.playerName}
                        </span>
                        <span className="max-w-[34%] shrink-0 truncate text-[11px] text-faint">
                          {l.usedByName}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] tnum text-accent">
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
    </div>
  );
}
