import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Hourglass } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { buildDraftIndex, getDraftBoard, getDraftSeasons } from "@/lib/lineage";
import { getPrincipals } from "@/lib/principals";
import { EmptyState, List, PageHeader, StatTile, Tabs } from "@/components/ui";
import { SeasonLinks } from "@/components/league/SeasonLinks";
import { BoardPickRow } from "../parts";
import { computeRecap, DraftRecap } from "./recap";
export const dynamic = "force-dynamic";
export default async function DraftBoardPage({ params, searchParams }) {
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
  const rounds = new Map();
  for (const p of board.picks) {
    const arr = rounds.get(p.round) ?? [];
    arr.push(p);
    rounds.set(p.round, arr);
  }
  const mine = board.picks.filter((p) => p.isMine);
  const traded = board.picks.filter((p) => p.wasTraded);
  const highlighted = board.picks.find((p) => p.pickNo === highlight);
  // The recap runs on a COMPLETE draft that is not the chain's oldest one - the oldest
  // is taken to be the startup, where a rookie pick curve is the wrong yardstick (see
  // recap.jsx). `seasons` is newest first, so the oldest is the last entry.
  const oldestSeason = seasons.at(-1)?.season;
  const showRecap =
    board.status === "complete" &&
    board.picks.length > 0 &&
    seasons.length > 1 &&
    season !== oldestSeason;
  const recap = showRecap ? computeRecap(h, board) : null;
  const boardPanel = (
    <>
      {[...rounds.entries()].map(([round, picks]) => {
        const yours = picks.filter((p) => p.isMine).length;
        return (
          <section key={round} aria-labelledby={`round-${round}`}>
            <div className="mb-2 mt-4 flex items-baseline justify-between gap-3 first:mt-1">
              <h2 id={`round-${round}`} className="text-lede font-semibold text-ink">
                Round {round}
              </h2>
              <span className="figure text-meta text-secondary">
                {picks.length} picks{yours > 0 ? ` · ${yours} yours` : ""}
              </span>
            </div>
            <List aria-label={`Round ${round} picks`}>
              {picks.map((p) => (
                <BoardPickRow key={p.pickNo} p={p} highlighted={p.pickNo === highlight} />
              ))}
            </List>
          </section>
        );
      })}
      <p className="mt-3 text-meta text-secondary">Rows open the dossier of the manager who made the pick.</p>
    </>
  );
  return (
    <div>
      <Link
        href="/drafts"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-note font-semibold text-secondary transition-colors hover:text-accent-text"
      >
        <ChevronLeft size={16} aria-hidden="true" />
        Drafts
      </Link>
      <PageHeader
        title={`${season} draft`}
        subtitle={
          board.draftId
            ? `${board.type ? `${board.type[0].toUpperCase()}${board.type.slice(1)} · ` : ""}${board.rounds} rounds · ${board.teams} teams`
            : "No draft on record for this season"
        }
      />
      {seasons.length > 1 && (
        <SeasonLinks
          className="mb-3"
          label="Draft season"
          seasons={seasons.map((s) => s.season)}
          active={season}
          hrefFor={(s) => `/drafts/${s}`}
        />
      )}

      {board.picks.length === 0 ? (
        <EmptyState
          icon={<Hourglass size={28} />}
          title={board.reason === "not-yet-drafted" ? "Draft hasn't happened yet" : "No draft data"}
          cta={{ href: "/drafts", label: "Back to drafts" }}
        >
          {board.reason === "not-yet-drafted"
            ? `No picks made in ${season} yet; picks traded for it are still in flight.`
            : board.reasonText}
          {board.status ? ` Status: ${board.status}.` : ""}
        </EmptyState>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <StatTile size="sm" label="Picks" value={String(board.picks.length)} />
            <StatTile size="sm" label="Yours" value={String(mine.length)} tone={mine.length ? "accent" : "neutral"} />
            <StatTile size="sm" label="Traded slots" value={String(traded.length)} />
          </div>
          {highlighted && (
            <p className="mb-2 text-note text-muted">
              <a href={`#pick-${highlighted.pickNo}`} className="font-semibold text-accent-text underline underline-offset-2">
                Pick #{highlighted.pickNo}
              </a>{" "}
              {highlighted.playerName ?? "no player"}
              {highlighted.usedByName ? `, taken by ${highlighted.usedByName}` : ""}
            </p>
          )}
          {recap && !highlighted ? (
            <Tabs
              label="Draft views"
              items={[
                { id: "class", label: "The class, today", content: <DraftRecap recap={recap} meRosterId={h.me.rosterId} /> },
                { id: "board", label: "Board", count: board.picks.length, content: boardPanel },
              ]}
            />
          ) : recap ? (
            <Tabs
              label="Draft views"
              items={[
                { id: "board", label: "Board", count: board.picks.length, content: boardPanel },
                { id: "class", label: "The class, today", content: <DraftRecap recap={recap} meRosterId={h.me.rosterId} /> },
              ]}
            />
          ) : (
            boardPanel
          )}
        </>
      )}
    </div>
  );
}
