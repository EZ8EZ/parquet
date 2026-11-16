import { SkeletonCard } from "@/components/ui";
import { fmt } from "@/lib/lockin/view";
import { loadSlotPreview } from "@/lib/week/load";

/** First paint: the seven slot scores from the matchup row, lock states still loading. */
export async function SlotPreview({ h, rosterId }) {
  const p = await loadSlotPreview(h, rosterId);
  return (
    <div aria-busy="true">
      {p ? (
        <ol aria-label="Your starting slots this week (loading)" className="mb-3 mt-12 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${p.slots.length || 7}, minmax(0, 1fr))` }}>
          {p.slots.map((s, i) => (
            <li key={i} className="flex h-[72px] min-w-0 flex-col items-center justify-between rounded-control bg-surface py-1.5">
              <span className="text-meta font-semibold text-secondary">{s.label}</span>
              <span className="figure text-body font-bold text-ink">{s.banked == null ? "-" : fmt(s.banked)}</span>
              <span className="skeleton h-3 w-6 rounded-full" aria-hidden="true" />
            </li>
          ))}
        </ol>
      ) : null}
      <SkeletonCard />
    </div>
  );
}
