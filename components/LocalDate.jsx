"use client";
/**
 * A timestamp rendered as the VIEWER's calendar date (YYYY-MM-DD), not the
 * server's. The server HTML carries the UTC reading so the instant is still
 * decided server-side (the StreakPanel contract); the client swaps in the local
 * date on hydration. Without this, a US evening reads tomorrow's date under
 * "Counted to" - the counted instant was right, the printed day was not.
 *
 * `useSyncExternalStore` rather than an effect: the store never changes, we only
 * want the server/client snapshot split, and it is the pattern the theme toggle
 * already established for exactly this hydration shape.
 */
import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
function localYmd(ts) {
  // en-CA formats as YYYY-MM-DD in the runtime's own timezone.
  return new Date(ts).toLocaleDateString("en-CA");
}
function utcYmd(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}
/**
 * A `LocalTime` sibling of this component - the same trick to the minute - lived here
 * for /lab/startline's "read at HH:MM" stamp. That surface was shelved (SHELVED.md,
 * S1) and nothing else in Parquet goes stale while you read it, so the component went
 * with it rather than sitting here waiting for a caller.
 */
export function LocalDate({ ts, className }) {
  const text = useSyncExternalStore(
    subscribe,
    () => localYmd(ts),
    () => utcYmd(ts),
  );
  return (
    <time
      dateTime={new Date(ts).toISOString()}
      className={className}
      // The one-day server/client mismatch is the point of this component.
      suppressHydrationWarning
    >
      {text}
    </time>
  );
}
