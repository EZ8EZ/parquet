/**
 * THE DEAL INDEX - every trade this league has ever made, as a list.
 *
 * What replaced the ring, and mostly what the ring already had underneath it. The old
 * page's own copy said "Everything is also listed below"; the list was the better
 * half and this is it, with two filters that carry the only two questions the ring's
 * geometry was ever answering: one manager's deals, and one pairing's.
 *
 * Filters live in the query string (`?manager=`, `?pair=`) rather than in component
 * state, so this page is a plain server component with no client bundle at all - and
 * so Manager Compare and the dossiers can link straight at a filtered view, which is
 * what they were already trying to do through `pairWebHref`/`managerWebHref`.
 *
 * AN INDEX, NOT NINETY-ONE RECEIPTS (D58). This page used to print every deal as its
 * full two-sided prose - and because a trade has two sides, it printed the SAME deal
 * twice, mirrored, one sentence per party. Ninety-one of those measured 17,499px at
 * 390px wide, five times this app's own median page. The sentences were not wrong;
 * they were in the wrong place. `/deals/[transactionId]` already prints them, with
 * what each side is worth today and every asset linked into its provenance rail, and
 * it does it better than a list ever could.
 *
 * So a row is now one tap target carrying the three things you scan a deal index for -
 * who, when, how big - and nothing you would rather read on the receipt. The two
 * directories underneath (pairings, managers) are `<details>`: they are ways IN to a
 * filtered index, not things you read on arrival, and expanded they were another
 * 3,000px under a list you had already finished with.
 */
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getPrincipals } from "@/lib/principals";
import { leagueBuybacks } from "@/lib/agency";
import { buildTradeLedger, dealPieces, pairMatrix } from "@/lib/tradegraph";
import {
  dealHref,
  dealsQueryString,
  parseDealsParams,
} from "@/lib/tradegraph/url";
import {
  Card,
  EmptyState,
  PageHeader,
  SectionHeader,
  Stat,
  Tag,
} from "@/components/ui";
import { LocalDate } from "@/components/LocalDate";
import { TeamAvatar } from "@/components/TeamAvatar";
import { cn } from "@/lib/ui";
import { Onward } from "@/components/Onward";
import { NeverTradedList, TradeMatrix } from "@/components/TradeMatrix";
export const dynamic = "force-dynamic";
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
  // A URL is untrusted input: every id in it is checked against THIS league's ledger
  // before it filters anything, so a stale or hand-edited link lands on the full
  // index rather than on an empty one.
  const pairing = url.pair
    ? (ledger.pairings.find((p) => p.key === url.pair) ?? null)
    : null;
  const manager =
    !pairing && url.manager
      ? (ledger.managers.find((m) => m.ownerId === url.manager) ?? null)
      : null;
  const season =
    url.season && ledger.seasons.includes(url.season) ? url.season : null;
  const byOwner = new Map(ledger.managers.map((m) => [m.ownerId, m]));
  let trades = ledger.trades;
  if (pairing) {
    const ids = new Set(pairing.tradeIds);
    trades = trades.filter((t) => ids.has(t.id));
  } else if (manager) {
    trades = trades.filter((t) => t.ownerParties.includes(manager.ownerId));
  }
  if (season) trades = trades.filter((t) => t.season === season);
  const possiblePairs =
    (ledger.managers.length * (ledger.managers.length - 1)) / 2;
  const busiest = ledger.pairings[0];
  /*
   * WHY THE LEAGUE-WIDE BUYBACK VIEW LIVES HERE.
   *
   * A buyback is a manager reacquiring a pick they originally owned, and until now it
   * rendered only on an individual dossier - so seeing the league's pattern meant
   * opening fourteen pages and holding the answer in your head. It is a reading OF the
   * trade record: every dated round trip resolves to a receipt this page already hosts,
   * the ordering is chronological like the index above it, and this page already
   * carries two other league-wide readings of the same corpus ("who trades with whom",
   * "managers"). It joins those rather than becoming a twenty-fifth registered surface
   * for a seventeen-row list, which keeps the drawer, the registry and ONWARD's
   * two-steps rule untouched.
   *
   * It is NOT on /managers, which is one row per person: a chronological list of round
   * trips there would be a second list in a different order on a page whose whole shape
   * is the roster of people. The dossier keeps its own section and now links here.
   *
   * Only on the unfiltered index, exactly like the two readings below it: under
   * `?manager=` the dossier's own section is the better answer and is one tap away.
   */
  const buybacks = leagueBuybacks(h);
  const matrix = pairMatrix(ledger.managers, ledger.pairings);
  const filterLabel = pairing
    ? `${byOwner.get(pairing.a)?.name ?? pairing.a} and ${byOwner.get(pairing.b)?.name ?? pairing.b}`
    : manager
      ? manager.name
      : null;
  const hrefWith = (next) =>
    `/deals${dealsQueryString({ ...url, pair: pairing?.key ?? null, manager: manager?.ownerId ?? null, season, ...next })}`;
  // Only built for the unfiltered index - see the render branch below. `trades`
  // is already newest-first (buildTradeLedger), so grouping preserves that
  // order for free; sorting the season keys themselves guards against a
  // corpus where the newest trade's season is not the newest season on record
  // (a quiet offseason with no deals yet, for instance).
  const seasonGroups = [];
  if (!season && !pairing && !manager) {
    const bySeason = new Map();
    for (const t of trades) {
      if (!bySeason.has(t.season)) bySeason.set(t.season, []);
      bySeason.get(t.season).push(t);
    }
    for (const s of [...bySeason.keys()].sort((a, b) => b.localeCompare(a))) {
      seasonGroups.push({ season: s, trades: bySeason.get(s) });
    }
  }
  return (
    <div>
      <PageHeader
        kicker="The record"
        title="Every deal"
        subtitle="Every trade on record, newest first. Tap one to open its receipt - what each side got, and what it is worth today."
      />

      {!pairing && !manager && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Stat
            label="Deals on record"
            value={ledger.totalTrades}
            tone="accent"
          />
          <Stat
            label="Pairs who have traded"
            value={`${ledger.pairings.length}/${possiblePairs}`}
            sub={`${possiblePairs - ledger.pairings.length} pairs never have`}
          />
        </div>
      )}

      {filterLabel && (
        <Card className="mb-3 border-accent-edge bg-accent-wash">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-body leading-snug text-ink">
              <span className="font-semibold">{filterLabel}</span>
              <span className="text-muted">
                {" · "}
                {trades.length} {trades.length === 1 ? "deal" : "deals"}
              </span>
            </p>
            <Link
              href="/deals"
              className="shrink-0 text-meta font-semibold text-accent-text hover:underline"
            >
              clear
            </Link>
          </div>
          {pairing && pairing.dossierCount > pairing.dealCount && (
            <p className="mt-1 text-meta leading-snug text-secondary">
              Their dossiers count {pairing.dossierCount}. A
              commissioner-executed multi-team deal collapses several
              transactions into one record here, so the listable number is the
              smaller one.
            </p>
          )}
        </Card>
      )}

      {/* Season filter. Plain links, so this page needs no JS and every filtered
            view is its own address. */}
      <div className="scroll-x -mx-4 mb-3 flex gap-1.5 px-4 sm:mx-0 sm:px-0">
        <FilterLink
          href={hrefWith({ season: null })}
          active={!season}
          label="All seasons"
        />
        {ledger.seasons.map((s) => (
          <FilterLink
            key={s}
            href={hrefWith({ season: s })}
            active={season === s}
            label={s}
          />
        ))}
      </div>

      {trades.length === 0 ? (
        <EmptyState icon={<Users size={26} />} title="No deals here">
          {season
            ? `Nothing was traded in ${season} under this filter.`
            : "Nothing on record for this filter."}
        </EmptyState>
      ) : season || pairing || manager ? (
        // Already a small, already-filtered set - print it flat, exactly as
        // before. Grouping one season, or one manager's history, by season
        // again would just be re-adding the header it took a tap to get past.
        <ul
          data-testid="deal-index"
          className="divide-y divide-border overflow-hidden rounded-[--radius-sm] border border-border bg-surface"
        >
          {trades.map((t) => (
            <DealRow key={t.id} t={t} meRosterId={ledger.meRosterId} />
          ))}
        </ul>
      ) : (
        /*
         * THE SAME DIET THE COMMISSIONER AUDIT LOG ALREADY GOT (D-round-9): this
         * unfiltered index used to print every trade, oldest and newest alike,
         * fully expanded - the majority of the ~92 rows behind the ~5,300px this
         * page cost at 390px wide. Grouping by season and folding every season
         * but the newest is the identical idiom, not a new one: current season
         * open, the rest `<details>`, the count printed on the shut summary, and
         * every row still a real link into its own receipt the moment you tap.
         */
        <div className="space-y-1.5" data-testid="deal-index">
          {seasonGroups.map((g, i) => (
            <details
              key={g.season}
              open={i === 0 || undefined}
              className="group overflow-hidden rounded-[--radius-sm] border border-border bg-surface"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-1">
                <span className="flex items-center gap-1.5">
                  <ChevronRight
                    size={13}
                    aria-hidden="true"
                    className="disclosure-chevron shrink-0 text-faint group-open:rotate-90"
                  />
                  <span className="figure text-note font-semibold text-ink">
                    {g.season}
                  </span>
                </span>
                <span className="figure text-meta text-secondary">
                  {g.trades.length}{" "}
                  {g.trades.length === 1 ? "deal" : "deals"}
                </span>
              </summary>
              <ul className="disclosure-body divide-y divide-border border-t border-border">
                {g.trades.map((t) => (
                  <DealRow key={t.id} t={t} meRosterId={ledger.meRosterId} />
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}

      {!pairing && !manager && buybacks.total > 0 && (
        <section id="buybacks" className="scroll-mt-4">
          <SectionHeader
            title={`Picks that came home - ${buybacks.total}`}
            href="/managers"
            cta="dossiers"
          />
          <Card className="p-3">
            {/* THE RATE, NOT JUST THE COUNT. "17 round trips" cannot say whether
                picks come home often or almost never; the denominator is every own
                pick that ever left home, counted over the same scope as the
                numerator (see `pickDepartures`). */}
            <p className="text-body leading-relaxed text-ink">
              A manager traded away a pick they originally owned, and later got
              it back. Across the league,{" "}
              <span className="figure">{buybacks.returnedPicks}</span> of{" "}
              <span className="figure">{buybacks.departedPicks}</span> own picks
              that have ever left home have come back, in{" "}
              {buybacks.total} round{" "}
              {buybacks.total === 1 ? "trip" : "trips"} made by{" "}
              <span className="figure">{buybacks.byManager.length}</span> of{" "}
              <span className="figure">{buybacks.rosters}</span> rosters. This
              says what happened, not why: intent is not in the record, and a
              pick can come home as a throw-in as easily as on purpose.
            </p>
            <div className="rule my-2.5" />
            <ul className="space-y-1 text-meta leading-snug text-secondary">
              {/* Only worth a line when there is a field to be busiest in. */}
              {buybacks.byManager.length > 1 && (
                <li>
                  Busiest:{" "}
                  <span className="font-semibold text-ink">
                    {buybacks.byManager[0].rosterName}
                  </span>
                  ,{" "}
                  <span className="figure">
                    {buybacks.byManager[0].returned}
                  </span>{" "}
                  of their{" "}
                  <span className="figure">
                    {buybacks.byManager[0].departed}
                  </span>{" "}
                  own picks traded away have come home.
                </li>
              )}
              {/*
               * D51's defect, one level down: two lines advertising two findings over
               * the same single row. "Longest away" is a superlative, and a superlative
               * needs a field - the same guard "Busiest" already uses. "Changed hands
               * somewhere else" is a structural fact about a round trip rather than a
               * ranking of it, so it stands at any size, and when it is the only line
               * left it absorbs the duration the suppressed line would have carried.
               */}
              {buybacks.byManager.length > 1 && buybacks.longestAway && (
                <li>
                  Longest away:{" "}
                  <span className="font-semibold text-ink">
                    {buybacks.longestAway.rosterName}
                  </span>
                  &apos;s own{" "}
                  <span className="figure">{buybacks.longestAway.label}</span>,{" "}
                  <span className="figure">
                    {buybacks.longestAway.awayDays}
                  </span>{" "}
                  days gone.
                </li>
              )}
              {buybacks.multiHop.length > 0 && (
                <li>
                  {buybacks.total > 1 ? (
                    <>
                      <span className="figure">{buybacks.multiHop.length}</span>{" "}
                      of them changed hands
                    </>
                  ) : (
                    "It changed hands"
                  )}{" "}
                  somewhere else before coming home, so it was not bought back
                  from the roster it was sold to
                  {buybacks.byManager.length <= 1 &&
                  buybacks.multiHop.length === 1 &&
                  buybacks.multiHop[0].awayDays != null ? (
                    <>
                      , after{" "}
                      <span className="figure">
                        {buybacks.multiHop[0].awayDays}
                      </span>{" "}
                      days gone
                    </>
                  ) : null}
                  .
                </li>
              )}
              {buybacks.unrecorded > 0 && (
                <li>
                  <span className="figure">{buybacks.unrecorded}</span> show up
                  only in the traded-picks snapshot: the round trip is a fact,
                  but no transaction explains it, so those carry no date rather
                  than a guessed one.
                </li>
              )}
            </ul>
          </Card>

          {/* Closed by default. The four lines above are the reading; the seventeen
                rows are the evidence, and an already tall index does not need them
                unfolded to make the point (the house Disclosure idiom, D15). */}
          <details className="group mt-1.5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-meta font-semibold uppercase tracking-wide text-accent-text">
              <ChevronRight
                size={13}
                aria-hidden="true"
                className="disclosure-chevron group-open:rotate-90"
              />
              Every round trip, oldest first
            </summary>
            <ul className="disclosure-body divide-y divide-border overflow-hidden rounded-[--radius-sm] border border-border bg-surface">
              {buybacks.all.map((b, i) => {
                const body = (
                  /* Wraps rather than truncating. The counterparty and the hop count
                   sit at the END of these two lines, and they are the half of a
                   round trip that is not already in the headline above - clipping
                   them to hold one line each would drop exactly the information
                   this section exists to show. The list is inside a closed
                   `<details>`, so the extra lines cost nothing at rest. */
                  <>
                    <span className="block text-body leading-snug text-ink">
                      <span className="font-semibold">{b.rosterName}</span>
                      <span className="text-secondary">
                        {" "}
                        bought back their own{" "}
                      </span>
                      <span className="figure">{b.label}</span>
                      <span className="text-secondary"> from {b.fromName}</span>
                    </span>
                    <span className="block figure text-meta leading-snug text-secondary">
                      {b.recorded ? (
                        <>
                          <LocalDate ts={b.at} />
                          {b.awayDays != null
                            ? ` · away ${b.awayDays} days${
                                b.recordedHops && b.recordedHops > 2
                                  ? `, changing hands ${b.recordedHops} times`
                                  : ""
                              }`
                            : " · the trade that sent it out is not in the record"}
                        </>
                      ) : (
                        "No transaction records this move, so it carries no date"
                      )}
                    </span>
                  </>
                );
                return (
                  <li key={`${b.season}-${b.round}-${b.rosterId}-${i}`}>
                    {b.recorded && b.transactionId ? (
                      <Link
                        href={dealHref(b.transactionId)}
                        className="flex min-h-11 items-center gap-2 px-2.5 py-1.5 transition-colors hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1">{body}</span>
                        <ChevronRight
                          size={13}
                          aria-hidden="true"
                          className="shrink-0 text-faint"
                        />
                      </Link>
                    ) : (
                      <div className="flex min-h-11 items-center gap-2 px-2.5 py-1.5">
                        <span className="min-w-0 flex-1">{body}</span>
                        <Tag tone="warn">unrecorded</Tag>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        </section>
      )}

      {!pairing && !manager && (
        <>
          {/* Both directories are doors into a filtered index rather than reading
                matter, so they arrive shut. Native `<details>`: no client bundle, and
                find-in-page still reaches every name inside them. */}
          {/* The reconsidered blue-sky idea: every possible pairing as a grid, so a
                pair that has NEVER traded is as visible as one that has. Shut like its
                two siblings - this is a reading of the same corpus the directories
                below already are, not a new destination, and it costs nothing at rest. */}
          <Directory title={`Trade matrix - ${matrix.traded} of ${matrix.possible} pairs`}>
            <p className="mb-1.5 text-meta leading-snug text-secondary">
              Every possible pairing among {matrix.order.length} managers, past and
              present. A filled square traded at least once; a hollow square never
              has - {matrix.never} pairs, listed below the chart.
            </p>
            <TradeMatrix matrix={matrix} />
            <div className="rule my-2.5" />
            <p className="text-meta font-semibold uppercase tracking-wide text-accent-text">
              Never traded
            </p>
            <NeverTradedList matrix={matrix} />
          </Directory>

          <Directory title={`Who trades with whom (${ledger.pairings.length})`}>
            {busiest && (
              <p className="mb-1.5 text-meta leading-snug text-secondary">
                Busiest pairing: {byOwner.get(busiest.a)?.name} and{" "}
                {byOwner.get(busiest.b)?.name}, {busiest.dealCount} deals.
              </p>
            )}
            <ul className="space-y-1">
              {ledger.pairings.map((p) => {
                const a = byOwner.get(p.a);
                const b = byOwner.get(p.b);
                return (
                  <li key={p.key}>
                    <Link
                      href={`/deals${dealsQueryString({ manager: null, pair: p.key, season: null })}`}
                      className="flex min-h-11 w-full items-center gap-2 rounded-[--radius-sm] border border-border bg-surface px-3 py-1.5 transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block line-clamp-1 text-body leading-snug text-ink">
                          {a?.name ?? p.a}{" "}
                          <span className="text-secondary">&amp;</span>{" "}
                          {b?.name ?? p.b}
                        </span>
                        <span className="block line-clamp-1 text-meta leading-snug text-secondary">
                          {p.seasons.join(", ")}
                        </span>
                      </span>
                      <span className="shrink-0 figure text-body text-accent-text">
                        {p.dealCount}
                      </span>
                      <ChevronRight
                        size={13}
                        aria-hidden="true"
                        className="shrink-0 text-faint"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Directory>

          <Directory title={`Managers (${ledger.managers.length})`}>
            <ul className="space-y-1">
              {ledger.managers.map((m) => (
                <li key={m.ownerId}>
                  <Link
                    href={`/deals${dealsQueryString({ manager: m.ownerId, pair: null, season: null })}`}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2.5 rounded-[--radius-sm] border px-3 py-1.5 transition-colors",
                      m.isMe
                        ? "border-accent-edge bg-accent-wash"
                        : "border-border bg-surface hover:bg-surface-2",
                    )}
                  >
                    <TeamAvatar
                      name={m.name}
                      avatarId={m.avatarId}
                      teamLogoUrl={m.teamLogoUrl}
                      size="xs"
                      isMe={m.isMe}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block line-clamp-1 text-body font-semibold leading-snug text-ink">
                        {m.name}
                        {m.isMe && (
                          <span className="ml-1.5 text-accent-text">(you)</span>
                        )}
                        {!m.isMe && m.isFormer && (
                          <span className="ml-1.5 text-secondary">
                            former{m.tenureLabel ? ` ${m.tenureLabel}` : ""}
                          </span>
                        )}
                      </span>
                      <span className="block line-clamp-1 text-meta leading-snug text-secondary">
                        {m.handle}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block figure text-body text-ink">
                        {m.trades}
                      </span>
                      <span className="block text-micro leading-normal text-faint">
                        deals
                      </span>
                    </span>
                    <ChevronRight
                      size={13}
                      aria-hidden="true"
                      className="shrink-0 text-faint"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Directory>
        </>
      )}
      <Onward from="/deals" />
    </div>
  );
}
/**
 * ONE DEAL, ONE ROW. Pulled out unchanged from the flat list so the season-grouped
 * branch and the filtered (small, already-flat) branch render the identical row -
 * a season fold must never mean two different rows for the same deal.
 */
function DealRow({ t, meRosterId }) {
  return (
    <li>
      <Link
        href={dealHref(t.id)}
        className="flex min-h-11 items-center gap-2 px-2.5 py-1.5 transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          {/* Who, on one line. The parties ARE the headline of a deal index -
            what each of them got is the receipt's job, and printing it here
            printed every deal twice. */}
          <span className="block line-clamp-1 text-body font-semibold leading-tight">
            {t.sides.map((s, i) => (
              <span key={s.rosterId}>
                {i > 0 && <span className="text-faint"> &harr; </span>}
                <span
                  className={
                    s.rosterId === meRosterId ? "text-accent-text" : "text-ink"
                  }
                >
                  {s.name}
                </span>
              </span>
            ))}
          </span>
          <span className="block line-clamp-1 figure text-meta leading-tight text-secondary">
            <LocalDate ts={t.created} /> · wk {t.week} · {dealPieces(t.assets)}
          </span>
        </span>
        {t.multiTeam && <Tag tone="info">{t.parties.length}-team</Tag>}
        {t.commissionerExecuted && <Tag tone="warn">no pick record</Tag>}
        <ChevronRight
          size={13}
          aria-hidden="true"
          className="shrink-0 text-faint"
        />
      </Link>
    </li>
  );
}
/**
 * A shut directory. The summary line is the whole affordance and it states its own
 * count, so nothing is hidden behind a label that does not admit what is inside it
 * (D46: no dead ends). The chevron is the only thing that moves, on `--motion-fast`,
 * and the revealed body arrives on `--motion-base` - both retired under
 * `prefers-reduced-motion` by `.disclosure-*` in app/interaction.css.
 */
function Directory({ title, children }) {
  return (
    <details className="group mt-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-meta font-semibold uppercase tracking-wide text-secondary">
        <ChevronRight
          size={13}
          aria-hidden="true"
          className="disclosure-chevron shrink-0 text-faint group-open:rotate-90"
        />
        {title}
      </summary>
      <div className="disclosure-body pt-1">{children}</div>
    </details>
  );
}
function FilterLink({ href, active, label }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 text-note font-semibold leading-snug transition-colors",
        active
          ? "border-accent bg-accent-wash text-accent-text"
          : "border-border bg-surface text-muted hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
}
