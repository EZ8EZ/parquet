"use client";
import { useEffect, useState } from "react";
import { countdownText } from "@/lib/lockin/tonightView";
import { DECIDE_BUFFER_MIN, DEFAULT_TZ, decideBy, stripZone } from "@/lib/lockin/time";
import { cn } from "@/lib/ui";

/**
 * A listed start as a deadline in the board's display zone (desk.displayTz), asking for
 * the move DECIDE_BUFFER_MIN before the tip and keeping the tip visible: "By 6:50 PM ·
 * tips 7:00" (`capitalize`, a heading) or "by 6:50 PM" (inline). Inside the buffer:
 * "Decide now · tips 7:00" in the warning tone. Display only: the engine's deadline is
 * the tip. The zone is named once, in the board's top bar.
 */
export function Deadline({ at, tz = DEFAULT_TZ, fallback, className, capitalize = false, nowMs = null }) {
  const db = at ? decideBy(at, tz, { nowMs }) : null;
  if (!db) {
    const raw = stripZone(fallback) ?? "";
    return <span className={className}>{capitalize && raw ? raw[0].toUpperCase() + raw.slice(1) : raw}</span>;
  }
  if (!capitalize) return <span className={className}>by {db.byClock}</span>;
  if (db.passed) return <span className={cn(className, "text-warn")}>Decide now · tips {db.tipText}</span>;
  return (
    <span className={className}>
      By {db.byClock} <span className="font-normal text-secondary">· tips {db.tipText}</span>
    </span>
  );
}

/** Under three hours a deadline is pressing: the pill turns amber (with the words, never colour alone). */
export const SOON_MS = 3 * 3600_000;
export { DECIDE_BUFFER_MIN };

const PILL = "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2 figure text-micro font-bold";

/**
 * Countdown to a listed start, ticking client-side once a second; no polling.
 * `frozenAt` (fixture and replays) runs the clock from that moment instead of now.
 */
export function Countdown({ at, frozenAt = null, className, pill = false, compact = false, bufferMin = 0 }) {
  const deadline = at ? Date.parse(at) - bufferMin * 60_000 : NaN;
  const [now, setNow] = useState(null);
  useEffect(() => {
    if (!Number.isFinite(deadline)) return;
    const start = Date.now();
    const base = frozenAt ? Date.parse(frozenAt) : start;
    const tick = () => setNow(base + (Date.now() - start));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline, frozenAt]);
  if (now == null) return pill ? <span className={cn(PILL, "invisible", className)}>in 0 h 00 min</span> : null;
  const left = countdownText(deadline, now);
  const soon = left && deadline - now < SOON_MS;
  return (
    <span className={cn(pill && PILL, pill && (soon ? "bg-warn-wash text-warn" : "bg-elevated text-muted"), className)} role="timer" aria-live="off" data-soon={pill ? String(!!soon) : undefined}>
      {left ? `in ${compact ? left.replace(/ h /, "h ").replace(/ min( \d+ s)?$/, "m").replace(/ s$/, "s") : left}` : "passed"}
    </span>
  );
}
