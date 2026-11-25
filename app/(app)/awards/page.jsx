import Link from "next/link";
import { ChevronRight, Scale, Trophy } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { AWARD_GROUPS, awardsPageData } from "@/lib/superlatives";
import { Card, Chip, Disclosure, EmptyState, List, ListRow, PageHeader, Sheet, StatTile, Tabs } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { AwardBadge, GROUP_TONE, iconForAward } from "@/components/AwardBadge";
import { AwardPoster } from "@/components/AwardTitleCard";
import { Onward } from "@/components/Onward";
export const dynamic = "force-dynamic";
/*
 * THE SUPERLATIVES. The page answers "who leads each of the league's awards?": the
 * counts behind them as tiles, your own awards first, then the awards by group as
 * rows (badge, title, winner, stat line) that open a sheet with the title card, the
 * award's definition, the winner and the runners-up. Every figure is a published
 * measurement from lib/superlatives; the copy states what happened (D6).
 */

/**
 * A departed manager's dossier is keyed by owner id; the roster they left now
 * describes their successor. A former entrant with no owner id has no route.
 */
function entrantHref(e) {
  if (e.isFormer) return e.ownerId ? `/managers/former/${e.ownerId}` : undefined;
  return `/managers/${e.rosterId}`;
}

function isMine(e, meRosterId) {
  return meRosterId != null && !e.isFormer && (e.rosterId === meRosterId || e.partnerRosterId === meRosterId);
}

function EntrantBadge({ e, me }) {
  if (me)
    return (
      <Chip size="sm" tone="accent">
        You
      </Chip>
    );
  if (e.isFormer) return <Chip size="sm">former{e.tenureLabel ? ` ${e.tenureLabel}` : ""}</Chip>;
  return null;
}

function AwardDetail({ award, meRosterId, userOf }) {
  const w = award.winner;
  const me = isMine(w, meRosterId);
  const user = userOf(w);
  return (
    <>
      <div className="overflow-hidden rounded-card">
        <AwardPoster as="p" title={award.title} deck={award.statLine} />
      </div>
      <p className="mt-3 text-note text-muted">{award.subtitle}</p>
      <List className="mt-3 bg-surface-2" aria-label="Standings">
        <li>
          <ListRow
            href={entrantHref(w)}
            highlight={me}
            leading="1"
            avatar={<TeamAvatar name={w.label} avatarId={user?.avatar} teamLogoUrl={user?.teamLogoUrl} size="sm" isMe={me} />}
            title={w.label}
            badge={<EntrantBadge e={w} me={me} />}
            meta={w.isFormer ? null : w.displayName}
          />
        </li>
        {award.runnersUp.map((r, i) => {
          const rme = isMine(r, meRosterId);
          const ru = userOf(r);
          return (
            <li key={`${r.ownerId ?? r.rosterId}-${r.partnerRosterId ?? ""}`}>
              <ListRow
                href={entrantHref(r)}
                highlight={rme}
                leading={String(i + 2)}
                avatar={<TeamAvatar name={r.label} avatarId={ru?.avatar} teamLogoUrl={ru?.teamLogoUrl} size="sm" isMe={rme} />}
                title={r.label}
                badge={<EntrantBadge e={r} me={rme} />}
                meta={<span className="figure">{r.stat}</span>}
              />
            </li>
          );
        })}
      </List>
      {w.partnerRosterId != null && (
        <Link
          href={`/managers/${w.partnerRosterId}`}
          className="mt-1 inline-flex min-h-11 items-center gap-0.5 text-note font-semibold text-accent-text"
        >
          Also see {w.partnerLabel}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      )}
    </>
  );
}

function AwardRow({ award, meRosterId, userOf }) {
  const w = award.winner;
  const me = isMine(w, meRosterId);
  return (
    <li>
      <Sheet
        triggerHint="Show details"
        title={award.title}
        subtitle={w.label}
        trigger={
          <ListRow
            as="span"
            chevron
            highlight={me}
            avatar={<AwardBadge icon={iconForAward(award.id)} tone={GROUP_TONE[award.group]} rank="winner" size={36} />}
            title={award.title}
            badge={<EntrantBadge e={w} me={me} />}
            meta={
              <>
                <span className="font-medium text-muted">{w.label}</span>
                <span className="figure"> · {award.statLine}</span>
              </>
            }
          />
        }
      >
        <AwardDetail award={award} meRosterId={meRosterId} userOf={userOf} />
      </Sheet>
    </li>
  );
}

export default async function AwardsPage() {
  const h = await getLeagueHistory();
  const { awards, summary } = await awardsPageData(h);
  const meRosterId = h.me.rosterId;
  const userOf = (entrant) => {
    if (entrant.ownerId) return h.usersById.get(entrant.ownerId);
    const r = h.rostersById.get(entrant.rosterId);
    return r?.ownerId ? h.usersById.get(r.ownerId) : undefined;
  };
  const mine = awards.filter((a) => isMine(a.winner, meRosterId));
  const groups = AWARD_GROUPS.map((g) => ({ ...g, items: awards.filter((a) => a.group === g.id) })).filter(
    (g) => g.items.length > 0,
  );
  return (
    <div>
      <PageHeader kicker="League awards" title="The Superlatives" subtitle="Earned, not voted" />

      {awards.length === 0 ? (
        <EmptyState
          icon={<Trophy size={22} aria-hidden />}
          title="Not enough history yet"
          cta={{ href: "/league", label: "See the league" }}
        >
          Not enough recorded transactions to hand out awards yet.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            <StatTile size="sm" label="Awards" value={String(awards.length)} tone="accent" />
            <StatTile size="sm" label="Managers" value={String(summary.managers)} />
            <StatTile size="sm" label="Trades" value={String(summary.trades)} />
            <StatTile size="sm" label="Moves" value={summary.moves.toLocaleString()} />
          </div>

          {mine.length > 0 && (
            <Card tone="accent" className="mt-2">
              <p className="text-meta font-medium text-secondary">Your mantel</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {mine.map((a) => (
                  <li key={a.id}>
                    <Chip tone="accent" icon={iconForAward(a.id)}>
                      {a.title}
                    </Chip>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Tabs
            className="mt-4"
            label="Award groups"
            items={groups.map((g) => ({
              id: g.id,
              label: g.label,
              count: g.items.length,
              content: (
                <List aria-label={g.label}>
                  {g.items.map((a) => (
                    <AwardRow key={a.id} award={a} meRosterId={meRosterId} userOf={userOf} />
                  ))}
                </List>
              ),
            }))}
          />

          <Disclosure summary="How these are settled" icon={<Scale size={14} />} className="mt-3">
            <p>
              Derived from {summary.moves.toLocaleString()} recorded transactions across {summary.seasons} seasons.
              Ties break to the lower roster number. Awards with no real signal behind them are left unawarded
              rather than handed to the least-bad entrant.
            </p>
            {summary.formerManagers > 0 && (
              <p className="mt-2">
                {summary.managers} managers across {summary.managers - summary.formerManagers} teams:{" "}
                {summary.formerManagers} team{summary.formerManagers === 1 ? " has" : "s have"} changed hands, and
                each manager is judged only on the seasons they actually ran.
              </p>
            )}
          </Disclosure>
        </>
      )}
      <Onward from="/awards" />
    </div>
  );
}
