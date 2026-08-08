import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Lightbulb, Trophy } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { buildDossier, dossiersByOwner } from "@/lib/dossier";
import { titleSummariesByOwner } from "@/lib/dossier/titles";
import { getPrincipals } from "@/lib/principals";
import { partnerIdentity } from "@/lib/dossier/partners";
import { scheduleLuckForRoster } from "@/lib/metrics/scheduleLuck";
import { managerDealsHref } from "@/lib/tradegraph/url";
import { Tag, DeltaValue, SectionHeader } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { BarChart } from "@/components/charts";
import { ManagerRail } from "@/components/ManagerRail";
import { DistributionStrip } from "@/components/DistributionStrip";
import { Onward } from "@/components/Onward";
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
    <div className="rounded-[--radius-sm] border border-border bg-surface px-2.5 py-1.5">
      <div className="text-meta uppercase tracking-wide text-secondary">{label}</div>
      <div
        className={cn(
          "figure text-lede font-semibold leading-tight",
          tone === "positive"
            ? "text-positive"
            : tone === "negative"
              ? "text-negative"
              : tone === "accent"
                ? "text-accent-text"
                : "text-ink",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-meta leading-tight text-muted">{sub}</div>}
    </div>
  );
}

const POSTURE_TONE: Record<string, string> = {
  rebuilding: "border-info/30 bg-info/[0.08] text-info",
  contending: "border-accent-edge bg-accent-wash text-accent-text",
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
  const luck = await scheduleLuckForRoster(h, principals, rosterId);
  const p = d.profile;
  const tradesData = p.tradesBySeason.map((s) => ({ label: s.season, value: s.count }));
  const isMe = h.me.rosterId === rosterId;
  const user = p.userId ? h.usersById.get(p.userId) : undefined;
  // Credited to the PERSON, via the same ownerId a roster handover would otherwise
  // get wrong - see lib/dossier/titles.ts.
  const titles = p.userId ? titleSummariesByOwner(h, principals).get(p.userId) : undefined;

  // Net pick capital for EVERY principal, so this dossier's figure has the league it
  // was earned in printed beside it. Same builder /managers and Manager Compare
  // already call - one pass over the same transactions, no new derivation (D25).
  const netPicksLeague = [...dossiersByOwner(h, principals).values()].map(
    (x) => x.profile.picks.net,
  );

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
        className="-ml-1 -mt-3 mb-0.5 inline-flex min-h-11 items-center gap-1.5 px-1 text-meta font-semibold text-muted transition-colors hover:text-accent-text"
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
          <p className="text-meta font-semibold uppercase tracking-[0.18em] text-accent-text">
            {isMe ? "Your own file" : "Dossier"}
          </p>
          <h1 className="truncate font-display text-display font-semibold leading-[1.15] text-ink">
            {p.teamName ?? p.displayName}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 figure text-meta text-faint">
            <span className="truncate">{p.displayName}</span>
            <span aria-hidden="true">·</span>
            <span>{p.trades} trades</span>
            <span aria-hidden="true">·</span>
            <span>{d.tradesPerSeason}/szn</span>
          </div>
        </div>
      </header>

      {titles && (
        <p className="mb-2 flex items-center gap-1.5 text-note font-semibold text-accent-text">
          <Trophy size={14} aria-hidden="true" className="shrink-0" />
          {titles.label}
        </p>
      )}

      {d.tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {d.tags.map((t) => (
            <Tag key={t} tone="accent">
              {t}
            </Tag>
          ))}
        </div>
      )}

      <p className="rounded-[--radius] border border-border bg-surface p-2.5 text-body leading-[1.42] text-ink">
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
              className="mt-[3px] shrink-0 text-accent-text"
            />
            <p className="text-note leading-snug text-ink/90">{t}</p>
          </li>
        ))}
      </ul>

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

      {/*
       * "Pick capital +6" is the dossier's sharpest behavioural claim and, on its
       * own, an unreadable one: +6 over five seasons could be the most aggressive
       * pick buyer in the league or an ordinary Tuesday. This is the only SIGNED
       * distribution in the app, so it is the one place the diverging pair does real
       * work - magenta below zero, green above, split at a meaningful centre rather
       * than at an arbitrary median. Position and the printed rank carry the same
       * reading, so the hue is never load-bearing on its own
       * (lib/chart-colors.ts, rules 1 and 3).
       */}
      <DistributionStrip
        label="Net picks, against the league"
        values={netPicksLeague}
        mine={p.picks.net}
        format={(n) => (n > 0 ? `+${n}` : `${n}`)}
        signed
        sub="Picks acquired minus picks spent, over every recorded season. Neither end is better: buying picks and spending them are both strategies."
        className="mt-1.5 rounded-[--radius-sm] border border-border bg-surface py-1.5"
      />

      <p className="mt-1.5 figure text-meta leading-relaxed text-secondary">
        {extras.join(" · ")}
      </p>

      {luck && luck.gamesPlayed > 0 && (
        <>
          <SectionHeader title="Schedule luck" />
          <div className="grid grid-cols-2 gap-1.5">
            <Metric
              label="Actual record"
              value={`${luck.wins}-${luck.losses}${luck.ties ? `-${luck.ties}` : ""}`}
              sub={`${luck.gamesPlayed} games`}
            />
            <Metric
              label="Scoring says"
              value={`${luck.expectedWins.toFixed(1)}-${(luck.gamesPlayed - luck.expectedWins).toFixed(1)}`}
              sub={luck.allPlay ? "all-play record" : "Pythagorean expected"}
            />
          </div>
          <p className="mt-1.5 text-note leading-snug text-muted">
            <span
              className={cn(
                "font-semibold",
                luck.luckWins >= 0 ? "text-positive" : "text-negative",
              )}
            >
              {signed(Math.round(luck.luckWins * 10) / 10)} wins
            </span>{" "}
            of {luck.luckWins >= 0 ? "cushion" : "drag"} versus what their scoring
            alone earned them
            {luck.luckiest && luck.unluckiest && luck.luckiest !== luck.unluckiest
              ? ` - ${luck.luckiest.season} was their kindest schedule, ${luck.unluckiest.season} their harshest.`
              : "."}
          </p>
          {!luck.allPlay && (
            <p className="mt-1 text-meta leading-relaxed text-secondary">
              From season point totals (points for vs. points against), not
              week-by-week play - this league&apos;s per-week history isn&apos;t
              loaded for the live provider (see lib/history.ts). Not the same as a
              true all-play record, but the same honest question: does the record
              match the scoring.
            </p>
          )}
        </>
      )}

      {p.afterLoss && p.afterLoss.total > 0 && (
        <p className="mt-1.5 text-note leading-snug text-muted">
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
                  "inline-flex items-baseline gap-1.5 rounded-full border px-2 py-0.5 figure text-meta",
                  POSTURE_TONE[s.posture] ?? POSTURE_TONE.balanced,
                )}
              >
                {s.season}
                <span className="text-meta font-medium not-italic opacity-80">
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
              <span className="figure text-meta text-secondary">
                {p.trades} across {tradesData.length} seasons
              </span>
            }
          />
          <div className="rounded-[--radius] border border-border bg-surface px-2 pb-1 pt-2">
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
                // Straight to this manager's own deals, filtered - which is what this
                // link was always trying to do, back when the only destination was a
                // ring with their strands lit.
                href={p.userId ? managerDealsHref(p.userId) : "/deals"}
                className="-my-2 inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-accent-text"
              >
                their deals
                <ChevronRight size={12} aria-hidden="true" />
              </Link>
            }
          />
          <div className="overflow-hidden rounded-[--radius] border border-border bg-surface">
            <ul className="divide-y divide-border">
              {p.tradePartners.slice(0, 6).map((tp) => {
                const t = partnerIdentity(h, principals, tp);
                return (
                  <li key={tp.ownerId ?? `r${tp.rosterId}`}>
                    <Link
                      href={t.href}
                      aria-label={`Dossier: ${t.name}`}
                      className="flex min-h-11 items-center gap-2.5 px-2.5 py-1.5 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
                    >
                      <TeamAvatar
                        name={t.name}
                        avatarId={t.avatarId}
                        teamLogoUrl={t.teamLogoUrl}
                        size="xs"
                        isMe={!t.isFormer && h.me.rosterId === tp.rosterId}
                      />
                      <span className="min-w-0 flex-1 truncate text-note font-medium text-ink">
                        {t.name}
                        {t.tenureLabel && (
                          <span className="text-meta font-normal text-secondary">
                            {" "}
                            {t.tenureLabel}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 figure text-meta text-muted">
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

      {/*
       * These three chips used to be "Price a trade / Game plan / Pick lineage" -
       * three generic app destinations on a page whose entire subject is one specific
       * person. A reader who has just finished reading what a rival values had no
       * path to a trade WITH THEM; they got a blank trade builder. Same rule as
       * everywhere else a manager is named (lib/nav.ts).
       */}
      <SectionHeader title={isMe ? "Your own file" : `More on ${p.teamName ?? p.displayName}`} />
      <ManagerRail
        rosterId={rosterId}
        ownerId={p.userId ?? null}
        isMe={isMe}
        omit={[`/managers/${rosterId}`]}
      />

      <Onward from="/managers" />

      <p className="mt-3 text-meta leading-relaxed text-secondary">
        Read from {p.totalTransactions} recorded moves ({signed(p.picks.net)} net
        picks). Behavior only - no roster contents, no stated intent.
      </p>
    </div>
  );
}
