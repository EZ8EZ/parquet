/**
 * Quiet skeleton, not a spinner (DECISIONS.md D15: dark editorial, no cheery
 * loading copy). This route walks the whole league's rosters to find trades, so
 * it is one of the slowest pages in the app.
 */
import { LoadingPage } from "@/components/PageSkeleton";
export default function Loading() {
  return <LoadingPage cards={3} />;
}
