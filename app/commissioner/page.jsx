import Link from "next/link";
import {
  AlertTriangle,
  Check,
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
  Disclosure,
  EmptyState,
  List,
  ListRow,
  PageHeader,
  SectionHeader,
  StatTile,
  Tag,
} from "@/components/ui";
import { Onward } from "@/components/Onward";
import { fmtValue } from "@/lib/ui";
import { LineageCard } from "../drafts/parts";
import { SeatLinks } from "./seats";
export const dynamic = "force-dynamic";
/** Stale rosters printed before the rest fold behind "N more". */
const STALE_SHOWN = 4;
function StaleRow({ r }) {
  return (
    <li>
      <ListRow
        href={`/managers/${r.rosterId}`}
        avatar={<ShieldAlert size={18} aria-hidden="true" className="text-warn" />}
        title={r.name}
        meta={r.reasons.map((x) => x.detail).join(" · ")}
      />
    </li>
  );
}
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
      <span className="mt-1 w-11 shrink-0 figure text-meta text-secondary">
        wk {e.week}
      </span>
      <Tag tone={TYPE_TONE[e.type] ?? "neutral"} className="mt-1 shrink-0">
        {e.type.replace("_", " ")}
      </Tag>
      <span className="min-w-0 flex-1 text-note text-ink">
        {e.description}
      </span>
      {href && (
        <ChevronRight
          size={16}
          className="mt-0.5 shrink-0 text-faint"
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
          className="flex min-h-12 items-start gap-2 px-4 py-2.5 transition-colors hover:bg-surface-2"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex min-h-12 items-start gap-2 px-4 py-2.5">
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
        kicker="Commissioner"
        title="League health"
        subtitle="Every row opens the page that owns the full story."
      />

      {/* The three checks as figures first, each a jump to its list below. */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          href="#stale"
          label="Stale"
          value={staleRosters.length}
          tone={staleRosters.length ? "neutral" : "positive"}
          sub={`of ${h.rosters.length} teams`}
        />
        <StatTile
          href="#stuck"
          label="Stuck picks"
          value={stuckPicks.length}
          tone={stuckPicks.length ? "negative" : "positive"}
          sub={`${pendingPicks.length} pending`}
        />
        <StatTile
          href="#audit"
          label="Notable"
          value={fmtValue(auditLog.length)}
          sub={`of ${fmtValue(h.transactions.length)}`}
        />
      </div>
      <Disclosure summary="What is not here" className="mt-1">
        Trade-veto history: Sleeper does not expose it reliably enough to show without
        risking a silent gap. This page is a checklist, not a second ledger; each row
        links to the surface that already owns the detail.
      </Disclosure>

      {/* First, because handing the app to the league is a one-time act that has to
            be findable, and everything below it is a recurring check. */}
      <SeatLinks h={h} />

      <SectionHeader
        id="stale"
        title="Stale rosters"
        action={
          <Tag tone={staleRosters.length ? "warn" : "positive"} icon={staleRosters.length ? AlertTriangle : Check}>
            {staleRosters.length ? `${staleRosters.length} flagged` : "all clear"}
          </Tag>
        }
      />
      {staleRosters.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={26} aria-hidden="true" />} title="Every roster looks active">
          No empty starting slots and every team has moved this season.
        </EmptyState>
      ) : (
        <>
          {h.rosters.length > 0 && staleRosters.length / h.rosters.length > 0.75 && (
            <p className="mb-2 text-note text-muted">Most of the league is quiet: the offseason lull.</p>
          )}
          <List>{staleRosters.slice(0, STALE_SHOWN).map((r) => <StaleRow key={r.rosterId} r={r} />)}</List>
          {staleRosters.length > STALE_SHOWN && (
            <Disclosure
              summary={`${staleRosters.length - STALE_SHOWN} more`}
              className="mt-1"
              bodyClassName="bg-transparent p-0"
            >
              <List>{staleRosters.slice(STALE_SHOWN).map((r) => <StaleRow key={r.rosterId} r={r} />)}</List>
            </Disclosure>
          )}
        </>
      )}

      {/*
          ROUND-TRIP PICKS. The pattern real commissioner guides name first when asked
          what a "league health" check needs to catch - not because a pick coming home
          is evidence of anything (a throw-in comes home the same way a plan does), but
          because it is the one shape a reader cannot spot by eye across a season. No
          verdict (D6): a count and a link to the full record.
        */}
      <SectionHeader
        title="Round-trip picks"
        action={
          buybacks.total ? (
            <Link
              href="/deals#buybacks"
              className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 px-2 text-note font-semibold text-accent-text"
            >
              All of them
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          ) : null
        }
      />
      {buybacks.total === 0 ? (
        <EmptyState icon={<ShieldCheck size={26} aria-hidden="true" />} title="No pick has come home">
          No traded pick has ever returned to the roster that traded it away.
        </EmptyState>
      ) : (
        <Card>
          <p className="text-body text-muted">
            <span className="figure text-display font-bold text-ink">{buybacks.total}</span>{" "}
            pick{buybacks.total === 1 ? "" : "s"} back with whoever traded{" "}
            {buybacks.total === 1 ? "it" : "them"} away, across{" "}
            <span className="figure font-semibold text-ink">{buybacks.byManager.length}</span> of{" "}
            <span className="figure">{buybacks.rosters}</span> rosters.
          </p>
          <Disclosure summary="What this does and does not mean" className="mt-1" bodyClassName="bg-surface-2">
            A fact worth knowing, not evidence of anything: intent is not in the record,
            and a pick can come home as a throw-in as easily as on purpose.
          </Disclosure>
        </Card>
      )}

      <SectionHeader
        id="stuck"
        title="Picks that can't resolve"
        action={
          <Tag tone={stuckPicks.length ? "negative" : "positive"} icon={stuckPicks.length ? AlertTriangle : Check}>
            {stuckPicks.length ? `${stuckPicks.length} need a look` : "all clear"}
          </Tag>
        }
      />
      {stuckPicks.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={26} aria-hidden="true" />} title="Nothing stuck">
          No traded pick is orphaned or recorded without a player.
        </EmptyState>
      ) : (
        <div className="space-y-1.5">
          {stuckPicks.map((l) => (
            <LineageCard key={`${l.season}-${l.round}-${l.originalRoster}`} l={l} />
          ))}
        </div>
      )}

      {pendingPicks.length > 0 && (
        <Disclosure
          className="mt-2"
          icon={<Hourglass size={16} className="text-secondary" />}
          summary={`${pendingPicks.length} more waiting on a future draft (normal)`}
          bodyClassName="space-y-1.5 bg-transparent p-0"
        >
          {pendingPicks.map((l) => (
            <LineageCard key={`${l.season}-${l.round}-${l.originalRoster}`} l={l} />
          ))}
        </Disclosure>
      )}

      <SectionHeader
        id="audit"
        title="Transaction audit log"
        action={
          <span className="figure text-meta text-secondary">
            {fmtValue(auditLog.length)} of {fmtValue(h.transactions.length)}
          </span>
        }
      />
      <p className="-mt-1 mb-2 text-note text-muted">Trades and {waiverLabel}, every team.</p>
      {auditLog.length === 0 ? (
        <EmptyState icon={<ScrollText size={26} aria-hidden="true" />} title="No notable moves yet">
          Trades and {waiverLabel} will show up here as they happen.
        </EmptyState>
      ) : (
        /*
         * THE DIET. Seasons are `<details>`, all closed by default (the current one
         * alone ran to 15+ wrapped rows), with the count printed on each summary. Nothing is removed: every row
         * is one tap away (e2e/core-flow.spec.js asserts exactly that).
         */
        <div className="space-y-2">
          {seasonsDesc.map((season) => (
            <details key={season} className="group overflow-hidden rounded-card bg-surface">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <ChevronRight
                    size={16}
                    aria-hidden="true"
                    className="disclosure-chevron shrink-0 text-secondary group-open:rotate-90"
                  />
                  <span className="figure text-body font-semibold text-ink">{season}</span>
                </span>
                <span className="figure text-meta text-secondary">{bySeason.get(season).length} notable</span>
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

      <Onward from="/commissioner" />
    </div>
  );
}
