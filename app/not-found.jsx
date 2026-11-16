/**
 * ROOT 404 - the app's own not-found screen.
 *
 * Static on purpose: it makes no claim that needs live data, so it renders instantly
 * for a route that, by definition, never resolved to a page with real data behind it.
 * Rendered inside the root layout, so the shell and tab bar are already correct. The
 * heading text is asserted by the e2e helpers (expectStableChrome, depth.spec); keep it.
 */
import { Compass, Home, Search } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/ui";
export default function NotFound() {
  return (
    <div className="pt-6">
      <EmptyState
        as="h1"
        icon={<Compass size={32} aria-hidden="true" />}
        title="Nothing on this floor"
        action={
          <>
            <ButtonLink href="/">
              <Home size={16} aria-hidden="true" />
              This Week
            </ButtonLink>
            <ButtonLink href="/settings" variant="secondary">
              <Search size={16} aria-hidden="true" />
              Search
            </ButtonLink>
          </>
        }
      >
        That page doesn&apos;t exist. Check the address, or start from here.
      </EmptyState>
    </div>
  );
}
