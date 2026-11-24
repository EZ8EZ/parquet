import { CornerDownRight, Hourglass, Lock } from "lucide-react";
import { actionView, winCompare } from "@/lib/lockin/matchupView";
import { LocalWhen } from "./LocalWhen";

/**
 * Lock vs hold in win chance, side by side: "Lock 76% to win · Hold 71%". The side the
 * model leans to is marked with a word ("model leans"), not colour alone.
 */
export function WinFigures({ card, winProb, compact = false }) {
  const w = winCompare(card, winProb);
  if (!w) return null;
  if (compact) {
    const fig = (key, label, value) => (
      <span className={w.leaned === key ? "text-ink" : "text-muted"}>
        {label} <span className={`figure font-bold ${w.leaned === key ? "text-ink" : "text-muted"}`}>{value}</span>
        {key === "lock" ? " to win" : ""}
      </span>
    );
    return (
      <div data-win-compare>
        <p className="text-lede">
          {fig("lock", "Lock:", w.lockPct)} <span className="text-secondary">·</span> {fig("hold", "Hold:", w.holdPct)}
        </p>
        {w.disagree && <p className="mt-1 text-note text-ink">{w.disagree}</p>}
      </div>
    );
  }
  const side = (key, label, value) => (
    <div className={`min-w-0 rounded-control p-3 ${w.leaned === key ? "bg-accent-wash" : "bg-surface-2"}`}>
      <p className="text-meta font-medium text-secondary">
        {label}
        {w.leaned === key && <span className="text-accent-text"> · model leans</span>}
      </p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="figure text-display font-bold tracking-tight text-ink">{value}</span>
        <span className="text-meta text-muted">to win</span>
      </p>
    </div>
  );
  return (
    <div data-win-compare>
      <div className="grid grid-cols-2 gap-2">
        {side("lock", "If you lock", w.lockPct)}
        {side("hold", "If you hold", w.holdPct)}
      </div>
      {w.disagree && <p className="mt-2 text-note text-ink">{w.disagree}</p>}
    </div>
  );
}

/** "+5 pts of win chance", for beside the lean chip. */
export function WinGain({ card, winProb }) {
  const w = winCompare(card, winProb);
  if (!w) return null;
  return <span className="figure text-meta font-semibold text-muted">{w.gainText}</span>;
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
