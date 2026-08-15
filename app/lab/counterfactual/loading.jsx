/** Two cards, because that is what the page actually renders. */
import { LoadingPage } from "@/components/PageSkeleton";
export default function Loading() {
  return <LoadingPage cards={2} kicker="w-20" />;
}
