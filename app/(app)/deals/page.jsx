/**
 * EVERY DEAL. The page answers "what trades has this league made?": the count, then
 * one row per deal that opens its receipt (/deals/[transactionId], which prints both
 * sides, what each is worth today and every asset's provenance).
 *
 * SHIPS ONE SEASON AT A TIME. The index used to render every deal, every season's
 * headline receipt, the trade matrix, the pairings and managers directories and the
 * buyback list into one response (612 KB of HTML on the live league). Now the default
 * view is the newest season with deals; `?season=` picks another (or `all` for every
 * row, rows only), and the directories are their own views (`?view=pairs|managers|
 * trips`), each its own URL and server render, so nothing ships that is not on screen.
 *
 * A row's separator is a MEASUREMENT, never a verdict (D6): value moved, both sides
 * summed at today's prices, players only (D24; a commissioner deal has no pick record,
 * D19), drawn as one to three ticks. Each season leads with its largest deal as a box
 * score. Filters (`?manager=`, `?pair=`) are checked against this league's ledger, so
 * a stale link lands on the full index rather than an empty one.
 */
import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, X } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getPrincipals } from "@/lib/principals";
import { leagueBuybacks } from "@/lib/agency";
import { buildTradeLedger, dealPieces, pairMatrix } from "@/lib/tradegraph";
import { dealMagnitudes, ticksLabel } from "@/lib/tradegraph/magnitude";
import { dealHref, dealsQueryString, parseDealsParams } from "@/lib/tradegraph/url";
import { cachedValuePlayers } from "@/lib/valuation";
import { ordinal } from "@/lib/derive/describe";
import {
  Card,
  Chip,
  Disclosure,
  EmptyState,
  List,
  ListRow,
  PageHeader,
  SectionHeader,
  Stat,
  StatTile,
} from "@/components/ui";
import { DealReceipt } from "@/components/DealReceipt";
import { LocalDate } from "@/components/LocalDate";
import { TeamAvatar } from "@/components/TeamAvatar";
import { SeasonLinks } from "@/components/league/SeasonLinks";
import { cn, fmtValue } from "@/lib/ui";
import { Onward } from "@/components/Onward";
import { NeverTradedList, TradeMatrix } from "@/components/TradeMatrix";
export const dynamic = "force-dynamic";

const VIEWS = [
  { id: "deals", label: "Deals" },
  { id: "pairs", label: "Pairs" },
  { id: "managers", label: "Managers" },
  { id: "trips", label: "Round trips" },
];

