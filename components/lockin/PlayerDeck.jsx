"use client";
import { createContext, useContext, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Sheet } from "@/components/ui";
import { cn } from "@/lib/ui";

/**
 * One controlled Sheet for every player on the board, with previous / next in its
 * footer so a manager can compare players without closing it. Triggers anywhere on
 * the board open it through context (DeckTrigger). Panels are rendered on the server
 * and passed in; only the open one is mounted. Focus returns to the trigger on close
 * (native modal <dialog>).
 */
const Deck = createContext(null);

export function PlayerDeck({ panels, initialOpen = null, children }) {
  const order = panels.map((p) => p.id);
  const [idx, setIdx] = useState(() => (initialOpen ? order.indexOf(initialOpen) : -1));
  const [isOpen, setOpen] = useState(() => idx >= 0);

  const open = (id) => {
    const i = order.indexOf(id);
    if (i < 0) return;
    setIdx(i);
    setOpen(true);
  };

  const p = idx >= 0 ? panels[idx] : null;
  const prev = idx > 0 ? panels[idx - 1] : null;
  const next = idx >= 0 && idx < panels.length - 1 ? panels[idx + 1] : null;
  return (
    <Deck.Provider value={open}>
      {children}
      <Sheet
        open={isOpen && !!p}
        onOpenChange={setOpen}
        title={p?.title}
        leading={p?.leading}
        subtitle={p?.subtitle}
        footer={
          p && panels.length > 1 ? (
            <nav aria-label="Other players" className="grid w-full grid-cols-2 gap-2">
              <PageButton panel={prev} dir="prev" onGo={() => setIdx(idx - 1)} />
              <PageButton panel={next} dir="next" onGo={() => setIdx(idx + 1)} />
            </nav>
          ) : null
        }
      >
        <div key={p?.id}>{p?.content}</div>
      </Sheet>
    </Deck.Provider>
  );
}

function PageButton({ panel, dir, onGo }) {
  if (!panel) return <span />;
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.currentTarget.closest("dialog")?.querySelector('[role="region"]')?.scrollTo?.(0, 0);
        onGo();
      }}
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

/** The deck's opener, for client components that open a player from elsewhere (null outside a deck). */
export function useDeck() {
  return useContext(Deck);
}

/**
 * Opens one player's panel in the deck. Children are its visible face, and they are
 * also its accessible name (no aria-label override, WCAG 2.5.3): context a listener
 * needs goes inside the face as sr-only text, and `hint` (usually "Show details") is
 * appended after it.
 */
export function DeckTrigger({ playerId, hint, className, children }) {
  const open = useContext(Deck);
  return (
    <button type="button" aria-haspopup="dialog" onClick={() => open?.(playerId)} className={cn("block w-full text-left", className)}>
      {children}
      {hint && <span className="sr-only">{hint}</span>}
    </button>
  );
}
