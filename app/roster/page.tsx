import { getLeagueHistory } from "@/lib/history";
import { analyzeRoster } from "@/lib/roster";
import { PageHeader, Card, Stat, SectionHeader, Tag } from "@/components/ui";
import { PlayerRow } from "@/components/PlayerRow";
import { AgeStrip, BarChart } from "@/components/charts";
import { fmtValue } from "@/lib/ui";
import { OpenInSleeper } from "@/components/OpenInSleeper";
import { sleeperTeamUrl } from "@/lib/sleeperLinks";

export const dynamic = "force-dynamic";

const WINDOW_COPY: Record<string, { tone: "info" | "accent" | "positive"; label: string; note: string }> = {
  rebuilding: { tone: "info", label: "Rebuilding / ascending", note: "Your core skews young - time is on your side." },
  "win-now": { tone: "accent", label: "Win-now window", note: "Your core is aging - the window is open now, not later." },
  balanced: { tone: "positive", label: "Balanced", note: "A mixed-age core - you can pivot either direction." },
};

export default async function RosterPage() {
  const h = await getLeagueHistory();
  const rosterId = h.me.rosterId;
  if (rosterId == null) {
    return <p className="text-muted">Couldn&apos;t identify your roster.</p>;
  }
  const a = analyzeRoster(h, rosterId);
  const win = WINDOW_COPY[a.window];
  const ages = a.valued.map((v) => v.age).filter((x): x is number => x != null);
  const posData = a.byPosition.map((p) => ({ label: p.pos, value: Math.round(p.value) }));

  return (
    <div>
      {/* Header + the escape hatch to this team on Sleeper. min-w-0/flex-1 lets a
          long owner name wrap instead of pushing the button off a 390px screen. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <PageHeader
            kicker={a.teamName ?? "Your team"}
            title={a.ownerName}
            subtitle={`${a.record.wins}-${a.record.losses} · ${a.valued.length} players`}
          />
        </div>
        <OpenInSleeper
          href={sleeperTeamUrl(h.currentLeague.leagueId, rosterId)}
          label="Sleeper"
          className="mt-1 shrink-0"
        />
      </div>

      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <Tag tone={win.tone}>{win.label}</Tag>
          <span className="font-mono text-sm text-muted">
            core age <span className="text-ink">{a.coreAge ?? "-"}</span>
          </span>
        </div>
        <p className="mt-2 text-sm text-muted">{win.note}</p>
      </Card>

      <div className="grid grid-cols-3 gap-2.5">
        <Stat
          label="Total value"
          value={fmtValue(a.totalValue)}
          sub={`${fmtValue(a.playerValue)} players + ${fmtValue(a.picks.total)} picks`}
        />
        <Stat
          label="1st-rd picks"
          value={a.picks.firsts}
          sub={
            a.picks.extraFirsts === 0
              ? "at baseline"
              : `${a.picks.extraFirsts > 0 ? "+" : ""}${a.picks.extraFirsts} vs baseline`
          }
          tone={a.picks.extraFirsts >= 0 ? "positive" : "negative"}
        />
        <Stat label="Core age" value={a.coreAge ?? "-"} />
      </div>

      {/* Pick capital - in dynasty, picks are assets, so they get real estate. */}
      <SectionHeader title={`Draft capital - ${a.picks.picks.length} picks`} />
      {a.picks.picks.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            No draft picks owned. Every future pick has been traded away - that
            caps how much this roster can change.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {a.picks.seasons.map((season) => {
            const forSeason = a.picks.picks.filter((p) => p.season === season);
            if (!forSeason.length) return null;
            return (
              <Card key={season}>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="font-mono text-sm font-semibold text-ink">{season}</span>
                  <span className="text-[11px] text-faint">
                    {fmtValue(forSeason.reduce((s, p) => s + p.value, 0))} value
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {forSeason.map((p) => (
                    <Tag key={`${p.season}-${p.round}-${p.originalRoster}`} tone={p.round === 1 ? "accent" : "neutral"}>
                      {p.round === 1 ? "1st" : p.round === 2 ? "2nd" : `${p.round}rd`}
                      {p.acquired && p.fromName ? ` · via ${p.fromName}` : ""}
                    </Tag>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <SectionHeader title="Age curve" />
      <Card>
        <AgeStrip ages={ages} />
        <p className="mt-1 text-center text-[11px] text-faint">
          Each dot is a rostered player. The dashed line is your average.
        </p>
      </Card>

      <SectionHeader title="Positional value" />
      <Card>
        <BarChart data={posData} format={(n) => fmtValue(n)} />
      </Card>

      <SectionHeader title="Roster - by value" />
      <div className="space-y-2">
        {a.valued.map((v) => (
          <PlayerRow
            key={v.playerId}
            name={v.name}
            team={v.team}
            position={v.position}
            age={v.age}
            value={v.value}
            tier={v.tier}
            playerId={v.playerId}
            injuryStatus={v.injuryStatus}
          />
        ))}
      </div>
    </div>
  );
}
