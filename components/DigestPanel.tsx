"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  GitBranch,
  History,
  Repeat,
} from "lucide-react";
import type { Digest, DigestMoveItem } from "@/lib/digest";
import { Disclosure } from "@/components/ui";
import { dealHref } from "@/lib/tradegraph/url";
import { cn } from "@/lib/ui";

/**
 * "Since your last visit."
 *
 * A client component for one reason: something has to advance the last-seen marker, and
 * a cookie can only be written from a route handler. The POST fires after paint, from a
 * panel that was already rendered against the OLD marker, so recording the visit can
 * never blank the thing the reader is currently looking at.
 *
 * Text and numbers only, no chart. The metric rows are a two-point comparison (the value
 * stored in the marker against the value now), and two points are a delta, not a trend;
 * drawing a line through them would imply a shape the data does not contain.
 */
export function DigestPanel({ digest }: { digest: Digest }) {
  const recorded = useRef(false);

  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    // Fire and forget. A failed write costs the reader nothing today and simply means
    // the next visit diffs against an older marker, which is a wider net, not a wrong one.
    void fetch("/api/digest-seen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ metrics: digest.nextMetrics }),
    }).catch(() => {});
  }, [digest.nextMetrics]);

  if (digest.state === "first-visit") {
    return (
      <Shell>
        <div className="flex items-start gap-2.5">
          <History size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-faint" />
          <div className="min-w-0">
            <p className="text-body font-semibold leading-tight text-ink">
              No earlier visit to compare against
            </p>
            {/* This is the one branch of this panel that a reader sees exactly once,
                and it was rendering fifty words of explanation permanently above the
                fold on the second screen of the app. The line above already says the
                whole thing; the paragraph explaining what the panel WILL do belongs
                behind the same disclosure everything else in this app uses. */}
            <Disclosure summary="What this panel will show" className="mt-0.5">
              This is the first time this device has looked, so there is no before.
              Parquet just marked where the league stands. From the next visit on, this
              panel lists every trade, every pick that became a player, and every real
              timeline or fragility shift that happened while you were away.
            </Disclosure>
          </div>
        </div>
      </Shell>
    );
  }

  if (digest.state === "quiet") {
    return (
      <Shell>
        <div className="flex items-start gap-2.5">
          <History size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-faint" />
          <div className="min-w-0">
            <p className="text-body font-semibold leading-tight text-ink">
              Nothing has moved since {digest.sinceLabel}
            </p>
            <p className="mt-1 text-meta leading-relaxed text-muted">
              No trades, no picks resolved, no roster shifted its timeline or fragility
              enough to be worth your attention.
            </p>
            {!digest.metricsTracked && <PrimingNote />}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-meta leading-tight text-muted">
        Since {digest.sinceLabel}
      </p>

      {digest.trades.length > 0 && (
        <Group
          icon={<Repeat size={13} aria-hidden="true" />}
          title="Trades"
          count={digest.totals.trades}
          shown={digest.trades.length}
          href="/ledger"
        >
          {digest.trades.map((t) => (
            <Row key={t.transactionId} href={dealHref(t.transactionId)} flagged={t.mine}>
              <span className="block text-body leading-snug text-ink">
                {t.description}
              </span>
              <span className="mt-0.5 block figure text-meta text-secondary">
                {t.season} · wk {t.week}
                {t.mine ? " · you" : ""}
              </span>
            </Row>
          ))}
        </Group>
      )}

      {digest.picks.length > 0 && (
        <Group
          icon={<GitBranch size={13} aria-hidden="true" />}
          title="Picks resolved"
          count={digest.totals.picks}
          shown={digest.picks.length}
          href="/drafts"
        >
          {digest.picks.map((p) => (
            <Row key={p.key} href="/drafts" flagged={p.mine}>
              <span className="block text-body leading-snug text-ink">
                {p.label} became {p.playerName}
              </span>
              <span className="mt-0.5 block figure text-meta text-secondary">
                {p.position ? `${p.position} · ` : ""}
                {p.mine ? "your pick" : p.ownerName}
              </span>
            </Row>
          ))}
        </Group>
      )}

      {digest.moves.length > 0 && (
        <Group
          icon={<ArrowUpRight size={13} aria-hidden="true" />}
          title="Movement"
          count={digest.totals.moves}
          shown={digest.moves.length}
          href="/league"
        >
          {digest.moves.map((m) => (
            <Row
              key={`${m.rosterId}-${m.metric}`}
              href={`/managers/${m.rosterId}`}
              flagged={m.mine}
            >
              <MoveLine move={m} />
            </Row>
          ))}
        </Group>
      )}

      {!digest.metricsTracked && (
        <div className="mt-2">
          <PrimingNote />
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[--radius-sm] border border-border bg-surface p-2.5">
      {children}
    </div>
  );
}

/**
 * Stated out loud rather than hidden, because the alternative is a panel that silently
 * reports no movement on the one visit where it structurally cannot know.
 */
function PrimingNote() {
  return (
    <p className="text-meta leading-relaxed text-secondary">
      Timeline and fragility movement needs a previous reading to subtract, and this visit
      is the first one to store one. Those rows start from your next visit.
    </p>
  );
}

function Group({
  icon,
  title,
  count,
  shown,
  href,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  shown: number;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-accent-text">{icon}</span>
        <h3 className="min-w-0 truncate text-meta font-semibold uppercase tracking-[0.14em] text-muted">
          {title}
        </h3>
        <span className="figure text-meta text-secondary">{count}</span>
      </div>
      <div className="mt-1 space-y-1">{children}</div>
      {count > shown && (
        <Link
          href={href}
          className="inline-flex min-h-11 items-center gap-0.5 text-meta font-semibold text-accent-text"
        >
          {count - shown} more
          <ChevronRight size={12} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

function Row({
  href,
  flagged,
  children,
}: {
  href: string;
  flagged: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-[--radius-sm] border px-2.5 py-1.5 transition-colors",
        flagged
          ? "border-accent-edge bg-accent-wash hover:border-accent-edge"
          : "border-border bg-bg/40 hover:border-border-strong hover:bg-surface-2",
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronRight
        size={14}
        aria-hidden="true"
        className="shrink-0 text-faint"
      />
    </Link>
  );
}

const METRIC_LABEL: Record<DigestMoveItem["metric"], string> = {
  tci: "timeline coherence",
  fragility: "fragility",
};

function MoveLine({ move }: { move: DigestMoveItem }) {
  // Direction is not sentiment: a rising timeline index is a roster agreeing with itself,
  // while rising fragility is a roster getting easier to break.
  const better = move.metric === "tci" ? move.delta > 0 : move.delta < 0;
  const up = move.delta > 0;
  const tone = better ? "text-positive" : "text-negative";
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <>
      <span className="block truncate text-body leading-snug text-ink">
        {move.mine ? "You" : move.name}
        <span className="text-muted"> · {METRIC_LABEL[move.metric]}</span>
      </span>
      <span className="mt-0.5 flex items-center gap-1 figure text-meta text-secondary">
        <span>
          {move.from} to {move.to}
        </span>
        <span className={cn("inline-flex items-center gap-0.5 font-semibold", tone)}>
          <Arrow size={11} aria-hidden="true" />
          {Math.abs(move.delta)}
        </span>
      </span>
    </>
  );
}
