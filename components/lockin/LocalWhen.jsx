import { DEFAULT_TZ, dayClockText, stripZone } from "@/lib/lockin/time";

/**
 * "Sat 7:30 PM" in the board's display zone (desk.displayTz; lib/lockin/time.js). The
 * zone is named once, in the board's top bar, so no suffix here. Server-rendered: the
 * same text on every device, no hydration swap.
 */
export function LocalWhen({ at, tz = DEFAULT_TZ, fallback = null, prefix = "", className }) {
  const text = dayClockText(at, tz) ?? stripZone(fallback);
  if (!text) return null;
  return (
    <span className={className}>
      {prefix}
      {text}
    </span>
  );
}
