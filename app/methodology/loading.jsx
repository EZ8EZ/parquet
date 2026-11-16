/** Methodology: the header, the section index, then the first section's figure. */
import { LoadingPage } from "@/components/PageSkeleton";
export default function Loading() {
  return <LoadingPage layout="cards" cards={3} kicker="w-24" />;
}
