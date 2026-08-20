import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Lightbulb, Trophy } from "lucide-react";
import { PostureGlyph } from "@/components/PostureTag";
import { getLeagueHistory } from "@/lib/history";
import { buildFormerDossier } from "@/lib/dossier";
import { titleSummariesByOwner } from "@/lib/dossier/titles";
import { getPrincipals } from "@/lib/principals";
import { partnerIdentity } from "@/lib/dossier/partners";
import { managerDealsHref } from "@/lib/tradegraph/url";
import { Tag, DeltaValue, PageHeader, SectionHeader } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { BarChart } from "@/components/charts";
import { cn, signed } from "@/lib/ui";
export const dynamic = "force-dynamic";
function Metric({ label, value, sub, tone = "neutral" }) {
  return (
    <div className="rounded-[--radius-sm] border border-border bg-surface px-2.5 py-1.5">
      <div className="text-meta uppercase tracking-wide text-secondary">
        {label}
      </div>
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
/* Postures are categories, not grades - see the note in components/PostureTag.tsx.
 * These season chips used to spell rebuilding as `info` and contending as `accent`,
 * which spent the app's one reserved "this is yours" hue on a category unrelated to
 * the viewer. One neutral chip now; the glyph and the word carry the distinction. */
const POSTURE_CHIP = "border-border bg-elevated text-muted";
export default async function FormerManagerDetailPage({ params }) {
  const { ownerId } = await params;
  const h = await getLeagueHistory();
  const principals = await getPrincipals(h);
  // A former dossier only exists for a principal who has actually left the league -
  // a current occupant's ownerId, or an unknown one, has no route here.
  const d = buildFormerDossier(h, ownerId, principals);
  if (!d || d.identity.kind !== "former") notFound();
  const identity = d.identity;
  const p = d.profile;
  const principal = principals.byOwnerId.get(ownerId);
  const tradesData = p.tradesBySeason.map((s) => ({
    label: s.season,
    value: s.count,
  }));
  // Keyed by ownerId directly - the identity that survives the handover this page
  // exists to represent. See lib/dossier/titles.ts.
  const titles = titleSummariesByOwner(h, principals).get(ownerId);
  const extras = [];
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

      <PageHeader
        leading={
          <TeamAvatar
            name={p.teamName ?? p.displayName}
            avatarId={principal?.avatar}
            teamLogoUrl={principal?.teamLogoUrl}
            size="lg"
          />
        }
        kicker="Dossier · former manager"
        title={p.teamName ?? p.displayName}
        /* Same fix as `/managers/[rosterId]`, same shared PageHeader misuse: NOT
           `truncateTitle` on a freeform team name (see that file's own note). */
      >
        <div className="flex flex-wrap items-center gap-x-2 figure text-meta text-faint">
          <span className="truncate">{p.displayName}</span>
          <span aria-hidden="true">·</span>
          <span>{identity.tenureLabel}</span>
          <span aria-hidden="true">·</span>
          <span>{p.trades} trades</span>
          <span aria-hidden="true">·</span>
          <span>{d.tradesPerSeason}/szn</span>
        </div>
      </PageHeader>

      <p className="mb-2 rounded-[--radius-sm] border border-border-strong bg-elevated px-2.5 py-1.5 text-meta leading-snug text-muted">
        No longer in the league - ran this roster {identity.tenureLabel}, then
        handed it off. Everything below is scoped to their own seasons only.
      </p>

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
          /* "Picks traded", not "Pick capital": this is a net COUNT of picks moved
             across a career, while the figure /roster labels pick capital is the VALUE
             of the picks a roster holds. Same words for two units is how a reader
             concludes the app is broken. */
          label="Picks traded"
          value={<DeltaValue n={p.picks.net} />}
          sub={`net · ${p.picks.firstsAcquired} firsts in · ${p.picks.firstsSpent} out`}
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
      <p className="mt-1.5 figure text-meta leading-relaxed text-secondary">
        {extras.join(" · ")}
      </p>

      {p.afterLoss && p.afterLoss.total > 0 && (
        <p className="mt-1.5 text-note leading-snug text-muted">
          <span className="font-semibold text-ink">After a loss:</span>{" "}
          {p.afterLoss.afterLoss} of {p.afterLoss.total} self-initiated trades
          came the week after a loss
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
                  POSTURE_CHIP,
                )}
              >
                {s.season}
                {/* Same pre-existing color-contrast fix as `/managers/[rosterId]` -
                    see that file's own note. */}
                <span className="inline-flex items-baseline gap-1 text-meta font-medium not-italic">
                  <PostureGlyph posture={s.posture} />
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
                // Straight to this manager's own deals - a former manager's whole
                // trade record is exactly what the web's node panel shows.
                href={managerDealsHref(ownerId)}
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

      <div className="mt-3 flex flex-wrap gap-1.5">
        {[
          { href: "/managers", label: "All dossiers" },
          { href: "/drafts", label: "Pick lineage" },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-3 text-note font-semibold text-ink transition-colors hover:border-border-strong hover:bg-surface-2"
          >
            {a.label}
          </Link>
        ))}
      </div>

      <p className="mt-3 text-meta leading-relaxed text-secondary">
        Read from {p.totalTransactions} recorded moves ({signed(p.picks.net)}{" "}
        net picks) across {identity.tenureLabel}. Behavior only - no roster
        contents, no stated intent.
      </p>
    </div>
  );
}
