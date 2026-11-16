"use client";
import { useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/ui";

/**
 * Bottom sheet: detail on tap. The trigger is a full-width button around `trigger`
 * (pass a ListRow with as="span"). The panel is a native modal <dialog>, so the page
 * behind is inert, focus stays inside, Escape closes, and focus returns to the
 * trigger. Backdrop tap and the close button also dismiss. Children mount on first
 * open, so a list of sheets costs no DOM until used. Motion: globals.css `.sheet`.
 */
export function Sheet({ trigger, triggerLabel, triggerClassName, title, subtitle, children, footer }) {
  const ref = useRef(null);
  const [opened, setOpened] = useState(false);
  const titleId = useId();

  const show = () => {
    setOpened(true);
    ref.current?.showModal();
  };
  const close = () => ref.current?.close();

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={triggerLabel}
        onClick={show}
        className={cn("block w-full text-left", triggerClassName)}
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="sheet"
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <span aria-hidden="true" className="mx-auto mt-2 block h-1 w-10 shrink-0 rounded-full bg-border-strong" />
        <div className="flex items-start gap-3 px-4 pb-2 pt-2">
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          {opened && children}
        </div>
        {footer && opened && <div className="border-t border-border px-4 py-3">{footer}</div>}
      </dialog>
    </>
  );
}
