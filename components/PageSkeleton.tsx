/**
 * THE ONE PAGE SKELETON, and the reason every route now has a loading boundary.
 *
 * This is not a decoration. In the App Router, `<Link>` prefetch of a dynamic route
 * fetches the route's LOADING BOUNDARY, not its content - and a route with no
 * `loading.tsx` therefore has nothing to prefetch. Measured against a production
 * build of this app before this file existed: a prefetch of `/plan` (which had a
 * boundary) returned 9,406 bytes of ready-to-paint shell; a prefetch of `/roster`,
 * `/ledger` or `/awards` returned 185 bytes containing no UI at all. Three of the
 * Desk's four permanent destinations were in the second group. Tapping one meant a
 * blocking server round trip with the previous page still on screen and no evidence
 * the tap had registered - the single worst thing this app's navigation did.
 *
 * So the fix is structural, not animated: `app/loading.tsx` gives every route in the
 * app a boundary, and every boundary renders this. No transition you could write
 * competes with painting the next page's shape immediately.
 *
 * SHAPE, not entertainment. The skeleton mirrors `PageHeader` exactly - kicker, title,
 * subtitle - because that header is the one region every page in this app shares, so
 * the part a reader looks at first lands in its final position and does not move when
 * the content arrives. Below it, cards, which is what most of these pages are. The
 * count is the only knob: a route whose real content is two cards passes `cards={2}`
 * rather than flashing three and dropping one.
 *
 * Skeleton rather than spinner, and that is a claim about knowledge, not a style
 * preference: a skeleton says "the shape is known, the values are not," which is
 * exactly true here. A spinner would say we do not know what is coming.
 */
import { SkeletonCard, SkeletonLine } from "@/components/ui";

export function PageSkeleton({
  /** How many card placeholders sit under the header. */
  cards = 3,
  /** Width of the kicker line, matched to the route's real kicker where it differs. */
  kicker = "w-28",
  /** Width of the title line. */
  title = "w-2/3",
}: {
  cards?: number;
  kicker?: string;
  title?: string;
}) {
  return (
    <div
      /*
       * aria-hidden plus a single polite status line, rather than labelling every bar.
       * A screen reader gets one useful sentence; without this it would read a dozen
       * empty divs, or - worse, with `aria-busy` alone - nothing at all.
       */
      aria-hidden="true"
    >
      <div className="mb-3">
        <SkeletonLine className={`h-3 ${kicker}`} />
        <SkeletonLine className={`mt-2 h-7 ${title}`} />
        <SkeletonLine className="mt-1.5 h-4 w-full" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: cards }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * What a route's `loading.tsx` should export. Keeps the announcement in one place:
 * the visual skeleton is `aria-hidden`, and this is the line that actually reaches
 * assistive tech. `polite`, never `assertive` - a page load is not an interruption.
 */
export function LoadingPage(props: Parameters<typeof PageSkeleton>[0]) {
  return (
    <>
      <p role="status" className="sr-only">
        Loading
      </p>
      <PageSkeleton {...props} />
    </>
  );
}
