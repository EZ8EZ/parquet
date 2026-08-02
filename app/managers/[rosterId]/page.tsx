import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Lightbulb } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { buildDossier } from "@/lib/dossier";
import { generateApproachMessage } from "@/lib/dossier/message";
import { getPrincipals } from "@/lib/principals";
import { managerWebHref } from "@/lib/tradegraph/url";
import { Tag, DeltaValue, SectionHeader } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { BarChart } from "@/components/charts";
import { CopyBlock } from "@/components/CopyBlock";
import { cn, signed } from "@/lib/ui";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";


function Metric({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "positive" | "negative" | "accent";
}) {
  return (
    <div className="rounded-[--radius-sm] border border-border bg-surface/60 px-2.5 py-1.5">
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
      <div
        className={cn(
          "font-mono text-lg font-semibold leading-tight tnum",
          tone === "positive"
            ? "text-positive"
            : tone === "negative"
              ? "text-negative"
              : tone === "accent"
                ? "text-accent"
                : "text-ink",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] leading-tight text-muted">{sub}</div>}
    </div>
  );
}

const POSTURE_TONE: Record<string, string> = {
  rebuilding: "border-info/30 bg-info/[0.08] text-info",
  contending: "border-accent/30 bg-accent/[0.08] text-accent",
  balanced: "border-border bg-elevated text-muted",
};

export default async function ManagerDetailPage({
  params,
}: {
  params: Promise<{ rosterId: string }>;
}) {
  const { rosterId: rid } = await params;
  const rosterId = parseInt(rid, 10);
  const h = await getLeagueHistory();
  if (!h.rostersById.has(rosterId)) notFound();

  const principals = await getPrincipals(h);
  const d = buildDossier(h, rosterId, principals);
  const p = d.profile;
  const tradesData = p.tradesBySeason.map((s) => ({ label: s.season, value: s.count }));
  const isMe = h.me.rosterId === rosterId;
  const user = p.userId ? h.usersById.get(p.userId) : undefined;

  /** Team identity for any roster in the league (used by the partner rows). */
  const teamOf = (id: number) => {
    const r = h.rostersById.get(id);
    const u = r?.ownerId ? h.usersById.get(r.ownerId) : undefined;
    return {
      name: u?.teamName ?? u?.displayName ?? `Roster ${id}`,
      handle: u?.displayName ?? null,
      user: u,
    };
  };

  const extras: string[] = [];
  if (p.avgHoldingDays != null) extras.push(`avg hold ${p.avgHoldingDays}d`);
  if (p.deadline.buys || p.deadline.sells)
    extras.push(
      `deadline ${p.deadline.buys} buy${p.deadline.buys === 1 ? "" : "s"} / ${p.deadline.sells} sell${p.deadline.sells === 1 ? "" : "s"}`,
    );
  extras.push(
    `${p.acquisitions.count} in${p.acquisitions.avgAge != null ? ` (avg ${p.acquisitions.avgAge}y)` : ""}`,
  );
  extras.push(
    `${p.disposals.count} out${p.disposals.avgAge != null ? ` (avg ${p.disposals.avgAge}y)` : ""}`,
  );

  return (
    <div>
      {/* Negative margins keep the 44px tap target from adding visible space. */}
      <Link
        href="/managers"
        className="-ml-1 -mt-3 mb-0.5 inline-flex min-h-11 items-center gap-1.5 px-1 text-[11px] font-semibold text-muted transition-colors hover:text-accent"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        All dossiers
      </Link>

      <header className="mb-2 flex items-start gap-3">
        <TeamAvatar
          name={p.teamName ?? p.displayName}
          avatarId={user?.avatar}
          teamLogoUrl={user?.teamLogoUrl}
          size="lg"
          isMe={isMe}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            {isMe ? "Your own file" : "Dossier"}
          </p>
          <h1 className="truncate font-display text-[24px] font-semibold leading-[1.15] text-ink">
            {p.teamName ?? p.displayName}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] tnum text-faint">
            <span className="truncate">{p.displayName}</span>
            <span aria-hidden="true">·</span>
            <span>{p.trades} trades</span>
            <span aria-hidden="true">·</span>
            <span>{d.tradesPerSeason}/szn</span>
          </div>
        </div>
      </header>

      {d.tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {d.tags.map((t) => (
            <Tag key={t} tone="accent">
              {t}
            </Tag>
          ))}
        </div>
      )}

      <p className="rounded-[--radius] border border-border bg-surface/80 p-2.5 text-[13px] leading-[1.42] text-ink">
        {d.read}
      </p>

      <SectionHeader title="How to approach them" />
      {/* Bullets, not boxes: hierarchy from weight and the gold marker. */}
      <ul className="space-y-1.5">
        {d.approachTips.map((t, i) => (
          <li key={i} className="flex items-start gap-2">
            <Lightbulb
              size={13}
              aria-hidden="true"
              className="mt-[3px] shrink-0 text-accent"
            />
            <p className="text-[12.5px] leading-snug text-ink/90">{t}</p>
          </li>
        ))}
      </ul>

      <div className="mt-2">
        <CopyBlock
          text={generateApproachMessage(d)}
          label="Draft message"
        />
      </div>

      <SectionHeader title="The numbers" />
      <div className="grid grid-cols-2 gap-1.5">
        <Metric
          label="Trades"
          value={p.trades}
          sub={`${p.tradesInitiated} initiated · ${p.tradesResponded} responded`}
        />
        <Metric
          label="Pick capital"
          value={<DeltaValue n={p.picks.net} />}
          sub={`${p.picks.firstsAcquired} firsts in · ${p.picks.firstsSpent} out`}
          tone={p.picks.net >= 0 ? "positive" : "negative"}
        />
        <Metric
          label="Avg acq. age"
          value={p.acquisitions.avgAge ?? "-"}
          sub={`${p.acquisitions.count} players added`}
        />
        <Metric
          label="Waiver / FA"
          value={p.waivers + p.freeAgents}
          sub={
            p.faabAggression != null
              ? `~$${p.faabAggression} avg bid`
              : `${p.totalTransactions} moves total`
          }
        />
      </div>
      <p className="mt-1.5 font-mono text-[11px] leading-relaxed tnum text-faint">
        {extras.join(" · ")}
      </p>

      {p.afterLoss && p.afterLoss.total > 0 && (
        <p className="mt-1.5 text-[12px] leading-snug text-muted">
          <span className="font-semibold text-ink">After a loss:</span>{" "}
          {p.afterLoss.afterLoss} of {p.afterLoss.total} self-initiated trades came
          the week after a loss
          {p.afterLoss.afterLoss > p.afterLoss.afterWin
            ? " - a possible tilt tell."
            : "."}
        </p>
      )}

      {p.postureBySeason.length > 0 && (
        <>
          <SectionHeader title="Posture by season" />
          <div className="flex flex-wrap gap-1">
            {p.postureBySeason.map((s) => (
              <span
                key={s.season}
                className={cn(
                  "inline-flex items-baseline gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] tnum",
                  POSTURE_TONE[s.posture] ?? POSTURE_TONE.balanced,
                )}
              >
                {s.season}
                <span className="text-[11px] font-medium not-italic opacity-80">
                  {s.posture}
                </span>
              </span>
            ))}
          </div>
        </>
      )}

      {tradesData.length > 0 && (
        <>
          <SectionHeader
            title="Trade activity"
            action={
              <span className="font-mono text-[11px] tnum text-faint">
                {p.trades} across {tradesData.length} seasons
              </span>
            }
          />
          <div className="rounded-[--radius] border border-border bg-surface/60 px-2 pb-1 pt-2">
            <BarChart data={tradesData} height={104} />
          </div>
        </>
      )}

      {p.tradePartners.length > 0 && (
        <>
          <SectionHeader
            title="Favorite trade partners"
            action={
              <Link
                // Straight to this manager's strands, not the bare ring - the URL
                // helper the trade web now exposes exists for exactly this link.
                href={p.userId ? managerWebHref(p.userId) : "/web"}
                className="-my-2 inline-flex min-h-11 items-center gap-1 text-[11px] font-semibold text-accent"
              >
                trade web
                <ChevronRight size={12} aria-hidden="true" />
              </Link>
            }
          />
          <div className="overflow-hidden rounded-[--radius] border border-border bg-surface/60">
            <ul className="divide-y divide-border">
              {p.tradePartners.slice(0, 6).map((tp) => {
                const t = teamOf(tp.rosterId);
                return (
                  <li key={tp.rosterId}>
                    <Link
                      href={`/managers/${tp.rosterId}`}
                      aria-label={`Dossier: ${t.name}`}
                      className="flex min-h-11 items-center gap-2.5 px-2.5 py-1.5 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
                    >
                      <TeamAvatar
                        name={t.name}
                        avatarId={t.user?.avatar}
                        teamLogoUrl={t.user?.teamLogoUrl}
                        size="xs"
                        isMe={h.me.rosterId === tp.rosterId}
                      />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                        {t.name}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tnum text-muted">
                        {tp.count} deal{tp.count === 1 ? "" : "s"}
                      </span>
                      <ChevronRight
                        size={13}
                        aria-hidden="true"
                        className="shrink-0 text-faint"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {[
          { href: "/trade", label: "Price a trade" },
          { href: "/plan", label: "Game plan" },
          { href: "/drafts", label: "Pick lineage" },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface/60 px-3 text-[12px] font-semibold text-ink transition-colors hover:border-border-strong hover:bg-surface-2"
          >
            {a.label}
          </Link>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Read from {p.totalTransactions} recorded moves ({signed(p.picks.net)} net
        picks). Behavior only - no roster contents, no stated intent.
      </p>
    </div>
  );
}
