import { habitView } from "@/lib/lockin/matchupView";

/**
 * How a manager plays lock-in: one lead line, then each habit as label, value and the
 * league's figure, then the basis (weeks, seasons, weighting). Facts only (D6): no
 * adjective about the manager. Null profile: one quiet line.
 */
export function Habits({ profile, season, emptyText = "Too few past weeks to describe yet." }) {
  const v = habitView(profile, { season });
  if (!v) return <p className="text-note text-muted">{emptyText}</p>;
  return (
    <div>
      {v.lead && <p className="text-body font-semibold text-ink">{v.lead}.</p>}
      <dl className="mt-2 divide-y divide-border rounded-control bg-surface-2">
        {v.facts.map((f) => (
          <div key={f.label} className="flex items-baseline justify-between gap-3 px-3 py-2">
            <dt className="min-w-0 text-note text-muted">{f.label}</dt>
            <dd className="shrink-0 text-right">
              <span className="figure text-note font-semibold text-ink">{f.value}</span>
              {f.league && <span className="ml-1.5 figure text-meta text-secondary">league {f.league}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {v.basis && <p className="mt-2 text-meta text-secondary">{v.basis}</p>}
      {v.shrinkText && <p className="mt-1 text-meta text-secondary">{v.shrinkText}</p>}
    </div>
  );
}
