import { Tag } from "@/components/ui";

/**
 * Starters with an injury tag and their games left this week. Games left needs the
 * NBA schedule, which the app does not load, so it prints "unknown" until the week
 * is over. News stays in Sleeper.
 */
export function InjuredStarters({ injured, available }) {
  if (!available) return null;
  return (
    <section aria-labelledby="injured-title" className="mt-4">
      <h2
        id="injured-title"
        className="mb-1.5 text-note font-semibold uppercase tracking-[0.16em] text-muted"
      >
        Injured starters
      </h2>
      {injured.length === 0 ? (
        <p className="text-body text-secondary">No starter carries an injury tag.</p>
      ) : (
        <ul className="divide-y divide-border rounded-[--radius-sm] border border-border bg-surface">
          {injured.map((s) => (
            <li key={s.index} className="flex items-start gap-2.5 px-3 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold leading-snug text-ink">
                  {s.name}
                </span>
                <span className="mt-px flex flex-wrap items-center gap-1.5 figure text-meta text-secondary">
                  <span>{s.label}</span>
                  <Tag tone="negative">
                    {s.injuryStatus && s.injuryStatus !== s.injury
                      ? `${s.injuryStatus} · `
                      : ""}
                    {s.injury}
                  </Tag>
                </span>
              </span>
              <span className="shrink-0 text-right figure text-meta leading-snug text-secondary">
                <span className="block font-semibold text-ink">
                  {s.gamesLeft == null ? "unknown" : s.gamesLeft}
                </span>
                games left
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
