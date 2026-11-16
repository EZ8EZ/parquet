/**
 * THE PAGE SKELETONS, and the reason every route has a loading boundary.
 *
 * In the App Router, `<Link>` prefetch of a dynamic route fetches the route's LOADING
 * BOUNDARY, not its content, so a route with no `loading.jsx` has nothing to prefetch
 * and a tap shows the previous page until the server answers. `app/loading.jsx` gives
 * every route a boundary, and every boundary renders one of these.
 *
 * SHAPE, not entertainment. Each layout mirrors the primitives the real page is built
 * from, at the same heights (components/ui/Skeleton.jsx), so the regions a reader
 * looks at first land in their final position and do not jump when data arrives:
 *
 *   default  PageHeader, a row of three StatTiles, a List of rows. The converted
 *            pattern ("the number leads, then the list"), so it is the right guess for
 *            a route that does not say otherwise.
 *   team     /roster: avatar header with chips, the hero value card, the direction
 *            card with three tiles, the Players / Picks / Outlook tabs, rows.
 *   league   /league: header with chips, three tiles, a segmented tab bar, rows.
 *   list     a header, a segmented control, a long list (boards, indexes).
 *   cards    a header and `cards` stacked cards (long-form pages).
 *
 * Skeleton rather than spinner: a skeleton says "the shape is known, the values are
 * not", which is exactly true here. Motion is three shimmer cycles and none under
 * prefers-reduced-motion (globals.css `.skeleton`).
 */
import {
  SkeletonCard,
  SkeletonHeader,
  SkeletonLine,
  SkeletonRows,
  SkeletonStat,
  SkeletonStats,
  SkeletonTabs,
} from "@/components/ui";

function Chips({ count = 3 }) {
  return (
    <div className="-mt-2 mb-4 flex gap-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton h-6 w-16 rounded-full" />
      ))}
    </div>
  );
}

export function PageSkeleton({
  layout = "default",
  /** For `cards`: how many card placeholders sit under the header. */
  cards = 3,
  /** Width of the kicker line, matched to the route's real kicker where it differs. */
  kicker = "w-28",
  /** Width of the title line. */
  title = "w-2/3",
  /** For list layouts: how many rows. */
  rows = 6,
}) {
  return (
    // aria-hidden: the bars say nothing; LoadingPage's status line is what reaches
    // assistive tech.
    <div aria-hidden="true">
      {layout === "team" ? (
        <>
          <SkeletonHeader avatar subtitle={false} kickerWidth="w-20" titleWidth="w-1/2" />
          <Chips count={4} />
          <SkeletonStat size="hero" className="p-4" />
          <div className="mt-3 space-y-3 rounded-card bg-surface p-4">
            <SkeletonLine className="h-3.5 w-1/3" />
            <SkeletonLine className="h-7 w-1/3" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="skeleton h-24 rounded-control" />
              ))}
            </div>
          </div>
          <SkeletonTabs count={3} className="mt-6" />
          <SkeletonRows rows={rows} className="mt-3" />
        </>
      ) : layout === "league" ? (
        <>
          <SkeletonHeader subtitle={false} kickerWidth={kicker} titleWidth="w-1/3" />
          <Chips count={3} />
          <SkeletonStats count={3} />
          <SkeletonTabs variant="segmented" className="mt-4" />
          <SkeletonRows rows={rows} className="mt-3" />
        </>
      ) : layout === "list" ? (
        <>
          <SkeletonHeader kickerWidth={kicker} titleWidth={title} />
          <SkeletonTabs variant="segmented" />
          <SkeletonRows rows={rows} className="mt-3" />
        </>
      ) : layout === "cards" ? (
        <>
          <SkeletonHeader kickerWidth={kicker} titleWidth={title} />
          <div className="space-y-3">
            {Array.from({ length: cards }, (_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </>
      ) : (
        <>
          <SkeletonHeader kickerWidth={kicker} titleWidth={title} />
          <SkeletonStats count={3} />
          <SkeletonLine className="mb-2 mt-6 h-5 w-1/3" />
          <SkeletonRows rows={rows} />
        </>
      )}
    </div>
  );
}

/**
 * What a route's `loading.jsx` exports. The visual skeleton is `aria-hidden`; this
 * one polite status line is what reaches assistive tech.
 */
export function LoadingPage(props) {
  return (
    <>
      <p role="status" className="sr-only">
        Loading
      </p>
      <PageSkeleton {...props} />
    </>
  );
}
