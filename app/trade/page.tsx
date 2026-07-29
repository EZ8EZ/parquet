import { getLeagueHistory } from "@/lib/history";
import { analyzeRoster, leagueValueRanking } from "@/lib/roster";
import { PageHeader } from "@/components/ui";
import { TradeBuilder, type PlayerOption } from "@/components/TradeBuilder";

export const dynamic = "force-dynamic";

export default async function TradePage() {
  const h = await getLeagueHistory();
  const rosterId = h.me.rosterId;

  const mine = rosterId != null ? analyzeRoster(h, rosterId) : null;
  const myPlayers: PlayerOption[] = (mine?.valued ?? []).map((v) => ({
    id: v.playerId,
    name: v.name,
    team: v.team,
    position: v.position,
    age: v.age,
    value: v.value,
  }));

  const otherPlayers: PlayerOption[] = leagueValueRanking(h)
    .filter((r) => r.rosterId !== rosterId)
    .flatMap((r) =>
      r.valued.map((v) => ({
        id: v.playerId,
        name: v.name,
        team: v.team,
        position: v.position,
        age: v.age,
        value: v.value,
        owner: r.teamName ?? r.ownerName,
      })),
    )
    .sort((a, b) => b.value - a.value);

  const y = h.currentSeasonYear;
  const seasons = [y, y + 1, y + 2, y + 3].map(String);

  return (
    <div>
      <PageHeader
        kicker="Trade evaluator"
        title="Should you make this move?"
        subtitle="We value both sides - but the answer isn't a grade. It's what each side is betting on, the assumption that must hold, and what your own history says."
      />
      <TradeBuilder
        myPlayers={myPlayers}
        otherPlayers={otherPlayers}
        seasons={seasons}
        leagueId={h.currentLeague.leagueId}
      />
    </div>
  );
}
