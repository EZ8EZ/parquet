import Link from "next/link";
import { getLeagueHistory } from "@/lib/history";
import { leagueValueRanking } from "@/lib/roster";
import { PageHeader, Card, SectionHeader, Tag, DeltaValue } from "@/components/ui";
import { fmtValue } from "@/lib/ui";
import { OpenInSleeper } from "@/components/OpenInSleeper";
import { sleeperLeagueUrl } from "@/lib/sleeperLinks";

export const dynamic = "force-dynamic";

const WINDOW_TONE = {
  rebuilding: "info",
  "win-now": "accent",
  balanced: "neutral",
} as const;

export default async function LeaguePage() {
  const h = await getLeagueHistory();
  const ranked = leagueValueRanking(h);
  const meId = h.me.rosterId;

  const contenders = ranked.filter((r) => r.window === "win-now").length;
  const rebuilders = ranked.filter((r) => r.window === "rebuilding").length;

  return (
    <div>
      {/* Header + the escape hatch to this league on Sleeper. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <PageHeader
            kicker={h.currentLeague.name}
            title="The League"
            subtitle={`${h.currentLeague.totalRosters} teams · ${h.chain.length} seasons of history · ${h.currentLeague.season} season`}
          />
        </div>
        <OpenInSleeper
          href={sleeperLeagueUrl(h.currentLeague.leagueId)}
          label="Sleeper"
          className="mt-1 shrink-0"
        />
      </div>

      <div className="mb-5 grid grid-cols-3 gap-2.5">
        <Card className="text-center">
          <div className="font-mono text-2xl font-semibold text-accent">{contenders}</div>
          <div className="text-[11px] uppercase tracking-wide text-faint">win-now</div>
        </Card>
        <Card className="text-center">
          <div className="font-mono text-2xl font-semibold text-info">{rebuilders}</div>
          <div className="text-[11px] uppercase tracking-wide text-faint">rebuilding</div>
        </Card>
        <Card className="text-center">
          <div className="font-mono text-2xl font-semibold text-ink">
            {ranked.length - contenders - rebuilders}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-faint">balanced</div>
        </Card>
      </div>

      <SectionHeader
        title="Power ranking - by roster value"
        action={
          <Link href="/managers" className="text-xs font-semibold text-accent">
            dossiers →
          </Link>
        }
      />
      <div className="space-y-2">
        {ranked.map((r, i) => {
          const isMe = r.rosterId === meId;
          return (
            <Link
              key={r.rosterId}
              href={`/managers/${r.rosterId}`}
              className={`flex items-center gap-3 rounded-[--radius-sm] border px-3 py-3 transition-colors hover:border-border-strong ${
                isMe ? "border-accent/40 bg-accent/[0.06]" : "border-border bg-surface/60"
              }`}
            >
              <span className="w-5 text-center font-mono text-sm text-faint">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink">
                    {r.teamName ?? r.ownerName}
                  </span>
                  {isMe && <Tag tone="accent">you</Tag>}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-faint">
                  <span>{r.ownerName}</span>
                  <span>·</span>
                  <span className="font-mono">{r.record.wins}-{r.record.losses}</span>
                  <Tag tone={WINDOW_TONE[r.window]}>{r.window}</Tag>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm font-semibold tnum text-ink">
                  {fmtValue(r.totalValue)}
                </div>
                <div className="text-[10px] text-faint">
                  1sts <DeltaValue n={r.picks.extraFirsts} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
