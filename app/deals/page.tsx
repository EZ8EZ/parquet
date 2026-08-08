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
 */
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getPrincipals } from "@/lib/principals";
import { buildTradeLedger } from "@/lib/tradegraph";
import { dealHref, dealsQueryString, parseDealsParams } from "@/lib/tradegraph/url";
import { Card, EmptyState, PageHeader, SectionHeader, Stat, Tag } from "@/components/ui";
import { LocalDate } from "@/components/LocalDate";
import { TeamAvatar } from "@/components/TeamAvatar";
import { cn } from "@/lib/ui";
import { Onward } from "@/components/Onward";

export const dynamic = "force-dynamic";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
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

  const filterLabel = pairing
    ? `${byOwner.get(pairing.a)?.name ?? pairing.a} and ${byOwner.get(pairing.b)?.name ?? pairing.b}`
    : manager
      ? manager.name
      : null;

  const hrefWith = (next: Partial<typeof url>) =>
    `/deals${dealsQueryString({ ...url, pair: pairing?.key ?? null, manager: manager?.ownerId ?? null, season, ...next })}`;

  return (
    <div>
      <PageHeader
        kicker="The record"
        title="Every deal"
        subtitle="One page per trade, with what each side got and what it is worth today. Tap any deal to open its receipt."
      />

      {!pairing && !manager && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Stat label="Deals on record" value={ledger.totalTrades} tone="accent" />
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
              Their dossiers count {pairing.dossierCount}. A commissioner-executed
              multi-team deal collapses several transactions into one record here, so
              the listable number is the smaller one.
            </p>
          )}
        </Card>
      )}

      {/* Season filter. Plain links, so this page needs no JS and every filtered
          view is its own address. */}
      <div className="scroll-x -mx-4 mb-3 flex gap-1.5 px-4 sm:mx-0 sm:px-0">
        <FilterLink href={hrefWith({ season: null })} active={!season} label="All seasons" />
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
      ) : (
        <ul className="space-y-1.5">
          {trades.map((t) => (
            <li key={t.id}>
              <Link
                href={dealHref(t.id)}
                className="block rounded-[--radius-sm] border border-border bg-surface px-3 py-2 transition-colors hover:border-border-strong hover:bg-surface-2"
              >
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="figure text-meta text-muted">
                    <LocalDate ts={t.created} /> · {t.season} wk {t.week}
                  </span>
                  {t.multiTeam && <Tag tone="info">{t.parties.length}-team</Tag>}
                  {t.hasInferredPicks && <Tag tone="warn">picks inferred</Tag>}
                  <ChevronRight
                    size={13}
                    aria-hidden="true"
                    className="ml-auto shrink-0 text-faint"
                  />
                </div>
                <ul className="space-y-0.5">
                  {t.sides.map((s) => (
                    <li key={s.rosterId} className="text-body leading-snug">
                      <span
                        className={cn(
                          "font-semibold",
                          s.rosterId === ledger.meRosterId ? "text-accent-text" : "text-ink",
                        )}
                      >
                        {s.name}
                      </span>{" "}
                      <span className="text-muted">{s.text}</span>
                    </li>
                  ))}
                </ul>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!pairing && !manager && (
        <>
          <SectionHeader title={`Who trades with whom (${ledger.pairings.length})`} />
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
                      <span className="block truncate text-body leading-snug text-ink">
                        {a?.name ?? p.a} <span className="text-secondary">&amp;</span>{" "}
                        {b?.name ?? p.b}
                      </span>
                      <span className="block truncate text-meta leading-snug text-secondary">
                        {p.seasons.join(", ")}
                      </span>
                    </span>
                    <span className="shrink-0 figure text-body text-accent-text">
                      {p.dealCount}
                    </span>
                    <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-faint" />
                  </Link>
                </li>
              );
            })}
          </ul>

          <SectionHeader title={`Managers (${ledger.managers.length})`} />
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
                    <span className="block truncate text-body font-semibold leading-snug text-ink">
                      {m.name}
                      {m.isMe && <span className="ml-1.5 text-accent-text">(you)</span>}
                      {!m.isMe && m.isFormer && (
                        <span className="ml-1.5 text-secondary">
                          former{m.tenureLabel ? ` ${m.tenureLabel}` : ""}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-meta leading-snug text-secondary">
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
                  <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <Onward from="/deals" />
    </div>
  );
}

function FilterLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
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
