import { cn } from "@/lib/ui";
import { fmt } from "@/lib/lockin/view";
import { StateIcon } from "./StateIcon";

/**
 * The opponent's seven slots as a compact strip mirroring yours: label, banked score
 * and the same state shapes. Not interactive itself; it sits inside the opponent
 * sheet's trigger, so it is spans only.
 */
export function OppStrip({ slots }) {
  return (
    <span className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${slots.length || 7}, minmax(0, 1fr))` }}>
      {slots.map((s) => (
        <span key={s.index} className={cn("flex h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-control", s.key === "locked" || s.key === "final" ? "bg-surface-2" : "bg-bg")}>
          <span className="text-micro font-semibold text-secondary">{s.label}</span>
          <span className="flex items-center gap-0.5">
            <span className={s.key === "locked" ? "text-info" : "text-muted"}>
              <StateIcon state={s.key} className="size-3" />
            </span>
            <span className={cn("figure text-micro font-bold leading-none", s.banked ? "text-ink" : "text-muted")}>{s.banked == null ? "-" : fmt(s.banked)}</span>
          </span>
        </span>
      ))}
    </span>
  );
}
