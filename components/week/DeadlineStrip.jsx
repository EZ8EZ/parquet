import { formatDay } from "@/lib/week";
import { cn } from "@/lib/ui";

/** One mark per deadline kind, so the timeline reads without colour. */
function Mark({ id, className }) {
  const shape =
    id === "taxi"
      ? "size-2.5 rounded-full border-2 border-accent bg-bg"
      : id === "trade"
        ? "size-2.5 bg-accent"
        : "h-3.5 w-1 bg-ink";
  return <span aria-hidden="true" className={cn("block shrink-0", shape, className)} />;
}

function whenText(d, window) {
  if (d.weeksAway == null) return `week ${d.week}`;
  if (d.weeksAway === 0) {
    if (window?.state === "live" && window.daysLeft === 0) return "tonight";
    return window?.end ? `this week · ${formatDay(window.end)}` : "this week";
  }
  if (d.weeksAway === 1) return "next week";
  return `in ${d.weeksAway} weeks`;
}

/**
 * Deadlines still ahead, as a timeline from this week to the last one, with the
 * same items listed underneath. Renders nothing when none are ahead.
 */
export function DeadlineStrip({ deadlines, week, window }) {
  if (!deadlines?.length) return null;
  const from = week ?? deadlines[0].week;
  const to = Math.max(from + 1, ...deadlines.map((d) => d.week));
  const at = (d) => ((d.week - from) / (to - from)) * 100;
  return (
    <section aria-labelledby="deadlines-title" className="mt-4">
      <h2
        id="deadlines-title"
        className="mb-1.5 text-note font-semibold uppercase tracking-[0.16em] text-muted"
      >
        Deadlines ahead
      </h2>
      {week != null && (
        <div aria-hidden="true" className="px-1.5">
          <div className="relative h-5">
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border-strong" />
            {deadlines.map((d) => (
              <span
                key={d.id}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${at(d)}%` }}
              >
                <Mark id={d.id} />
              </span>
            ))}
          </div>
          <div className="flex justify-between figure text-micro text-faint">
            <span>wk {from} · now</span>
            <span>wk {to}</span>
          </div>
        </div>
      )}
      <ul className="mt-1.5 space-y-1">
        {deadlines.map((d) => (
          <li key={d.id} className="flex items-center gap-2.5">
            <span className="flex w-3.5 justify-center">
              <Mark id={d.id} />
            </span>
            <span className="min-w-0 flex-1 text-body leading-snug text-ink">
              {d.label}
              <span className="figure text-meta text-secondary">
                {" "}
                · {d.at === "end" ? "end of" : ""} week {d.week}
              </span>
            </span>
            <span
              className={cn(
                "figure shrink-0 text-meta font-semibold",
                d.weeksAway === 0 ? "text-accent-text" : "text-secondary",
              )}
            >
              {whenText(d, window)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
