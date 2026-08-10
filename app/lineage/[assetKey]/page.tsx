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
import { loadProvenanceSource } from "@/lib/provenance/source";
import { ProvenanceRail, chainSummary } from "@/components/ProvenanceRail";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card, Disclosure, SectionHeader } from "@/components/ui";
import { cachedValuePlayers } from "@/lib/valuation";
import { leagueTiers, tierResolver } from "@/lib/rankings/tiers";
import { assetPlayerId } from "@/lib/tradegraph";
import { valuesFocusHref } from "@/lib/values/url";
import { fmtValue } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function LineagePage({
  params,
}: {
  params: Promise<{ assetKey: string }>;
}) {
  const { assetKey: raw } = await params;
  const assetKey = decodeURIComponent(raw);

  // Shape check only, and it never throws: an unrecognisable key is a 404, not an
  // error page.
  const requestedPid = assetPlayerId(assetKey);
  if (!requestedPid && !parsePickKey(assetKey)) notFound();

  const h = await getLeagueHistory();
  if (requestedPid && !h.players.has(requestedPid)) notFound();

  const { ctx } = await loadProvenanceSource(h);
  const chain = buildProvenance(ctx, assetKey);
  if (!chain) notFound();

  // The chain's SUBJECT, which is not always what was asked for: a spent pick
  // resolves to the player it became, since that is the same chain and the player is
  // the half that still exists.
  const pid = assetPlayerId(chain.assetKey);
  const player = pid ? h.players.get(pid) : undefined;

  let value: number | null = null;
  let tier: string | null = null;
  if (pid) {
    const values = cachedValuePlayers(h);
    const v = values.get(pid);
    if (v && v.value > 0) {
      const desc = [...values.values()]
        .map((x) => x.value)
        .filter((x) => x > 0)
        .sort((a, b) => b - a);
      value = v.value;
      tier =
        tierResolver(leagueTiers(desc))(v.value)
          ?.label ?? null;
    }
  }

  return (
    <div>
      <header className="mb-3">
        <p className="text-meta font-semibold uppercase tracking-[0.18em] text-accent-text">
          How this got here
        </p>
        <div className="flex items-center gap-2.5">
          {pid && (
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
          )}
          <div className="min-w-0">
            <h1 className="min-w-0 font-display text-display font-semibold leading-tight text-ink">
              {player?.fullName ?? chain.label}
            </h1>
            <p className="figure text-meta text-secondary">
              {pid
                ? [player?.position, player?.age != null ? `${player.age}y` : null]
                    .filter(Boolean)
                    .join(" · ")
                : "draft pick"}
            </p>
          </div>
        </div>
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
      </header>

      <Card>
        <ProvenanceRail chain={chain} />
      </Card>

      <SectionHeader title="What this is and is not" />
      <Card>
        <p className="text-body leading-relaxed text-muted">
          Read upward and this answers one question only: how the thing you hold today
          got to you. It is not a claim that the trade was good, and there is no grade
          anywhere on it.
        </p>
        <Disclosure summary="Where this chain can be wrong" className="mt-1">
          <p>
            A pick is not the player. Where a chain crosses a draft it credits whoever
            was actually taken at that slot, which is a fact - but a manager who
            acquired the pick and then took someone else would leave the same trace,
            and a draft board nobody used leaves no record at all.
          </p>
          <p className="mt-1.5">
            Commissioner-executed trades reach us with no picks attached, so a hop that
            moved a pick by hand can be missing from the chain entirely. Where a pick
            was reconstructed rather than recorded, the hop says so.
          </p>
          <p className="mt-1.5">
            The record starts when this league&apos;s history does. Anything that was
            already true then reads &quot;on this roster before the record
            begins&quot;, which is honest rather than complete.
          </p>
        </Disclosure>
      </Card>

      <div className="mt-3 flex flex-wrap gap-1.5">
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
