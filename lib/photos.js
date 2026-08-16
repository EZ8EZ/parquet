/**
 * Whether this deploy renders real player photos rather than monograms - the
 * server-safe home for the same check `components/PlayerAvatar.jsx` reads.
 *
 * This used to live only inside PlayerAvatar.jsx, which is `"use client"` - fine for
 * the two callers that first needed it (`ValuesList`, `RankingBoard`, both client
 * components already), but Next.js refuses to invoke ANY export of a client module
 * from server-side code, even a plain function with no client-only API in it
 * ("Attempted to call photosEnabled() from the server but photosEnabled is on the
 * client"). Server Component call sites (app/drafts/parts.jsx,
 * app/lab/counterfactual/page.jsx, app/recap/page.jsx - all decide whether to render
 * a per-row `PlayerAvatar` the same way `ValueAssetRow` and the `/rank` board do,
 * D73) import from here instead. `PlayerAvatar.jsx` re-exports this same function so
 * its existing client imports keep working unchanged - one implementation, not two.
 */
export function photosEnabled() {
  return process.env.NEXT_PUBLIC_USE_PLAYER_PHOTOS === "true";
}
