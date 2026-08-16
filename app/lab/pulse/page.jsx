/**
 * THE PULSE - the digest, but for the whole league, and only once it has something
 * to say.
 *
 * `lib/digest` already computed a league-wide diff - every trade, every pick that
 * resolved into a player, and every roster whose TCI or Fragility crossed a five-point
 * threshold - since S2 (SHELVED.md) shipped it behind a Home panel. That panel is gone;
 * the engine underneath it never was. It just had nowhere honest to render, because the
 * marker it read burned its own baseline on the FIRST page view: load once and it has
 * "no earlier visit to compare against," reload thirty seconds later and it has
 * "nothing has moved since just now."
 *
 * `shouldAdvanceMarker` (lib/digest) is the fix SHELVED.md names as the condition for a
 * revival: the marker only actually moves once `DIGEST_ADVANCE_FLOOR_MS` (twelve hours)
 * has elapsed since the last time it did, so this page has a real window to report
 * instead of one it just closed on itself thirty seconds ago.
 *
 * This is NOT a marketplace, a chat, or a raw transaction log - Sleeper already has
 * that, and duplicating it would be exactly the scope creep this app's own restraint
 * exists to refuse. What this page adds is the thing Sleeper's own activity feed
 * cannot: it reads the SAME move through this app's own lens, past the raw fact
 * ("traded away") to what it did to a roster's revealed shape (TCI, RFI), in this
 * app's own established non-verdict voice - a metric moving is printed as a number and
 * a direction, never as good or bad on its own (see `lib/metrics/bands.js`'s
 * `fragilityTone`, and D61).
 *
 * Ships to /lab, not to Home or the primary nav, matching D54's own bar: the floor
 * mechanic and this presentation have not been lived with across a season the way TCI
 * and RFI have. If it holds up, promotion is a later round's decision, not this one's.
 */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { loadDigest } from "@/lib/digest";
