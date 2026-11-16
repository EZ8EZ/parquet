import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/ui";

/** Wins as filled dots, losses as hollow ones. Capped so a long season still fits. */
function RecordDots({ wins, losses }) {
  if (wins + losses === 0 || wins + losses > 12) return null;
  return (
    <span aria-hidden="true" className="mt-1 flex gap-0.5">
      {Array.from({ length: wins }, (_, i) => (
        <span key={`w${i}`} className="size-1.5 rounded-full bg-ink" />
      ))}
      {Array.from({ length: losses }, (_, i) => (
        <span key={`l${i}`} className="size-1.5 rounded-full border border-secondary" />
      ))}
    </span>
  );
}

/** One tick per roster, yours taller and gold: where the rank sits in the pack. */
function RankTicks({ rank, of }) {
  if (!rank || !of || of > 20) return null;
  return (
    <span aria-hidden="true" className="mt-1 flex h-3 items-end gap-px">
      {Array.from({ length: of }, (_, i) => (
        <span
          key={i}
          className={cn(
            "w-1 rounded-[1px]",
            i + 1 === rank ? "h-3 bg-accent" : "h-1.5 bg-border-strong",
          )}
        />
      ))}
    </span>
  );
}

export function DirectionCard({ summary }) {
  if (!summary) return null;
  return (
    <section
      aria-labelledby="direction-title"
      className="card-lit rounded-[--radius] border border-border bg-surface p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-micro font-semibold uppercase tracking-[0.16em] text-muted">
            The plan&apos;s direction
          </p>
          <h2
            id="direction-title"
            className="mt-0.5 font-display text-lede font-semibold leading-tight text-ink"
          >
            {summary.label}
          </h2>
        </div>
        <Link
          href="/plan"
          className="-mr-1 inline-flex min-h-11 shrink-0 items-center gap-0.5 px-1 text-meta font-semibold text-accent-text"
        >
          Full plan
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      </div>
      {summary.note && (
        <p className="mt-1 text-note leading-snug text-muted">{summary.note}</p>
      )}
      <dl className="mt-2.5 grid grid-cols-3 gap-1.5">
        {summary.inputs.map((input) => (
          <div
            key={input.id}
            className="min-w-0 rounded-[--radius-sm] border border-border bg-bg/40 px-2 py-1.5"
          >
            <dt className="text-micro font-semibold uppercase tracking-wide text-secondary">
              {input.label}
            </dt>
            <dd className="mt-0.5">
              <span className="block figure text-body font-semibold leading-tight text-ink">
                {input.value}
              </span>
              <span className="block text-micro leading-snug text-secondary">
                {input.sub}
              </span>
              {input.id === "record" && input.wins != null && (
                <RecordDots wins={input.wins} losses={input.losses} />
              )}
              {input.id === "value" && <RankTicks rank={input.rank} of={input.of} />}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
