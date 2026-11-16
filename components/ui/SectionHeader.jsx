import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/ui";

/**
 * A section's title in sentence case, with one optional trailing action: either a
 * node (`action`) or a "see all" link (`href` + `cta`). `as` is accepted for old call
 * sites and no longer changes the look.
 */
export function SectionHeader({ title, action, href, cta, id, className }) {
  return (
    <div className={cn("mb-2 mt-6 flex min-h-11 items-end justify-between gap-3", className)}>
      <h2 id={id} className="min-w-0 scroll-mt-16 pb-1.5 text-lede font-semibold tracking-tight text-ink">
        {title}
      </h2>
      {action}
      {href && cta && (
        <Link
          href={href}
          className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 px-2 text-note font-semibold text-accent-text"
        >
          {cta}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
