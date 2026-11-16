import { cn } from "@/lib/ui";

export function SkeletonLine({ className }) {
  return <div className={cn("skeleton h-4 w-full", className)} />;
}

export function SkeletonCard({ className }) {
  return (
    <div className={cn("space-y-3 rounded-card bg-surface p-4", className)}>
      <SkeletonLine className="h-5 w-1/2" />
      <SkeletonLine className="w-3/4" />
      <SkeletonLine className="w-2/3" />
    </div>
  );
}

/** Placeholder for a List of `rows` ListRows. */
export function SkeletonRows({ rows = 5, className }) {
  return (
    <div className={cn("divide-y divide-border overflow-hidden rounded-card bg-surface", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-14 items-center gap-3 px-4">
          <div className="skeleton size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <SkeletonLine className="h-3.5 w-2/5" />
            <SkeletonLine className="h-3 w-1/4" />
          </div>
          <SkeletonLine className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a row of StatTiles. */
export function SkeletonStats({ count = 3, className }) {
  return (
    <div className={cn("grid gap-2", className)} style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2 rounded-card bg-surface p-3">
          <SkeletonLine className="h-3 w-1/2" />
          <SkeletonLine className="h-7 w-3/4" />
        </div>
      ))}
    </div>
  );
}
