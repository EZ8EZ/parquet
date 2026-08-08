import { SkeletonCard, SkeletonLine } from "@/components/ui";

export default function Loading() {
  return (
    <div>
      <div className="mb-3">
        <SkeletonLine className="h-3 w-20" />
        <SkeletonLine className="mt-2 h-7 w-2/3" />
        <SkeletonLine className="mt-1.5 h-4 w-full" />
      </div>
      <div className="space-y-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
