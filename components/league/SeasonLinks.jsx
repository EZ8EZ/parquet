import Link from "next/link";
import { cn } from "@/lib/ui";

/**
 * A season picker that navigates: one pill per season, the active one marked with
 * `aria-current` and the elevated tone (the Segmented look, but links, because each
 * season is its own URL and server render). Scrolls sideways when there are many.
 * `hrefFor(season)` builds each link.
 */
export function SeasonLinks({ seasons, active, hrefFor, label = "Season", className }) {
  if (!seasons?.length) return null;
  return (
    <nav aria-label={label} className={cn("no-scrollbar -mx-4 overflow-x-auto px-4", className)}>
      <ul className="flex w-max gap-1 rounded-full bg-surface p-1">
        {seasons.map((s) => {
          const on = String(s) === String(active);
          return (
            <li key={s}>
              <Link
                href={hrefFor(s)}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full px-4 figure text-note font-semibold transition-colors",
                  on ? "bg-elevated text-ink" : "text-secondary hover:text-ink",
                )}
              >
                {s}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
