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
import Link from "next/link";
import { Circle, Hourglass, TrendingUp } from "lucide-react";
import type { LiveStreak, StreakState } from "@/lib/streaks";
import { cn } from "@/lib/ui";

const STATE_COPY: Record<StreakState, { label: string; tone: string }> = {
  growing: { label: "live", tone: "text-positive" },
  "at-risk": { label: "at risk", tone: "text-warn" },
  idle: { label: "idle", tone: "text-faint" },
};

function StateDot({ state }: { state: StreakState }) {
  const { label, tone } = STATE_COPY[state];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide", tone)}>
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
function unitNoun(s: LiveStreak): string {
  if (s.unit === "days") return "";
  const singular = { players: "player", seasons: "season", trades: "trade" }[s.unit];
  return s.value === 1 ? singular : `${singular}s`;
}

function Meter({ progress }: { progress: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <div
      className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2"
      role="img"
      aria-label={`${pct}% of the way there`}
    >
      <div className="h-full rounded-full bg-accent/70" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StreakPanel({
  streaks,
  countedAt,
}: {
  streaks: LiveStreak[];
  /** The instant every figure was measured to. */
  countedAt: number;
}) {
  if (streaks.length === 0) {
    return (
      <div className="rounded-[--radius] border border-border bg-surface/60 p-3">
        <p className="text-[12.5px] leading-relaxed text-muted">
          Nothing is running yet. Streaks appear once this roster has some history to
          measure - a hold that has lasted, or a trade to count from.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 flex items-start gap-1.5 text-[11px] leading-snug text-faint">
        <Hourglass size={12} aria-hidden="true" className="mt-px shrink-0" />
        <span>
          Counted to{" "}
          <span className="font-mono tnum text-muted">
            {new Date(countedAt).toISOString().slice(0, 10)}
          </span>
          . These move on their own - four of them change with nothing but the passing
          of a day. The{" "}
          <Link href="/awards" className="font-semibold text-accent">
            Superlatives
          </Link>{" "}
          are the opposite: settled, ranked, and season-final.
        </span>
      </p>

      <div className="overflow-hidden rounded-[--radius] border border-border bg-surface/60">
        <ul className="divide-y divide-border">
          {streaks.map((s) => (
            <li key={s.id} className="px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {s.label}
                </span>
                <StateDot state={s.state} />
              </div>

              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="font-mono text-[22px] font-semibold leading-none tnum text-ink">
                  {s.display}
                </span>
                <span className="text-[11px] text-faint">{unitNoun(s)}</span>
                {s.atLeast && (
                  <span className="text-[10px] text-warn" title="Older than the record">
                    at least
                  </span>
                )}
              </div>

              <p className="mt-0.5 text-[12px] leading-snug text-muted">{s.detail}</p>

              {s.next && (
                <>
                  <Meter progress={s.next.progress} />
                  <p className="mt-1 flex items-center gap-1 font-mono text-[10.5px] tnum text-faint">
                    <TrendingUp size={11} aria-hidden="true" className="shrink-0" />
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
