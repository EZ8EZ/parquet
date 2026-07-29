import { getLeagueHistory } from "@/lib/history";
import { analyzeRoster } from "@/lib/roster";
import { PageHeader, Card, Stat, SectionHeader, Tag, DeltaValue } from "@/components/ui";
import { PlayerRow } from "@/components/PlayerRow";
import { AgeStrip, BarChart } from "@/components/charts";
import { fmtValue } from "@/lib/ui";

export const dynamic = "force-dynamic";

const WINDOW_COPY: Record<string, { tone: "info" | "accent" | "positive"; label: string; note: string }> = {
  rebuilding: { tone: "info", label: "Rebuilding / ascending", note: "Your core skews young — time is on your side." },
  "win-now": { tone: "accent", label: "Win-now window", note: "Your core is aging — the window is open now, not later." },
  balanced: { tone: "positive", label: "Balanced", note: "A mixed-age core — you can pivot either direction." },
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
      <PageHeader
        kicker={a.teamName ?? "Your team"}
        title={a.ownerName}
        subtitle={`${a.record.wins}-${a.record.losses} · ${a.valued.length} players`}
      />

      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <Tag tone={win.tone}>{win.label}</Tag>
          <span className="font-mono text-sm text-muted">
            core age <span className="text-ink">{a.coreAge ?? "—"}</span>
          </span>
        </div>
        <p className="mt-2 text-sm text-muted">{win.note}</p>
      </Card>

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Roster value" value={fmtValue(a.totalValue)} />
        <Stat label="1st-rd picks" value={<DeltaValue n={a.firsts.net} />} sub={`${a.firsts.acquired} in / ${a.firsts.lost} out`} tone={a.firsts.net >= 0 ? "positive" : "negative"} />
        <Stat label="Core age" value={a.coreAge ?? "—"} />
      </div>

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

      <SectionHeader title="Roster — by value" />
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
