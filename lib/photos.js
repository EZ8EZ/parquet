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
 *
 * THE DEFAULT IS ON, AND THAT IS A DELIBERATE REVISION OF D39 (see D90).
 *
 * D39 flipped this default to OFF for one stated reason: this repo is public, so a
 * fork or somebody else's Vercel deploy that never set the var must not silently ship
 * real, unlicensed headshots. That worry is legitimate and is NOT being discarded -
 * but the implementation charged the whole cost of it to the one person it was never
 * aimed at. `NEXT_PUBLIC_*` is inlined at BUILD time, so "just set it in the Vercel
 * dashboard" also requires a fresh no-cache redeploy; the owner was walked through
 * that twice and the photos were still off, across four separate asks. A default the
 * project's own owner cannot get past is not a safety default, it is a bug.
 *
 * So the rule is now three-branch, and the branch ORDER is the whole design:
 *
 *   1. `NEXT_PUBLIC_USE_PLAYER_PHOTOS` set explicitly wins, either way. "false" is
 *      the documented opt-out for a fork that wants monograms; "true" is the
 *      documented opt-in for a fork that read the licensing note and accepts it.
 *   2. Unset, and positively identifiable as SOMEBODY ELSE'S build -> OFF. Vercel
 *      auto-populates `NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER` for Next.js projects
 *      (checked against Vercel's framework-environment-variables reference, not
 *      assumed). It carries the `NEXT_PUBLIC_` prefix, so it is inlined at build time
 *      into the server AND client bundles from a single value - which is why the fork
 *      check reads it rather than the bare `VERCEL_GIT_REPO_OWNER`: a server-runtime
 *      read and a client build-time read can disagree, and this function gates
 *      whether an element renders at all, so a disagreement is a hydration mismatch.
 *   3. Anything else -> ON. Local `pnpm dev`, `pnpm build`, CI, and the owner's own
 *      Vercel deploys all land here and need no configuration at all.
 *
 * Note the asymmetry, which is the point: this FAILS OPEN. The fork check can only
 * ever turn photos off, and only when it holds a repo owner that is positively not
 * the canonical one. If Vercel's "Enable access to System Environment Variables"
 * setting is off, or the var is renamed, or the deploy is not git-connected, the var
 * is absent and photos stay ON rather than quietly reverting to monograms. A missing
 * env var silently downgrading the owner's own site is the exact failure this must
 * not be able to repeat. The price of failing open is that automatic fork protection
 * degrades to the documented `.env.example` opt-out, which is a far better trade than
 * a fifth round of "the photos are still not showing up."
 */

/**
 * The GitHub account owning the canonical repo (github.com/EZ8EZ/parquet). Compared
 * lower-cased: GitHub logins are case-insensitive and the exact casing Vercel
 * forwards is not worth depending on.
 */
const CANONICAL_REPO_OWNER = "ez8ez";

export function photosEnabled() {
  // An explicit setting is the entire answer, in both directions. Checked first so
  // that neither the fork heuristic nor the ON default can override a deploy that has
  // actually said what it wants - `playwright.config.mjs` pins "false" here to keep
  // the e2e suite deterministic and offline, and that has to keep working.
  const explicit = process.env.NEXT_PUBLIC_USE_PLAYER_PHOTOS;
  if (explicit === "false") return false;
  if (explicit === "true") return true;
  // Nothing set. Photos are on unless this build is positively someone else's.
  const owner = process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER;
  if (owner && owner.toLowerCase() !== CANONICAL_REPO_OWNER) return false;
  return true;
}
