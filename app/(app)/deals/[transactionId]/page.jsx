/**
 * THE RECEIPT - one trade, one URL. The page answers "what did each side get, and what
 * is it worth today?": the two-sided receipt first (each side's players-only total at
 * today's prices over every asset it received), then each side's assets as rows that
 * open the asset's provenance (a player: where he came from; a pick: what it became).
 *
 * NO GRADE, NO WINNER (D6). Nothing computes a delta or a verdict. The caveats ride
 * with the number, one tap away: D23 hindsight (no historical price snapshots, so
 * "today" and only today), D24 players only (commissioner deals arrive with no picks),
 * D19 a commissioner-executed deal says its pick record is gone, never inferred.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, Hourglass } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getPrincipals } from "@/lib/principals";
import { buildTradeLedger, tradeParties, pickKey } from "@/lib/tradegraph";
import { loadProvenanceSource } from "@/lib/provenance/source";
import { lineageHref, playerLineageHref } from "@/lib/tradegraph/url";
import { cachedValuePlayers } from "@/lib/valuation";
import { leagueTiers, tierResolver } from "@/lib/rankings/tiers";
import { ordinal } from "@/lib/derive/describe";
import { Card, Chip, Disclosure, List, ListRow, PageHeader, SectionHeader } from "@/components/ui";
import { LocalDate } from "@/components/LocalDate";
import { DealReceipt } from "@/components/DealReceipt";
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
  const { pickPlayers } = await loadProvenanceSource(h, { principals });
  const values = cachedValuePlayers(h);
  const valuesDesc = [...values.values()]
    .map((v) => v.value)
    .filter((v) => v > 0)
    .sort((a, b) => b - a);
  const tierFor = tierResolver(leagueTiers(valuesDesc));
  const holdings = {};
  for (const r of h.rosters) for (const pid of r.players) holdings[pid] = r.rosterId;
  const nowOf = (pid) => {
    const v = values.get(pid);
    if (!v || v.value <= 0) return undefined;
    return {
      team: h.players.get(pid)?.team ?? null,
      value: v.value,
      tier: tierFor(v.value)?.label ?? "Fringe",
      heldBy: holdings[pid] ?? null,
    };
  };
  const names = {};
  for (const m of ledger.managers) if (!m.isFormer) names[m.rosterId] = m.name;
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
  const anyValued = sides.some((s) => s.total > 0);
  const pickLabel = (dp) =>
    `${dp.season} ${ordinal(dp.round)}${
      dp.rosterId !== dp.previousOwnerId && names[dp.rosterId] ? ` (orig. ${names[dp.rosterId]})` : ""
    }`;
  const receiptSides = sides.map((s) => ({
    key: s.rosterId,
    name: s.manager?.name ?? s.side?.name ?? `Roster ${s.rosterId}`,
    isMe: s.manager?.isMe ?? false,
    total: s.total,
    lines: [
      ...s.playersIn.map((pid) => {
        const now = nowOf(pid);
        return {
          key: `p:${pid}`,
          label: h.players.get(pid)?.fullName ?? `Player ${pid}`,
          value: now ? Math.round(now.value) : null,
        };
      }),
      ...s.picksIn.map((dp) => {
        const key = pickKey(dp.season, dp.round, dp.rosterId);
        const became = pickPlayers[key];
        return {
          key: `${key}|${dp.previousOwnerId}`,
          label: pickLabel(dp),
          value: null,
          note: became ? `became ${became}` : null,
        };
      }),
    ],
  }));

  return (
    <div>
      <Link
        href="/deals"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-note font-semibold text-secondary transition-colors hover:text-accent-text"
      >
        <ChevronLeft size={16} aria-hidden="true" />
        All deals
      </Link>

      <PageHeader
        kicker={`${record.season} · week ${record.week}`}
        title={record.multiTeam ? `${parties.length}-team deal` : "The deal"}
        subtitle={<LocalDate ts={record.created} />}
        below={
          record.commissionerExecuted ? (
            <div className="mt-2">
              <Chip tone="warn" icon={AlertTriangle}>
                Pick record missing
              </Chip>
              <Disclosure summary="Why picks may be missing">
                The commissioner executed this deal by hand, and Sleeper records no picks against commissioner
                moves. If picks changed hands here, they are not below, and the app will not guess which ones.
              </Disclosure>
            </div>
          ) : null
        }
      />

      {anyValued && (
        <section aria-labelledby="worth-today">
          <h2 id="worth-today" className="mb-2 text-lede font-semibold text-ink">
            What each side is worth today
          </h2>
          <Card pad="sm">
            <DealReceipt sides={receiptSides} />
            <Disclosure className="-mb-2 mt-1 px-1" summary="Players only, at today's prices: what that misses">
              <p>
                This is hindsight: it prices what each side received at what those players are worth now, the right
                way to read an outcome and the wrong way to read a decision. Nobody trading in {record.season} knew
                any of it, and the app holds no historical price snapshots. Not a grade and not a winner.
              </p>
              <p className="mt-2">
                Picks are left unpriced because commissioner-executed trades reach us with none attached. A side
                that sent picks and took back players looks better here than it was; a side that sold for picks
                looks worse.
              </p>
            </Disclosure>
          </Card>
        </section>
      )}

      {sides.map((s) => {
        const name = s.manager?.name ?? s.side?.name ?? `Roster ${s.rosterId}`;
        const count = s.playersIn.length + s.picksIn.length;
        return (
          <section key={s.rosterId}>
            <SectionHeader
              title={`${name} got`}
              href={s.manager && !s.manager.isFormer ? `/managers/${s.manager.rosterId}` : undefined}
              cta={s.manager && !s.manager.isFormer ? "Dossier" : undefined}
            />
            {count === 0 ? (
              <Card>
                <p className="text-body text-muted">Nothing recorded incoming on this side.</p>
              </Card>
            ) : (
              <List aria-label={`What ${name} received`}>
                {s.playersIn.map((pid) => {
                  const p = h.players.get(pid);
                  const label = p?.fullName ?? `Player ${pid}`;
                  const now = nowOf(pid);
                  return (
                    <li key={pid}>
                      <ListRow
                        href={playerLineageHref(pid)}
                        aria-label={`${label}: ${now ? `worth ${fmtValue(now.value)} today` : "no price today"}. Open where he came from.`}
                        avatar={<PlayerAvatar name={label} team={now?.team ?? p?.team ?? null} playerId={pid} size="sm" />}
                        title={label}
                        meta={
                          now
                            ? [now.tier, now.heldBy != null && names[now.heldBy] ? `now on ${names[now.heldBy]}` : null]
                                .filter(Boolean)
                                .join(" · ")
                            : "no price today"
                        }
                        value={now ? fmtValue(now.value) : "unknown"}
                        valueSub="today"
                      />
                    </li>
                  );
                })}
                {s.picksIn.map((dp) => {
                  const key = pickKey(dp.season, dp.round, dp.rosterId);
                  const became = pickPlayers[key];
                  return (
                    <li key={`${key}|${dp.previousOwnerId}`}>
                      <ListRow
                        href={lineageHref(key)}
                        title={pickLabel(dp)}
                        meta={
                          became ? (
                            `became ${became}`
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Hourglass size={12} aria-hidden="true" />
                              not drafted yet
                            </span>
                          )
                        }
                      />
                    </li>
                  );
                })}
              </List>
            )}
          </section>
        );
      })}

      <Disclosure className="mt-3" summary="As recorded">
        <ul className="space-y-1.5">
          {record.sides.map((s) => (
            <li key={s.rosterId}>
              <span className="font-semibold text-ink">{s.name}</span> {s.text}
            </li>
          ))}
        </ul>
        {record.summary && <p className="mt-2">{record.summary}</p>}
      </Disclosure>
    </div>
  );
}
