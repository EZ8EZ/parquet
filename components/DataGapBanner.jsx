/**
 * One plain sentence when the current view is built on incomplete Sleeper data.
 *
 * Server component, rendered by the root layout. It reads `getDataGaps()` (the corpus's
 * gaps plus those of the loaders that run beside it, lib/util/gaps.js) and renders
 * nothing at all when nothing is missing, which is the normal case. The copy states
 * what is missing and that the view is incomplete (D6: no advice, D19: say so rather
 * than let a failed request read as a quiet week).
 */
import { getDataGaps } from "@/lib/history";
import { describeGaps } from "@/lib/util/gaps";
import { AlertTriangle } from "lucide-react";

export async function DataGapBanner() {
  const sentence = describeGaps(await getDataGaps());
  if (!sentence) return null;
  // Warn wash and edge tokens (text on the wash is 8.1:1), and an icon so the
  // warning never rests on colour alone.
  return (
    <p
      role="status"
      className="mb-4 flex items-start gap-2 rounded-control border border-warn-edge bg-warn-wash px-3 py-2.5 text-note text-ink"
    >
      <AlertTriangle size={16} aria-hidden="true" className="mt-px shrink-0 text-warn" />
      <span className="min-w-0">{sentence}</span>
    </p>
  );
}
