import Link from "next/link";
import { AlertTriangle, ArrowRight, Target } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { buildGamePlan } from "@/lib/gameplan";
import { PageHeader, Card, SectionHeader, Tag, Stat } from "@/components/ui";
import { CopyBlock } from "@/components/CopyBlock";
import { fmtValue } from "@/lib/ui";

export const dynamic = "force-dynamic";

const DIR_LABEL: Record<
  string,
  { label: string; tone: "accent" | "info" | "warn" | "positive" }
> = {
  contend: { label: "Contend", tone: "accent" },
  ascend: { label: "Ascend", tone: "positive" },
  rebuild: { label: "Rebuild", tone: "info" },
  retool: { label: "Retool", tone: "warn" },
};

export default async function PlanPage() {
  const h = await getLeagueHistory();
  const rosterId = h.me.rosterId;
  if (rosterId == null) {
    return (
      <p className="text-muted">
        Couldn&apos;t identify your roster.{" "}
        <Link href="/teams" className="text-accent underline">
          Pick a team
        </Link>
        .
      </p>
    );
  }
  const plan = buildGamePlan(h, rosterId);
  const dx = plan.diagnosis;
  const dir = DIR_LABEL[dx.direction];

  return (
    <div>
      <PageHeader
        kicker="Game plan"
        title="How to improve this team"
        subtitle={`${h.me.teamName ?? h.me.displayName} - ranked ${dx.valueRank} of ${dx.teams} by total asset value.`}
      />

      {/* The verdict, up top. */}
      <Card className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <Tag tone={dir.tone}>{dir.label}</Tag>
          <span className="text-[11px] uppercase tracking-wide text-faint">
            recommended direction
          </span>
        </div>
        <h2 className="font-display text-2xl font-semibold leading-tight text-ink">
          {dx.headline}
        </h2>
        <ul className="mt-3 space-y-1.5">
          {dx.because.map((b, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
              <span className="text-ink/85">{b}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Stars" value={dx.starCount} sub="cornerstone+" />
        <Stat
          label="Pick value"
          value={fmtValue(dx.pickTotal)}
          sub={dx.extraFirsts >= 0 ? `+${dx.extraFirsts} extra 1sts` : `${dx.extraFirsts} 1sts`}
          tone={dx.extraFirsts >= 0 ? "positive" : "negative"}
        />
        <Stat label="Fringe" value={dx.deadWeight} sub="roster clogs" />
      </div>

      {(dx.weakPositions.length > 0 || dx.strengthPositions.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {dx.strengthPositions.map((p) => (
            <Tag key={`s-${p}`} tone="positive">
              strong at {p}
            </Tag>
          ))}
          {dx.weakPositions.map((p) => (
            <Tag key={`w-${p}`} tone="negative">
              thin at {p}
            </Tag>
          ))}
        </div>
      )}

      {/* The moves - the actual point of the page. */}
      <SectionHeader title={`${plan.moves.length} moves to consider`} />
      <div className="space-y-3">
        {plan.moves.map((m, i) => (
          <article
            key={m.id}
            className="rounded-[--radius] border border-border bg-surface/70 p-4"
          >
            <div className="mb-2 flex items-start gap-2.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-[11px] font-semibold text-accent">
                {i + 1}
              </span>
              <h3 className="font-display text-lg font-semibold leading-snug text-ink">
                {m.title}
              </h3>
            </div>
            <p className="text-sm leading-relaxed text-ink/85">{m.detail}</p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-[--radius-sm] border border-border bg-bg/40 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-faint">
                  You send
                </div>
                <div className="mt-0.5 text-sm text-ink">{m.give.join(", ") || "-"}</div>
              </div>
              <div className="rounded-[--radius-sm] border border-border bg-bg/40 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-faint">
                  You target
                </div>
                <div className="mt-0.5 text-sm text-ink">{m.get.join(", ") || "-"}</div>
              </div>
            </div>

            {m.partnerName && (
              <Link
                href={`/managers/${m.partnerRosterId}`}
                className="mt-3 flex items-start gap-2 rounded-[--radius-sm] border border-info/25 bg-info/[0.06] p-2.5 transition-colors hover:border-info/50"
              >
                <Target size={14} className="mt-0.5 shrink-0 text-info" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-ink">
                    Try {m.partnerName}
                  </div>
                  {m.partnerRationale && (
                    <div className="mt-0.5 text-[11px] leading-relaxed text-muted">
                      {m.partnerRationale}
                    </div>
                  )}
                </div>
                <ArrowRight size={13} className="mt-0.5 shrink-0 text-info" />
              </Link>
            )}

            <div className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-warn">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                <span className="font-semibold">The cost:</span> {m.cost}
              </span>
            </div>

            <div className="mt-3">
              <CopyBlock text={m.copyable} />
            </div>
          </article>
        ))}
      </div>

      {plan.caveats.length > 0 && (
        <>
          <SectionHeader title="Read this before you act" />
          <div className="space-y-2">
            {plan.caveats.map((c, i) => (
              <Card key={i} className="border-warn/25 bg-warn/[0.05]">
                <p className="text-sm leading-relaxed text-ink/85">{c}</p>
              </Card>
            ))}
          </div>
        </>
      )}

      <p className="mt-8 text-center text-[11px] leading-relaxed text-faint">
        Parquet can&apos;t execute trades - Sleeper has no write API. Copy a summary
        and send it from Sleeper.
      </p>
    </div>
  );
}
