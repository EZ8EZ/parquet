"use client";
import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronRight, RotateCcw } from "lucide-react";
import { Sheet } from "@/components/ui";
import { cn } from "@/lib/ui";
import { assumeFromSearch, assumeHref, parseTypedScore, withAssume } from "@/lib/lockin/assumeView";
import { useDeck } from "./PlayerDeck";
import { SAVED_ASSUME_COOKIE, encodeSaved, weekEndMs } from "@/lib/lockin/savedAssume";

/** Replace the page's ?assume= in place (scroll kept), returning [go, pending]. */
// D141: lock and play-on marks stay until changed (lib/lockin/savedAssume.js); the team is the
// one the viewer picked (the parquet_roster cookie, readable by design)
function rememberMarks(list) {
  try {
    const roster = /(?:^|;\s*)parquet_roster=(\d+)/.exec(document.cookie)?.[1];
    const value = roster ? encodeSaved(roster, list) : null;
    document.cookie = value
      ? `${SAVED_ASSUME_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${Math.ceil((weekEndMs() - Date.now()) / 1000)}; samesite=lax`
      : `${SAVED_ASSUME_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } catch {
    // cookies blocked: the what-if still works for this visit
  }
}

export function useAssumeNav() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, start] = useTransition();
  const go = (list) => {
    rememberMarks(list);
    start(() => router.replace(assumeHref(pathname, search?.toString() ?? "", list), { scroll: false }));
  };
  return { go, pending, list: assumeFromSearch(search?.toString() ?? "") };
}

/**
 * A slot tile that opens the what-if choice: "Treat as locked at 33.0" / "Treat as
 * playing on" / "Model's guess", the current one marked. Choosing re-renders the page
 * with the new ?assume= (a server round trip; marks are kept until changed, D141); the tile shows it is
 * pending meanwhile. Your own slots also offer the player's sheet.
 */
export function AssumeTile({ tile, label, children, className, detailsId = null }) {
  const [open, setOpen] = useState(false);
  const { go, pending, list } = useAssumeNav();
  const openDeck = useDeck();
  // Closing the sheet pops the history entry it pushed (Sheet.jsx); navigate only after
  // that pop lands, or the back would undo the new ?assume=.
  const [typed, setTyped] = useState(tile.typedScore != null ? String(tile.typedScore) : "");
  const typedScore = parseTypedScore(typed);
  const choose = (state, score = null) => {
    const next = withAssume(tile.applied ?? list, tile.side, tile.index, state, score);
    let done = false;
    const fire = () => {
      if (done) return;
      done = true;
      go(next);
    };
    window.addEventListener("popstate", fire, { once: true });
    setTimeout(fire, 400);
    setOpen(false);
  };
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      trigger={<span className={cn("block", pending && "animate-pulse motion-reduce:animate-none")} data-pending={pending ? "" : undefined}>{children}</span>}
      triggerLabel={label}
      triggerClassName={cn("block w-full rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent", className)}
      title={`${tile.side === "mine" ? "Your" : "Their"} ${tile.label}${tile.name ? ` · ${tile.name}` : ""}`}
      subtitle="What if? Locked and playing-on stay until you change them; typed scores are for this visit."
    >
      <div className="space-y-3" data-assume-sheet>
        {tile.contradiction && <p className="rounded-control bg-warn-wash px-3 py-2 text-note text-ink">{tile.contradiction}</p>}
        {tile.choices.options.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-card bg-surface-2" aria-label="Treat this slot as">
            {tile.choices.options.map((o) => {
              // a typed score is its own choice: "locked at the current score" is not current then
              const current = o.current && !(o.state === "locked" && tile.typedScore != null);
              return (
                <li key={String(o.state)}>
                  <button type="button" onClick={() => choose(o.state)} aria-pressed={current} className="flex min-h-12 w-full items-center gap-3 px-3.5 text-left text-body font-semibold text-ink transition-colors hover:bg-elevated">
                    <span className="flex-1">{o.label}</span>
                    {current && (
                      <span className="flex items-center gap-1 text-meta font-semibold text-accent-text">
                        <Check size={16} aria-hidden="true" />
                        Current
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <form
          className="rounded-card bg-surface-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (typedScore != null) choose("locked", typedScore);
          }}
        >
          <label htmlFor={`typed-${tile.side}-${tile.index}`} className="block text-note font-semibold text-ink">
            Lock at a score you type
          </label>
          <p className="mt-0.5 text-meta text-secondary">What if he finishes on this score and you lock it? Any number from 0 to 150.</p>
          <div className="mt-2 flex gap-2">
            <input
              id={`typed-${tile.side}-${tile.index}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={tile.value != null ? String(tile.value) : "30"}
              aria-invalid={typed !== "" && typedScore == null ? "true" : undefined}
              className="figure min-h-11 w-24 rounded-control bg-bg px-3 text-body text-ink outline-1 outline-border-strong focus-visible:outline-2 focus-visible:outline-accent"
            />
            <button type="submit" disabled={typedScore == null} className="min-h-11 flex-1 rounded-control bg-accent px-3 text-note font-semibold text-accent-ink transition-opacity disabled:opacity-50">
              {tile.typedScore != null ? "Update" : "Lock at this score"}
            </button>
          </div>
          {typed !== "" && typedScore == null && <p className="mt-1 text-meta text-warn">Type a number from 0 to 150.</p>}
          {tile.typedScore != null && (
            <p className="mt-1.5 text-meta text-secondary">
              Now: locked at <span className="figure font-semibold text-ink">{tile.typedScore}</span> (typed).
            </p>
          )}
        </form>
        {tile.choices.note && <p className="text-meta text-secondary">{tile.choices.note}</p>}
        <p className="text-meta text-secondary">Every number on the page follows the assumption: win chance (rough), projections, the model&apos;s calls. Sleeper does not show lock states, so the app infers them; this lets you say what you know.</p>
        {detailsId && openDeck && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setTimeout(() => openDeck(detailsId), 0);
            }}
            className="flex min-h-11 w-full items-center justify-between rounded-control px-1 text-note font-semibold text-accent-text"
          >
            {tile.name ? `${tile.name}: charts, record and method` : "Player details"}
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** Clears every assumption (the What-if bar's Reset). */
export function ResetAssume({ className }) {
  const { go, pending } = useAssumeNav();
  return (
    <button type="button" onClick={() => go([])} disabled={pending} className={cn("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-elevated px-3.5 text-note font-semibold text-ink transition-colors hover:bg-border-strong disabled:opacity-60", className)}>
      <RotateCcw size={15} aria-hidden="true" className={cn("shrink-0", pending && "animate-spin motion-reduce:animate-none")} />
      Reset
    </button>
  );
}
