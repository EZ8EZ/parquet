import { Chip } from "@/components/ui";
import { habitView } from "@/lib/lockin/matchupView";

/**
 * How a manager plays lock-in: one lead line, then each habit as label, value and the
 * league's figure, then the basis (weeks, seasons, weighting). Facts only (D6): no
 * adjective about the manager. Null profile: one quiet line.
 */
export function Habits({ profile, season, self = false, emptyText = "Too few past weeks to describe yet." }) {
  const v = habitView(profile, { season, self });
  if (!v) return <p className="text-note text-muted">{emptyText}</p>;
  return (
    <div>
      {(v.lead || v.provisional) && (
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {v.lead && <span className="text-body font-semibold text-ink">{v.lead}.</span>}
          {v.provisional && (
            <Chip size="sm" title="The fit from past weeks has not landed yet; these values will change.">
              provisional
            </Chip>
          )}
        </p>
      )}
      <dl className="mt-2 divide-y divide-border rounded-control bg-surface-2">
        {v.facts.map((f) => (
          <div key={f.label} className="flex items-start justify-between gap-3 px-3 py-2">
            <dt className="min-w-0 flex-1 text-note text-muted">{f.label}</dt>
            <dd className="min-w-0 text-right">
              <span className="block figure text-note font-semibold text-ink">{f.value}</span>
              {f.league && <span className="block figure text-meta text-secondary">league {f.league}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {v.basis && <p className="mt-2 text-meta text-secondary">{v.basis}</p>}
      {v.shrinkText && <p className="mt-1 text-meta text-secondary">{v.shrinkText}</p>}
      {v.provisional && <p className="mt-1 text-meta text-secondary">Provisional: the fit from past weeks has not landed, so these values will change.</p>}
    </div>
  );
}
