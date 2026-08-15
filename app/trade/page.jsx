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
  // The most motivated partners on the board: lowest timeline coherence. A
  // straddling roster has to pick a direction eventually, and either direction
  // means a trade.
  const motivated = leagueTimelines(h)
    .filter((t) => t.rosterId !== rosterId)
    .slice(-3)
    .reverse();
  return (
    <div>
      <PageHeader
        kicker="Trade evaluator"
        title="Should you make this move?"
        subtitle="We value both sides - but the answer isn't a grade. It's what each side is betting on, the assumption that must hold, and what your own history says. Picks are priced by who owes them."
      />
      {/* The builder prices a trade you already have in mind. The finder runs the other
            direction: it proposes the trade, using the same evaluator underneath. */}
      <nav aria-label="Trade tools" className="mb-2 flex gap-1.5">
        <Link
          href="/trade/finder"
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3 text-note leading-snug font-semibold text-muted transition-colors hover:border-accent hover:text-accent-text"
        >
          Find a trade for me
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      </nav>
      {/*
          Suspense because TradeBuilder reads the query string through useSearchParams -
          the give/get package is addressable now (lib/trade/url.ts), so checking a
          value or a dossier mid-build and coming back does not lose the package, and
          a pasted link reproduces it on another phone. This page is force-dynamic, so
          the boundary never actually suspends in practice; it is here so that
          dependency can never turn into a render-mode surprise later (same reasoning
          as /deals - see lib/tradegraph/url.ts).
        */}
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
                      <span className="block truncate text-body font-semibold leading-tight text-ink">
                        {t.teamName ?? t.ownerName}
                      </span>
                      <span className="block truncate figure text-meta leading-tight text-secondary">
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

      <Onward from="/trade" />
    </div>
  );
}
