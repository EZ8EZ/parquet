import { cn } from "@/lib/ui";
import { SLOT_STATES, fmt, slotStateKey } from "@/lib/lockin/view";
import { StateIcon } from "./StateIcon";
import { DeckTrigger } from "./PlayerDeck";

const SETTLED = new Set(["locked", "final"]);

/** The seven slots as seven tappable cells: label, banked score, state shape. Tap opens the player. */
export function SlotCells({ slots }) {
  const keys = slots.map(slotStateKey);
  return (
    <div>
      <ol aria-label="Your starting slots this week" className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${slots.length || 7}, minmax(0, 1fr))` }}>
        {slots.map((s, i) => {
          const key = keys[i];
          const face = (
            <span className={cn("flex h-[72px] min-w-0 flex-col items-center justify-between rounded-control py-1.5", SETTLED.has(key) ? "bg-surface-2" : "bg-surface")}>
              <span className="text-meta font-semibold text-secondary">{s.label}</span>
              <span className={cn("figure font-bold leading-none", s.banked ? "text-body text-ink" : "text-meta text-muted")}>{s.banked == null ? "-" : fmt(s.banked)}</span>
              <span className={key === "locked" ? "text-accent-text" : "text-muted"}>
                <StateIcon state={key} />
              </span>
            </span>
          );
          // Starts with the visible text ("PG 31.0") so speech input can target it (WCAG 2.5.3).
          const spoken = `${s.label} ${s.banked == null ? "-" : fmt(s.banked)}: ${s.name ?? "empty"}, ${SLOT_STATES[key].long}`;
          return (
            <li key={s.index} className="min-w-0">
              {s.playerId ? (
                <DeckTrigger playerId={s.playerId} label={`${spoken}. Show details`} className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  {face}
                </DeckTrigger>
              ) : (
                <span role="img" aria-label={spoken}>
                  {face}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <ul aria-hidden="true" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-meta text-secondary">
        {[...new Set(keys)].map((k) => (
          <li key={k} className="flex items-center gap-1">
            <StateIcon state={k} /> {SLOT_STATES[k].label}
          </li>
        ))}
      </ul>
    </div>
  );
}
