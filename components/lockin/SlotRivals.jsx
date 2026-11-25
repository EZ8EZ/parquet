import { Users } from "lucide-react";
import { rivalsView } from "@/lib/lockin/view";

/**
 * "If you let 24.5 go": everyone on the roster who could still fill this slot this week,
 * each with his games left (chance of playing each) and his chance of reaching the score
 * at least once; who can't help, and why; the chance that at least one of them beats it.
 * The same bench the plan behind the win chance already counts, shown the way a manager
 * weighs it.
 */
export function SlotRivals({ card, className, headingLevel = 4 }) {
  const H = headingLevel === 3 ? "h3" : "h4";
  const v = rivalsView(card);
  if (!v || !v.rows.length) return null;
  return (
    <section className={className} aria-label={`If you let ${v.x} go`} data-rivals>
      <H className="flex items-center gap-1.5 text-note font-semibold text-ink">
        <Users size={15} aria-hidden="true" className="shrink-0 text-secondary" />
        If you let {v.x.toFixed(1)} go, who could beat it at {v.slotLabel}?
      </H>
      <ul className="mt-2 space-y-2">
        {v.rows.map((r) => (
          <li key={r.playerId} className="text-meta">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 font-semibold text-ink">
                {r.name}
                <span className="ml-1 font-normal text-secondary">
                  {r.tag}
                  {r.status ? ` · ${r.status}` : ""}
                </span>
              </span>
              <span className="figure shrink-0 font-semibold text-ink">{r.beatPct}</span>
            </div>
            <span className="mt-1 block h-1.5 rounded-full bg-elevated" aria-hidden="true">
              <span className="block h-full rounded-full bg-secondary" style={{ width: `${r.beatWidth}%` }} />
            </span>
            <span className="mt-0.5 block text-micro text-secondary">
              Plays {r.gamesText}
              {r.elsewhere ? ` · ${r.elsewhere}` : ""}
            </span>
          </li>
        ))}
      </ul>
      {v.cannot.length > 0 && <p className="mt-2 text-micro text-secondary">Can&apos;t help: {v.cannot.join("; ")}.</p>}
      <p className="mt-2 text-note text-ink">
        At least one of them beats {v.x.toFixed(1)}: <span className="figure font-semibold">{v.anyPct}</span>
      </p>
      <p className="mt-1 text-micro text-muted">{v.note}</p>
    </section>
  );
}
