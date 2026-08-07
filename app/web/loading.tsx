/**
 * Quiet skeleton, not a spinner (DECISIONS.md D15: dark editorial, no cheery
 * loading copy). This route builds the trade graph and every asset's current
 * value across the league's full history, so it is one of the slower pages.
 */
import { SkeletonLine, SkeletonCard } from "@/components/ui";

export default function Loading() {
  return (
    <div>
      <div className="mb-3">
        <SkeletonLine className="h-3 w-28" />
        <SkeletonLine className="mt-2 h-7 w-2/3" />
        <SkeletonLine className="mt-1.5 h-4 w-full" />
      </div>
      <div className="space-y-2">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
