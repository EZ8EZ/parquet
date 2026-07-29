import Link from "next/link";
import { getLeagueHistory } from "@/lib/history";
import { tierOf, valuePlayers } from "@/lib/valuation";
import { PageHeader } from "@/components/ui";
import { ValuesList, type ValueRow } from "@/components/ValuesList";

export const dynamic = "force-dynamic";

export default async function ValuesPage() {
  const h = await getLeagueHistory();
  const scoring = h.currentLeague.scoringSettings;
  const values = valuePlayers([...h.players.values()], scoring);

  const rows: ValueRow[] = [...h.players.values()]
    .map((p) => {
      const v = values.get(p.playerId)!;
      return {
        id: p.playerId,
        name: p.fullName,
        team: p.team,
        position: p.position,
        age: p.age,
        value: v.value,
        tier: tierOf(v.value),
        espnId: p.espnId,
      };
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 260);

  return (
    <div>
      <PageHeader
        kicker="Dynasty values"
        title="Asset values"
        subtitle="A transparent, tunable model - not a scraped market. Values are league-aware (computed from your scoring settings)."
      />
      <p className="mb-3 text-xs text-faint">
        Curious how these are built?{" "}
        <Link href="/methodology" className="font-semibold text-accent underline-offset-2 hover:underline">
          Read the methodology →
        </Link>
      </p>
      <ValuesList rows={rows} />
    </div>
  );
}
