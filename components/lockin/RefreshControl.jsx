"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/ui";
import { refreshLockDesk } from "@/lib/lockin/refresh";

/** While one of the roster's games is in progress: refresh every 2 minutes, tab visible only. */
export const LIVE_REFRESH_MS = 120_000;
/** When a slot's score is still catching up: one refresh shortly after load. */
const CATCH_UP_MS = 8_000;

function stamp(iso) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(t).replace(/\s?([AP])M/, (_, a) => ` ${a.toLowerCase()}m`) + " ET";
}

/**
 * Refresh button with its "as of" time. One tap expires tonight's data (server action,
 * rate-limited to once per roster per 20 s) and re-renders. Polls only while a game is
 * live and the tab is visible; never outside a live window.
 */
export function RefreshControl({ rosterId, asOf, live = false, updating = false, disabled = false }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState(null);
  const busy = useRef(false);
  const catchUps = useRef(0);

  const run = (auto = false) => {
    if (busy.current || disabled) return;
    busy.current = true;
    start(async () => {
      const r = await refreshLockDesk(rosterId).catch(() => ({ ok: false, reason: "error" }));
      busy.current = false;
      if (r.ok) {
        setNote(null);
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

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={() => run(false)}
        disabled={pending || disabled}
        aria-busy={pending}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-2 px-3.5 text-note font-semibold text-ink transition-colors hover:bg-elevated disabled:text-secondary"
      >
        <RefreshCw size={16} aria-hidden="true" className={cn(pending && "animate-spin motion-reduce:animate-none")} />
        {pending ? "Refreshing" : "Refresh"}
      </button>
      <p aria-live="polite" className="text-meta text-secondary">
        {note ?? (pending ? "Reading Sleeper…" : `${live ? "Live · " : ""}as of ${stamp(asOf)}`)}
      </p>
    </div>
  );
}
