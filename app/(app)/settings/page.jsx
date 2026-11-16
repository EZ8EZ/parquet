/**
 * SETTINGS AND SEARCH - the Menu's utility page.
 *
 * The theme toggle that first justified a settings page was retired with the light
 * theme, so what is left is the thing people come here for: search across every
 * player, manager, trade and pick, then the rest of the Menu as rows. The page
 * answers "where is X?" with the search field first, at the top of the screen.
 */
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { SearchPanel } from "@/components/SearchPanel";
import { TabIndex } from "@/components/TabIndex";
export const metadata = {
  title: "Search - Parquet",
};
export default function SettingsPage() {
  return (
    <div>
      <PageHeader kicker="Menu" title="Search" />
      <Suspense fallback={<div className="skeleton h-12 rounded-full" aria-hidden="true" />}>
        <SearchPanel basePath="/settings" />
      </Suspense>
      <TabIndex tab="utility" title="Also in the menu" className="mt-6" exclude={["/settings"]} />
    </div>
  );
}
