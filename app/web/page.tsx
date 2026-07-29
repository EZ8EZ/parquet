import { FlaskConical } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getTradedPickLineages } from "@/lib/lineage";
import {
  buildAssetMoves,
  buildHoldings,
  buildTradeGraph,
  pickKey,
  type ManagerMetric,
  type PlayerNow,
} from "@/lib/tradegraph";
import { valuePlayers } from "@/lib/valuation";
import { computeTiers, tierResolver } from "@/lib/rankings/tiers";
import { leagueTimelines, playerDuration } from "@/lib/metrics/duration";
import { leagueFragility } from "@/lib/metrics/fragility";
import { Card, PageHeader, Tag } from "@/components/ui";
import { TradeWeb } from "@/components/TradeWeb";

export const dynamic = "force-dynamic";

export default async function TradeWebPage() {
  const h = await getLeagueHistory();
  const graph = buildTradeGraph(h);

  // Every roster's current read on the two proprietary metrics, keyed for O(1)
  // lookup wherever the web/tree names a manager. Both are already computed
  // league-wide for other pages, so this is two cheap synchronous passes, not a
  // second valuation of anything.
  const managerMetrics: Record<number, ManagerMetric> = {};
  for (const t of leagueTimelines(h)) {
    managerMetrics[t.rosterId] = {
      tci: t.tci,
      posture: t.posture,
      rosterDuration: t.rosterDuration,
      fragility: null,
      fragilityBand: null,
    };
  }
  for (const f of leagueFragility(h)) {
    managerMetrics[f.rosterId] = {
      ...(managerMetrics[f.rosterId] ?? {
        tci: 0,
        posture: "straddling",
        rosterDuration: 0,
      }),
      fragility: f.fragility,
      fragilityBand: f.band,
    };
  }

  // Current value, tier and duration for every player who has ever moved in a
  // trade - so a tree node can say what the asset is worth TODAY, not just what
  // it was called at the time. Priced with the same recipe /values uses, so a
  // tier label here never disagrees with the one on that page.
  const scoring = h.currentLeague.scoringSettings;
  const values = valuePlayers([...h.players.values()], scoring);
  const valuesDesc = [...values.values()]
    .map((v) => v.value)
    .filter((v) => v > 0)
    .sort((a, b) => b - a);
  const tierFor = tierResolver(
    computeTiers(valuesDesc, { floor: (valuesDesc[0] ?? 0) * 0.1 }),
  );
  const holdings = buildHoldings(h);
  const playerNow: Record<string, PlayerNow> = {};
  for (const p of h.players.values()) {
    const v = values.get(p.playerId);
    if (!v || v.value <= 0) continue;
    playerNow[p.playerId] = {
      team: p.team,
      value: v.value,
      tier: tierFor(v.value)?.label ?? "Fringe",
      duration: playerDuration(p.age),
      heldBy: holdings[p.playerId] ?? null,
    };
  }

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

      <TradeWeb
        graph={graph}
        moves={moves}
        holdings={holdings}
        managerMetrics={managerMetrics}
        playerNow={playerNow}
      />
    </div>
  );
}
