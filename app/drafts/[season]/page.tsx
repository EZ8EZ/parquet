import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Hourglass } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { buildDraftIndex, getDraftBoard, getDraftSeasons } from "@/lib/lineage";
import { EmptyState, PageHeader, SectionHeader, Stat, Tag } from "@/components/ui";
import { cn } from "@/lib/ui";
import { BoardPickRow } from "../parts";

export const dynamic = "force-dynamic";

export default async function DraftBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string }>;
  searchParams: Promise<{ pick?: string }>;
}) {
  const { season } = await params;
  const { pick } = await searchParams;
  const highlight = pick ? parseInt(pick, 10) : NaN;

  const h = await getLeagueHistory();
  const index = await buildDraftIndex(h);
  const [board, seasons] = await Promise.all([
    getDraftBoard(h, season, { index }),
    getDraftSeasons(h, { index }),
  ]);

  // Unknown season with no draft AND not in the chain -> a real 404.
  if (board.reason === "no-draft" && !h.chain.some((l) => l.season === season)) {
    notFound();
  }

  // Group into rounds so the board reads as a board, not one long list.
  const rounds = new Map<number, typeof board.picks>();
  for (const p of board.picks) {
    const arr = rounds.get(p.round) ?? [];
    arr.push(p);
    rounds.set(p.round, arr);
  }

  const mine = board.picks.filter((p) => p.isMine);
  const traded = board.picks.filter((p) => p.wasTraded);

  return (
    <div>
      {/* Negative margin keeps the 44px tap target from adding visual space. */}
      <Link
        href="/drafts"
        className="-ml-1 -mt-2 mb-1 inline-flex min-h-[44px] items-center gap-1.5 px-1 text-[12px] font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Pick lineage
      </Link>

      <PageHeader
        kicker="Draft board"
        title={`${season} draft`}
        subtitle={
          board.draftId
            ? `${board.type} · ${board.rounds} rounds · ${board.teams} teams`
            : "No draft on record for this season."
        }
      />

      {/* Season switcher - 44px tap targets, horizontal only for these pills. */}
      {seasons.length > 1 && (
        <nav aria-label="Draft season" className="scroll-x -mx-4 mb-5 px-4">
          <ul className="flex gap-2">
            {seasons.map((s) => {
              const active = s.season === season;
              return (
                <li key={s.draftId}>
                  <Link
                    href={`/drafts/${s.season}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono text-sm font-semibold tnum transition-colors",
                      active
                        ? "border-accent bg-accent/12 text-accent"
                        : "border-border text-muted hover:bg-surface-2",
                    )}
                  >
                    {s.season}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {board.picks.length === 0 ? (
        <EmptyState
          icon={<Hourglass size={28} />}
          title={
            board.reason === "not-yet-drafted"
              ? "Draft hasn't happened yet"
              : "No draft data"
          }
          cta={{ href: "/drafts", label: "Back to pick lineage" }}
        >
          {/* `reasonText` is phrased for a single pick; a whole board needs its own
              copy. */}
          {board.reason === "not-yet-drafted"
            ? `No picks have been made in the ${season} draft yet. Picks traded for this season are still in flight.`
            : board.reasonText}
          {board.status ? ` Status: ${board.status}.` : ""}
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <Stat label="Picks" value={board.picks.length} />
            <Stat
              label="Yours"
              value={mine.length}
              tone={mine.length ? "accent" : "neutral"}
            />
            <Stat label="Traded in" value={traded.length} sub="changed hands" />
          </div>

          {[...rounds.entries()].map(([round, picks]) => (
            <section key={round}>
              <SectionHeader
                title={`Round ${round}`}
                action={
                  picks.some((p) => p.isMine) ? (
                    <Tag tone="accent">
                      {picks.filter((p) => p.isMine).length} yours
                    </Tag>
                  ) : undefined
                }
              />
              <ul className="space-y-1.5">
                {picks.map((p) => (
                  <BoardPickRow
                    key={p.pickNo}
                    p={p}
                    highlighted={p.pickNo === highlight}
                  />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
