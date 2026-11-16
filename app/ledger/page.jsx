/**
 * THE DECISION LEDGER - one question at a time.
 *
 * This page used to open every textarea it had, all at once: twenty-nine capture cards
 * of ~340px each, 10,047px at 390px wide, every one of them pre-expanded with the same
 * placeholder waiting for an answer. The Desk badge and the Home banner both promise a
 * single next action, and the page they lead to was a twenty-nine question exam that
 * opened on question one.
 *
 * So: ONE pinned card for the newest uncaptured decision (`newestToCapture`, and see
 * its note for why newest rather than oldest), and everything else - uncaptured and
 * captured alike - as a tappable summary row that expands into the identical editor.
 * Nothing is dropped and nothing is read-only that was not read-only before; the same
 * `LedgerItem` is inside every row, minus the chrome the row itself already prints.
 *
 * The pattern is `PickAgencyPanel`'s, deliberately rather than a new one: native
 * `<details>`, no client JavaScript to open a row, find-in-page still reaches the text
 * inside a shut one, and the only motion is the shared `.disclosure-*` reveal.
 */
import { Check, CheckCircle2, ChevronRight, Eye, KeyRound } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import {
  getLedgerEntries,
  getLedgerSummary,
  newestToCapture,
  notableWaiverLabel,
} from "@/lib/ledger";
import { getPrincipals } from "@/lib/principals";
import { captureBlock, readSeat } from "@/lib/auth/server";
import { LedgerItem } from "@/components/LedgerItem";
import { Chip, Disclosure, PageHeader, SectionHeader, Stat, EmptyState, Tabs } from "@/components/ui";
import { Onward } from "@/components/Onward";
export const dynamic = "force-dynamic";
/** Newest uncaptured rows shown before the "older" fold. */
const FIRST = 6;
export default async function LedgerPage() {
  const h = await getLeagueHistory();
  const seat = await readSeat();
  // Two different reasons a reader cannot write here, and they need two different
  // sentences: one is "nobody has given you a link", the other is "you are looking
  // at someone else's team right now". In legacy mode this is null and the page is
  // exactly what it always was.
  const blocked = captureBlock(seat, h.me.userId);
  // Scoped to the viewer's own tenure in this seat - see `getLedgerEntries`.
  const principals = await getPrincipals(h);
  const entries = getLedgerEntries(h, principals);
  const summary = getLedgerSummary(h, principals);
  const waiverLabel = notableWaiverLabel(h);
  const toCapture = entries.filter((e) => e.notable && !e.annotation);
  const captured = entries.filter((e) => e.annotation);
  // The one the page asks for. A reader who cannot write here is not asked anything,
  // so there is nothing to pin for them - the list below is the whole page.
  const newest = blocked ? null : newestToCapture(entries);
  const rest = toCapture.filter(
    (e) => e.transactionId !== newest?.transactionId,
  );
  return (
    <div>
      <PageHeader
        kicker="Decision ledger"
        title={blocked ? "The record" : "Capture the why"}
        subtitle={
          blocked
            ? "Every notable move; the reasoning stays private"
            : "Write down why, while you still remember"
        }
      />

      {blocked === "other-lens" && (
        <p className="mb-3 flex items-center gap-2 text-note text-muted">
          <Eye size={16} aria-hidden="true" className="shrink-0 text-secondary" />
          Viewing {h.me.teamName ?? h.me.displayName}: reasoning is hidden. Switch to your own team to edit yours.
        </p>
      )}

      {blocked === "unclaimed" && (
        <p className="mb-3 flex items-center gap-2 text-note text-muted">
          <KeyRound size={16} aria-hidden="true" className="shrink-0 text-secondary" />
          This browser has no seat. Ask the commissioner for your claim link.
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Stat
          label={blocked ? "Uncaptured" : "To capture"}
          value={summary.unannotatedNotable}
          tone={!blocked && summary.unannotatedNotable ? "accent" : "neutral"}
        />
        <Stat label="Captured" value={summary.annotated} tone="positive" />
        <Stat label="Notable" value={summary.notable} />
      </div>
      <Disclosure className="mt-1" summary="What counts as notable">
        Every trade, plus {waiverLabel}: the same bar the commissioner audit log and season recap use.
      </Disclosure>

      {/* THE PINNED ONE. It is the only editor open on arrival, it is the freshest
            decision with no why on it, and it is above everything else on the page
            because it is the answer to the badge that sent you here. */}
      {newest && (
        <>
          <SectionHeader title="Newest to capture" />
          <div data-testid="ledger-pinned">
            <LedgerItem
              transactionId={newest.transactionId}
              description={newest.description}
              season={newest.season}
              week={newest.week}
              type={newest.type}
              initialReasoning={null}
              initialPosture={null}
              autoFocus
            />
          </div>
        </>
      )}

      <SectionHeader title={newest ? "The rest" : "Every notable move"} />
      <Tabs
        label="Decisions"
        items={[
          {
            id: "open",
            label: blocked ? "Uncaptured" : "To capture",
            count: rest.length,
            content:
              toCapture.length === 0 ? (
                <EmptyState icon={<CheckCircle2 size={28} />} title={blocked ? "Nothing notable yet" : "All caught up"}>
                  {blocked
                    ? "This team has made no trades or notable waiver claims."
                    : "Every notable decision has your reasoning attached."}
                </EmptyState>
              ) : rest.length === 0 ? (
                <p className="text-note text-muted">That was the last one without a why on it.</p>
              ) : (
                <>
                  <RowList>
                    {rest.slice(0, FIRST).map((e) => (
                      <LedgerRow key={e.transactionId} entry={e} readOnly={blocked != null} />
                    ))}
                  </RowList>
                  {rest.length > FIRST && (
                    <Disclosure summary={`${rest.length - FIRST} older`} bodyClassName="bg-transparent p-0">
                      <RowList>
                        {rest.slice(FIRST).map((e) => (
                          <LedgerRow key={e.transactionId} entry={e} readOnly={blocked != null} />
                        ))}
                      </RowList>
                    </Disclosure>
                  )}
                </>
              ),
          },
          {
            id: "captured",
            label: "Captured",
            count: captured.length,
            content:
              captured.length === 0 ? (
                <p className="text-note text-muted">
                  {blocked ? "Nothing of yours is readable from here." : "Nothing captured yet."}
                </p>
              ) : (
                <RowList>
                  {captured.map((e) => (
                    <LedgerRow key={e.transactionId} entry={e} readOnly={blocked != null} />
                  ))}
                </RowList>
              ),
          },
        ]}
      />

      <Onward from="/ledger" />
    </div>
  );
}
function RowList({ children }) {
  return (
    <ul
      data-testid="ledger-rows"
      className="divide-y divide-border overflow-hidden rounded-card bg-surface"
    >
      {children}
    </ul>
  );
}
/**
 * ONE DECISION, SHUT. The summary line carries everything you need to decide whether
 * this is the one you want to write about - what you did, when, and whether a why is
 * already on it - and the tap opens the same editor that used to be permanently open.
 *
 * The description is truncated to a single line here and printed in full inside, which
 * is not a duplication so much as a preview: the row has to stay one line to be
 * scannable, and you cannot write reasoning about a sentence you can only see half of.
 */
function LedgerRow({ entry, readOnly }) {
  const annotated = entry.annotation != null;
  return (
    <li>
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-body font-semibold text-ink">{entry.description}</span>
            <span className="mt-0.5 block figure text-meta text-secondary">
              {entry.season} · wk {entry.week} · {entry.type.replace("_", " ")}
            </span>
          </span>
          {annotated ? (
            <Chip size="sm" tone="positive" icon={Check}>
              captured
            </Chip>
          ) : (
            <Chip size="sm" tone={readOnly ? "neutral" : "accent"}>
              {readOnly ? "no why" : "add why"}
            </Chip>
          )}
          <ChevronRight
            size={18}
            aria-hidden="true"
            className="disclosure-chevron -mr-1 shrink-0 text-faint group-open:rotate-90"
          />
        </summary>
        <div className="disclosure-body">
          <LedgerItem
            transactionId={entry.transactionId}
            description={entry.description}
            season={entry.season}
            week={entry.week}
            type={entry.type}
            initialReasoning={entry.annotation?.reasoning ?? null}
            initialPosture={entry.annotation?.posture ?? null}
            readOnly={readOnly}
            showChrome={false}
          />
        </div>
      </details>
    </li>
  );
}
