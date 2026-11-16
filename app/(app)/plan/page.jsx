import Link from "next/link";
import { AlertTriangle, ArrowRight, Check } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { buildGamePlan } from "@/lib/gameplan";
import { getPrincipals } from "@/lib/principals";
import { leagueValueRanking, currentFormByRoster } from "@/lib/roster";
import { directionSummary } from "@/lib/team";
import { breakAssetNames, cachedLeagueTimelines } from "@/lib/metrics/duration";
import { leagueWindows, windowShort } from "@/lib/metrics/window";
import {
  ButtonLink,
  Card,
  Chip,
  Disclosure,
  EmptyState,
  PageHeader,
  SectionHeader,
  StatTile,
} from "@/components/ui";
import { DirectionCard } from "@/components/team/DirectionCard";
import { TeamAvatar } from "@/components/TeamAvatar";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { fmtValue } from "@/lib/ui";
export const dynamic = "force-dynamic";
/*
 * GAME PLAN. The page answers "what should I consider doing with this roster?": the
 * direction as one word with the three inputs that decided it (the same card /roster
 * opens with), then each move as a card - what you send, what you get, both totals,
 * the counterparty and one action. The reasoning, the cost, the timeline check and the
 * caveats each sit one tap away. Every figure comes from lib/gameplan; this page only
 * composes. The direction is the plan's reading of the inputs, never a grade (D6).
 */
