import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader, SectionHeader } from "@/components/ui";
import { SearchPanel } from "@/components/SearchPanel";
import { groupedSurfaces } from "@/lib/nav";
import { iconForSurface } from "@/components/nav-icons";

export const dynamic = "force-dynamic";

export default function MorePage() {
  const groups = groupedSurfaces();

  return (
    <div>
      <PageHeader
        kicker="Explore"
        title="Everything in Parquet"
        subtitle="Search for a specific player, manager, trade or pick - or browse every surface the app has. If it isn't listed below, it doesn't exist yet."
      />

      {/*
        Suspense because SearchPanel reads the query string through useSearchParams -
        the search box's own text is addressable now (`/more?q=...`), so leaving for
        a result and coming back restores it instead of an empty box. This page is
        force-dynamic, so the boundary never actually suspends in practice; it is
        here so that dependency can never turn into a render-mode surprise later.
      */}
      <Suspense fallback={null}>
        <SearchPanel />
      </Suspense>

      {groups.map(({ group, items }) => (
        <div key={group}>
          <SectionHeader title={group} />
          {group === "Primary" ? (
            // Already one tap away via the tab bar - listed for completeness (a
            // "everything" page that quietly excluded five real pages would be
            // lying about its own premise), but compact rather than full cards.
            <div className="grid grid-cols-5 gap-1.5">
              {items.map((s) => {
                const Icon = iconForSurface(s.href);
                return (
                  <Link
                    key={s.href}
                    href={s.href}
                    className="flex flex-col items-center gap-1 rounded-[--radius-sm] border border-border bg-surface/40 px-1 py-2 text-center transition-colors hover:border-border-strong hover:bg-surface-2"
                  >
                    <Icon size={16} aria-hidden="true" className="text-faint" />
                    <span className="text-[10px] font-medium leading-tight text-muted">
                      {s.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1.5">
              {items.map((s) => {
                const Icon = iconForSurface(s.href);
                return (
                  <Link
                    key={s.href}
                    href={s.href}
                    className="flex min-h-11 items-center gap-2.5 rounded-[--radius-sm] border border-border bg-surface/60 px-2.5 py-2 transition-colors hover:border-border-strong hover:bg-surface-2"
                  >
                    <Icon size={17} aria-hidden="true" className="shrink-0 text-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold leading-tight text-ink">
                        {s.label}
                      </span>
                      <span className="block truncate text-[11.5px] leading-snug text-faint">
                        {s.sub}
                      </span>
                    </span>
                    <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-faint" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
