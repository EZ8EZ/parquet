/**
 * "Still running" - the live-streak panel.
 *
 * Deliberately NOT a badge. `AwardBadge` is a trophy with an icon and a past-tense
 * title, because a Superlative is settled; every row here is a running counter with a
 * present-tense label, a live/at-risk state dot, and a meter showing what it is
 * climbing towards. If this ever starts looking like a shelf of medals, the
 * distinction the feature rests on has been lost.
 *
 * A server component: the numbers are a function of an instant, and the instant is
 * decided on the server so it appears in the HTML and cannot drift between render and
 * hydration. That is also why the panel prints WHEN it was counted - a figure that
 * moves on its own is only meaningful next to the moment it was true.
 */
import { Circle, Hourglass, TrendingUp } from "lucide-react";
import { LocalDate } from "@/components/LocalDate";
import { cn } from "@/lib/ui";
const STATE_COPY = {
  growing: { label: "live", tone: "text-positive" },
  "at-risk": { label: "at risk", tone: "text-warn" },
  idle: { label: "idle", tone: "text-secondary" },
};
function StateDot({ state }) {
  const { label, tone } = STATE_COPY[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-micro font-semibold uppercase tracking-wide",
        tone,
      )}
    >
      <Circle
        size={6}
        aria-hidden="true"
        className={cn(
          "fill-current",
          // The one animated thing in the app, and it earns it: these numbers are
          // literally still moving. Off entirely for reduced-motion.
          state === "growing" && "animate-pulse motion-reduce:animate-none",
        )}
      />
      {label}
    </span>
  );
}
/**
 * The noun after the number. Empty for a duration: `humanDays` already carries its own
 * unit ("3y 2mo"), and "3y 2mo days" is nonsense.
 */
function unitNoun(s) {
  if (s.unit === "days") return "";
  const singular = { players: "player", seasons: "season", trades: "trade" }[
    s.unit
  ];
  return s.value === 1 ? singular : `${singular}s`;
}
function Meter({ progress }) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <div
      className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2"
      role="img"
      aria-label={`${pct}% of the way there`}
    >
      <div
        className="h-full rounded-full bg-accent-strong"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
/**
 * A row that is BOTH idle and zero is anti-information: "Trades in the last 90 days -
 * idle - 0 trades" in August tells the reader nothing except that it is August, and it
 * costs a full row of a panel that already runs long. An idle row with a real number
 * still says something ("longest hold: 3y 2mo, idle"), so only the zeroes go.
 */
function worthShowing(s) {
  return !(s.state === "idle" && s.value === 0);
}
export function StreakPanel({ streaks: allStreaks, countedAt }) {
  const streaks = allStreaks.filter(worthShowing);
  if (streaks.length === 0) {
    return (
      <div className="rounded-[--radius] border border-border bg-surface p-3">
        <p className="text-note leading-relaxed text-muted">
          Nothing is running yet. Streaks appear once this roster has some
          history to measure - a hold that has lasted, or a trade to count from.
        </p>
      </div>
    );
  }
  return (
    <div>
      {/* The stamp stays; the paragraph that used to follow it explaining how a streak
            differs from a Superlative does not. That contrast is a product-design
            footnote, true on every visit and new on exactly one of them, so it lives on
            /about now and the section header above this panel still links to /awards. */}
      <p className="mb-2 flex items-center gap-1.5 text-meta leading-snug text-faint">
        <Hourglass size={12} aria-hidden="true" className="shrink-0" />
        <span>
          Counted to <LocalDate ts={countedAt} className="figure text-muted" />
        </span>
      </p>

      <div className="overflow-hidden rounded-[--radius] border border-border bg-surface">
        <ul className="divide-y divide-border">
          {streaks.map((s) => (
            <li key={s.id} className="px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-meta font-semibold uppercase tracking-wide text-muted">
                  {s.label}
                </span>
                <StateDot state={s.state} />
              </div>

              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="figure text-lede font-semibold leading-none text-ink">
                  {s.display}
                </span>
                <span className="text-meta text-faint">{unitNoun(s)}</span>
                {s.atLeast && (
                  <span
                    className="text-micro text-warn"
                    title="Older than the record"
                  >
                    at least
                  </span>
                )}
              </div>

              <p className="mt-0.5 text-note leading-snug text-muted">
                {s.detail}
              </p>

              {s.next && (
                <>
                  <Meter progress={s.next.progress} />
                  <p className="mt-1 flex items-center gap-1 figure text-micro text-faint">
                    <TrendingUp
                      size={11}
                      aria-hidden="true"
                      className="shrink-0"
                    />
                    {s.next.remaining}
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
