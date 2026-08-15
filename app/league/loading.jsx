/**
 * Quiet skeleton, not a spinner (DECISIONS.md D15: dark editorial, no cheery
 * loading copy). This route ranks and classifies every roster in the league,
 * so it is one of the slower pages.
 */
import { LoadingPage } from "@/components/PageSkeleton";
export default function Loading() {
  return <LoadingPage cards={3} />;
}
