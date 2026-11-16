import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, Tag } from "@/components/ui";
/**
 * THE ACTION QUEUE: at most three decision cards, numbered because the order IS the
 * priority (crunch → taxi → plan → waivers, lib/actions). Each card prints a count or
 * the game plan's own move text - no grades (D6), nothing invented (D19). Renders
 * nothing when there is nothing to decide. No `truncate`: a decision you cannot read
 * in full is not one you can make.
 */
export function ActionQueue({ items, className, compact = false }) {
  if (!items?.length) return null;
  if (compact) return <CompactQueue items={items} className={className} />;
  return (
    <section id="action-queue" aria-label="Decisions in front of you" className={className}>
      <ol className="space-y-1.5">
        {items.map((item, i) => (
          <li key={item.id} data-action={item.id}>
            <Link href={item.href} className="group block">
              <Card
                as="div"
                className="card-lit flex items-start gap-2.5 p-3 transition-colors group-hover:border-border-strong group-hover:bg-surface-2"
              >
                <span
                  aria-hidden="true"
                  className="figure mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-accent-edge bg-accent-wash text-meta font-semibold text-accent-text"
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Tag tone="accent">{item.kicker}</Tag>
                  </span>
                  <span className="mt-1 block text-body font-semibold leading-snug text-ink">
                    {item.title}
                  </span>
                  {item.detail && (
                    <span className="mt-0.5 block text-meta leading-snug text-muted">
                      {item.detail}
                    </span>
                  )}
                  <span className="mt-1 inline-flex min-h-6 items-center gap-0.5 text-meta font-semibold text-accent-text">
                    {item.cta}
                    <ChevronRight size={13} aria-hidden="true" />
                  </span>
                </span>
              </Card>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CompactQueue({ items, className }) {
  return (
    <section id="action-queue" aria-labelledby="action-queue-title" className={className}>
      <h2
        id="action-queue-title"
        className="mb-1.5 text-note font-semibold uppercase tracking-[0.16em] text-muted"
      >
        To do
      </h2>
      <ol className="divide-y divide-border overflow-hidden rounded-[--radius-sm] border border-border bg-surface">
        {items.map((item) => (
          <li key={item.id} data-action={item.id}>
            <Link
              href={item.href}
              className="flex min-h-11 items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-micro font-semibold uppercase tracking-[0.14em] text-accent-text">
                  {item.kicker}
                </span>
                <span className="block text-body font-semibold leading-snug text-ink">
                  {item.title}
                </span>
              </span>
              <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-faint" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
