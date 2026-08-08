/**
 * THE APP-WIDE LOADING BOUNDARY.
 *
 * A `loading.tsx` at the root segment applies to every route beneath it that does not
 * define its own, which here is roughly thirty of them. That inheritance is the whole
 * point: this app has ~33 `force-dynamic` routes that each assemble a league corpus
 * server-side, and until this file existed, only five of them had a boundary. The
 * other twenty-eight prefetched an empty 185-byte payload, so a tap on the Desk's
 * Roster or Record slot showed the reader nothing at all until the server came back.
 *
 * A route with a genuinely different shape still overrides this (see `/plan`,
 * `/league`, `/trade/finder`, `/lab/regret`, `/lab/counterfactual`). This is the
 * default, not a ceiling.
 *
 * See components/PageSkeleton.tsx for the measurement and the shape argument.
 */
import { LoadingPage } from "@/components/PageSkeleton";

export default function Loading() {
  return <LoadingPage />;
}
