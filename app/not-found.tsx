/**
 * ROOT 404 - the themed replacement for Next's default black-on-white not-found.
 *
 * Static on purpose, same reasoning as /about (see that file): it makes no claim
 * that needs live data, so it renders instantly for a route that, by definition,
 * never resolved to a page with real data behind it. Rendered inside the root
 * layout (Next nests `not-found.tsx` under the nearest layout, not in place of
 * it), so the themed shell and the bottom nav are already correct - this file
 * only has to fix the content that used to sit above them.
 */
import Link from "next/link";
import { Compass, Home } from "lucide-react";
import { PageHeader, EmptyState, ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div>
      <PageHeader kicker="Parquet" title="Nothing on this floor" />
      <EmptyState icon={<Compass size={28} aria-hidden="true" />} title="That page doesn't exist">
        Check the address, or find your way from here instead.
      </EmptyState>
      <div className="mt-3 flex gap-2">
        <ButtonLink href="/" className="flex-1">
          <Home size={15} aria-hidden="true" />
          Home
        </ButtonLink>
        <ButtonLink href="/more" variant="ghost" className="flex-1">
          See everything
        </ButtonLink>
      </div>
      <p className="mt-4 text-center text-meta leading-relaxed text-secondary">
        New to Parquet?{" "}
        <Link
          href="/about"
          className="inline-flex min-h-11 items-center font-semibold text-muted underline-offset-2 hover:text-accent-text hover:underline"
        >
          What this is, and what the numbers mean
        </Link>
      </p>
    </div>
  );
}
