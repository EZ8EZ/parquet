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
import { Card, Disclosure, List, ListRow, PageHeader } from "@/components/ui";
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
          <p className="mt-1 text-note text-muted">
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

      <Disclosure className="mt-2" summary="What this is, and where it can be wrong">
        <p>
          How the thing you hold today got to you, read top to bottom. Not a claim that any trade was good; no grade
          anywhere on it.
        </p>
        <p className="mt-2">
          A pick is not the player: where a chain crosses a draft it credits whoever was actually taken at that slot.
          Commissioner-executed trades reach us with no picks attached, so a hand-moved pick can be missing; where a
          hop we have came from a commissioner move, it says so. The record starts when this league&apos;s history
          does.
        </p>
      </Disclosure>

      <List className="mt-3" aria-label="Related">
        {depthHref && player?.team && (
          <li>
            <ListRow href={depthHref} title={`Where he sits on ${player.team}`} meta="Sleeper's depth chart" />
          </li>
        )}
        {pid && (
          <li>
            <ListRow href={valuesFocusHref(pid)} title="How he is valued" meta="Asset values" />
          </li>
        )}
        <li>
          <ListRow href="/deals" title="Every deal" meta="The deal index" />
        </li>
      </List>
    </div>
  );
}
