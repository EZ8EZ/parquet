import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { analyzeRoster, leagueValueRanking } from "@/lib/roster";
import { leagueTimelines } from "@/lib/metrics/duration";
import { PageHeader, SectionHeader } from "@/components/ui";
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
        <>
          <SectionHeader
            title="Most motivated partners"
            href="/league"
            cta="all timelines"
          />
          <ul className="space-y-1">
            {motivated.map((t) => {
              const ownerId = h.rostersById.get(t.rosterId)?.ownerId;
              const user = ownerId ? h.usersById.get(ownerId) : undefined;
              return (
                <li key={t.rosterId}>
                  <Link
                    href={`/managers/${t.rosterId}`}
                    className="flex min-h-11 items-center gap-2.5 rounded-[--radius-sm] border border-border bg-surface px-2.5 py-1.5 transition-colors hover:border-border-strong hover:bg-surface-2"
                  >
                    <TeamAvatar
                      name={t.teamName ?? t.ownerName}
                      avatarId={user?.avatar}
                      teamLogoUrl={user?.teamLogoUrl}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      {/* Was `truncate`: this row's own PostureTag chip sits beside the
                          name, so the longest real team name in the league clipped
                          ("Sweet Home Wembanya...", screenshotted live) the same way
                          /managers' card did before D72 gave the team name its own
                          full-width line. `line-clamp-2` keeps the whole name instead. */}
                      <span className="block text-body font-semibold leading-snug text-ink line-clamp-2">
                        {t.teamName ?? t.ownerName}
                      </span>
                      {/* Was `truncate`: this line's four facts (TCI, value duration,
                          now/later split) were clipping mid-percentage on real rows
                          ("...% now / 2..." for "24% now / 22% later"), the same shape of
                          bug D72 fixed on /league's own window/TCI/RFI/posture line -
                          real information cut, not a label. `line-clamp-2` keeps every
                          fact instead of losing whichever one lands last. */}
                      <span className="block figure text-meta leading-snug text-secondary line-clamp-2">
                        TCI {t.tci} · value ~{t.rosterDuration.toFixed(1)}s out
                        · {Math.round(t.nowShare * 100)}% now /{" "}
                        {Math.round(t.laterShare * 100)}% later
                      </span>
                    </span>
                    <PostureTag posture={t.posture} />
                    <ChevronRight
                      size={14}
                      aria-hidden="true"
                      className="shrink-0 text-faint"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-meta leading-snug text-secondary">
            The lowest-coherence rosters in the league. Their assets disagree
            about when they win, and either fix - consolidating young or cashing
            out old - runs through a trade. Read the dossier before you call.
          </p>
        </>
      )}

      <TabIndex tab="trade" title="More in Trade" exclude={["/trade/finder", "/values", "/managers"]} />
      <Onward from="/trade" />
    </div>
  );
}
