/**
 * THE RECEIPT - one trade, one URL.
 *
 * This is the page `tradeWebHref` should always have been pointing at. The digest,
 * global search, Manager Compare, the dossiers and the commissioner's audit log have
 * all been linking a specific deal for rounds; every one of them landed the reader in
 * a fourteen-node ring with one strand lit and the deal itself somewhere in a list
 * underneath. `TradeRecord` was already the receipt - it just had nowhere to print.
 *
 * Two stacked side-blocks (N for a multi-team deal - `tradeParties` already computes
 * the party set, and this league's biggest deals are three-way), each asset a row
 * carrying what it is worth TODAY and, for a pick, what it actually became. Every
 * player row links to its own provenance rail: trade -> asset -> trade is the whole
 * loop this feature is built around.
 *
 * NO GRADE, NO WINNER (D6). The totals are labelled "what each side is worth today"
 * and nothing here computes a delta, a percentage or a verdict. Three separate
 * honesty caveats ride with the number rather than sitting on a methodology page:
 *   - D23: this is hindsight. It measures how the deal turned out, not how it was
 *     reasoned. We hold NO historical ranking snapshots, so a value-at-trade-time
 *     version is not available and the copy says "today" and only today.
 *   - D24: players only. Commissioner-executed trades arrive with `draft_picks: []`,
 *     so including the picks we happen to have would produce a total that looks
 *     complete and is not.
 *   - D19: a commissioner-executed deal says so at the top - not that its picks were
 *     inferred (they never are), but that its pick record is simply gone.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Hourglass } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getPrincipals } from "@/lib/principals";
import { buildTradeLedger, tradeParties, pickKey } from "@/lib/tradegraph";
import { loadProvenanceSource } from "@/lib/provenance/source";
import { lineageHref, playerLineageHref } from "@/lib/tradegraph/url";
import { cachedValuePlayers } from "@/lib/valuation";
import { leagueTiers, tierResolver } from "@/lib/rankings/tiers";
import { leagueTimelines, playerDuration } from "@/lib/metrics/duration";
import { leagueFragility } from "@/lib/metrics/fragility";
import { ordinal } from "@/lib/derive/describe";
import { Card, Disclosure, PageHeader, SectionHeader } from "@/components/ui";
import { LocalDate } from "@/components/LocalDate";
import { ManagerLink, PlayerNowRow } from "@/components/TradeParts";
import { SideBars } from "@/components/charts";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { fmtValue } from "@/lib/ui";
export const dynamic = "force-dynamic";
export default async function DealPage({ params }) {
  const { transactionId } = await params;
  const id = decodeURIComponent(transactionId);
  const h = await getLeagueHistory();
  const principals = await getPrincipals(h);
  const ledger = buildTradeLedger(h, principals);
  const record = ledger.trades.find((t) => t.id === id);
  const tx = h.transactions.find((t) => t.transactionId === id);
  if (!record || !tx) notFound();
  // One assembly, shared by the pick resolution below and by nothing else on this
  // page - the rails themselves live on /lineage, one tap away from every row.
  const { pickPlayers } = await loadProvenanceSource(h, { principals });
  const values = cachedValuePlayers(h);
  const valuesDesc = [...values.values()]
    .map((v) => v.value)
    .filter((v) => v > 0)
    .sort((a, b) => b - a);
  const tierFor = tierResolver(leagueTiers(valuesDesc));
  const holdings = {};
  for (const r of h.rosters)
    for (const pid of r.players) holdings[pid] = r.rosterId;
  const nowOf = (pid) => {
    const v = values.get(pid);
    if (!v || v.value <= 0) return undefined;
    const p = h.players.get(pid);
    return {
      team: p?.team ?? null,
      value: v.value,
      tier: tierFor(v.value)?.label ?? "Fringe",
      duration: playerDuration(p?.age ?? null),
      heldBy: holdings[pid] ?? null,
    };
  };
  const managerMetrics = {};
  for (const t of leagueTimelines(h)) {
    managerMetrics[t.rosterId] = {
      tci: t.tci,
      posture: t.posture,
      rosterDuration: t.rosterDuration,
      fragility: null,
      fragilityBand: null,
    };
  }
  for (const f of leagueFragility(h)) {
    managerMetrics[f.rosterId] = {
      ...(managerMetrics[f.rosterId] ?? {
        tci: 0,
        posture: "straddling",
        rosterDuration: 0,
      }),
      fragility: f.fragility,
      fragilityBand: f.band,
    };
  }
  const names = {};
  for (const m of ledger.managers) if (!m.isFormer) names[m.rosterId] = m.name;
  // Read the parties from the transaction itself, not from the asset moves: a move
  // needs a recorded `from` to exist at all, and a receipt that silently omitted an
  // asset because its counterpart drop was missing would be the wrong kind of tidy.
  const parties = tradeParties(tx);
  const sides = parties.map((rosterId) => {
    const playersIn = Object.entries(tx.adds)
      .filter(([, r]) => r === rosterId)
      .map(([pid]) => pid);
    const picksIn = tx.draftPicks.filter((dp) => dp.ownerId === rosterId);
    const total = playersIn.reduce((s, pid) => s + (nowOf(pid)?.value ?? 0), 0);
    const side = record.sides.find((s) => s.rosterId === rosterId);
    const ownerId = principals.ownerAt(record.season, rosterId);
    const manager = ledger.managers.find((m) => m.ownerId === ownerId);
    return { rosterId, playersIn, picksIn, total, side, manager };
  });
  const maxTotal = Math.max(1, ...sides.map((s) => s.total));
  const anyValued = sides.some((s) => s.total > 0);
  return (
    <div>
      <Link
        href="/deals"
        className="-ml-2 mb-1 inline-flex min-h-11 items-center gap-1 px-2 text-meta font-semibold text-muted transition-colors hover:text-accent-text"
      >
        <ChevronLeft size={13} aria-hidden="true" />
        All deals
      </Link>

      <PageHeader
        kicker={`${record.season} · week ${record.week}`}
        title={record.multiTeam ? `${parties.length}-team deal` : "The deal"}
      >
        <p className="mt-0.5 figure text-meta text-secondary">
          <LocalDate ts={record.created} />
        </p>
        <p className="mt-1 text-note leading-snug text-muted">
          {record.summary}
        </p>
      </PageHeader>

      {record.commissionerExecuted && (
        <Card className="mb-3 border-warn/30 bg-warn/[0.06]">
          <p className="text-note leading-snug text-muted">
            <span className="font-semibold text-warn">
              Pick record missing.
            </span>{" "}
            The commissioner executed this deal by hand, and Sleeper records no
            picks against commissioner moves. If picks changed hands here, they
            are not below - and the app will not guess which ones.
          </p>
        </Card>
      )}

      {sides.map((s) => (
        <section
          key={s.rosterId}
          className="mb-2 rounded-[--radius] border border-border bg-surface p-3"
        >
          <div className="flex items-start justify-between gap-2">
            {s.manager ? (
              <ManagerLink
                node={s.manager}
                metric={
                  s.manager.isFormer
                    ? undefined
                    : managerMetrics[s.manager.rosterId]
                }
                isMe={s.manager.isMe}
              />
            ) : (
              <span className="text-body font-semibold text-ink">
                {s.side?.name ?? `Roster ${s.rosterId}`}
              </span>
            )}
            <span className="shrink-0 text-right">
              <span className="block figure text-lede font-semibold leading-tight text-ink">
                {fmtValue(s.total)}
              </span>
              <span className="block text-micro leading-normal text-faint">
                today
              </span>
            </span>
          </div>

          <p className="mt-1 text-meta leading-snug text-muted">
            received {s.playersIn.length + s.picksIn.length}{" "}
            {s.playersIn.length + s.picksIn.length === 1 ? "asset" : "assets"}
          </p>

          <ul className="mt-1.5 space-y-1.5">
            {s.playersIn.map((pid) => {
              const p = h.players.get(pid);
              const now = nowOf(pid);
              return (
                <li key={pid}>
                  {now ? (
                    <PlayerNowRow
                      assetKey={`p:${pid}`}
                      label={p?.fullName ?? `Player ${pid}`}
                      now={now}
                      names={names}
                    />
                  ) : (
                    // A player the model cannot price - out of the league, or with no
                    // NBA team to anchor a consensus rank against. Listed, never
                    // scored zero, and excluded from the total above.
                    <Link
                      href={playerLineageHref(pid)}
                      className="flex items-center gap-1.5 rounded-[--radius-sm] border border-border bg-surface px-2 py-1.5 transition-colors hover:bg-surface-2"
                    >
                      <PlayerAvatar
                        name={p?.fullName ?? "?"}
                        team={p?.team ?? null}
                        playerId={pid}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-semibold leading-snug text-ink">
                          {p?.fullName ?? `Player ${pid}`}
                        </span>
                        <span className="block text-meta leading-snug text-secondary">
                          no price today · where he came from
                        </span>
                      </span>
                    </Link>
                  )}
                </li>
              );
            })}

            {s.picksIn.map((dp) => {
              const key = pickKey(dp.season, dp.round, dp.rosterId);
              const became = pickPlayers[key];
              return (
                <li key={`${key}|${dp.previousOwnerId}`}>
                  <Link
                    href={lineageHref(key)}
                    className="flex items-start gap-1.5 rounded-[--radius-sm] border border-border bg-surface px-2 py-1.5 transition-colors hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-semibold leading-snug text-ink">
                        {dp.season} {ordinal(dp.round)}
                        {dp.rosterId !== dp.previousOwnerId &&
                        names[dp.rosterId]
                          ? ` (orig. ${names[dp.rosterId]})`
                          : ""}
                      </span>
                      {became ? (
                        <span className="block truncate text-meta leading-snug text-info">
                          became {became}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-meta leading-snug text-faint">
                          <Hourglass
                            size={11}
                            aria-hidden="true"
                            className="shrink-0"
                          />
                          not drafted yet
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}

            {s.playersIn.length === 0 && s.picksIn.length === 0 && (
              <li className="text-meta leading-snug text-secondary">
                Nothing recorded incoming on this side.
              </li>
            )}
          </ul>
        </section>
      ))}

      {anyValued && (
        <>
          <SectionHeader title="What each side is worth today" />
          <Card>
            <SideBars
              data={sides.map((s) => ({
                label:
                  s.manager?.name ?? s.side?.name ?? `Roster ${s.rosterId}`,
                value: Math.round(s.total),
              }))}
              max={maxTotal}
              format={(n) => fmtValue(n)}
            />
            <p className="mt-2 text-meta leading-snug text-muted">
              Today&apos;s prices, on the players only. Not a grade and not a
              winner.
            </p>
            <Disclosure
              summary="What this number cannot tell you"
              className="mt-1"
            >
              <p>
                This is hindsight. It prices what each side received at what
                those players are worth NOW, which is the right way to read an
                outcome and the wrong way to read a decision - nobody trading in{" "}
                {record.season} knew any of it. The app holds no historical
                ranking snapshots, so a value-at-the-time version is not
                available and this one says today, and only today.
              </p>
              <p className="mt-1.5">
                Players only. Commissioner-executed trades reach us with no
                picks attached at all, so counting the picks that happen to be
                recorded would make a number that looks complete and is not. The
                direction of the bias is worth knowing: a side that sent picks
                and took back players looks better here than it was, and a side
                that sold for picks looks worse. What the picks became is listed
                above, unpriced.
              </p>
            </Disclosure>
          </Card>
        </>
      )}

      <SectionHeader title="In the record" />
      <Card>
        <ul className="space-y-1.5">
          {record.sides.map((s) => (
            <li key={s.rosterId} className="text-body leading-snug">
              <span className="font-semibold text-ink">{s.name}</span>{" "}
              <span className="text-muted">{s.text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-meta leading-snug text-secondary">
          Every player above opens where he came from. Every pick opens what it
          became.
        </p>
      </Card>
    </div>
  );
}
