import { CornerDownRight, Hourglass, Lock } from "lucide-react";
import { actionView, winCompare } from "@/lib/lockin/matchupView";
import { LocalWhen } from "./LocalWhen";

/**
 * Win chance if he is locked and if he is held: "Win chance: lock 28% · hold 19%".
 * Information beside the lean, which rests on points (lean.leanBasis): neither side is
 * marked as the model's. When the two disagree, the engine's reason follows.
 */
export function WinFigures({ card, winProb, showReason = true }) {
  const w = winCompare(card, winProb);
  if (!w) return null;
  return (
    <div data-win-compare>
      <p className="text-note text-muted">
        Win chance: lock <span className="figure text-body font-bold text-ink">{w.lockPct}</span> <span className="text-secondary">·</span> hold{" "}
        <span className="figure text-body font-bold text-ink">{w.holdPct}</span>
      </p>
      {showReason && w.disagree && <p className="mt-1 text-note text-ink">{w.disagree}</p>}
    </div>
  );
}

const ICON = { lock_now: Lock, wait: Hourglass, hold: Hourglass };

/**
 * The model's call: "Lock now", "Wait until Fri 7:30 PM EST" (with why that time), or
 * "Hold"; for a wait, the conditions that would change it, as the engine words them.
 */
export function ModelCall({ card }) {
  const v = actionView(card);
  if (!v) return null;
  const Icon = ICON[v.action];
  return (
    <div data-model-call={v.action}>
      <p className="text-meta text-secondary">{card.lean?.conditional ? "The model's call, if not already locked" : "The model's call"}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-lede font-bold text-ink">
        <Icon size={18} aria-hidden="true" className="shrink-0 text-accent-text" />
        <span>
          {v.title}
          {v.whenIso && (
            <>
              {" "}
              <LocalWhen at={v.whenIso} fallback={v.whenFallback} />
            </>
          )}
        </span>
      </p>
      {v.reason && <p className="mt-0.5 text-note text-muted">Deadline: {v.reason}.</p>}
      {v.triggers.length > 0 && (
        <ul className="mt-1.5 space-y-1" aria-label="What would change the call">
          {v.triggers.map((t) => (
            <li key={t.text} className="flex gap-1.5 text-note text-ink">
              <CornerDownRight size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-secondary" />
              <span>{t.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
