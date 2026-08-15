/**
 * This route reads a whole lock-in season on demand: ~23 lineup requests plus one per
 * player who spent a week on the roster. Quiet skeleton, no spinner, no cheery copy.
 */
import { LoadingPage } from "@/components/PageSkeleton";
export default function Loading() {
  return <LoadingPage cards={3} kicker="w-20" title="w-1/2" />;
}
