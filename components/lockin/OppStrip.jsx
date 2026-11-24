import { Check, Lock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/ui";
import { fmt } from "@/lib/lockin/view";

/**
 * The opponent's seven slots, one quiet row under yours in the same column grid: the
 * score with the same in-tile state glyphs (lock, check, reset), blue when locked, a
 * dot before his game, a dash for an empty slot. Spans only: it sits inside the
 * opponent sheet's trigger, which carries the spoken summary.
 */
export function OppStrip({ slots }) {
  return (
    <span className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${slots.length || 7}, minmax(0, 1fr))` }}>
      {slots.map((s) => (
        <span
          key={s.index}
          data-slot-state={s.key}
          className={cn(
            "flex h-7 min-w-0 items-center justify-center gap-px rounded-control figure text-meta font-semibold",
            s.key === "locked" ? "bg-them-wash text-info" : s.key === "final" ? "bg-elevated text-ink" : s.key === "empty" ? "border border-dashed border-border-strong text-faint" : "text-muted",
          )}
        >
          {s.key === "locked" && <Lock size={10} strokeWidth={2.5} aria-hidden="true" className="shrink-0" />}
          {s.key === "final" && <Check size={10} strokeWidth={3} aria-hidden="true" className="shrink-0" />}
          {s.key === "reset" && <RotateCcw size={10} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-faint" />}
          {s.key === "yet" ? "·" : s.key === "empty" ? "—" : s.banked == null ? "—" : fmt(s.banked)}
        </span>
      ))}
    </span>
  );
}