import { dealHref } from "@/lib/tradegraph/url";
import { Card, Disclosure, EmptyState, PageHeader, SectionHeader } from "@/components/ui";
import { ExperimentBadge } from "@/components/ExperimentBadge";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "The pulse - Parquet Lab",
  description:
    "What changed across every roster in the league since you last looked - trades, resolved picks, and real TCI/RFI shifts, floored so it always has a real window to report.",
};
const METRIC_LABEL = { tci: "TCI", fragility: "RFI" };
function ListCard({ children }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-[--radius-sm] border border-border bg-surface">
      {children}
    </ul>
  );
}
function TradeRow({ t }) {
  return (
    <li>
      <Link
        href={dealHref(t.transactionId)}
        className="flex items-start gap-2 px-2.5 py-2 transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-body leading-snug text-ink">
            {t.description}
          </span>
          <span className="block figure text-meta leading-tight text-secondary">
            {t.season} · wk {t.week}
          </span>
        </span>
        <ChevronRight
          size={13}
          aria-hidden="true"
          className="mt-1 shrink-0 text-faint"
        />
      </Link>
    </li>
  );
}
function PickRow({ p }) {
  return (
    <li>
      <Link
        href={`/managers/${p.ownerRoster}`}
        className="flex min-h-11 items-center gap-2 px-2.5 py-1.5 transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold leading-tight text-ink">
            {p.playerName}
            {p.position ? ` · ${p.position}` : ""}
          </span>
          <span className="block truncate text-meta leading-tight text-secondary">
            {p.label} &rarr; {p.mine ? "you" : p.ownerName}
          </span>
        </span>
        <ChevronRight
          size={13}
          aria-hidden="true"
          className="shrink-0 text-faint"
        />
      </Link>
    </li>
  );
}
function MoveRow({ m }) {
  return (
    <li>
      <Link
        href={`/managers/${m.rosterId}`}
        className="flex min-h-11 items-center gap-2 px-2.5 py-1.5 transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold leading-tight text-ink">
            {m.mine ? "You" : m.name}
          </span>
          <span className="block text-meta uppercase tracking-wide text-faint">
            {METRIC_LABEL[m.metric]}
          </span>
        </span>
        {/* Figures only, no green/red - a metric moving is not a verdict (D61). The
            reader gets the number and the direction of travel; what it means for this
            particular roster's chosen posture is the dossier's job, one tap away. */}
        <span className="shrink-0 figure text-body text-ink">
          {m.from} &rarr; {m.to}{" "}
          <span className="text-meta text-muted">
            ({m.delta > 0 ? "+" : ""}
            {m.delta})
          </span>
        </span>
        <ChevronRight
          size={13}
          aria-hidden="true"
          className="shrink-0 text-faint"
        />
      </Link>
    </li>
  );
}
export default async function PulsePage() {
  const h = await getLeagueHistory();
  const digest = await loadDigest(h);
  return (
    <div>
      <PageHeaderLocal digest={digest} />
      <Card className="mt-1">
        <p className="text-body leading-relaxed text-muted">
          Every trade, every traded pick that resolved into a player, and every roster
          whose Timeline Coherence or Fragility crossed a five-point swing - across all{" "}
          {h.rosters.length} rosters, not just yours.
        </p>
      </Card>
      {/* A real h2 before anything else below, even the empty states - EmptyState's
          own heading is an h3, and skipping straight from PageHeader's h1 to it
          fails heading-order (caught live: axe flagged the identical h1->h3 skip on
          /lab/regret's own empty state, a pre-existing latent case this page is not
          reproducing on purpose). */}
      <SectionHeader title="What changed" />
      {digest.state === "first-visit" && (
        <EmptyState title="No earlier visit to compare against yet">
          Come back later and this will have a real window to report.
        </EmptyState>
      )}
      {digest.state === "quiet" && (
        <EmptyState title={`Nothing has moved since ${digest.sinceLabel}`}>
          No trades, no picks resolved into players, and no roster crossed a
          five-point swing in TCI or RFI in that time.
        </EmptyState>
      )}
      {digest.state === "changes" && (
        <>
          {digest.totals.trades > 0 && (
            <>
              <SectionHeader
                title="Trades"
                action={
                  <span className="figure text-meta text-secondary">
                    {digest.totals.trades}
                  </span>
                }
              />
              <ListCard>
                {digest.trades.map((t) => (
                  <TradeRow key={t.transactionId} t={t} />
                ))}
              </ListCard>
              {digest.totals.trades > digest.trades.length && (
                <p className="mt-1.5 text-meta text-faint">
                  {digest.totals.trades - digest.trades.length} more on{" "}
                  <Link href="/deals" className="text-accent-text">
                    the full index
                  </Link>
                  .
                </p>
              )}
            </>
          )}
          {digest.totals.picks > 0 && (
            <>
              <SectionHeader
                title="Picks that became players"
                action={
                  <span className="figure text-meta text-secondary">
                    {digest.totals.picks}
                  </span>
                }
              />
              <ListCard>
                {digest.picks.map((p) => (
                  <PickRow key={p.key} p={p} />
                ))}
              </ListCard>
            </>
          )}
          {digest.metricsTracked && digest.totals.moves > 0 && (
            <>
              <SectionHeader
                title="Rosters that moved"
                action={
                  <span className="figure text-meta text-secondary">
                    {digest.totals.moves}
                  </span>
                }
              />
              <ListCard>
                {digest.moves.map((m) => (
                  <MoveRow key={`${m.rosterId}-${m.metric}`} m={m} />
                ))}
              </ListCard>
              {digest.totals.moves > digest.moves.length && (
                <p className="mt-1.5 text-meta text-faint">
                  {digest.totals.moves - digest.moves.length} more shift
                  {digest.totals.moves - digest.moves.length > 1 ? "s" : ""} not
                  shown here.
                </p>
              )}
            </>
          )}
          {!digest.metricsTracked && (
            <p className="mt-3 text-meta leading-snug text-faint">
              TCI/RFI movement is not tracked yet for this window - the marker that
              was current last time carried no snapshot to compare against. It will
              be tracked from here forward.
            </p>
          )}
        </>
      )}
      <div className="mt-5">
        <Disclosure summary="What this cannot know">
          <ul className="space-y-1.5">
            <li className="text-meta leading-snug text-muted">
              The baseline is YOUR own last visit, not a shared league clock - two
              managers who open this page at different times see two different
              windows, each true to their own history.
            </li>
            <li className="text-meta leading-snug text-muted">
              Floored at twelve hours: a bookmark you hit twice in the same sitting
              always reads the same window, even though the league kept moving
              underneath it. The trade-off is real - the window can occasionally lag
              a few hours behind an actual move.
            </li>
            <li className="text-meta leading-snug text-muted">
              A five-point TCI or RFI swing is reported as a fact, not a verdict.
              Whether it matters for a given roster depends on the posture it chose -
              see that roster&apos;s own dossier.
            </li>
            <li className="text-meta leading-snug text-muted">
              A roster with no prior snapshot on record cannot show a metric move,
              even if it moved a great deal - the marker has nothing to diff it
              against yet.
            </li>
          </ul>
        </Disclosure>
      </div>
      <p className="mt-2 text-meta leading-snug text-secondary">
        Built on{" "}
        <Link href="/methodology" className="text-accent-text">
          the same TCI and RFI
        </Link>{" "}
        every other page reads. This is an unproven presentation of an already-proven
        signal - it may not earn a permanent page, and unlike TCI and RFI themselves it
        has not been lived with across a season yet.
      </p>
    </div>
  );
}
/**
 * Split out only because the subtitle has three real states worth writing out in
 * full rather than folding into one string with a ternary inside a ternary.
 */
function PageHeaderLocal({ digest }) {
  const subtitle =
    digest.state === "first-visit"
      ? "Building your first baseline now."
      : digest.state === "quiet"
        ? `Quiet since ${digest.sinceLabel}.`
        : `Since ${digest.sinceLabel}.`;
  return (
    <PageHeader
      kicker="The Lab"
      title="The pulse"
      subtitle={subtitle}
      action={<ExperimentBadge />}
    />
  );
}
