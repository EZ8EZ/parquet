"use client";
/**
 * ROOT ERROR BOUNDARY - the app's own screen instead of a raw stack trace.
 *
 * Client component because `reset()` is only available in a boundary, and a
 * boundary has to be a Client Component to catch render errors. Logs to the
 * console (not the UI) so a leaguemate never sees a trace, while the person
 * actually debugging this still can. Nested inside the root layout, so the
 * shell and the tab bar stay put. The heading text is asserted by the e2e
 * helpers (expectStableChrome); keep it.
 */
import { useEffect } from "react";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Button, ButtonLink, EmptyState } from "@/components/ui";
export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="pt-6">
      <EmptyState
        as="h1"
        tone="negative"
        icon={<AlertTriangle size={32} aria-hidden="true" />}
        title="This page hit a snag"
        action={
          <>
            <Button onClick={() => reset()}>
              <RotateCcw size={16} aria-hidden="true" />
              Try again
            </Button>
            <ButtonLink href="/" variant="secondary">
              <Home size={16} aria-hidden="true" />
              This Week
            </ButtonLink>
          </>
        }
      >
        Something broke while pulling the league data together.
      </EmptyState>
    </div>
  );
}
