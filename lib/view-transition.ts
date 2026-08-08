/**
 * THE ONE PLACE A VIEW TRANSITION IS STARTED, and the argument for when it earns one.
 *
 * There is exactly one thing animation is reliably good at, and it is not delight and
 * it is not "perceived performance": it is telling a reader WHICH OBJECT BECAME WHICH
 * across a state change. When twenty rows all move at once and the reader is holding
 * one of them in their head, a cut makes them re-find it and a tween does not. That is
 * the whole test this helper exists to enforce - if a change does not reassign
 * identity across a set of things the reader is tracking, it does not come through
 * here, it just renders.
 *
 * Which is why this is a helper and not a convention: an entrance animation, a
 * staggered list reveal, a page-enter fade - none of those pass the test, and having a
 * single named function makes it obvious at the call site that a claim is being made.
 *
 * THREE GUARDS, all of which have to pass:
 *
 *  1. The API exists. Same-document view transitions ship in Safari 18+, Chrome and
 *     Edge; a browser without it takes the plain `update()` path and sees a cut, which
 *     is the pre-existing behaviour, not a regression.
 *  2. The reader has not asked for reduced motion. A view transition is a cross-fade
 *     plus a translate of many elements at once, which is exactly the vestibular case
 *     the setting is about. Note this is a REMOVE rather than a REDUCE, and that is
 *     the correct reading here specifically: the information the motion carries (which
 *     row went where) is also carried by the printed rank ordinal on every row, so
 *     dropping the motion drops no meaning. Where motion is the only carrier of a
 *     fact, it should be swapped for a dissolve rather than deleted - see the press
 *     rules in globals.css, which reduce rather than remove.
 *  3. The document is visible. Starting a transition on a backgrounded tab queues an
 *     animation nobody will watch and delays the state update behind it.
 *
 * `flushSync` is required, not incidental: `startViewTransition` snapshots the DOM,
 * runs the callback, and snapshots again. React's default batching would return from
 * the callback before the DOM had changed, so the second snapshot would be identical
 * and the transition would animate nothing.
 */
import { flushSync } from "react-dom";

export function withViewTransition(update: () => void): void {
  if (
    typeof document === "undefined" ||
    !("startViewTransition" in document) ||
    document.visibilityState !== "visible" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }
  document.startViewTransition(() => {
    flushSync(update);
  });
}
