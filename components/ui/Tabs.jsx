"use client";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/ui";
import { useRail } from "./useRail";

/**
 * Tabs within a page. `items` = [{ id, label, count?, content }], content rendered
 * on the server and passed in. Inactive panels are `hidden`, so they cost no reading
 * and no layout. Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern).
 * `variant="segmented"` draws the pill control; the default is an underline bar.
 * `onChange(id)` reports a switch (for a URL or a parent); `value` makes it
 * controlled. A tab's `count` is printed in a small pill beside its label.
 */
export function Tabs({ items, label, defaultId, value, onChange, variant = "underline", className, panelClassName }) {
  const [inner, setInner] = useState(defaultId ?? items[0]?.id);
  const active = value ?? inner;
  const setActive = (id) => {
    setInner(id);
    onChange?.(id);
  };
  const base = useId();
  const tabRefs = useRef([]);
  const [railRef, railStyle] = useRail(active);

  const onKeyDown = (e, i) => {
    const last = items.length - 1;
    const next =
      e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next == null) return;
    e.preventDefault();
    setActive(items[next].id);
    tabRefs.current[next]?.focus();
  };

  const seg = variant === "segmented";
  return (
    <div className={className}>
      <div
        ref={railRef}
        role="tablist"
        aria-label={label}
        className={cn(
          "no-scrollbar relative flex overflow-x-auto",
          seg ? "gap-1 rounded-full bg-surface p-1" : "gap-5 border-b border-border",
        )}
        style={railStyle}
      >
        {items.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => (tabRefs.current[i] = el)}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              data-active={selected ? "true" : undefined}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-note font-semibold transition-colors",
                seg
                  ? cn("flex-[1_0_0%] rounded-full px-3", selected ? "bg-elevated text-ink" : "text-secondary hover:text-ink")
                  : cn(
                      "-mb-px shrink-0 border-b-2 px-0.5",
                      selected ? "border-accent text-ink" : "border-transparent text-secondary hover:text-ink",
                    ),
              )}
            >
              {t.label}
              {t.count != null && (
                <span
                  className={cn(
                    "rounded-full px-1.5 figure text-micro",
                    selected ? "bg-accent-wash text-accent-text" : "bg-surface-2 text-secondary",
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {items.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={t.id !== active}
          className={cn("tab-panel pt-3", panelClassName)}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
