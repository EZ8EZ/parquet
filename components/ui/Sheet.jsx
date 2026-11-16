"use client";
import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/ui";

/**
 * Bottom sheet: detail on tap. The trigger is a full-width button around `trigger`
 * (pass a ListRow with as="span"). The panel is a native modal <dialog>, so the page
 * behind is inert, focus stays inside, Escape closes, and focus returns to the
 * trigger. Backdrop tap and the close button also dismiss. Children mount on first
 * open, so a list of sheets costs no DOM until used. Motion: globals.css `.sheet`.
 * `footer` (alias `actions`) pins a row of buttons under the scrolling body;
 * `leading` puts an avatar beside the title.
 *
 * Open state: uncontrolled by default (the trigger opens it). `defaultOpen` opens it
 * on mount, e.g. for a deep link such as /values?focus=<id>. `open` + `onOpenChange`
 * make it controlled; every dismissal path (Escape, backdrop, close button) reports
 * `onOpenChange(false)` and the trigger reports `onOpenChange(true)`. Without a
 * `trigger` the sheet is opened only through `open` (several triggers elsewhere, e.g.
 * components/lockin/PlayerDeck).
 */
export function Sheet({
  trigger,
  triggerLabel,
  triggerClassName,
  title,
  subtitle,
  leading,
  children,
  footer,
  actions,
  open,
  defaultOpen = false,
  onOpenChange,
}) {
  const foot = footer ?? actions;
  const ref = useRef(null);
  const [inner, setInner] = useState(defaultOpen);
  const isOpen = open ?? inner;
  // Children mount on first open and stay mounted (so a reopen keeps its state).
  const [opened, setOpened] = useState(isOpen);
  const titleId = useId();

  const request = (next) => {
    if (open === undefined) setInner(next);
    onOpenChange?.(next);
  };
  const show = () => request(true);
  const close = () => ref.current?.close();

  // The <dialog> follows the state; showModal only exists after mount.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (isOpen && !d.open) {
      setOpened(true);
      d.showModal();
    } else if (!isOpen && d.open) {
      d.close();
    }
  }, [isOpen]);

  return (
    <>
      {trigger != null && (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={triggerLabel}
          onClick={show}
          className={cn("block w-full text-left", triggerClassName)}
        >
          {trigger}
        </button>
      )}
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="sheet"
        onClose={() => {
          if (isOpen) request(false);
        }}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <span aria-hidden="true" className="mx-auto mt-2 block h-1 w-10 shrink-0 rounded-full bg-border-strong" />
        <div className="flex items-start gap-3 px-4 pb-2 pt-2">
          {leading && <div className="shrink-0 pt-2">{leading}</div>}
          <div className="min-w-0 flex-1 pt-2.5">
            <h2 id={titleId} className="text-lede font-semibold text-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-note text-secondary">{subtitle}</p>}
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
        {/* A focusable, labelled scroll region: keyboard users can scroll it even when the
            content has nothing focusable (axe scrollable-region-focusable). */}
        <div
          role="region"
          aria-labelledby={titleId}
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          {opened && children}
        </div>
        {foot && opened && (
          <div className="flex flex-wrap gap-2 border-t border-border px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            {foot}
          </div>
        )}
      </dialog>
    </>
  );
}
