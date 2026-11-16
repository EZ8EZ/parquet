/**
 * THE END OF EVERY PAGE.
 *
 * One row of next steps, driven by the registry (`onwardFrom` in lib/nav.ts) rather
 * than by a hand-kept array at each call site - the same repair the surface registry
 * itself was for. A page passes its own path and nothing else.
 *
 * It is NOT a second navigation bar, and the difference is the second line: each step
 * prints the QUESTION this page leaves you holding, and the destination's name
 * underneath it. A row of bare page names would be the drawer again, two inches
 * higher up.
 *
 * Server component. No JS, no state - three links.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { onwardFrom } from "@/lib/nav";
import { cn } from "@/lib/ui";
export function Onward({ from, steps, className }) {
  const items = steps ?? (from ? onwardFrom(from) : []);
  if (items.length === 0) return null;
  return (
    <nav aria-label="Where to next" className={cn("mt-6", className)}>
      <h2 className="mb-2 text-lede font-semibold tracking-tight text-ink">
        Where next
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-card bg-surface">
        {items.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="group flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold leading-tight text-ink group-hover:text-accent-text">
                  {s.why}
                </span>
                <span className="block text-meta leading-tight text-secondary">
                  {s.label}
                </span>
              </span>
              <ArrowRight
                size={14}
                aria-hidden="true"
                className="shrink-0 text-faint transition-colors group-hover:text-accent-text"
              />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
