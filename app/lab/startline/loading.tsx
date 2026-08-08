/**
 * This route reads a season of lineups plus the whole NBA schedule on demand (~24
 * requests cold, ~1.05MB of it the schedule). Quiet skeleton, no spinner, no cheery
 * copy - the same reason /lab/regret's says nothing.
 */
import { LoadingPage } from "@/components/PageSkeleton";

export default function Loading() {
  return <LoadingPage cards={3} kicker="w-20" title="w-2/5" />;
}
