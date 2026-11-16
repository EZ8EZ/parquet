import { Tag } from "@/components/ui";
import { cn } from "@/lib/ui";

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const REASONS = {
  offseason: "No games this week: the season is not under way.",
  provider: "Lock-in data comes from Sleeper, and this league is not loaded from Sleeper.",
  "no-week": "Sleeper's league settings carry no current week, so there are no slots to read.",
  "no-matchup": "Sleeper returned no lineup for your team this week.",
};

/**
 * THE LOCK DESK: the bounded region where lock-or-hold decisions live. Today it shows
 * each slot's state and, until `decisions` is supplied, an empty state saying where
 * the numbers will go. `decisions` is keyed by slot index; this file is the one a
 * decision engine replaces.
 */
export function LockDesk({
  slots,
  available,
  reason,
  ended = false,
  decisions = null,
}) {
  const empty = ended ? "none" : "open";
  const open = slots.filter((s) => !s.banked).length;
  return (
    <section
      aria-labelledby="lock-desk-title"
      className="mt-3 rounded-[--radius] border border-border bg-surface"
    >
      <header className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <h2
          id="lock-desk-title"
          className="text-note font-semibold uppercase tracking-[0.16em] text-muted"
        >
          Lock or hold
        </h2>
        {available && (
          <span className="figure text-meta text-secondary">
            {slots.length - open} banked · {open} {empty}
          </span>
        )}
      </header>

      {!available ? (
        <p className="px-3 py-3 text-body leading-snug text-muted">
          {REASONS[reason] ?? "No lock-in data for this week."}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {[...slots]
            .sort((a, b) => Number(a.banked) - Number(b.banked) || a.index - b.index)
            .map((s) => (
              <li key={s.index} className="flex items-start gap-2.5 px-3 py-1.5">
                <span className="figure mt-0.5 w-9 shrink-0 text-micro font-semibold uppercase tracking-wide text-secondary">
                  {s.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold leading-snug text-ink">
                    {s.name ?? "Empty slot"}
                  </span>
                  <span className="mt-px flex flex-wrap items-center gap-x-1.5 figure text-meta leading-snug text-secondary">
                    {s.team && <span>{s.team}</span>}
                    {s.gamesPlayed != null && (
                      <span>
                        {s.gamesPlayed} {s.gamesPlayed === 1 ? "game" : "games"} played
                      </span>
                    )}
                    {s.injury && <Tag tone="negative">{s.injury}</Tag>}
                  </span>
                  {decisions?.[s.index]}
                </span>
                <span
                  className={cn(
                    "figure mt-0.5 shrink-0 text-body font-semibold",
                    s.banked ? "text-ink" : "text-accent-text",
                  )}
                >
                  {s.banked ? fmt(s.points) : empty}
                </span>
              </li>
            ))}
        </ul>
      )}

      {available && !decisions && !ended && open > 0 && (
        <p className="border-t border-dashed border-border px-3 py-2 text-meta leading-snug text-secondary">
          Lock-or-hold numbers for each open slot arrive here.
        </p>
      )}
    </section>
  );
}
