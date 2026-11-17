import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { loadDigest } from "@/lib/digest";
import { dealHref } from "@/lib/tradegraph/url";
import { Chip, Disclosure, EmptyState, List, ListRow, PageHeader, SectionHeader, StatTile } from "@/components/ui";
import { Onward } from "@/components/Onward";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "The pulse - Parquet Lab",
  description:
    "What changed across every roster in the league since you last looked - trades, resolved picks, and real TCI/RFI shifts, floored so it always has a real window to report.",
};
/*
 * THE PULSE. The page answers "what changed in the league since I last looked?": the
 * three counts as tiles, then the trades, the traded picks that became players and the
 * rosters whose TCI or RFI crossed a five-point swing, as rows. The baseline is the
 * viewer's own last visit (lib/digest), floored at twelve hours. A metric moving is
 * printed as figures only, never coloured as a verdict (D61).
 */
const METRIC_LABEL = { tci: "TCI", fragility: "RFI" };

export default async function PulsePage() {
  const h = await getLeagueHistory();
  const digest = await loadDigest(h);
  const subtitle =
    digest.state === "first-visit"
      ? "Building your first baseline now"
      : digest.state === "quiet"
        ? `Quiet since ${digest.sinceLabel}`
        : `Since ${digest.sinceLabel}, across all ${h.rosters.length} rosters`;
  return (
    <div>
      <PageHeader
        kicker="This Week"
        title="The pulse"
        subtitle={subtitle}
        aside={
          <Chip tone="warn" size="sm" icon={FlaskConical}>
            Experiment
          </Chip>
        }
      />
      {digest.state === "changes" && (
        <div className="grid grid-cols-3 gap-2">
          <StatTile size="sm" label="Trades" value={String(digest.totals.trades)} />
          <StatTile size="sm" label="Picks resolved" value={String(digest.totals.picks)} />
          <StatTile
            size="sm"
            label="Rosters moved"
            value={digest.metricsTracked ? String(digest.totals.moves) : "unknown"}
            sub={digest.metricsTracked ? "5+ pt swing" : "not tracked yet"}
          />
        </div>
      )}
      <SectionHeader title="What changed" />
      {digest.state === "first-visit" && (
        <EmptyState title="No earlier visit to compare against">
          Come back later and this will have a real window to report.
        </EmptyState>
      )}
      {digest.state === "quiet" && (
        <EmptyState title={`Nothing has moved since ${digest.sinceLabel}`}>
          No trades, no picks resolved, no five-point TCI or RFI swing.
        </EmptyState>
      )}
      {digest.state === "changes" && (
        <>
          {digest.totals.trades > 0 && (
            <>
              <h3 className="mb-2 text-note font-semibold text-ink">Trades</h3>
              <List aria-label="Trades">
                {digest.trades.map((t) => (
                  <li key={t.transactionId}>
                    <ListRow
                      href={dealHref(t.transactionId)}
                      title={<span className="font-medium">{t.description}</span>}
                      meta={
                        <span className="figure">
                          {t.season} · wk {t.week}
                        </span>
                      }
                    />
                  </li>
                ))}
              </List>
              {digest.totals.trades > digest.trades.length && (
                <Link href="/deals" className="mt-1 inline-flex min-h-11 items-center text-note font-semibold text-accent-text">
                  {digest.totals.trades - digest.trades.length} more on the deal index
                </Link>
              )}
            </>
          )}
          {digest.totals.picks > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-note font-semibold text-ink">Picks that became players</h3>
              <List aria-label="Picks that became players">
                {digest.picks.map((p) => (
                  <li key={p.key}>
                    <ListRow
                      href={`/managers/${p.ownerRoster}`}
                      highlight={p.mine}
                      title={`${p.playerName}${p.position ? ` · ${p.position}` : ""}`}
                      badge={
                        p.mine ? (
                          <Chip size="sm" tone="accent">
                            You
                          </Chip>
                        ) : null
                      }
                      meta={`${p.label} → ${p.mine ? "you" : p.ownerName}`}
                    />
                  </li>
                ))}
              </List>
            </>
          )}
          {digest.metricsTracked && digest.totals.moves > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-note font-semibold text-ink">Rosters that moved</h3>
              <List aria-label="Rosters that moved">
                {digest.moves.map((m) => (
                  <li key={`${m.rosterId}-${m.metric}`}>
                    <ListRow
                      href={`/managers/${m.rosterId}`}
                      highlight={m.mine}
                      title={m.mine ? "You" : m.name}
                      meta={METRIC_LABEL[m.metric]}
                      value={`${m.from} → ${m.to}`}
                      valueSub={`${m.delta > 0 ? "+" : ""}${m.delta}`}
                    />
                  </li>
                ))}
              </List>
              {digest.totals.moves > digest.moves.length && (
                <p className="mt-1.5 text-meta text-secondary">
                  {digest.totals.moves - digest.moves.length} more not shown.
                </p>
              )}
            </>
          )}
        </>
      )}
      <Disclosure className="mt-3" summary="What this cannot know">
        <ul className="list-disc space-y-1.5 pl-4">
          <li>The baseline is your own last visit, not a shared league clock.</li>
          <li>Floored at twelve hours, so the window can lag a few hours behind an actual move.</li>
          <li>A five-point TCI or RFI swing is a fact, not a verdict; what it means depends on the roster&apos;s posture.</li>
          <li>A roster with no prior snapshot cannot show a metric move yet.</li>
          {digest.state === "changes" && !digest.metricsTracked && (
            <li>TCI/RFI movement is not tracked for this window: the last marker carried no snapshot. It is tracked from here on.</li>
          )}
          <li>
            Built on{" "}
            <Link href="/methodology" className="font-semibold text-accent-text underline underline-offset-2">
              the same TCI and RFI
            </Link>{" "}
            as every other page; this presentation is unproven and may not earn a permanent page.
          </li>
        </ul>
      </Disclosure>
      <Onward from="/lab/pulse" />
    </div>
  );
}
