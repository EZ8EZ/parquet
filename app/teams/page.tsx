import { getLeagueHistory } from "@/lib/history";
import { leagueValueRanking } from "@/lib/roster";
import { buildDossier } from "@/lib/dossier";
import { PageHeader } from "@/components/ui";
import { TeamPicker, type TeamOption } from "@/components/TeamPicker";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const h = await getLeagueHistory();
  const ranked = leagueValueRanking(h);

  const teams: TeamOption[] = ranked.map((r) => {
    const d = buildDossier(h, r.rosterId);
    return {
      rosterId: r.rosterId,
      teamName: r.teamName ?? r.ownerName,
      ownerName: r.ownerName,
      record: `${r.record.wins}-${r.record.losses}`,
      totalValue: r.totalValue,
      window: r.window,
      tags: d.tags,
    };
  });

  return (
    <div>
      <PageHeader
        kicker={h.currentLeague.name}
        title="Whose team are you?"
        subtitle="Pick a team to run the whole app as that manager - their roster, their revealed strategy, their game plan, their read on everyone else."
      />
      <TeamPicker
        teams={teams}
        currentRosterId={h.me.rosterId}
        username={process.env.SLEEPER_USERNAME ?? "EZ8"}
      />
    </div>
  );
}
