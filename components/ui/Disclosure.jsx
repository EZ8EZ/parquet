import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/ui";

/**
 * The standard place explanation goes. Collapsed by default, one line of summary
 * ("How this is measured", "Why 9th"). Native <details>: keyboard and screen-reader
 * behaviour for free, works before hydration.
 */
export function Disclosure({ summary, children, icon, className, bodyClassName, open }) {
  return (
    <details className={cn("group", className)} open={open}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-note font-medium text-secondary transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
        {icon && (
          <span aria-hidden="true" className="shrink-0">
            {icon}
          </span>
        )}
        <span className="min-w-0">{summary}</span>
        <ChevronRight
          size={16}
          aria-hidden="true"
          className="disclosure-chevron shrink-0 group-open:rotate-90"
        />
      </summary>
      <div
        className={cn(
          "disclosure-body mb-2 rounded-control bg-surface-2 p-3 text-note text-muted",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </details>
  );
}
