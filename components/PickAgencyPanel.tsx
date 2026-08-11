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
 * THE LIST IS GROUPED, NOT PER-PICK. It used to be one native `<details>` per live
 * pick, and the sentence inside each one is a template: every pick riding on a
 * rebuilding roster expands to the same clause with a different name in it. Twelve
 * disclosure widgets therefore advertised twelve findings and held four, and the
 * reader who opened three of them learned the template. `groupAgency` partitions the
 * same reads into the picks you set yourself plus one group per posture, states the
 * shared clause once, and puts the picks underneath as a compact list where the
 * season, the round and the roster whose season sets each one are what is actually
 * different between them. Nothing is dropped: the group counts, firsts and values sum
 * to the ungrouped list, which lib/agency's test pins.
 *
 * Still native `<details>`, so the summary line stays scannable at 375px and the full
 * read is one tap away without any client JavaScript.
 *
 * ONLY THE PICKS STILL IN PLAY GET A ROW. The panel's question is "whose season decides
 * this", and for a pick whose determining season is already over that question has an
 * answer and no consequence: the slot is settled and nobody's posture can move it. Those
 * rows were repeating, in a second flat list, the twelve assets the draft-capital list
 * directly above had already enumerated - the same duplication D40 found on /league,
 * costing about 250px at 390px wide on a page that was 4,446px tall. They are still
 * counted in the split bar and in both value totals, because holding them is a fact
 * about the balance sheet; what is withheld is a live read that is not live. The count
 * is stated rather than silently dropped (D46: no dead ends).
 */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, Tag } from "@/components/ui";
import { PostureTag } from "@/components/PostureTag";
import { CHART_ACCENT, CHART_NEUTRAL } from "@/lib/chart-colors";
import { groupAgency, type AgencySummary, type PickAgency } from "@/lib/agency";
import { fmtValue } from "@/lib/ui";

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

  const live = reads.filter((r) => !r.settled);
  const settledCount = reads.length - live.length;
  const groups = groupAgency(live);

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
                  <PostureTag posture={b.posture} />
                  <span className="figure text-secondary">
                    {b.picks} {b.picks === 1 ? "pick" : "picks"}
                  </span>
                  <span className="min-w-0 text-muted">{b.managers.join(", ")}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {settledCount > 0 && (
          <>
            <div className="rule my-2.5" />
            <p className="text-meta leading-snug text-secondary">
              {/* Every gap that touches an expression is an explicit {" "}, and the
                  following text starts on its own line. JSX only strips whitespace
                  that contains a newline, so `{expr} no` on one wrapped line happens
                  to survive - but it survives by where Prettier chose to break, which
                  is not a thing to leave a sentence's readability resting on. */}
              {settledCount} of these {reads.length}{" "}
              {settledCount === 1 ? "was" : "were"}{" "}
              set by a season that is already over, so{" "}
              {settledCount === 1 ? "its slot is" : "their slots are"}{" "}
              no longer anybody&apos;s to move.{" "}
              {live.length > 0
                ? `The ${live.length} still in play are listed below.`
                : "Nothing you hold is still in play."}
            </p>
          </>
        )}

        {orderNote && (
          <>
            <div className="rule my-2.5" />
            <p className="text-meta leading-snug text-secondary">{orderNote}</p>
          </>
        )}
      </Card>

      <ul className="mt-1.5 divide-y divide-border overflow-hidden rounded-[--radius-sm] border border-border bg-surface empty:hidden">
        {groups.map((g) => (
          <li key={g.key}>
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-2.5 py-1.5">
                <ChevronRight
                  size={13}
                  aria-hidden="true"
                  className="disclosure-chevron shrink-0 text-faint group-open:rotate-90"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold leading-tight text-ink">
                    {g.title}
                  </span>
                  {/* The counts, which is what a closed group has to earn its line
                      with: how many, how much, and how much of it is a first. */}
                  <span className="block figure text-meta leading-tight text-secondary">
                    {g.count} {g.count === 1 ? "pick" : "picks"} · {fmtValue(g.value)}
                    {g.firsts > 0
                      ? ` · ${g.firsts} ${g.firsts === 1 ? "first" : "firsts"}`
                      : ""}
                  </span>
                </span>
                {g.kind === "controlled" ? (
                  <Tag tone="accent">yours</Tag>
                ) : (
                  <PostureTag posture={g.posture ?? "unread"} />
                )}
              </summary>
              <div className="disclosure-body px-2.5 pb-2.5 pt-0.5">
                {/* The templated clause, once. */}
                <p className="text-note leading-relaxed text-muted">{g.note}</p>
                {/* And then the part that genuinely differs pick to pick. The second
                    line names the season whose standings set the slot, which is not
                    the season on the pick and is the thing readers get wrong. */}
                <ul className="mt-1.5 space-y-1">
                  {g.picks.map((r) => (
                    <li
                      key={r.key}
                      className="flex items-baseline justify-between gap-2 text-meta leading-snug"
                    >
                      <span className="min-w-0">
                        <span className="block figure font-semibold text-ink">
                          {r.shortLabel}
                        </span>
                        <span className="block text-secondary">
                          {r.controlled ? "your" : `${r.determinedByName}'s`}{" "}
                          <span className="figure">{r.determiningSeason}</span> season
                          sets it
                        </span>
                      </span>
                      <span className="shrink-0 figure text-muted">
                        {fmtValue(r.pick.value)}
                      </span>
                    </li>
                  ))}
                </ul>
                {g.managers.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-3">
                    {g.managers.map((m) => (
                      <Link
                        key={m.rosterId}
                        href={`/managers/${m.rosterId}`}
                        className="inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-accent-text"
                      >
                        {m.name}&apos;s dossier
                        <ChevronRight size={12} aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
