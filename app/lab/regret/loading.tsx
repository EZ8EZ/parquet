/**
 * This route reads a whole lock-in season on demand: ~23 lineup requests plus one per
 * player who spent a week on the roster. Quiet skeleton, no spinner, no cheery copy.
 */
import { SkeletonCard, SkeletonLine } from "@/components/ui";

export default function Loading() {
  return (
    <div>
      <div className="mb-3">
        <SkeletonLine className="h-3 w-20" />
        <SkeletonLine className="mt-2 h-7 w-1/2" />
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
