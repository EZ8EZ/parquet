"use client";
import { useEffect, useState } from "react";
import { countdownText, localDeadline } from "@/lib/lockin/tonightView";

/**
 * A listed start as a deadline in the viewer's own time zone. The server renders the
 * engine's Eastern text; after hydration it switches to local time with the zone.
 */
export function Deadline({ at, fallback, className, capitalize = false }) {
  const [raw, setText] = useState(fallback);
  const text = capitalize && raw ? raw[0].toUpperCase() + raw.slice(1) : raw;
  useEffect(() => {
    const local = localDeadline(at);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- local zone is only known in the browser
    if (local) setText(local);
  }, [at]);
  return <span className={className}>{text}</span>;
}

/**
 * Countdown to a listed start, ticking client-side once a second; no polling.
 * `frozenAt` (fixture and replays) runs the clock from that moment instead of now.
 */
export function Countdown({ at, frozenAt = null, className }) {
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
  if (now == null) return null;
  const left = countdownText(deadline, now);
  return (
    <span className={className} role="timer" aria-live="off">
      {left ? `in ${left}` : "passed"}
    </span>
  );
}
