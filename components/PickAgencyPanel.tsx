/**
 * WHOSE SEASON DECIDES THE PICKS YOU HOLD.
 *
 * The panel is a split bar and a list, and the split bar is deliberately the smallest
 * chart in the app: two segments, one number printed on each, so the picture is a
 * summary of the sentence beside it rather than the only place the value lives (chart
 * colour rule 1, lib/chart-colors.ts). Accent is the segment the reader controls,
 * because "the subject" is exactly what a pick you set yourself is; everything else is
 * the neutral mark.
 *
 * HOUSE SVG RULES (D3): fixed viewBox, integer coordinates, colours from tokens, one
 * full-sentence aria-label, and no library.
 *
 * The per-pick rows are native `<details>` so the summary line stays scannable at
 * 375px and the full read is one tap away without any client JavaScript.
 */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, Tag } from "@/components/ui";
import { CHART_ACCENT, CHART_NEUTRAL } from "@/lib/chart-colors";
import type { AgencySummary, PickAgency, Posture } from "@/lib/agency";
import { fmtValue } from "@/lib/ui";

const POSTURE_TONE: Record<Posture | "unread", "accent" | "positive" | "info" | "negative" | "neutral"> = {
  contending: "accent",
  ascending: "positive",
  rebuilding: "info",
  straddling: "negative",
  unread: "neutral",
};

const BAR_W = 300;
const BAR_H = 14;

function SplitBar({ controlled, total }: { controlled: number; total: number }) {
  if (total <= 0) return null;
  // Integer widths, and the second segment is the remainder rather than its own
  // rounded share, so the two always add up to exactly the bar.
  const w = Math.round((BAR_W * controlled) / total);
  return (
    <svg
      viewBox={`0 0 ${BAR_W} ${BAR_H}`}
      width="100%"
      height={BAR_H}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Split bar: ${controlled} of ${total} picks are set by your own seasons, ${total - controlled} by somebody else's.`}
      className="block"
    >
      <rect x={0} y={0} width={BAR_W} height={BAR_H} rx={3} fill={CHART_NEUTRAL} />
      {w > 0 && <rect x={0} y={0} width={w} height={BAR_H} rx={3} fill={CHART_ACCENT} />}
    </svg>
  );
}

export interface PickAgencyPanelProps {
  reads: PickAgency[];
  summary: AgencySummary;
  /** The measured statement about how draft order is actually set here. */
  orderNote?: string;
}

export function PickAgencyPanel({ reads, summary, orderNote }: PickAgencyPanelProps) {
  if (!reads.length) return null;

  return (
    <>
      <Card className="p-3">
        <p className="text-body leading-relaxed text-ink">{summary.headline}</p>
        <div className="mt-2">
          <SplitBar controlled={summary.controlled} total={summary.total} />
          <div className="mt-1 flex items-baseline justify-between gap-2 figure text-meta">
            <span className="text-accent-text">
              {summary.controlled} yours · {fmtValue(summary.controlledValue)}
            </span>
            <span className="text-secondary">
              {summary.passenger} on others · {fmtValue(summary.passengerValue)}
            </span>
          </div>
        </div>

        {summary.ridingOn.length > 0 && (
          <>
            <div className="rule my-2.5" />
            <p className="text-meta font-semibold uppercase tracking-wide text-secondary">
              What the seasons you ride on are doing
            </p>
            <ul className="mt-1 space-y-1">
              {summary.ridingOn.map((b) => (
                <li
                  key={b.posture}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-meta leading-snug"
                >
                  <Tag tone={POSTURE_TONE[b.posture]}>{b.posture}</Tag>
                  <span className="figure text-secondary">
                    {b.picks} {b.picks === 1 ? "pick" : "picks"}
                  </span>
                  <span className="min-w-0 text-muted">{b.managers.join(", ")}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {orderNote && (
          <>
            <div className="rule my-2.5" />
            <p className="text-meta leading-snug text-secondary">{orderNote}</p>
          </>
        )}
      </Card>

      <ul className="mt-1.5 divide-y divide-border overflow-hidden rounded-[--radius-sm] border border-border bg-surface">
        {reads.map((r) => (
          <li key={r.key}>
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-2.5 py-1.5">
                <ChevronRight
                  size={13}
                  aria-hidden="true"
                  className="shrink-0 text-faint transition-transform group-open:rotate-90"
                />
                {/* The label drops the "(via X)" qualifier and the line below names
                    the manager instead: at 375px the qualifier ate the season and
                    the round to repeat what the next line already says. Neither line
                    truncates now, because the manager's name IS the information. */}
                <span className="min-w-0 flex-1">
                  <span className="block figure text-body font-semibold leading-tight text-ink">
                    {r.shortLabel}
                  </span>
                  <span className="block text-meta leading-tight text-secondary">
                    {r.controlled
                      ? "Your season sets it"
                      : `${r.determinedByName}'s season sets it`}
                    {r.settled ? " · already settled" : ""}
                  </span>
                </span>
                {r.controlled ? (
                  <Tag tone="accent">yours</Tag>
                ) : (
                  <Tag tone={POSTURE_TONE[r.posture ?? "unread"]}>
                    {r.posture ?? "unread"}
                  </Tag>
                )}
              </summary>
              <div className="px-2.5 pb-2.5 pt-0.5">
                <p className="text-note leading-relaxed text-muted">{r.note}</p>
                {!r.controlled && (
                  <Link
                    href={`/managers/${r.determinedBy}`}
                    className="mt-1 inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-accent-text"
                  >
                    Read {r.determinedByName}&apos;s dossier
                    <ChevronRight size={12} aria-hidden="true" />
                  </Link>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
