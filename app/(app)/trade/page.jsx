import { Suspense } from "react";
import { getLeagueHistory } from "@/lib/history";
import { analyzeRoster, leagueValueRanking } from "@/lib/roster";
import { leagueTimelines } from "@/lib/metrics/duration";
import { Disclosure, List, ListRow, PageHeader, SectionHeader } from "@/components/ui";
import { PostureTag } from "@/components/PostureTag";
import { TeamAvatar } from "@/components/TeamAvatar";
import { Onward } from "@/components/Onward";
import { TradeBuilder } from "@/components/TradeBuilder";
import { TabIndex } from "@/components/TabIndex";
import { PartnersRow, TradeJobs } from "@/components/trade/TradeHub";
export const dynamic = "force-dynamic";
export default async function TradePage() {
  const h = await getLeagueHistory();
  const rosterId = h.me.rosterId;
  const mine = rosterId != null ? analyzeRoster(h, rosterId) : null;
  const myPlayers = (mine?.valued ?? []).map((v) => ({
    id: v.playerId,
    name: v.name,
    team: v.team,
    position: v.position,
    age: v.age,
    value: v.value,
  }));
  const ranking = leagueValueRanking(h);
  const others = ranking.filter((r) => r.rosterId !== rosterId);
  const otherPlayers = others
    .flatMap((r) =>
      r.valued.map((v) => ({
        id: v.playerId,
        name: v.name,
        team: v.team,
        position: v.position,
        age: v.age,
        value: v.value,
        owner: r.teamName ?? r.ownerName,
        ownerRosterId: r.rosterId,
      })),
    )
    .sort((a, b) => b.value - a.value);
  // REAL owned picks, valued and labelled by who owes them - so the slot-aware
  // pick model is actually reachable from the builder.
  const toPickOption = (p, owner, ownerRosterId) => ({
    id: `${p.season}-${p.round}-${p.originalRoster}`,
    season: p.season,
    round: p.round,
    originalRosterId: p.originalRoster,
    label: p.label,
    value: p.value,
    owner,
    ownerRosterId,
  });
  const myPicks = (mine?.picks.picks ?? []).map((p) => toPickOption(p));
  const otherPicks = others
    .flatMap((r) =>
      r.picks.picks.map((p) =>
        toPickOption(p, r.teamName ?? r.ownerName, r.rosterId),
      ),
    )
    .sort((a, b) => b.value - a.value);
  const partners = ranking
    .filter((r) => r.rosterId !== rosterId)
    .map((r) => {
      const ownerId = h.rostersById.get(r.rosterId)?.ownerId;
      const user = ownerId ? h.usersById.get(ownerId) : undefined;
      return {
        rosterId: r.rosterId,
        name: r.teamName ?? r.ownerName,
        avatarId: user?.avatar ?? null,
        teamLogoUrl: user?.teamLogoUrl ?? null,
      };
    });
  // The most motivated partners on the board: lowest timeline coherence. A
  // straddling roster has to pick a direction eventually, and either direction
  // means a trade.
  const motivated = leagueTimelines(h)
    .filter((t) => t.rosterId !== rosterId)
    .slice(-3)
    .reverse();
  return (
    <div>
      <PageHeader kicker="Trade" title="What's the job?" />
      <TradeJobs />
      <PartnersRow partners={partners} />

      <SectionHeader title="Check a deal" />
      <div id="check" className="scroll-mt-4" />
      <Suspense fallback={null}>
        <TradeBuilder
          myPlayers={myPlayers}
          otherPlayers={otherPlayers}
          myPicks={myPicks}
          otherPicks={otherPicks}
          leagueId={h.currentLeague.leagueId}
        />
      </Suspense>

      {/* Below the builder: who to actually call. Lowest-TCI rosters are the
            league's most motivated partners - their assets disagree about when they
            win, and fixing that requires a trade in SOME direction. */}
      {motivated.length > 0 && (
        <section aria-labelledby="motivated-title">
          <SectionHeader id="motivated-title" title="Most motivated partners" href="/league" cta="All timelines" />
          <List aria-label="Most motivated partners">
            {motivated.map((t) => {
              const ownerId = h.rostersById.get(t.rosterId)?.ownerId;
              const user = ownerId ? h.usersById.get(ownerId) : undefined;
              return (
                <li key={t.rosterId}>
                  {/* Names and the four facts wrap, never clip (D72, D111). */}
                  <ListRow
                    href={`/managers/${t.rosterId}`}
                    avatar={
                      <TeamAvatar
                        name={t.teamName ?? t.ownerName}
                        avatarId={user?.avatar}
                        teamLogoUrl={user?.teamLogoUrl}
                        size="sm"
                      />
                    }
                    title={t.teamName ?? t.ownerName}
                    badge={<PostureTag posture={t.posture} />}
                    meta={`TCI ${t.tci} · value ~${t.rosterDuration.toFixed(1)}s out · ${Math.round(t.nowShare * 100)}% now / ${Math.round(t.laterShare * 100)}% later`}
                  />
                </li>
              );
            })}
          </List>
          <Disclosure className="mt-1" summary="Why these three">
            The lowest-coherence rosters in the league. Their assets disagree about when
            they win, and either fix - consolidating young or cashing out old - runs
            through a trade. Read the dossier before you call.
          </Disclosure>
        </section>
      )}

      <TabIndex tab="trade" title="More in Trade" exclude={["/trade/finder", "/values", "/managers"]} />
      <Onward from="/trade" />
    </div>
  );
}
