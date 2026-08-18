import Link from "next/link";
import {
  ChevronRight,
  Hourglass,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getTradedPickLineages } from "@/lib/lineage";
import { getAuditLog, getStaleRosters } from "@/lib/commissioner";
import { leagueBuybacks } from "@/lib/agency";
import { notableWaiverLabel } from "@/lib/ledger";
import {
  Card,
  EmptyState,
  PageHeader,
  SectionHeader,
  Tag,
} from "@/components/ui";
import { Onward } from "@/components/Onward";
import { fmtValue } from "@/lib/ui";
import { LineageCard } from "../drafts/parts";
import { SeatLinks } from "./seats";
export const dynamic = "force-dynamic";
const TYPE_TONE = {
  trade: "accent",
  waiver: "info",
};
/** One audit-log row: date, type, the ledger's own neutral copy, and a link to
 *  wherever this transaction actually lives - its own deal page for a trade, the
 *  manager who made the move for everything else. No inline detail beyond that
 *  one line, on purpose - see lib/commissioner.ts for why this isn't a second
 *  ledger. */
function AuditRow({ e }) {
  const href =
    e.tradeHref ?? (e.rosterId != null ? `/managers/${e.rosterId}` : null);
  /*
   * `e.description` USED TO BE `truncate` (single-line ellipsis). It is a full
   * transaction sentence built by `describeTransaction` - "Trade - Roster A sent
   * Bobby Portis, ...; Roster B sent ..." for a multi-asset deal - not a short
   * label, and a one-line cap silently cut off every row on the live 362-move
   * log ("Full Tilt claimed Xavier Kowals...", "Trade - Draft Vault sent Bobby
   * P...", every single visible row screenshotted mid-word). An audit log's
   * whole job is to state exactly what happened; the fix is to let it wrap
   * (the row is already `min-h-11`, not a fixed height, so it can grow), not to
   * keep shrinking a sentence this log exists to show in full.
   */
  const inner = (
    <>
      <span className="mt-1.5 w-11 shrink-0 figure text-meta text-secondary">
        wk {e.week}
      </span>
      <Tag tone={TYPE_TONE[e.type] ?? "neutral"} className="mt-1 shrink-0">
        {e.type.replace("_", " ")}
      </Tag>
      <span className="min-w-0 flex-1 text-note leading-snug text-ink">
        {e.description}
      </span>
      {href && (
        <ChevronRight
          size={13}
          className="mt-1.5 shrink-0 text-faint"
          aria-hidden="true"
        />
      )}
    </>
  );
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="flex min-h-11 items-start gap-2 px-2.5 py-1 transition-colors hover:bg-surface-2"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex min-h-11 items-start gap-2 px-2.5 py-1">
          {inner}
        </div>
      )}
    </li>
  );
}
export default async function CommissionerPage() {
  const h = await getLeagueHistory();
  const lineages = await getTradedPickLineages(h);
  const unresolvedPicks = lineages.filter((l) => !l.resolved);
  // A pick waiting on a future or in-progress draft is completely normal - the actual
  // health signal is a pick that CAN'T resolve: the team that owned the slot left the
  // league, or the recorded pick carries no player. Splitting these keeps "needs a
  // look" from being buried under dozens of routine future picks.
  const stuckPicks = unresolvedPicks.filter(
    (l) => l.reason === "slot-unknown" || l.reason === "no-player",
  );
  // The complement, not a second allowlist: UnresolvedReason has more values than
  // the two "stuck" ones (no-draft, not-yet-drafted, and no-draft-support on a
  // provider without drafts), and a pick that matched neither list would silently
  // vanish from a page whose whole premise is that nothing gets silently dropped.
  const pendingPicks = unresolvedPicks.filter(
    (l) => l.reason !== "slot-unknown" && l.reason !== "no-player",
  );
  const staleRosters = getStaleRosters(h);
  // The one pattern every real commissioner guide names first when asked what
  // "league health" actually means: a pick returning to whoever traded it away.
  // `leagueBuybacks` already computes this league-wide for /deals#buybacks (D51);
  // it simply never had a doorway on the one page whose whole job is "what should
  // a commissioner look at" - a reader would have had to already know to look on
  // /deals to find it. Same computation, same neutral non-verdict framing, just
  // reachable from the page that asks the question.
  const buybacks = leagueBuybacks(h);
  const auditLog = getAuditLog(h);
  const waiverLabel = notableWaiverLabel(h);
  const bySeason = new Map();
  for (const e of auditLog) {
    const list = bySeason.get(e.season) ?? [];
    list.push(e);
    bySeason.set(e.season, list);
  }
  const seasonsDesc = [...bySeason.keys()].sort((a, b) => b.localeCompare(a));
  return (
    <div>
      <PageHeader
        kicker="Commissioner tools"
        title="League health & audit log"
        subtitle="A dashboard, not a second ledger - every row here points at the surface that already owns the full story. Trade-veto history isn't included: Sleeper doesn't expose it reliably enough to show without risking a silent gap."
      />

      {/* First, because handing the app to the league is a one-time act that has to
            be findable, and everything below it is a recurring check. */}
      <SeatLinks h={h} />

      <SectionHeader
        title="Stale rosters"
        action={
          <Tag tone={staleRosters.length ? "warn" : "positive"}>
            {staleRosters.length
              ? `${staleRosters.length} flagged`
              : "all clear"}
          </Tag>
        }
      />
      {staleRosters.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={26} />}
          title="Every roster looks active"
        >
          No empty starting slots and every team has moved this season.
        </EmptyState>
      ) : (
        <>
          {h.rosters.length > 0 &&
            staleRosters.length / h.rosters.length > 0.75 && (
              <p className="mb-2 text-note leading-snug text-muted">
                Most of the league is quiet right now. That is the offseason
                lull, not a pile of separate problems.
              </p>
            )}
          <div className="space-y-1.5">
            {staleRosters.map((r) => (
              <Link
                key={r.rosterId}
                href={`/managers/${r.rosterId}`}
                className="flex min-h-11 items-center gap-2 rounded-[--radius-sm] border border-warn/30 bg-surface px-2.5 py-1.5 transition-colors hover:bg-surface-2"
              >
                <ShieldAlert
                  size={15}
                  className="shrink-0 text-warn"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold leading-tight text-ink">
                    {r.name}
                  </span>
                  <span className="block truncate text-meta leading-tight text-muted">
                    {r.reasons.map((x) => x.detail).join(" · ")}
                  </span>
                </span>
                <ChevronRight
                  size={13}
                  className="shrink-0 text-faint"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        </>
      )}

      {/*
          ROUND-TRIP PICKS. The pattern real commissioner guides name first when
          asked what a "league health" check actually needs to catch - not because
          a pick coming home is evidence of anything (it plainly is not: a throw-in
          comes home the same way a plan does), but because it is the one shape a
          reader cannot spot by eye across a season of transactions, and the fact
          itself is worth a commissioner's own two seconds either way. No verdict
          here, same as everywhere else in this app (D6) - a count and a link to
          the full record, not an accusation.
        */}
      <SectionHeader
        title="Round-trip picks"
        action={
          <Tag tone="neutral">
            {buybacks.total
              ? `${buybacks.total} on record`
              : "none on record"}
          </Tag>
        }
      />
      {buybacks.total === 0 ? (
        <EmptyState icon={<ShieldCheck size={26} />} title="No pick has come home">
          No traded pick has ever returned to the roster that traded it away.
        </EmptyState>
      ) : (
        <Card>
          <p className="text-body leading-relaxed text-ink">
            <span className="figure font-semibold text-ink">
              {buybacks.total}
            </span>{" "}
            pick{buybacks.total === 1 ? "" : "s"}{" "}
            {buybacks.total === 1 ? "has" : "have"} returned to whoever traded{" "}
            {buybacks.total === 1 ? "it" : "them"} away, across{" "}
            <span className="figure">{buybacks.byManager.length}</span> of{" "}
            <span className="figure">{buybacks.rosters}</span> rosters. A fact
            worth knowing, not evidence of anything: intent is not in the
            record, and a pick can come home as a throw-in as easily as on
            purpose.
          </p>
          <Link
            href="/deals#buybacks"
            className="mt-1.5 inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-accent-text"
          >
            Every round trip, league-wide
            <ChevronRight size={12} aria-hidden="true" />
          </Link>
        </Card>
      )}

      <SectionHeader
        title="Picks that can't resolve"
        action={
          <Tag tone={stuckPicks.length ? "negative" : "positive"}>
            {stuckPicks.length
              ? `${stuckPicks.length} need a look`
              : "all clear"}
          </Tag>
        }
      />
      {stuckPicks.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={26} />} title="Nothing stuck">
          No traded pick is orphaned (the original team left the league) or
          recorded without a player.
        </EmptyState>
      ) : (
        <div className="space-y-1.5">
          {stuckPicks.map((l) => (
            <LineageCard
              key={`${l.season}-${l.round}-${l.originalRoster}`}
              l={l}
            />
          ))}
        </div>
      )}

      {pendingPicks.length > 0 && (
        <details className="mt-2 rounded-[--radius] border border-border bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-2.5 py-1.5 text-note font-semibold text-muted">
            <Hourglass
              size={14}
              className="shrink-0 text-faint"
              aria-hidden="true"
            />
            {pendingPicks.length} more traded pick
            {pendingPicks.length === 1 ? "" : "s"} waiting on a future or
            in-progress draft - normal, not a health issue
          </summary>
          <div className="disclosure-body space-y-1.5 border-t border-border p-1.5">
            {pendingPicks.map((l) => (
              <LineageCard
                key={`${l.season}-${l.round}-${l.originalRoster}`}
                l={l}
              />
            ))}
          </div>
        </details>
      )}

      <SectionHeader
        title="Transaction audit log"
        action={
          <span className="figure text-meta text-secondary">
            {fmtValue(auditLog.length)} of {fmtValue(h.transactions.length)}
          </span>
        }
      />
      <p className="-mt-1 mb-1.5 text-meta leading-snug text-muted">
        Trades and {waiverLabel}, across every team - the same bar the ledger
        uses for what counts as notable. Everything else is real activity too,
        just not the kind a commissioner needs a checklist for.
      </p>
      {auditLog.length === 0 ? (
        <EmptyState
          icon={<ScrollText size={26} />}
          title="No notable moves yet"
        >
          Trades and {waiverLabel} will show up here as they happen.
        </EmptyState>
      ) : (
        /*
         * THE DIET. This log rendered every season of every notable move expanded,
         * and it is most of why the longest page in the app was 10,125px - a wall
         * whose newest and only actionable rows sat at the top and whose remaining
         * four fifths nobody scrolled. Seasons are `<details>` now, with the current
         * one open and the rest closed, which is the same idiom the pending-picks
         * list two sections up already uses. Nothing is removed: every row is one tap
         * away and the count is printed on the closed summary, so a reader can see
         * how much is behind each without opening it.
         */
        <div className="space-y-1.5">
          {seasonsDesc.map((season, i) => (
            <details
              key={season}
              open={i === 0}
              className="group overflow-hidden rounded-[--radius] border border-border bg-surface"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-1">
                <span className="flex items-center gap-1.5">
                  <ChevronRight
                    size={13}
                    aria-hidden="true"
                    className="disclosure-chevron shrink-0 text-faint group-open:rotate-90"
                  />
                  <span className="figure text-note font-semibold text-ink">
                    {season}
                  </span>
                </span>
                <span className="figure text-meta text-secondary">
                  {bySeason.get(season).length} notable
                </span>
              </summary>
              <ul className="disclosure-body divide-y divide-border border-t border-border">
                {bySeason.get(season).map((e) => (
                  <AuditRow key={e.transactionId} e={e} />
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}

      {/* Third of the four zero-outbound surfaces, and the one that also had zero
            INBOUND links - the longest page in the app was one nobody could navigate
            to. /league now carries the doorway; this is the way back out. */}
      <Onward from="/commissioner" />
    </div>
  );
}
