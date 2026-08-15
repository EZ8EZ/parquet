/**
 * WHEREVER A MANAGER IS NAMED, THIS IS WHAT WE KNOW ABOUT THEM.
 *
 * A compact rail of every surface that has something to say about one manager -
 * dossier, a trade with them, their deals, and (on your own) your captured
 * reasoning. The hrefs come from `managerLinks()` in lib/nav.ts, so the rule is one
 * function rather than four hand-written link rows that would drift the moment a
 * route changes. See that function's header for the four separate integration
 * failures this collapses into one.
 *
 * Deliberately small and quiet: it sits under a name that has already been printed,
 * so it must not compete with it. Chips, not cards.
 *
 * Server component. Its links are plain hrefs and it holds no state.
 */
import Link from "next/link";
import { managerLinks } from "@/lib/nav";
import { cn } from "@/lib/ui";
export function ManagerRail({
  rosterId,
  ownerId,
  isFormer = false,
  isMe = false,
  /** Drop links that would point back at the page rendering this. */
  omit = [],
  className,
}) {
  const links = managerLinks({ rosterId, ownerId, isFormer, isMe }).filter(
    (l) => !omit.some((o) => l.href === o || l.href.startsWith(`${o}?`)),
  );
  if (links.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-2.5 text-meta font-semibold text-muted transition-colors hover:border-accent-edge hover:text-accent-text"
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}
