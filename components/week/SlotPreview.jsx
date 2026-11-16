import { SkeletonCard } from "@/components/ui";
import { fmt } from "@/lib/lockin/view";

/**
 * First paint of Home's week, from the matchup row alone (lib/week/load.js
 * loadSlotPreview): the week and the seven slot scores, with lock states still loading.
 * It is the Suspense fallback for the full board, so it is also what a browser without
 * JavaScript keeps showing.
 */
export function SlotPreview({ preview }) {
  return (
    <div aria-busy="true">
      {preview ? (
        <>
          <p className="mb-3 pt-1 figure text-note text-secondary">Week {preview.week} · lock states loading</p>
          <ol aria-label="Your starting slots this week (loading)" className="mb-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${preview.slots.length || 7}, minmax(0, 1fr))` }}>
            {preview.slots.map((s, i) => (
              <li key={i} className="flex h-[72px] min-w-0 flex-col items-center justify-between rounded-control bg-surface py-1.5">
                <span className="text-meta font-semibold text-secondary">{s.label}</span>
                <span className="figure text-body font-bold text-ink">{s.banked == null ? "-" : fmt(s.banked)}</span>
                <span className="skeleton h-3 w-6 rounded-full" aria-hidden="true" />
              </li>
            ))}
          </ol>
        </>
      ) : null}
      <SkeletonCard />
    </div>
  );
}