export default async function DealsPage({ searchParams }) {
  const sp = await searchParams;
  const one = (k) => {
    const v = sp[k];
    return typeof v === "string" ? v : null;
  };
  const url = parseDealsParams({ get: one });
  const h = await getLeagueHistory();
  const principals = await getPrincipals(h);
  const ledger = buildTradeLedger(h, principals);
  const pairing = url.pair ? (ledger.pairings.find((p) => p.key === url.pair) ?? null) : null;
  const manager =
    !pairing && url.manager ? (ledger.managers.find((m) => m.ownerId === url.manager) ?? null) : null;
  const filtered = Boolean(pairing || manager);
  const view = !filtered && VIEWS.some((v) => v.id === one("view")) ? one("view") : "deals";
  const byOwner = new Map(ledger.managers.map((m) => [m.ownerId, m]));
  const avatarFor = (rosterId) => {
    const ownerId = h.rostersById.get(rosterId)?.ownerId;
    const u = ownerId ? h.usersById.get(ownerId) : null;
    return { avatarId: u?.avatar ?? null, teamLogoUrl: u?.teamLogoUrl ?? null };
  };

  let trades = ledger.trades;
  if (pairing) {
    const ids = new Set(pairing.tradeIds);
    trades = trades.filter((t) => ids.has(t.id));
  } else if (manager) {
    trades = trades.filter((t) => t.ownerParties.includes(manager.ownerId));
  }
  // Seasons that hold at least one deal under this filter, newest first. `trades` is
  // already newest-first (buildTradeLedger).
  const dealSeasons = [...new Set(trades.map((t) => t.season))].sort((a, b) => b.localeCompare(a));
  const all = url.season === "all" || (filtered && !url.season);
  const season = all ? null : dealSeasons.includes(url.season) ? url.season : (dealSeasons[0] ?? null);
  const shown = season ? trades.filter((t) => t.season === season) : trades;

  const possiblePairs = (ledger.managers.length * (ledger.managers.length - 1)) / 2;
  const values = cachedValuePlayers(h);
  const priceOf = (pid) => {
    const v = values.get(pid);
    return v && v.value > 0 ? v.value : 0;
  };
  const mag = dealMagnitudes(h.transactions, priceOf);
  const txById = new Map(h.transactions.map((t) => [t.transactionId, t]));
  const rosterNames = {};
  for (const m of ledger.managers) if (!m.isFormer) rosterNames[m.rosterId] = m.name;
  const filterLabel = pairing
    ? `${byOwner.get(pairing.a)?.name ?? pairing.a} and ${byOwner.get(pairing.b)?.name ?? pairing.b}`
    : manager
      ? manager.name
      : null;
  const seasonHref = (s) =>
    `/deals${dealsQueryString({ pair: pairing?.key ?? null, manager: manager?.ownerId ?? null, season: s })}`;
  const viewHref = (v) => (v === "deals" ? "/deals" : `/deals?view=${v}`);

  const headlineId = season ? mag.headlineBySeason.get(season) : null;
  const headline = headlineId && !filtered ? (shown.find((t) => t.id === headlineId) ?? null) : null;
  const rest = headline ? shown.filter((t) => t.id !== headline.id) : shown;

  return (
    <div>
      <PageHeader title="Every deal" subtitle="Tap a deal for its receipt" />

      {filterLabel ? (
        <Card tone="accent" className="mb-3">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-body text-ink">
              <span className="font-semibold">{filterLabel}</span>
              <span className="text-muted">
                {" · "}
                {trades.length} {trades.length === 1 ? "deal" : "deals"}
              </span>
            </p>
            <Link
              href="/deals"
              className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-note font-semibold text-accent-text"
            >
              <X size={14} aria-hidden="true" />
              Clear
            </Link>
          </div>
          {pairing && pairing.dossierCount > pairing.dealCount && (
            <Disclosure summary={`Their dossiers count ${pairing.dossierCount}`}>
              A commissioner-executed multi-team deal collapses several transactions into one record here, so
              the listable number is the smaller one.
            </Disclosure>
          )}
        </Card>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Stat label="Deals on record" value={ledger.totalTrades} tone="accent" />
            <Stat
              label="Pairs who have traded"
              value={`${ledger.pairings.length}/${possiblePairs}`}
              sub={`${possiblePairs - ledger.pairings.length} never have`}
            />
          </div>
          <SeasonLinks
            className="mb-3"
            label="View"
            seasons={VIEWS.map((v) => v.label)}
            active={VIEWS.find((v) => v.id === view)?.label}
            hrefFor={(label) => viewHref(VIEWS.find((v) => v.label === label).id)}
          />
        </>
      )}

      {view === "deals" && (
        <>
          <SeasonLinks
            className="mb-3"
            label="Season"
            seasons={[...dealSeasons, "All"]}
            active={season ?? "All"}
            hrefFor={(s) => seasonHref(s === "All" ? "all" : s)}
          />
          {shown.length === 0 ? (
            <EmptyState icon={<ArrowLeftRight size={26} />} title="No deals here">
              Nothing on record for this filter.
            </EmptyState>
          ) : (
            <>
              <p className="mb-2 text-meta text-secondary">
                {shown.length} {shown.length === 1 ? "deal" : "deals"}
                {season ? ` in ${season}` : ""}, newest first. Ticks show value moved.
              </p>
              <List data-testid="deal-index" aria-label={season ? `Deals in ${season}` : "Every deal"}>
                {headline && (
                  <HeadlineDeal
                    t={headline}
                    tx={txById.get(headline.id)}
                    valueMoved={mag.byId.get(headline.id)?.value ?? 0}
                    priceOf={priceOf}
                    players={h.players}
                    rosterNames={rosterNames}
                    meRosterId={ledger.meRosterId}
                  />
                )}
                {rest.map((t) => (
                  <DealRow
                    key={t.id}
                    t={t}
                    avatarFor={avatarFor}
                    meRosterId={ledger.meRosterId}
                    ticks={mag.byId.get(t.id)?.ticks ?? null}
                  />
                ))}
              </List>
            </>
          )}
        </>
      )}

      {view === "pairs" && <PairsView ledger={ledger} byOwner={byOwner} />}
      {view === "managers" && <ManagersView ledger={ledger} />}
      {view === "trips" && <TripsView buybacks={leagueBuybacks(h)} />}

      <Onward from="/deals" />
    </div>
  );
}

