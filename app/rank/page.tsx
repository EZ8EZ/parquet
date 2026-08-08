import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { RankingBoard } from "@/components/RankingBoard";
import { Onward } from "@/components/Onward";

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
        <p className="text-meta font-semibold uppercase tracking-[0.18em] text-accent-text">
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

      {/* WHAT THIS BOARD IS FOR, said on the page that asks for the work. The board
          has always fed the Trade Finder - every package it proposes is checked
          against this order and prints the gap on its own card - and nothing on
          either page said so, which made a genuinely load-bearing feature look like
          a toy that saves a list. */}
      <Link
        href="/trade/finder"
        className="mb-2 flex min-h-11 items-center gap-1.5 rounded-[--radius-sm] border border-accent-edge bg-accent-wash px-2.5 py-1.5 text-note leading-snug text-muted transition-colors hover:bg-accent-wash"
      >
        <span className="min-w-0 flex-1">
          Whatever you save here is what the Trade Finder prices against. Every package
          it proposes says where your board and the model disagree.
        </span>
        <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-accent-text" />
      </Link>

      <RankingBoard players={pool} scoring={scoring} />

      {/* The second of the two surfaces measured with zero outbound links. */}
      <Onward from="/rank" />
    </div>
  );
}
