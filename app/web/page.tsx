import { FlaskConical } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getTradedPickLineages } from "@/lib/lineage";
import {
  buildAssetMoves,
  buildHoldings,
  buildTradeGraph,
  pickKey,
} from "@/lib/tradegraph";
import { Card, PageHeader, Tag } from "@/components/ui";
import { TradeWeb } from "@/components/TradeWeb";

export const dynamic = "force-dynamic";

export default async function TradeWebPage() {
  const h = await getLeagueHistory();
  const graph = buildTradeGraph(h);

  // Pick -> the player it actually became, so a pick in a lineage chain keeps going
  // past the draft. Best-effort: a provider or season with no draft data just leaves
  // those chains ending at "pick not used yet" rather than failing the page.
  const pickPlayers: Record<string, string> = {};
  try {
    for (const l of await getTradedPickLineages(h)) {
      if (l.resolved && l.playerName) {
        pickPlayers[pickKey(l.season, l.round, l.originalRoster)] = l.playerName;
      }
    }
  } catch {
    // no draft data — chains still build, they just stop at the pick.
  }

  const moves = buildAssetMoves(h, pickPlayers);
  const holdings = buildHoldings(h);

  return (
    <div>
      <PageHeader
        kicker="League network"
        title="The trade web"
        subtitle="Every deal this league has ever made, as connections you can pull on. Who trades with whom, how often, and what those assets became."
      />

      <Card className="mb-5 border-warn/30 bg-warn/[0.06]">
        <div className="flex items-start gap-2.5">
          <FlaskConical size={16} className="mt-0.5 shrink-0 text-warn" />
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <Tag tone="warn">Beta</Tag>
              <span className="text-[11px] text-faint">
                new, additive, nothing else changed
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted">
              An experiment in seeing the league as a network rather than a list.
              It sits alongside the ledger and the dossiers - it does not replace
              them. Counts come from the same derivation the dossiers use, so the
              two can never disagree.
            </p>
          </div>
        </div>
      </Card>

      <TradeWeb graph={graph} moves={moves} holdings={holdings} />
    </div>
  );
}