/** One deal, one row, one link into its receipt. Names wrap (D111). */
function DealRow({ t, meRosterId, ticks = null, avatarFor = null }) {
  const mine = t.sides.some((s) => s.rosterId === meRosterId);
  return (
    <li>
      <ListRow
        href={dealHref(t.id)}
        highlight={mine}
        avatar={
          avatarFor ? (
            // The two (or more) managers' avatars, overlapped; names are printed beside.
            <span aria-hidden="true" className="flex -space-x-2">
              {t.sides.slice(0, 2).map((s) => (
                <TeamAvatar key={s.rosterId} name={s.name} {...avatarFor(s.rosterId)} size="xs" isMe={s.rosterId === meRosterId} />
              ))}
            </span>
          ) : null
        }
        title={t.sides.map((s, i) => (
          <span key={s.rosterId}>
            {i > 0 && <span className="font-normal text-secondary"> &harr; </span>}
            {s.name}
          </span>
        ))}
        badge={
          <>
            {mine && (
              <Chip size="sm" tone="accent">
                You
              </Chip>
            )}
            {t.multiTeam && (
              <Chip size="sm" tone="info">
                {t.parties.length}-team
              </Chip>
            )}
            {t.commissionerExecuted && (
              <Chip size="sm" tone="warn" icon={AlertTriangle}>
                no pick record
              </Chip>
            )}
          </>
        }
        meta={
          <span className="figure">
            <LocalDate ts={t.created} />
 · wk {t.week} · {dealPieces(t.assets)}
          </span>
        }
        value={ticks ? <MagnitudeTicks ticks={ticks} /> : null}
      />
    </li>
  );
}

/**
 * Value moved as a signal meter: three slots, `ticks` filled. The count carries the
 * reading; both states are neutral, because colour-grading a deal's size would be one
 * step from grading the deal (D6). Unmeasured renders nothing, never "small".
 */
function MagnitudeTicks({ ticks }) {
  return (
    <span role="img" aria-label={ticksLabel(ticks)} className="flex items-end justify-end gap-[3px]">
      {[1, 2, 3].map((slot) => (
        <span
          key={slot}
          className={cn(
            "w-1 rounded-[1px]",
            slot === 1 ? "h-2" : slot === 2 ? "h-3" : "h-4",
            slot <= ticks ? "bg-secondary" : "bg-elevated",
          )}
        />
      ))}
    </span>
  );
}

/**
 * The season's box score: its largest deal by value moved, both sides at today's
 * prices. A sum cannot say who won (D6). Still one <li> and one link, so the index
 * keeps one row per deal.
 */
