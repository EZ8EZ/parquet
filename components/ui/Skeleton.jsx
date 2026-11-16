import { cn } from "@/lib/ui";

/*
 * Placeholders shaped like the primitives they stand in for, at the same heights, so
 * a page does not jump when its data arrives. Each mirrors one primitive's box:
 * SkeletonHeader = PageHeader, SkeletonStat = StatTile, SkeletonRows = List of
 * ListRows (min-h-14), SkeletonTabs = the Tabs bar.
 */

export function SkeletonLine({ className }) {
  return <div className={cn("skeleton h-4 w-full", className)} />;
}

export function SkeletonCard({ className, lines = 3 }) {
  return (
    <div className={cn("space-y-3 rounded-card bg-surface p-4", className)}>
      <SkeletonLine className="h-5 w-1/2" />
      {Array.from({ length: Math.max(0, lines - 1) }, (_, i) => (
        <SkeletonLine key={i} className={i % 2 ? "w-2/3" : "w-3/4"} />
      ))}
    </div>
  );
}

/** Placeholder for a List of `rows` ListRows; `avatar={false}` for rank-only rows. */
export function SkeletonRows({ rows = 5, avatar = true, className }) {
  return (
    <div className={cn("divide-y divide-border overflow-hidden rounded-card bg-surface", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-14 items-center gap-3 px-4">
          {avatar ? (
            <div className="skeleton size-8 shrink-0 rounded-full" />
          ) : (
            <div className="skeleton h-3.5 w-5 shrink-0" />
          )}
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

/** One StatTile. `size` matches StatTile: sm 17px, md 28px, hero 44px figure. */
export function SkeletonStat({ size = "md", className }) {
  const h = size === "hero" ? "h-11" : size === "sm" ? "h-5" : "h-7";
  return (
    <div className={cn("space-y-2 rounded-card bg-surface p-3", className)}>
      <SkeletonLine className="h-3 w-1/2" />
      <SkeletonLine className={cn(h, size === "hero" ? "w-2/5" : "w-3/4")} />
      {size === "hero" && <SkeletonLine className="h-3 w-1/3" />}
    </div>
  );
}

/** Placeholder for a row of StatTiles. */
export function SkeletonStats({ count = 3, size = "md", className }) {
  return (
    <div className={cn("grid gap-2", className)} style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonStat key={i} size={size} />
      ))}
    </div>
  );
}

/** Placeholder for a PageHeader: optional kicker, the 28px title, one subtitle line. */
export function SkeletonHeader({ kicker = true, subtitle = true, avatar = false, kickerWidth = "w-28", titleWidth = "w-2/3", className }) {
  return (
    <div className={cn("mb-4 flex items-center gap-3", className)}>
      {avatar && <div className="skeleton size-12 shrink-0 rounded-full" />}
      <div className="min-w-0 flex-1">
        {kicker && <SkeletonLine className={cn("mb-1.5 h-3.5", kickerWidth)} />}
        <SkeletonLine className={cn("h-7", titleWidth)} />
        {subtitle && <SkeletonLine className="mt-1.5 h-3.5 w-4/5" />}
      </div>
    </div>
  );
}

/** Placeholder for a Tabs bar: `count` labels on the underline bar, or a pill. */
export function SkeletonTabs({ count = 3, variant = "underline", className }) {
  if (variant === "segmented") {
    return <div className={cn("skeleton h-[52px] rounded-full", className)} />;
  }
  return (
    <div className={cn("flex h-11 items-center gap-5 border-b border-border", className)}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonLine key={i} className="h-3.5 w-16" />
      ))}
    </div>
  );
}
