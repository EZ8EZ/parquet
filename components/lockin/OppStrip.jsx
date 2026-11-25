import { Check, Lock, PencilLine, RotateCcw } from "lucide-react";
import { cn } from "@/lib/ui";
import { fmt } from "@/lib/lockin/view";
import { AssumeTile } from "./AssumeTile";

/**
 * The opponent's seven slots, one quiet row under yours in the same column grid: the
 * score with the same in-tile state glyphs (lock, check, reset), blue when locked, a
 * dot before his game, a dash for an empty slot. Spans only: it sits inside the
 * opponent sheet's trigger, which carries the spoken summary.
 */
function Face({ s, label = false }) {
  return (
    <span
      data-slot-state={s.key}
      data-assumed={s.assumed ?? undefined}
      className={cn(
        "flex h-7 min-w-0 items-center justify-center gap-px rounded-control figure text-meta font-semibold",
        s.assumed ? "bg-surface-2 text-ink outline-1 -outline-offset-1 outline-dashed outline-secondary" : s.key === "locked" ? "bg-them-wash text-info" : s.key === "final" ? "bg-elevated text-ink" : s.key === "empty" ? "bg-bg text-faint" : "text-muted",
      )}
    >
      {s.assumed && <PencilLine size={10} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-secondary" />}
      {!s.assumed && s.key === "locked" && <Lock size={10} strokeWidth={2.5} aria-hidden="true" className="shrink-0" />}
      {s.key === "final" && <Check size={10} strokeWidth={3} aria-hidden="true" className="shrink-0" />}
      {s.key === "reset" && <RotateCcw size={10} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-faint" />}
      {label && <span className="sr-only">Their {s.label} </span>}
      {s.assumedScore != null ? fmt(s.assumedScore) : s.key === "yet" ? "·" : s.key === "empty" ? "—" : s.banked == null ? "—" : fmt(s.banked)}
      {label && (
        <span className="sr-only">
          : {s.name ?? "empty"}, {s.assumed ? `you assumed ${s.assumed === "locked" ? "locked" : "playing on"}` : s.stateLong ?? s.key}
        </span>
      )}
    </span>
  );
}

/**
 * The opponent's seven slots, one quiet row under yours in the same column grid: the
 * score with the same in-tile state glyphs, blue when locked, a dot before his game, a
 * dash for an empty slot. A slot the viewer can make an assumption about is a button
 * that opens the what-if choice (with a dashed outline and pencil once assumed).
 */
export function OppStrip({ slots }) {
  return (
    <span className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${slots.length || 7}, minmax(0, 1fr))` }}>
      {slots.map((s) =>
        s.choices ? (
          <AssumeTile key={s.index} tile={{ ...s, side: "theirs" }} hint="What if">
            {/* the button's name is the score it prints, framed by sr-only words (WCAG 2.5.3) */}
            <Face s={s} label />
          </AssumeTile>
        ) : (
          <Face key={s.index} s={s} />
        ),
      )}
    </span>
  );
}