function HeadlineDeal({ t, tx, valueMoved, priceOf, players, rosterNames, meRosterId }) {
  if (!tx) return null;
  const nameOf = (rosterId) => t.sides.find((s) => s.rosterId === rosterId)?.name ?? `Roster ${rosterId}`;
  const sides = t.parties.map((rosterId) => {
    const playersIn = Object.entries(tx.adds)
      .filter(([, r]) => r === rosterId)
      .map(([pid]) => pid);
    const picksIn = tx.draftPicks.filter((dp) => dp.ownerId === rosterId);
    return {
      key: rosterId,
      name: nameOf(rosterId),
      isMe: rosterId === meRosterId,
      total: playersIn.reduce((s, pid) => s + priceOf(pid), 0),
      lines: [
        ...playersIn.map((pid) => {
          const v = priceOf(pid);
          return {
            key: `p:${pid}`,
            label: players.get(pid)?.fullName ?? `Player ${pid}`,
            value: v > 0 ? Math.round(v) : null,
          };
        }),
        ...picksIn.map((dp) => ({
          key: `k:${dp.season}-${dp.round}-${dp.rosterId}|${dp.previousOwnerId}`,
          label: `${dp.season} ${ordinal(dp.round)}${
            dp.rosterId !== dp.previousOwnerId && rosterNames[dp.rosterId]
              ? ` (orig. ${rosterNames[dp.rosterId]})`
              : ""
          }`,
          value: null,
        })),
      ],
    };
  });
  return (
    <li>
      <Link href={dealHref(t.id)} className="block px-4 py-3 transition-colors hover:bg-surface-2">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-meta font-medium text-secondary">Most value moved</span>
          <span className="figure shrink-0 text-meta text-secondary">
            <LocalDate ts={t.created} /> · wk {t.week}
          </span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
          <span className="figure text-display font-bold text-ink">{fmtValue(Math.round(valueMoved))}</span>
          <span className="text-meta text-secondary">both sides, today, players only</span>
        </span>
        <DealReceipt className="mt-2" sides={sides} dense />
        {(t.multiTeam || t.commissionerExecuted) && (
          <span className="mt-2 flex flex-wrap gap-1.5">
            {t.multiTeam && (
              <Chip size="sm" tone="info">
                {t.parties.length}-team
              </Chip>
            )}
            {t.commissionerExecuted && (
              <Chip size="sm" tone="warn" icon={AlertTriangle}>
                no pick record
              </Chip>
            )}
          </span>
        )}
      </Link>
    </li>
  );
}

function PairsView({ ledger, byOwner }) {
  const matrix = pairMatrix(ledger.managers, ledger.pairings);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Pairs traded" value={`${matrix.traded}/${matrix.possible}`} />
        <StatTile label="Never traded" value={String(matrix.never)} sub="pairs" />
      </div>
      <Card className="mt-2">
        <TradeMatrix matrix={matrix} />
        <p className="mt-2 text-meta text-secondary">Filled: traded at least once. Hollow: never.</p>
        <Disclosure className="-mb-2 mt-1" summary={`The ${matrix.never} pairs that never traded`}>
          <NeverTradedList matrix={matrix} />
        </Disclosure>
      </Card>
      <SectionHeader title="Who trades with whom" />
      <List aria-label="Pairings by number of deals">
        {ledger.pairings.map((p) => (
          <li key={p.key}>
            <ListRow
              href={`/deals${dealsQueryString({ manager: null, pair: p.key, season: null })}`}
              title={
                <>
                  {byOwner.get(p.a)?.name ?? p.a} <span className="font-normal text-secondary">&amp;</span>{" "}
                  {byOwner.get(p.b)?.name ?? p.b}
                </>
              }
              meta={<span className="figure">{p.seasons.join(", ")}</span>}
              value={p.dealCount}
              valueSub={p.dealCount === 1 ? "deal" : "deals"}
            />
          </li>
        ))}
      </List>
    </>
  );
}

