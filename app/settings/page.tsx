/**
 * SETTINGS - the app's first real preference gets the app's first settings page.
 *
 * This page exists now rather than earlier on a decision the team already recorded: a
 * settings page is not a feature on its own, and should be folded in with whichever
 * feature needs the first genuine preference. The theme escape hatch is that feature.
 *
 * Static apart from the toggle, which is a client island - nothing here is derived from
 * the league, so there is no reason for this page to be dynamic.
 */

import Link from "next/link";
import { ArrowLeft, ChevronRight, Lock } from "lucide-react";
import { PageHeader, SectionHeader } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata = {
  title: "Settings - Parquet",
};

export default function SettingsPage() {
  return (
    <div>
      <Link
        href="/"
        className="-ml-1 -mt-3 mb-0.5 inline-flex min-h-11 items-center gap-1.5 px-1 text-meta font-semibold text-muted transition-colors hover:text-accent"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        Home
      </Link>

      <PageHeader
        kicker="Settings"
        title="How this looks"
        subtitle="Display preferences, stored in this browser only. Nothing here changes a single number the app shows you."
      />

      <SectionHeader title="Theme" />
      <ThemeToggle />

      <SectionHeader title="Where you are" />
      <Link
        href="/teams"
        className="flex min-h-11 items-center gap-2.5 rounded-[--radius] border border-border bg-surface/60 px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold leading-tight text-ink">
            Switch team
          </span>
          <span className="block text-meta leading-tight text-faint">
            Run the whole app as a different manager
          </span>
        </span>
        <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-faint" />
      </Link>

      <p className="mt-4 flex items-start gap-1.5 text-meta leading-relaxed text-faint">
        <Lock size={11} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
        <span>
          Your theme lives in this browser&apos;s local storage. It is never sent
          anywhere, and it is not part of the league data this app reads.
        </span>
      </p>
    </div>
  );
}
