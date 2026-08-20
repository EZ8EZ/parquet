/**
 * ONE ASSET'S PROVENANCE, at its own address.
 *
 * "Cooper Flagg is on my team because of a first-rounder I traded away two years
 * before he was drafted. Here's the receipt." That is the sentence this page exists
 * to make linkable, and linkable is most of the point - the reason for a standalone
 * route rather than only an in-row expansion is that this is the one thing in the app
 * anybody would actually paste into a league chat.
 *
 * EVERY ASSET HAS ONE, including a player who has never been traded, so there is
 * deliberately no empty state anywhere in this feature: "your 2022 startup
 * third-rounder, never moved" is a real answer and a common one, not a failure to
 * find something.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { buildProvenance, parsePickKey } from "@/lib/provenance";
import {
  chainGapScenes,
  draftDatesFrom,
  holdDurationsByRoster,
  loadProvenanceSource,
} from "@/lib/provenance/source";
import { ProvenanceRail, chainSummary } from "@/components/ProvenanceRail";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card, Disclosure, PageHeader, SectionHeader } from "@/components/ui";
import { cachedValuePlayers } from "@/lib/valuation";
import { leagueTiers, tierResolver } from "@/lib/rankings/tiers";
import { assetPlayerId } from "@/lib/tradegraph";
import { valuesFocusHref } from "@/lib/values/url";
import { depthChartHref } from "@/lib/depth/url";
import { fmtValue } from "@/lib/ui";
export const dynamic = "force-dynamic";
export default async function LineagePage({ params }) {
  const { assetKey: raw } = await params;
  const assetKey = decodeURIComponent(raw);
  // Shape check only, and it never throws: an unrecognisable key is a 404, not an
  // error page.
  const requestedPid = assetPlayerId(assetKey);
  if (!requestedPid && !parsePickKey(assetKey)) notFound();
  const h = await getLeagueHistory();
  if (requestedPid && !h.players.has(requestedPid)) notFound();
  const { ctx, moves, index } = await loadProvenanceSource(h);
  const chain = buildProvenance(ctx, assetKey);
  if (!chain) notFound();
  // EVERY GAP GETS ITS OWN SCENE, scoped to whoever was holding the thing - see
  // `chainGapScenes`. Computed only here, not on /roster's inline rails: this page is
  // one asset at a time, so the cost is bounded, and the per-gap comparisons stay
  // inside closed disclosures regardless (D58's density mandate is about what a reader
  // sees on arrival, and a shut `<details>` shows nothing extra).
  const scenes = chainGapScenes(h, chain, ctx);
  // Both free: `moves` and `index` were already built by the call above and thrown
  // away. Real draft dates become the rail's SOLID hairlines, and the hold population
  // is what a single hold is read against.
  const drafts = draftDatesFrom(index);
  const holdDurations = holdDurationsByRoster(moves);
  // The chain's SUBJECT, which is not always what was asked for: a spent pick
  // resolves to the player it became, since that is the same chain and the player is
  // the half that still exists.
  const pid = assetPlayerId(chain.assetKey);
  const player = pid ? h.players.get(pid) : undefined;
  let value = null;
  let tier = null;
  if (pid) {
    const values = cachedValuePlayers(h);
    const v = values.get(pid);
    if (v && v.value > 0) {
      const desc = [...values.values()]
        .map((x) => x.value)
        .filter((x) => x > 0)
        .sort((a, b) => b - a);
      value = v.value;
      tier = tierResolver(leagueTiers(desc))(v.value)?.label ?? null;
    }
  }
  const depthHref = pid && player?.team ? depthChartHref(player.team, pid) : null;
  return (
    <div>
      <PageHeader
        kicker="How this got here"
        leading={
          pid ? (
            <PlayerAvatar
              name={player?.fullName ?? chain.label}
              team={player?.team ?? null}
              playerId={pid}
              size="md"
              // The crest replaces the team abbreviation that used to sit in the
              // line below - one header, one player, the kind of "fewer, larger"
              // spot this app's imagery is supposed to earn rather than the
              // opposite of the 260-row lists where the letters stay text.
              teamBadge
            />
          ) : undefined
        }
        title={player?.fullName ?? chain.label}
        below={
          <p className="mt-1 text-note leading-snug text-muted">
            {chainSummary(chain)}
            {value != null && (
              <>
                {" · worth "}
                <span className="figure font-semibold text-ink">
                  {fmtValue(value)}
                </span>
                {tier ? ` today (${tier})` : " today"}
              </>
            )}
          </p>
        }
      >
        <p className="figure text-meta text-secondary">
          {pid
            ? [player?.position, player?.age != null ? `${player.age}y` : null]
                .filter(Boolean)
                .join(" · ")
            : "draft pick"}
        </p>
      </PageHeader>

      <Card>
        <ProvenanceRail
          chain={chain}
          scenes={scenes}
          drafts={drafts}
          holdDurations={holdDurations}
          names={ctx.names}
        />
      </Card>

      <SectionHeader title="What this is and is not" />
      <Card>
        <p className="text-body leading-relaxed text-muted">
          Read top to bottom and this answers one question only: how the thing
          you hold today got to you. It is not a claim that the trade was good,
          and there is no grade anywhere on it.
        </p>
        <Disclosure summary="Where this chain can be wrong" className="mt-1">
          <p>
            A pick is not the player. Where a chain crosses a draft it credits
            whoever was actually taken at that slot, which is a fact - but a
            manager who acquired the pick and then took someone else would leave
            the same trace, and a draft board nobody used leaves no record at
            all.
          </p>
          <p className="mt-1.5">
            Commissioner-executed trades reach us with no picks attached, so a
            hop that moved a pick by hand can be missing from the chain
            entirely. Nothing here is reconstructed to fill that in - where a
            hop we DO have came from a commissioner move, it says so and names
            what is missing; where the hop itself was never recorded, the chain
            is simply shorter than the truth and cannot know it.
          </p>
          <p className="mt-1.5">
            The record starts when this league&apos;s history does. Anything
            that was already true then reads &quot;on this roster before the
            record begins&quot;, which is honest rather than complete.
          </p>
        </Disclosure>
      </Card>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {/* WHERE HE SITS TONIGHT. This page answers "how did I get him"; the
            question a reader holds immediately after that is "and what is his
            actual role now", which is the one thing on the same subject that this
            app can answer from a fact rather than a model. Rendered only when
            Sleeper has him on an NBA team - a free agent has no chart to open. */}
        {depthHref && player?.team && (
          <Link
            href={depthHref}
            className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-surface px-3 text-note font-semibold leading-snug text-muted transition-colors hover:border-accent hover:text-accent-text"
          >
            Where he sits on {player.team}
            <ChevronRight size={13} aria-hidden="true" />
          </Link>
        )}
        {pid && (
          <Link
            href={valuesFocusHref(pid)}
            className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-surface px-3 text-note font-semibold leading-snug text-muted transition-colors hover:border-accent hover:text-accent-text"
          >
            How he is valued
            <ChevronRight size={13} aria-hidden="true" />
          </Link>
        )}
        <Link
          href="/deals"
          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-surface px-3 text-note font-semibold leading-snug text-muted transition-colors hover:border-accent hover:text-accent-text"
        >
          Every deal
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
