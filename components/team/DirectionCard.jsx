import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Disclosure, RankStrip } from "@/components/ui";

/** Wins filled, losses hollow. Capped so a long season still fits. */
function RecordDots({ wins, losses }) {
  if (wins + losses === 0 || wins + losses > 12) return null;
  return (
    <span aria-hidden="true" className="flex gap-1">
      {Array.from({ length: wins }, (_, i) => (
        <span key={`w${i}`} className="size-2 rounded-full bg-ink" />
      ))}
      {Array.from({ length: losses }, (_, i) => (
        <span key={`l${i}`} className="size-2 rounded-full border border-secondary" />
      ))}
    </span>
  );
}

/**
 * The plan's direction (lib/team `directionSummary`): the stance as a word, its three
 * inputs as figures, the reasoning one tap away. A stance is the plan's reading of
 * the inputs, not a grade of anyone's past moves (D6).
 */
export function DirectionCard({ summary, href = "/plan", cta = "Full plan", headingLevel = 2, children }) {
  const H = `h${headingLevel}`;
  if (!summary) return null;
  return (
    <section aria-labelledby="direction-title" className="rounded-card bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-meta font-medium text-secondary">The plan&apos;s direction</p>
          <H id="direction-title" data-plan-direction className="text-display font-bold tracking-tight text-accent-text">
            {summary.label}
          </H>
        </div>
        {href && (
        <Link
          href={href}
          className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 px-2 text-note font-semibold text-accent-text"
        >
          {cta}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {summary.inputs.map((input) => (
          <div key={input.id} className="min-w-0 rounded-control bg-surface-2 p-2.5">
            <dt className="text-meta font-medium text-secondary">{input.label}</dt>
            <dd>
              <span className="block figure text-lede font-bold text-ink">{input.value}</span>
              <span className="block text-micro text-secondary">{input.sub}</span>
              <span className="mt-1.5 block">
                {input.id === "record" && input.wins != null && (
                  <RecordDots wins={input.wins} losses={input.losses} />
                )}
                {input.id === "value" && <RankStrip rank={input.rank} of={input.of} />}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      {(summary.note || children) && (
        <Disclosure className="-mb-2 mt-1" summary={`Why ${summary.label.toLowerCase()}`}>
          {summary.note}
          {children}
        </Disclosure>
      )}
    </section>
  );
}
