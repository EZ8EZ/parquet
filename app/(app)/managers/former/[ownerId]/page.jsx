import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lightbulb, Trophy } from "lucide-react";
import { PostureGlyph } from "@/components/PostureTag";
import { getLeagueHistory } from "@/lib/history";
import { buildFormerDossier } from "@/lib/dossier";
import { titleSummariesByOwner } from "@/lib/dossier/titles";
import { dossierBehaviours } from "@/lib/dossier/behaviours";
import { getPrincipals } from "@/lib/principals";
import { partnerIdentity } from "@/lib/dossier/partners";
import { managerDealsHref } from "@/lib/tradegraph/url";
import { BarList, Card, Chip, Disclosure, List, ListRow, PageHeader, SectionHeader, StatTile, Tabs } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { signed } from "@/lib/ui";
/**
 * FORMER MANAGER DOSSIER. Same answer as the current one ("how did this manager
 * deal?"), scoped to the seasons they ran the roster. Behaviour only: no roster
 * contents, no stated intent. All figures from lib/dossier.
 */
export const dynamic = "force-dynamic";
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
  const tradesData = p.tradesBySeason.map((s) => ({ label: s.season, value: s.count }));
  // Keyed by ownerId directly - the identity that survives the handover this page
  // exists to represent. See lib/dossier/titles.ts.
  const titles = titleSummariesByOwner(h, principals).get(ownerId);
  const name = p.teamName ?? p.displayName;
  const behaviours = dossierBehaviours(d);

  const tradesTab = (
    <>
      {tradesData.length > 0 && (
        <Card>
          <p className="mb-2 text-meta text-secondary">
            Trades by season · {p.trades} across {tradesData.length}
          </p>
          <BarList
            label="Trades by season"
            items={tradesData.map((t) => ({ key: t.label, label: `${t.label}`, value: t.value }))}
          />
        </Card>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <StatTile
          size="sm"
          label="Avg hold"
          value={p.avgHoldingDays != null ? `${p.avgHoldingDays}d` : "unknown"}
          sub="per player"
        />
        <StatTile
          size="sm"
          label="In"
          value={`${p.acquisitions.count}`}
          sub={p.acquisitions.avgAge != null ? `avg ${p.acquisitions.avgAge}y` : "age unknown"}
        />
        <StatTile
          size="sm"
          label="Out"
          value={`${p.disposals.count}`}
          sub={p.disposals.avgAge != null ? `avg ${p.disposals.avgAge}y` : "age unknown"}
        />
        <StatTile size="sm" label="Deadline" value={`${p.deadline.buys}/${p.deadline.sells}`} sub="buys / sells" />
        {p.afterLoss && p.afterLoss.total > 0 && (
          <StatTile
            size="sm"
            label="After a loss"
            value={`${p.afterLoss.afterLoss}/${p.afterLoss.total}`}
            sub="trades started"
          />
        )}
      </div>
      {p.postureBySeason.length > 0 && (
        <>
          <SectionHeader title="Posture by season" />
          {/* Postures are categories, not grades (components/PostureTag). */}
          <div className="flex flex-wrap gap-1.5">
            {p.postureBySeason.map((s) => (
              <Chip key={s.season}>
                <span className="figure">{s.season}</span>
                <PostureGlyph posture={s.posture} />
                {s.posture}
              </Chip>
            ))}
          </div>
        </>
      )}
    </>
  );

  const partnersTab =
    p.tradePartners.length > 0 ? (
      <>
        <List aria-label="Favourite trade partners">
          {p.tradePartners.slice(0, 6).map((tp) => {
            const t = partnerIdentity(h, principals, tp);
            return (
              <li key={tp.ownerId ?? `r${tp.rosterId}`}>
                <ListRow
                  href={t.href}
                  aria-label={`Dossier: ${t.name}`}
                  avatar={
                    <TeamAvatar
                      name={t.name}
                      avatarId={t.avatarId}
                      teamLogoUrl={t.teamLogoUrl}
                      size="sm"
                      isMe={!t.isFormer && h.me.rosterId === tp.rosterId}
                    />
                  }
                  title={t.name}
                  meta={t.tenureLabel ?? undefined}
                  value={`${tp.count}`}
                  valueSub={`deal${tp.count === 1 ? "" : "s"}`}
                />
              </li>
            );
          })}
        </List>
        <Link
          href={managerDealsHref(ownerId)}
          className="mt-1 inline-flex min-h-11 items-center text-note font-semibold text-accent-text"
        >
          Their deals
        </Link>
      </>
    ) : (
      <p className="text-note text-muted">No trades on record.</p>
    );

  return (
    <div>
      <Link
        href="/managers"
        className="-ml-1 -mt-2 inline-flex min-h-11 items-center gap-1.5 px-1 text-note font-semibold text-secondary transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        All managers
      </Link>

      <PageHeader
        leading={
          <TeamAvatar name={name} avatarId={principal?.avatar} teamLogoUrl={principal?.teamLogoUrl} size="lg" />
        }
        kicker="Former manager"
        /* Not truncated: a freeform team name wraps (D111). */
        title={name}
        subtitle={`${p.displayName} · ran it ${identity.tenureLabel}`}
        below={
          titles ? (
            <div className="mt-2">
              <Chip tone="accent" icon={Trophy}>
                {titles.label}
              </Chip>
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="Trades"
          value={`${p.trades}`}
          sub={`${d.tradesPerSeason}/season · ${p.tradesInitiated} started`}
        />
        {/* A net COUNT of picks moved, in ink: neither end is better (D6). */}
        <StatTile
          label="Picks traded"
          value={signed(p.picks.net)}
          sub={`net · ${p.picks.firstsAcquired} firsts in · ${p.picks.firstsSpent} out`}
        />
        <StatTile
          label="Avg acq. age"
          value={p.acquisitions.avgAge ?? "unknown"}
          sub={`${p.acquisitions.count} players added`}
        />
        <StatTile
          label="Waiver / FA"
          value={`${p.waivers + p.freeAgents}`}
          sub={p.faabAggression != null ? `~$${p.faabAggression} avg bid` : `${p.totalTransactions} moves total`}
        />
      </div>

      {behaviours.length > 0 && (
        <ul aria-label="Behaviours on record" className="mt-3 flex flex-wrap gap-1.5">
          {behaviours.map((b) => (
            <li key={b}>
              <Chip>{b}</Chip>
            </li>
          ))}
        </ul>
      )}
      <Disclosure className="mt-1" summary="The full read">
        <p>{d.read}</p>
        <p className="mt-2">
          No longer in the league: ran this roster {identity.tenureLabel}, then handed it
          off. Everything here is scoped to their own seasons only.
        </p>
      </Disclosure>

      <SectionHeader title="From their trade record" />
      <List aria-label="From their trade record">
        {d.approachTips.map((t, i) => (
          <li key={i} className="flex items-start gap-3 px-4 py-3">
            <Lightbulb size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-text" />
            <span className="text-body text-ink">{t}</span>
          </li>
        ))}
      </List>

      <Tabs
        className="mt-6"
        variant="segmented"
        label="Dossier sections"
        items={[
          { id: "trades", label: "Trades", content: tradesTab },
          { id: "partners", label: "Partners", content: partnersTab },
        ]}
      />

      <Disclosure className="mt-4" summary="How this is read">
        Read from {p.totalTransactions} recorded moves ({signed(p.picks.net)} net picks)
        across {identity.tenureLabel}. Behaviour only: no roster contents, no stated
        intent.
      </Disclosure>
      <SectionHeader title="More" />
      <List>
        <li>
          <ListRow href="/managers" title="All managers" />
        </li>
        <li>
          <ListRow href="/drafts" title="Pick lineage" />
        </li>
      </List>
    </div>
  );
}
