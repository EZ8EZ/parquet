import { getLeagueHistory } from "@/lib/history";
import { RankingBoard } from "@/components/RankingBoard";

export const dynamic = "force-dynamic";

// A dynasty roster you'd actually argue about tops out well under this. Capped
// so the drag list is something you can finish dragging in one sitting on a
// phone, not a scroll-forever wall - and scoped by consensus rank (not value)
// because that is the exact universe consensusSource() draws from.
const POOL_SIZE = 120;

export default async function RankPage() {
  const h = await getLeagueHistory();
  const scoring = h.currentLeague.scoringSettings;

  const pool = [...h.players.values()]
    .filter((p) => p.searchRank != null)
    .sort((a, b) => a.searchRank! - b.searchRank!)
    .slice(0, POOL_SIZE);

  return (
    <div>
      <header className="mb-2">
        <p className="text-meta font-semibold uppercase tracking-[0.18em] text-accent">
          Your ranking
        </p>
        <h1 className="font-display text-display font-semibold leading-tight text-ink">
          Rank the board
        </h1>
        <p className="mt-0.5 text-note leading-snug text-muted">
          Drag players into your own order, blend it against consensus at
          whatever weight you trust today, and see exactly where the two
          disagree.
        </p>
      </header>

      <RankingBoard players={pool} scoring={scoring} />
    </div>
  );
}
