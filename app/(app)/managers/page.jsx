import { Trophy } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getAllDossiers } from "@/lib/dossier";
import { titleSummariesByOwner } from "@/lib/dossier/titles";
import { getPrincipals } from "@/lib/principals";
import { ButtonLink, Chip, Disclosure, List, ListRow, PageHeader, StatTile } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { signed } from "@/lib/ui";
import { Onward } from "@/components/Onward";
/**
 * MANAGERS. Answers "who am I dealing with?": every manager's trading volume as a
 * row, sorted by total activity (lib/dossier), each opening the full dossier. The
 * behaviour lines live on the dossier, not here.
 */
export const dynamic = "force-dynamic";
export default async function ManagersPage() {
  const h = await getLeagueHistory();
  const principals = await getPrincipals(h);
  const dossiers = getAllDossiers(h, principals);
  const titlesByOwnerId = titleSummariesByOwner(h, principals);
  const seasons = h.chain.length || 1;
  const me = h.me.rosterId;
  return (
    <div>
      <PageHeader
        kicker="Trade"
        title="Managers"
        subtitle="How they act, not what they hold"
        aside={
          <ButtonLink href="/managers/compare" variant="secondary" size="sm">
            Compare
          </ButtonLink>
        }
      />
      <div className="mb-3 grid grid-cols-3 gap-2">
        <StatTile size="sm" label="Scouted" value={`${dossiers.length}`} sub="managers" />
        <StatTile size="sm" label="Seasons" value={`${seasons}`} sub="on record" />
        <StatTile size="sm" label="Moves" value={h.transactions.length.toLocaleString()} sub="read" />
      </div>

      <List aria-label="Managers by activity">
        {dossiers.map((d) => {
          const p = d.profile;
          const identity = d.identity;
          const isFormer = identity.kind === "former";
          // A former principal is absent from the current league's user list, so
          // their imagery comes off the principal record itself, not h.usersById.
          const principal = p.userId ? principals.byOwnerId.get(p.userId) : undefined;
          const href = isFormer ? `/managers/former/${identity.ownerId}` : `/managers/${identity.rosterId}`;
          const key = isFormer ? `former-${identity.ownerId}` : `current-${identity.rosterId}`;
          // Keyed by ownerId, not rosterId - see lib/dossier/titles.ts and D22.
          const titles = p.userId ? titlesByOwnerId.get(p.userId) : undefined;
          const mine = !isFormer && identity.rosterId === me;
          return (
            <li key={key}>
              <ListRow
                href={href}
                aria-label={`Dossier: ${p.teamName ?? p.displayName}`}
                highlight={mine}
                avatar={
                  <TeamAvatar
                    name={p.teamName ?? p.displayName}
                    avatarId={principal?.avatar}
                    teamLogoUrl={principal?.teamLogoUrl}
                    size="sm"
                  />
                }
                title={p.teamName ?? p.displayName}
                badge={
                  <>
                    {mine && (
                      <Chip size="sm" tone="accent">
                        You
                      </Chip>
                    )}
                    {isFormer && <Chip size="sm">former {identity.tenureLabel}</Chip>}
                    {titles && (
                      <Chip size="sm" tone="accent" icon={Trophy}>
                        {titles.label}
                      </Chip>
                    )}
                  </>
                }
                meta={`${p.displayName} · ${p.totalTransactions} moves · ${signed(p.picks.net)} picks`}
                value={`${p.trades}`}
                valueSub={`trades · ${d.tradesPerSeason}/szn`}
              />
            </li>
          );
        })}
      </List>

      <Disclosure className="mt-2" summary="How these are read">
        Private to this league. Reads are inferred from public transactions, not stated
        intent, and sorted by total activity. Each dossier carries the approach notes,
        trade history and favourite partners.
      </Disclosure>
      <Onward from="/managers" />
    </div>
  );
}
