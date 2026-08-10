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
import Link from "next/link";
import { CheckCircle2, ChevronRight, Eye, KeyRound } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import {
  getLedgerEntries,
  getLedgerSummary,
  newestToCapture,
  notableWaiverLabel,
  type LedgerEntry,
} from "@/lib/ledger";
import { getPrincipals } from "@/lib/principals";
import { captureBlock, readSeat } from "@/lib/auth/server";
import { LedgerItem } from "@/components/LedgerItem";
import { PageHeader, SectionHeader, Stat, EmptyState, Tag } from "@/components/ui";
import { Onward } from "@/components/Onward";

export const dynamic = "force-dynamic";

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
  const rest = toCapture.filter((e) => e.transactionId !== newest?.transactionId);

  return (
    <div>
      <PageHeader
        kicker="Decision ledger"
        title={blocked ? "The record" : "Capture the why"}
        subtitle={
          blocked
            ? "Every notable move this team has made. The reasoning behind them is private to the manager who wrote it, so none of it is shown here."
            : "Record your reasoning at the moment of conviction - not later, when memory has already rewritten it."
        }
      />

      {blocked === "other-lens" && (
        <div className="mb-3 flex items-start gap-2.5 rounded-[--radius-sm] border border-border bg-surface px-2.5 py-2">
          <Eye size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-faint" />
          <p className="min-w-0 text-meta leading-relaxed text-muted">
            You are viewing {h.me.teamName ?? h.me.displayName}. Captured reasoning
            belongs to whoever wrote it, so yours is hidden here too - switch back to
            your own team to see and edit it.
          </p>
        </div>
      )}

      {blocked === "unclaimed" && (
        <div className="mb-3 flex items-start gap-2.5 rounded-[--radius-sm] border border-border bg-surface px-2.5 py-2">
          <KeyRound size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-faint" />
          <p className="min-w-0 text-meta leading-relaxed text-muted">
            This browser has not claimed a seat, so it cannot write as anyone. Ask the
            commissioner for your claim link - it takes one tap and no password.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <Stat
          label={blocked ? "Uncaptured" : "To capture"}
          value={summary.unannotatedNotable}
          tone={!blocked && summary.unannotatedNotable ? "accent" : "neutral"}
        />
        <Stat label="Captured" value={summary.annotated} tone="positive" />
        <Stat label="Notable" value={summary.notable} />
      </div>
      <p className="-mt-1 mb-2 text-meta leading-snug text-muted">
        Notable means every trade, plus {waiverLabel} - the same bar the
        commissioner audit log and season recap use.
      </p>

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

      <SectionHeader
        title={
          blocked
            ? "Uncaptured - newest first"
            : newest
              ? "The rest, newest first"
              : "To capture - newest first"
        }
      />
      {toCapture.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={28} />}
          title={blocked ? "Nothing notable yet" : "All caught up"}
        >
          {blocked
            ? "This team has made no trades or notable waiver claims."
            : "Every notable decision has your reasoning attached. Come back after your next trade."}
        </EmptyState>
      ) : rest.length === 0 ? (
        <p className="text-body leading-relaxed text-muted">
          That was the last one without a why on it.
        </p>
      ) : (
        <RowList>
          {rest.map((e) => (
            <LedgerRow key={e.transactionId} entry={e} readOnly={blocked != null} />
          ))}
        </RowList>
      )}

      <SectionHeader title="Captured" />
      {captured.length === 0 ? (
        <p className="text-body leading-relaxed text-muted">
          {blocked
            ? "Nothing of yours is readable from here."
            : "Nothing captured yet. Start above."}
        </p>
      ) : (
        <RowList>
          {captured.map((e) => (
            <LedgerRow key={e.transactionId} entry={e} readOnly={blocked != null} />
          ))}
        </RowList>
      )}

      {blocked === "unclaimed" && (
        <p className="mt-4 text-center text-meta leading-relaxed text-secondary">
          Everything else in Parquet is public league data.{" "}
          <Link
            href="/about"
            className="inline-flex min-h-11 items-center gap-0.5 font-semibold text-muted underline-offset-2 hover:text-accent-text hover:underline"
          >
            What this is
            <ChevronRight size={12} aria-hidden="true" />
          </Link>
        </p>
      )}
      <Onward from="/ledger" />
    </div>
  );
}

function RowList({ children }: { children: React.ReactNode }) {
  return (
    <ul
      data-testid="ledger-rows"
      className="divide-y divide-border overflow-hidden rounded-[--radius-sm] border border-border bg-surface"
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
function LedgerRow({ entry, readOnly }: { entry: LedgerEntry; readOnly: boolean }) {
  const annotated = entry.annotation != null;
  return (
    <li>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-2.5 py-1.5">
          <ChevronRight
            size={13}
            aria-hidden="true"
            className="disclosure-chevron shrink-0 text-faint group-open:rotate-90"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body leading-tight text-ink">
              {entry.description}
            </span>
            <span className="block figure text-meta leading-tight text-secondary">
              {entry.season} · wk {entry.week} · {entry.type.replace("_", " ")}
            </span>
          </span>
          <Tag tone={annotated ? "positive" : "accent"}>
            {annotated ? "captured" : readOnly ? "no why" : "add why"}
          </Tag>
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
