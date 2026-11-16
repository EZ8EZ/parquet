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
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { PageHeader, SectionHeader } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Onward } from "@/components/Onward";
import { SearchPanel } from "@/components/SearchPanel";
import { TabIndex } from "@/components/TabIndex";
export const metadata = {
  title: "Settings and search - Parquet",
};
export default function SettingsPage() {
  return (
    <div>
      <Link
        href="/"
        className="-ml-1 -mt-3 mb-0.5 inline-flex min-h-11 items-center gap-1.5 px-1 text-meta font-semibold text-muted transition-colors hover:text-accent-text"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        This Week
      </Link>

      <PageHeader kicker="Menu" title="Settings and search" />

      <SectionHeader title="Search" />
      <Suspense fallback={null}>
        <SearchPanel basePath="/settings" />
      </Suspense>

      <SectionHeader title="Theme" />
      <ThemeToggle />

      <TabIndex tab="utility" title="Also in the menu" exclude={["/settings"]} />

      <p className="mt-4 flex items-start gap-1.5 text-meta leading-relaxed text-faint">
        <Lock
          size={11}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-warn"
        />
        <span>
          Your theme lives in this browser&apos;s local storage. It is never
          sent anywhere, and it is not part of the league data this app reads.
        </span>
      </p>
      <Onward from="/settings" />
    </div>
  );
}
