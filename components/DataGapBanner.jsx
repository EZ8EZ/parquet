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

export async function DataGapBanner() {
  const sentence = describeGaps(await getDataGaps());
  if (!sentence) return null;
  return (
    <p
      role="status"
      className="mb-4 rounded-md border border-[var(--color-warn)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]"
    >
      {sentence}
    </p>
  );
}