function ManagersView({ ledger }) {
  return (
    <List aria-label="Managers by deals">
      {ledger.managers.map((m) => (
        <li key={m.ownerId}>
          <ListRow
            href={`/deals${dealsQueryString({ manager: m.ownerId, pair: null, season: null })}`}
            highlight={m.isMe}
            avatar={
              <TeamAvatar name={m.name} avatarId={m.avatarId} teamLogoUrl={m.teamLogoUrl} size="sm" isMe={m.isMe} />
            }
            title={m.name}
            badge={
              m.isMe ? (
                <Chip size="sm" tone="accent">
                  You
                </Chip>
              ) : m.isFormer ? (
                <Chip size="sm">former{m.tenureLabel ? ` ${m.tenureLabel}` : ""}</Chip>
              ) : null
            }
            meta={m.handle}
            value={m.trades}
            valueSub="deals"
          />
        </li>
      ))}
    </List>
  );
}

/**
 * Picks that came home: a manager traded away a pick they originally owned and later
 * got it back. The rate's denominator is every own pick that ever left home. This says
 * what happened, not why (intent is not in the record).
 */
function TripsView({ buybacks }) {
  if (buybacks.total === 0) {
    return <EmptyState title="No round trips">No pick has come back to the roster that originally owned it.</EmptyState>;
  }
  const busiest = buybacks.byManager.length > 1 ? buybacks.byManager[0] : null;
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Round trips" value={String(buybacks.total)} sub={`by ${buybacks.byManager.length} of ${buybacks.rosters} rosters`} />
        <StatTile
          label="Own picks back"
          value={`${buybacks.returnedPicks}/${buybacks.departedPicks}`}
          sub="of those that left home"
        />
      </div>
      <Disclosure className="mt-1" summary="What counts, and what it cannot say">
        <ul className="list-disc space-y-1.5 pl-4">
          <li>A pick can come home as a throw-in as easily as on purpose; intent is not in the record.</li>
          {busiest && (
            <li>
              Busiest: {busiest.rosterName}, {busiest.returned} of their {busiest.departed} own picks traded away
              have come home.
            </li>
          )}
          {busiest && buybacks.longestAway && (
            <li>
              Longest away: {buybacks.longestAway.rosterName}&apos;s own {buybacks.longestAway.label},{" "}
              {buybacks.longestAway.awayDays} days gone.
            </li>
          )}
          {buybacks.multiHop.length > 0 && (
            <li>
              {buybacks.total > 1 ? `${buybacks.multiHop.length} of them` : "It"} changed hands somewhere else
              before coming home, so not bought back from the roster it was sold to.
            </li>
          )}
          {buybacks.unrecorded > 0 && (
            <li>
              {buybacks.unrecorded} show up only in the traded-picks snapshot: no transaction explains them, so
              they carry no date rather than a guessed one.
            </li>
          )}
        </ul>
      </Disclosure>
      <SectionHeader title="Every round trip" />
      <List aria-label="Round trips, oldest first">
        {buybacks.all.map((b, i) => {
          const meta = b.recorded ? (
            <span className="figure">
              <LocalDate ts={b.at} />
              {b.awayDays != null
                ? ` · away ${b.awayDays} days${b.recordedHops && b.recordedHops > 2 ? `, ${b.recordedHops} hands` : ""}`
                : " · outbound trade not in the record"}
            </span>
          ) : (
            "No transaction records this move"
          );
          const title = (
            <>
              {b.rosterName} <span className="font-normal text-secondary">got back</span>{" "}
              <span className="figure">{b.label}</span>{" "}
              <span className="font-normal text-secondary">from {b.fromName}</span>
            </>
          );
          return (
            <li key={`${b.season}-${b.round}-${b.rosterId}-${i}`}>
              {b.recorded && b.transactionId ? (
                <ListRow href={dealHref(b.transactionId)} title={title} meta={meta} />
              ) : (
                <ListRow
                  title={title}
                  meta={meta}
                  badge={
                    <Chip size="sm" tone="warn" icon={AlertTriangle}>
                      unrecorded
                    </Chip>
                  }
                />
              )}
            </li>
          );
        })}
      </List>
    </>
  );
}
