/**
 * SETTINGS - the app's first real preference gets the app's first settings page.
 *
 * This page exists now rather than earlier on a decision the team already recorded: a
 * settings page is not a feature on its own. The theme toggle that justified it was
 * retired with the light theme (one dark theme now); search and the menu index remain.
 */
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader, SectionHeader } from "@/components/ui";
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

      <TabIndex tab="utility" title="Also in the menu" exclude={["/settings"]} />

      <Onward from="/settings" />
    </div>
  );
}
