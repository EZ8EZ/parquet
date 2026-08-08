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

function localYmd(ts: number): string {
  // en-CA formats as YYYY-MM-DD in the runtime's own timezone.
  return new Date(ts).toLocaleDateString("en-CA");
}

function utcYmd(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/**
 * The same trick, to the minute, for the one surface that goes stale while you read
 * it. Everything else in Parquet is stable between visits; /lab/startline is about
 * tonight, so it has to say when "tonight" was read. The instant is still decided on
 * the server - only its rendering is local.
 */
export function LocalTime({ ts, className }: { ts: number; className?: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () =>
      new Date(ts).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    () => `${new Date(ts).toISOString().slice(11, 16)} UTC`,
  );
  return (
    <time
      dateTime={new Date(ts).toISOString()}
      className={className}
      suppressHydrationWarning
    >
      {text}
    </time>
  );
}

export function LocalDate({ ts, className }: { ts: number; className?: string }) {
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
