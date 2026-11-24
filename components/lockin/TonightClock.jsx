"use client";
import { useEffect, useState } from "react";
import { countdownText } from "@/lib/lockin/tonightView";
import { DEFAULT_TZ, clockText, stripZone } from "@/lib/lockin/time";
import { cn } from "@/lib/ui";

/**
 * A listed start as a deadline, "before 7:00 PM", in the board's display zone
 * (desk.displayTz). The zone is named once, in the board's top bar.
 */
export function Deadline({ at, tz = DEFAULT_TZ, fallback, className, capitalize = false }) {
  const clock = clockText(at, tz);
  const raw = clock ? `before ${clock}` : stripZone(fallback) ?? "";
  const text = capitalize && raw ? raw[0].toUpperCase() + raw.slice(1) : raw;
  return <span className={className}>{text}</span>;
}

/** Under three hours a deadline is pressing: the pill turns amber (with the words, never colour alone). */
export const SOON_MS = 3 * 3600_000;

const PILL = "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2 figure text-micro font-bold";

/**
 * Countdown to a listed start, ticking client-side once a second; no polling.
 * `frozenAt` (fixture and replays) runs the clock from that moment instead of now.
 */
export function Countdown({ at, frozenAt = null, className, pill = false }) {
  const deadline = at ? Date.parse(at) : NaN;
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
      {left ? `in ${left}` : "passed"}
    </span>
  );
}
