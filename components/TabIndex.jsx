import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { surfacesIn } from "@/lib/nav";
import { iconForSurface } from "./nav-icons";
import { cn } from "@/lib/ui";

/** The pages filed under a tab, as compact link rows. `section` narrows to one group. */
export function TabIndex({ tab, section, title, className, exclude = [] }) {
  const items = surfacesIn(tab).filter(
    (s) => (!section || s.section === section) && !exclude.includes(s.href),
  );
  if (!items.length) return null;
  return (
    <section className={cn("mt-5", className)} aria-label={title}>
      {title && (
        <h2 className="mb-1.5 text-note font-semibold uppercase tracking-[0.16em] text-muted">
          {title}
        </h2>
      )}
      <ul className="divide-y divide-border overflow-hidden rounded-[--radius-sm] border border-border bg-surface">
        {items.map((s) => {
          const Icon = iconForSurface(s.href);
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                className="flex min-h-11 items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface-2"
              >
                <Icon size={16} aria-hidden="true" className="shrink-0 text-accent-text" />
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold leading-tight text-ink">
                    {s.label}
                  </span>
                  <span className="block text-meta leading-snug text-secondary">
                    {s.sub}
                  </span>
                </span>
                <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-faint" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
