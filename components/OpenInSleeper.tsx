"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/ui";

/**
 * "Open in Sleeper" — the escape hatch back to the app where things actually
 * get done. Parquet reads league state and gives an opinion; Sleeper is where
 * the user sends the trade, sets the lineup, or claims the waiver. Every insight
 * should be one tap from the screen that executes it.
 *
 * Renders NOTHING when `href` is null. The `lib/sleeperLinks` helpers return
 * null for ids that cannot be real Sleeper ids (e.g. the `fixture` provider's
 * `fx-nba-2025`), so a dead outbound link is structurally impossible instead of
 * something each call site has to guard.
 */
export function OpenInSleeper({
  href,
  label = "Open in Sleeper",
  variant = "button",
  className,
}: {
  /** A URL from `lib/sleeperLinks`. Null renders nothing — see note above. */
  href: string | null;
  /** Visible text for `button`; accessible label for `icon`. */
  label?: string;
  variant?: "icon" | "button";
  className?: string;
}) {
  if (!href) return null;

  // External navigation to a third-party app: always noopener/noreferrer.
  const common = "text-muted transition-colors hover:text-accent";

  if (variant === "icon") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        title={label}
        // 44px tap target (a11y floor in DESIGN.md) via min-h/min-w rather than
        // padding, so the icon stays optically small and nothing reflows.
        className={cn(
          "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full",
          common,
          className,
        )}
      >
        <ExternalLink size={16} aria-hidden="true" />
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full",
        "border border-border px-3.5 text-xs font-semibold",
        "hover:border-border-strong hover:bg-surface-2",
        common,
        className,
      )}
    >
      {label}
      <ExternalLink size={13} aria-hidden="true" />
    </a>
  );
}