export default async function PlanPage() {
  const h = await getLeagueHistory();
  const rosterId = h.me.rosterId;
  if (rosterId == null) {
    return (
      <EmptyState title="No roster picked" cta={{ href: "/teams", label: "Pick a team" }}>
        Couldn&apos;t identify your roster.
      </EmptyState>
    );
  }
  const principals = await getPrincipals(h);
  const plan = buildGamePlan(h, rosterId, principals);
  const dx = plan.diagnosis;
  const myUser = h.usersById.get(h.me.userId);
  const analysis = leagueValueRanking(h).find((r) => r.rosterId === rosterId) ?? null;
  const form = (await currentFormByRoster(h)).get(rosterId) ?? null;
  const summary = directionSummary({ dx, analysis, form });
  const dirWord = (summary?.label ?? dx.direction ?? "").toLowerCase();
  /*
   * The timeline check: `diagnose` reads the posture, so the plan and the timeline can
   * only stand on different feet when the standing override decided the call - stated
   * by `directionNote`. The window is the span or its refusal code (D95), linked to
   * /league, which owns the full synthesis.
   */
  const tl = cachedLeagueTimelines(h).find((t) => t.rosterId === rosterId);
  const timelineAgrees = dx.directionBasis === "posture";
  const windows = leagueWindows(h);
  const myWindow = windows.me
    ? { readable: windows.me.state === "window", short: windowShort(windows.me), peak: windows.me.peak }
    : null;
  const brk = tl && breakAssetNames(tl.timelineBreak) ? tl.timelineBreak : null;
  const ownerOf = (rid) => {
    const o = h.rostersById.get(rid)?.ownerId;
    return o ? h.usersById.get(o) : null;
  };

  return (
    <div>
      <PageHeader
        leading={
          <TeamAvatar
            name={h.me.teamName ?? h.me.displayName}
            avatarId={myUser?.avatar}
            teamLogoUrl={myUser?.teamLogoUrl}
            size="md"
            isMe
          />
        }
        kicker={h.me.teamName ?? h.me.displayName}
        title="Game plan"
        subtitle={`${plan.moves.length} ${plan.moves.length === 1 ? "move" : "moves"} to consider`}
      />

      {summary && (
        <DirectionCard summary={summary} href="/roster" cta="Roster">
          {dx.headline && <p className="mt-2 font-semibold text-ink">{dx.headline}</p>}
          {dx.because.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {dx.because.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </DirectionCard>
      )}

      {(dx.weakPositions.length > 0 || dx.strengthPositions.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {dx.strengthPositions.map((p) => (
            <Chip key={`s-${p}`} tone="positive" icon={Check}>
              Strong at {p}
            </Chip>
          ))}
          {dx.weakPositions.map((p) => (
            <Chip key={`w-${p}`} tone="warn" icon={AlertTriangle}>
              Thin at {p}
            </Chip>
          ))}
        </div>
      )}

      <SectionHeader title="Moves" href="/trade" cta="Trade builder" />
      <ol className="space-y-3">
        {plan.moves.map((m, i) => (
          <li key={m.id}>
            <Card
              as="article"
              data-plan-move
              data-counterparty={m.package?.counterparty.name ?? ""}
              aria-labelledby={`move-${m.id}`}
            >
              <div className="flex items-baseline gap-2">
                <span aria-hidden="true" className="shrink-0 figure text-note font-bold text-accent-text">
                  {i + 1}
                </span>
                <h3 id={`move-${m.id}`} className="min-w-0 flex-1 text-body font-semibold text-ink">
                  {m.title}
                </h3>
              </div>
              {m.package && (
                <p className="mt-1 flex items-center gap-1.5 pl-5 text-note text-secondary">
                  With
                  <TeamAvatar
                    name={m.package.counterparty.name}
                    avatarId={ownerOf(m.package.counterparty.rosterId)?.avatar}
                    teamLogoUrl={ownerOf(m.package.counterparty.rosterId)?.teamLogoUrl}
                    size="xs"
                  />
                  <span className="font-semibold text-ink">{m.package.counterparty.name}</span>
                </p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  {
                    label: "You send",
                    assets: m.package?.give,
                    total: m.package?.giveValue,
                    plain: m.give,
                  },
                  {
                    label: m.package ? "You get" : "You target",
                    assets: m.package?.get,
                    total: m.package?.getValue,
                    plain: m.get,
                  },
                ].map((side) => (
                  <div key={side.label} data-side={side.label} className="min-w-0 rounded-control bg-surface-2 p-3">
                    <p className="text-meta font-medium text-secondary">{side.label}</p>
                    {side.total != null && (
                      <p data-total className="figure text-lede font-bold text-ink">
                        {fmtValue(side.total)}
                      </p>
                    )}
                    {side.assets?.some((x) => x.kind === "player") && (
                      // Faces in a row of their own, so they never squeeze the names below.
                      <div aria-hidden="true" className="mt-1.5 flex -space-x-2">
                        {side.assets
                          .filter((x) => x.kind === "player")
                          .map((x) => (
                            <PlayerAvatar key={x.id} name={x.name} team={h.players.get(String(x.id))?.team} playerId={String(x.id)} size="sm" decorative />
                          ))}
                      </div>
                    )}
                    {side.assets ? (
                      <ul className="mt-1.5 space-y-1">
                        {side.assets.map((x) => (
                          <li key={x.id} className="flex items-baseline justify-between gap-2 text-note leading-snug">
                            <span className="min-w-0 text-ink">{x.name}</span>
                            <span className="shrink-0 figure text-meta text-secondary">{fmtValue(x.value)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p data-plain className="mt-1 text-note text-ink">
                        {side.plain.join(", ") || "none"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {m.package && (
                <ButtonLink href={m.package.builderHref} variant="secondary" size="sm" block className="mt-3">
                  Open in trade builder
                  <ArrowRight size={16} aria-hidden="true" />
                </ButtonLink>
              )}
              <Disclosure className="-mb-2 mt-1" summary="Why, and the cost">
                <p>{m.detail}</p>
                <p className="mt-2 flex items-start gap-1.5 text-warn">
                  <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                  <span>
                    <span className="font-semibold">The cost:</span> {m.cost}
                  </span>
                </p>
              </Disclosure>
            </Card>
          </li>
        ))}
      </ol>

      <SectionHeader title="Where the roster stands" />
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          size="sm"
          label={`${dx.starLine.tier} or better`}
          value={dx.starCount}
          sub={`valued ${fmtValue(dx.starLine.value)}+`}
        />
        <StatTile
          size="sm"
          label="Pick value"
          value={fmtValue(dx.pickTotal)}
          sub={dx.extraFirsts >= 0 ? `+${dx.extraFirsts} extra 1sts` : `${dx.extraFirsts} 1sts`}
        />
        <StatTile
          size="sm"
          label="Dead weight"
          value={dx.deadWeight}
          sub={`under ${fmtValue(dx.deadLine.value)}`}
        />
      </div>

      {tl && (
        <Disclosure
          className="mt-2"
          summary={`Timeline check: TCI ${tl.tci}, value ~${tl.rosterDuration.toFixed(1)}s out`}
        >
          <p>
            {tl.posture === "straddling"
              ? `Your assets do not agree about when you win: ${Math.round(tl.nowShare * 100)}% of your value pays off inside two seasons while ${Math.round(tl.laterShare * 100)}% arrives four or more out. A move that adds value but widens the spread makes this worse.`
              : timelineAgrees
                ? `The ${dirWord} call is read off this timeline: value concentrated around ${tl.rosterDuration.toFixed(1)} seasons out, assets agreed about it ("${tl.posture}"). Pieces dated far from it would pull against it.`
                : `The ${dirWord} call was decided by standing, not by this timeline (value ~${tl.rosterDuration.toFixed(1)} seasons out, ${tl.posture}). The two answer different questions, so this is a choice rather than a contradiction.`}
          </p>
          {myWindow && (
            <p className="mt-2">
              {myWindow.readable ? (
                <>
                  The middle half of your value is dated <span className="figure font-semibold">{myWindow.short}</span>
                  {myWindow.peak != null && (
                    <>
                      , heaviest in <span className="figure">{myWindow.peak}</span>
                    </>
                  )}
                  .
                </>
              ) : (
                <>
                  Your window is not readable: <span className="figure font-semibold">{myWindow.short}</span>.
                </>
              )}{" "}
              <Link href="/league" className="font-semibold text-accent-text underline underline-offset-2">
                Who is standing in it
              </Link>
            </p>
          )}
          {brk && (
            <p className="mt-2">
              {brk.assets.length > 1 ? "Two assets do" : "One asset does"} not fit that story:{" "}
              {brk.assets.map((a) => `${a.label}, ${a.duration.toFixed(1)} seasons`).join(", and ")}.{" "}
              <Link
                href={`/trade/finder?${new URLSearchParams({ move: brk.assets.map((a) => String(a.id)).join(",") }).toString()}`}
                className="font-semibold text-accent-text underline underline-offset-2"
              >
                Find a deal that moves {brk.assets.length > 1 ? "them" : "it"}
              </Link>
            </p>
          )}
          <p className="mt-2">
            <Link href="/methodology" className="font-semibold text-accent-text underline underline-offset-2">
              How TCI works
            </Link>
          </p>
        </Disclosure>
      )}

      <Disclosure
        summary={`Before you act${plan.caveats.length ? ` (${plan.caveats.length} ${plan.caveats.length === 1 ? "note" : "notes"})` : ""}`}
      >
        {plan.caveats.length > 0 && (
          <ul className="list-disc space-y-1.5 pl-4">
            {plan.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        )}
        <p className={plan.caveats.length ? "mt-2" : undefined}>
          Parquet can&apos;t execute trades; send a pitch from Sleeper.
        </p>
      </Disclosure>
    </div>
  );
}
