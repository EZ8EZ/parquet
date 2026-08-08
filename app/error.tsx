"use client";

/**
 * ROOT ERROR BOUNDARY - the themed replacement for a raw stack trace.
 *
 * Client component because `reset()` is only available in a boundary, and a
 * boundary has to be a Client Component to catch render errors. Logs to the
 * console (not the UI) so a leaguemate never sees a trace, while the person
 * actually debugging this still can. Nested inside the root layout the same
 * way `not-found.tsx` is, so the themed shell and bottom nav are unaffected.
 */
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div>
      <div className="rounded-[--radius] border border-negative/30 bg-negative/[0.06] p-6 text-center">
        <AlertTriangle
          size={28}
          aria-hidden="true"
          className="mx-auto mb-3 text-negative"
        />
        <h1 className="font-display text-lede leading-tight font-semibold text-ink">
          This page hit a snag
        </h1>
        <p className="mx-auto mt-1.5 max-w-sm text-body leading-relaxed text-muted">
          Something broke while pulling this together. Try again - if it keeps
          happening, the league data behind it is probably the problem, not your
          connection.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-body leading-relaxed font-semibold text-accent-ink"
        >
          <RotateCcw size={15} aria-hidden="true" />
          Try again
        </button>
      </div>
      <p className="mt-4 text-center text-meta leading-relaxed text-secondary">
        Still stuck?{" "}
        <Link
          href="/"
          className="inline-flex min-h-11 items-center font-semibold text-muted underline-offset-2 hover:text-accent-text hover:underline"
        >
          Back to Home
        </Link>
      </p>
    </div>
  );
}
