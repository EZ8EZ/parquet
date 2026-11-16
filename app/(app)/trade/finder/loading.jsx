/** The trade finder walks every roster in the league; its result is a long list. */
import { LoadingPage } from "@/components/PageSkeleton";
export default function Loading() {
  return <LoadingPage layout="list" rows={7} />;
}
