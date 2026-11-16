import { getLeagueHistory } from "@/lib/history";
import { RankingBoard } from "@/components/RankingBoard";
import { Onward } from "@/components/Onward";
import { List, ListRow, PageHeader } from "@/components/ui";
/**
 * YOUR RANKING. Answers "where do I disagree with the board?": a drag-to-rank list
 * blended against consensus at a weight you set. Restyled only; the board's logic
 * lives in components/RankingBoard and lib/rankings.
 */
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
    .sort((a, b) => a.searchRank - b.searchRank)
    .slice(0, POOL_SIZE);
  return (
    <div>
      <PageHeader kicker="Trade" title="Your ranking" subtitle="Your order, blended against consensus" />

      <RankingBoard players={pool} scoring={scoring} />

      {/* What this board is for: the Trade Finder prices every package against it. */}
      <List className="mt-6">
        <li>
          <ListRow href="/trade/finder" title="The Trade Finder prices against this board" meta="Every package shows where your board and the model disagree" />
        </li>
      </List>

      <Onward from="/rank" />
    </div>
  );
}
