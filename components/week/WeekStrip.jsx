import { cn } from "@/lib/ui";

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * The seven lock-in slots as seven cells. A banked cell prints its score and fills
 * from the bottom in proportion to it (scale: 50 or the week's best, whichever is
 * higher); an open cell is dashed and says "open". Number and border carry the
 * state, so colour is never the only signal.
 */
export function WeekStrip({ slots, available, ended = false }) {
  const empty = ended ? "none" : "open";
  const max = Math.max(50, ...slots.map((s) => s.points ?? 0));
  return (
    <ol
      aria-label="Your starting slots this week"
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${slots.length || 7}, minmax(0, 1fr))` }}
    >
      {slots.map((s) => {
        const pct = s.banked ? Math.max(6, Math.round((s.points / max) * 100)) : 0;
        const spoken = !available
          ? `${s.label}: no data`
          : s.banked
            ? `${s.label}: ${s.name ?? "empty"}, ${fmt(s.points)} banked`
            : `${s.label}: ${s.name ?? "empty"}, ${empty}`;
        return (
          <li
            key={s.index}
            className={cn(
              "relative flex h-[68px] min-w-0 flex-col items-center justify-between overflow-hidden rounded-[--radius-sm] border px-0.5 pb-1 pt-1",
              s.banked
                ? "border-accent-edge bg-surface"
                : "border-dashed border-border-strong bg-transparent",
            )}
          >
            <span className="sr-only">{spoken}</span>
            {s.banked && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 bg-accent/20"
                style={{ height: `${pct}%` }}
              />
            )}
            <span
              aria-hidden="true"
              className="relative text-micro font-semibold uppercase tracking-wide text-secondary"
            >
              {s.label}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "relative figure font-semibold leading-none",
                s.banked ? "text-[15px] text-ink" : "text-micro text-muted",
              )}
            >
              {!available ? "–" : s.banked ? fmt(s.points) : empty}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
