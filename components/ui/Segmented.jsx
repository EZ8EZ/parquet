"use client";
import { useId, useState } from "react";
import { cn } from "@/lib/ui";

/**
 * Segmented control: pick one value from two to four. Native radios underneath, so
 * arrow keys and screen readers work without extra code. Controlled (`value` +
 * `onChange`) or uncontrolled (`defaultValue`). To switch whole panels, use
 * <Tabs variant="segmented"> instead.
 */
export function Segmented({ options, value, defaultValue, onChange, label, className }) {
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value);
  const current = value ?? inner;
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("grid gap-1 rounded-full bg-surface p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const checked = o.value === current;
        return (
          <label
            key={o.value}
            className={cn(
              "relative flex min-h-11 cursor-pointer items-center justify-center rounded-full px-3 text-note font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-text",
              checked ? "bg-elevated text-ink" : "text-secondary hover:text-ink",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              onChange={() => {
                setInner(o.value);
                onChange?.(o.value);
              }}
              className="sr-only"
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
