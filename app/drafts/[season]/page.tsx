import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Hourglass } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { buildDraftIndex, getDraftBoard, getDraftSeasons } from "@/lib/lineage";
import { getPrincipals } from "@/lib/principals";
import { EmptyState, PageHeader } from "@/components/ui";
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
  const [index, principals] = await Promise.all([
    buildDraftIndex(h),
    getPrincipals(h),
  ]);
  const [board, seasons] = await Promise.all([
    // Names the manager who was on the clock that season - see `getDraftBoard`.
    getDraftBoard(h, season, { index, principals }),
    getDraftSeasons(h, { index }),
  ]);

  // Unknown season with no draft AND not in the chain -> a real 404.
  if (
    board.reason === "no-draft" &&
    !h.chain.some((l) => l.season === season)
  ) {
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
  const highlighted = board.picks.find((p) => p.pickNo === highlight);

  return (
    <div>
      {/* Negative margin keeps the 44px tap target from adding visual space. */}
      <Link
        href="/drafts"
        className="-ml-1 -mt-3 mb-0.5 inline-flex min-h-11 items-center gap-1.5 px-1 text-meta font-semibold text-muted transition-colors hover:text-accent-text"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        Pick lineage
      </Link>

      <PageHeader
        kicker="Draft board"
        kickerAction={
          <Link
            href="/values"
            className="-my-2 inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-muted transition-colors hover:text-accent-text"
          >
            pick values
            <ChevronRight size={12} aria-hidden="true" />
          </Link>
        }
        title={`${season} draft`}
      >
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 figure text-meta text-secondary">
          {board.draftId ? (
            <>
              <span className="uppercase tracking-wide">{board.type}</span>
              <span aria-hidden="true">·</span>
              <span>{board.rounds} rounds</span>
              <span aria-hidden="true">·</span>
              <span>{board.teams} teams</span>
              <span aria-hidden="true">·</span>
              <span>{board.picks.length} picks</span>
              {mine.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-accent-text">{mine.length} yours</span>
                </>
              )}
              {traded.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-info">{traded.length} traded in</span>
                </>
              )}
            </>
          ) : (
            <span>No draft on record for this season.</span>
          )}
        </div>
      </PageHeader>

      {/* Season switcher - 44px tap targets, horizontal only for these pills. */}
      {seasons.length > 1 && (
        <nav aria-label="Draft season" className="scroll-x -mx-4 mb-2 px-4">
          <ul className="flex gap-1.5">
            {seasons.map((s) => {
              const active = s.season === season;
              return (
                <li key={s.draftId}>
                  <Link
                    href={`/drafts/${s.season}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 figure text-body font-semibold transition-colors",
                      active
                        ? "border-accent bg-accent-wash text-accent-text"
                        : "border-border text-muted hover:bg-surface-2",
                    )}
                  >
                    {s.season}
                    <span
                      className={cn(
                        "text-meta font-normal",
                        active ? "text-accent-text" : "text-secondary",
                      )}
                    >
                      {s.pickCount === 0 ? "soon" : s.pickCount}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {highlighted && (
        <p className="mb-2 rounded-[--radius-sm] border border-accent-edge bg-accent-wash px-2.5 py-1.5 text-meta leading-snug text-muted">
          <span className="font-semibold text-ink">
            Pick #{highlighted.pickNo}
          </span>{" "}
          highlighted below: {highlighted.playerName ?? "no player"}
          {highlighted.usedByName ? `, taken by ${highlighted.usedByName}` : ""}
          .
        </p>
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
          {[...rounds.entries()].map(([round, picks]) => {
            const yours = picks.filter((p) => p.isMine).length;
            return (
              <section key={round}>
                <div className="mb-1 mt-2.5 flex items-baseline justify-between gap-3">
                  <h2 className="text-meta font-semibold uppercase tracking-[0.16em] text-muted">
                    Round {round}
                  </h2>
                  <span className="figure text-meta text-secondary">
                    {picks.length} picks
                    {yours > 0 && (
                      <span className="text-accent-text"> · {yours} yours</span>
                    )}
                  </span>
                </div>
                <ul className="space-y-1">
                  {picks.map((p) => (
                    <BoardPickRow
                      key={p.pickNo}
                      p={p}
                      highlighted={p.pickNo === highlight}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
          <p className="mt-3 text-meta leading-relaxed text-secondary">
            Rows link to the dossier of the manager who made the pick.
            &ldquo;via&rdquo; names the roster the slot originally belonged to.
          </p>
        </>
      )}
    </div>
  );
}
