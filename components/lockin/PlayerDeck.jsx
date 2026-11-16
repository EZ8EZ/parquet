"use client";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/ui";

/**
 * One bottom sheet for every player on the board, with previous / next so a manager
 * can compare players without closing it. Same native modal <dialog> and `.sheet`
 * styling as the Sheet primitive (focus contained, Escape and backdrop close, focus
 * returns to the trigger); it differs only in holding many panels. Panels are
 * rendered on the server and passed in; only the open one is mounted.
 * Candidate for promotion to components/ui as a "paged sheet".
 */
const Deck = createContext(null);

export function PlayerDeck({ panels, initialOpen = null, children }) {
  const ref = useRef(null);
  const body = useRef(null);
  const opener = useRef(null);
  const titleId = useId();
  const order = panels.map((p) => p.id);
  const [idx, setIdx] = useState(() => (initialOpen ? order.indexOf(initialOpen) : -1));

  const open = (id, from) => {
    const i = order.indexOf(id);
    if (i < 0) return;
    opener.current = from ?? null;
    setIdx(i);
    if (!ref.current?.open) ref.current?.showModal();
  };
  const close = () => ref.current?.close();

  useEffect(() => {
    if (initialOpen && order.includes(initialOpen)) ref.current?.showModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    body.current?.scrollTo?.(0, 0);
  }, [idx]);

  const p = idx >= 0 ? panels[idx] : null;
  const prev = idx > 0 ? panels[idx - 1] : null;
  const next = idx >= 0 && idx < panels.length - 1 ? panels[idx + 1] : null;
  return (
    <Deck.Provider value={open}>
      {children}
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="sheet"
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        onClose={() => opener.current?.focus?.()}
      >
        <span aria-hidden="true" className="mx-auto mt-2 block h-1 w-10 shrink-0 rounded-full bg-border-strong" />
        <div className="flex items-start gap-3 px-4 pb-2 pt-2">
          <div className="min-w-0 flex-1 pt-2.5">
            <h2 id={titleId} className="text-lede font-semibold text-ink">
              {p?.title}
            </h2>
            {p?.subtitle && <p className="mt-0.5 text-note text-secondary">{p.subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted transition-colors hover:text-ink"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {p?.content}
        </div>
        {p && panels.length > 1 && (
          <nav aria-label="Other players" className="grid grid-cols-2 gap-2 border-t border-border px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2">
            <PageButton panel={prev} dir="prev" onGo={() => setIdx(idx - 1)} />
            <PageButton panel={next} dir="next" onGo={() => setIdx(idx + 1)} />
          </nav>
        )}
      </dialog>
    </Deck.Provider>
  );
}

function PageButton({ panel, dir, onGo }) {
  if (!panel) return <span />;
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onGo}
      className={cn(
        "flex min-h-11 min-w-0 items-center gap-1 rounded-control bg-surface-2 px-3 text-note font-semibold text-ink transition-colors hover:bg-elevated",
        dir === "next" && "justify-end text-right",
      )}
    >
      {dir === "prev" && <Icon size={16} aria-hidden="true" className="shrink-0" />}
      <span className="min-w-0">
        <span className="sr-only">{dir === "prev" ? "Previous: " : "Next: "}</span>
        {panel.title}
      </span>
      {dir === "next" && <Icon size={16} aria-hidden="true" className="shrink-0" />}
    </button>
  );
}

/** Opens one player's panel in the deck. Children are its visible face. */
export function DeckTrigger({ playerId, label, className, children }) {
  const open = useContext(Deck);
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={label}
      onClick={(e) => open?.(playerId, e.currentTarget)}
      className={cn("block w-full text-left", className)}
    >
      {children}
    </button>
  );
}
