import { cn } from "@/lib/ui";
import { SLOT_STATES, fmt, slotStateKey } from "@/lib/lockin/view";
import { StateIcon } from "./StateIcon";

/** The seven slots as seven cells: label, banked score, state shape. Names in full on /lockin. */
export function SlotCells({ slots }) {
  return (
    <div>
      <ol aria-label="Your starting slots this week" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${slots.length || 7}, minmax(0, 1fr))` }}>
        {slots.map((s) => {
          const key = slotStateKey(s);
          const solid = key === "locked" || key === "final";
          return (
            <li
              key={s.index}
              className={cn(
                "flex h-[64px] min-w-0 flex-col items-center justify-between rounded-[var(--radius-sm)] border px-0.5 py-1",
                key === "locked" ? "border-accent-edge bg-surface" : solid ? "border-border-strong bg-surface" : "border-dashed border-border-strong",
              )}
            >
              <span className="sr-only">
                {s.label}: {s.name ?? "empty"}, {s.banked == null ? "" : `${fmt(s.banked)}, `}
                {SLOT_STATES[key].long}
              </span>
              <span aria-hidden="true" className="text-micro font-semibold uppercase tracking-wide text-secondary">
                {s.label}
              </span>
              <span aria-hidden="true" className={cn("figure font-semibold leading-none", s.banked ? "text-[15px] text-ink" : "text-micro text-muted")}>
                {s.banked == null ? "-" : fmt(s.banked)}
              </span>
              <span aria-hidden="true" className={key === "locked" ? "text-accent-text" : "text-muted"}>
                <StateIcon state={key} />
              </span>
            </li>
          );
        })}
      </ol>
      <ul aria-hidden="true" className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-micro text-muted">
        {[...new Set(slots.map(slotStateKey))].map((k) => (
          <li key={k} className="flex items-center gap-1">
            <StateIcon state={k} /> {SLOT_STATES[k].label}
          </li>
        ))}
      </ul>
    </div>
  );
}
