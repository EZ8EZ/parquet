"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RefreshCw } from "lucide-react";
import { cn } from "@/lib/ui";
import { refreshLockDesk } from "@/lib/lockin/refresh";

/** While one of the roster's games is in progress: refresh every 2 minutes, tab visible only. */
export const LIVE_REFRESH_MS = 120_000;
/** When a slot's score is still catching up: one refresh shortly after load. */
const CATCH_UP_MS = 8_000;

/**
 * Refresh: one round button in the board's top bar, carrying the "as of" time and the
 * board's zone ("4:55 PM ET", the one place the zone is named; lib/lockin/time.js).
 * One tap expires tonight's data (server action, rate-limited to once per roster per
 * 20 s) and re-renders; when the new board lands, a short note says what changed
 * ("Updated 5:12 PM ET · win chance 27% → 31%"), announced politely. Polls only while
 * a game is live and the tab is visible; never outside a live window.
 */
export function RefreshControl({ asOf, asOfText = "", winPct = null, live = false, updating = false, disabled = false }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState(null);
  const [done, setDone] = useState(null);
  const busy = useRef(false);
  const catchUps = useRef(0);
  const manual = useRef(null);

  // When a manual refresh's new board arrives (asOf changes), say what moved, briefly.
  useEffect(() => {
    const m = manual.current;
    if (!m || m.asOf === asOf) return;
    manual.current = null;
    const moved = m.winPct && winPct && m.winPct !== winPct ? ` · win chance ${m.winPct} → ${winPct}` : winPct ? " · win chance unchanged" : "";
    setDone(`Updated ${asOfText}${moved}`);
    const t = setTimeout(() => setDone(null), 6000);
    return () => clearTimeout(t);
  }, [asOf, asOfText, winPct]);

  const run = (auto = false) => {
    if (busy.current || disabled) return;
    busy.current = true;
    start(async () => {
      const r = await refreshLockDesk().catch(() => ({ ok: false, reason: "error" }));
      busy.current = false;
      if (r.ok) {
        setNote(null);
        if (!auto) manual.current = { asOf, winPct };
        router.refresh();
      } else if (!auto) {
        setNote(r.reason === "rate_limited" ? `Just refreshed; again in ${Math.ceil(r.retryInMs / 1000)} s` : "Refresh failed; showing the last load");
      }
    });
  };

  useEffect(() => {
    if (disabled || !updating || catchUps.current >= 3) return;
    catchUps.current += 1;
    const t = setTimeout(() => run(true), CATCH_UP_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOf, updating, disabled]);

  useEffect(() => {
    if (disabled || !live) return;
    let id = null;
    const arm = () => {
      clearInterval(id);
      id = document.visibilityState === "visible" ? setInterval(() => run(true), LIVE_REFRESH_MS) : null;
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", arm);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, disabled]);

  const status = note ?? done ?? (pending ? "Updating from Sleeper" : null);
  return (
    <div className="relative flex shrink-0 items-center">
      <button
        type="button"
        onClick={() => run(false)}
        disabled={pending || disabled}
        aria-busy={pending}
        aria-label={`Refresh. ${live ? "Live, " : ""}as of ${asOfText}`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface px-3.5 figure text-meta font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-default"
      >
        <RefreshCw size={15} aria-hidden="true" className={cn("shrink-0 text-ink", pending && "animate-spin motion-reduce:animate-none")} />
        {live && <span aria-hidden="true" className="size-1.5 rounded-full bg-negative" />}
        <span aria-hidden="true">{pending ? "Updating" : asOfText}</span>
      </button>
      <p aria-live="polite" className={cn("absolute right-0 top-full z-20 mt-1.5 w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-control bg-elevated px-3 py-2 text-note text-ink shadow-[var(--shadow-pop)]", !status && "sr-only")}>
        {status && (
          <span className="flex items-center gap-1.5">
            {done && !note && <Check size={15} aria-hidden="true" className="shrink-0 text-positive" />}
            {status}
          </span>
        )}
      </p>
    </div>
  );
}
