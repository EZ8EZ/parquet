import { AlertTriangle, Hourglass, Lock } from "lucide-react";
import { Chip } from "@/components/ui";
import { SLOT_STATES, decisionNumbers, fmt, gamesLeftText, leanView, pct, remainingGames, slotStateKey } from "@/lib/lockin/view";
import { Opp } from "./Opp";
import { DEFAULT_TZ, decideBy } from "@/lib/lockin/time";
import { heldNote } from "@/lib/lockin/matchupView";
import { StateIcon } from "./StateIcon";

export function slotKeyOf(card) {
  if (!card.lockState) return null;
  return slotStateKey({ playerId: card.playerId, lockState: card.lockState.state, lockStateReason: card.lockState.reason });
}

/**
 * The model's lean as a chip, always named as the model's: lock is violet with a lock
 * (an action that is yours to take), hold is a neutral outline with an hourglass. The
 * confidence is the second word, never a colour. `short` ("Model: lock · clear") is for
 * dense rows. A conditional lean says "If not already locked" unless the caller says it once
 * for the whole list.
 */
export function LeanChip({ lean, hideConditional = false, short = false, size = "md", prefix = null }) {
  const v = leanView(lean);
  if (!v) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1" data-lean={v.value}>
      {v.conditional && !hideConditional && <span className="text-meta text-secondary">If not already locked</span>}
      <Chip tone={v.value === "lock" ? "accent" : "outline"} icon={v.value === "lock" ? Lock : Hourglass} size={size}>
        {prefix ? `${prefix} model leans` : short ? "Model:" : "Model leans"} {v.value} <span className="font-medium opacity-90">· {v.confidence}</span>
      </Chip>
    </span>
  );
}

export function Hazards({ card }) {
  if (!card.hazards.length) return null;
  return card.hazards.map((h) => (
    <p key={h.code} className="flex gap-2 rounded-control bg-warn-wash px-3 py-2 text-note text-ink">
      <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
      <span>{h.text}</span>
    </p>
  ));
}

function Tile({ label, value, sub }) {
  return (
    <div className="min-w-0 rounded-control bg-surface-2 p-3">
      <p className="text-meta font-medium text-secondary">{label}</p>
      <p className="mt-1 figure text-display font-bold tracking-tight text-ink">{value}</p>
      {sub && <div className="mt-0.5 text-meta text-muted">{sub}</div>}
    </div>
  );
}

function Pair({ label, value, sub }) {
  return (
    <div className="min-w-0">
      <p className="text-meta text-secondary">{label}</p>
      <p className="figure text-lede font-bold text-ink">{value}</p>
      {sub && <p className="text-meta text-muted">{sub}</p>}
    </div>
  );
}

/**
 * The decision's figures: score on the table and expected-if-held side by side at
 * display size, then the chance a later game beats it (if he plays) and the next-game
 * range. Without a lock-or-hold decision: the banked score and its state only.
 */
export function DecisionFigures({ card }) {
  const n = decisionNumbers(card);
  const key = slotKeyOf(card);
  const state = key ? (
    <span className="inline-flex items-center gap-1">
      <StateIcon state={key} /> {SLOT_STATES[key].label}
    </span>
  ) : null;
  if (!n) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Tile label={card.role === "bench" ? "Bench" : "In his slot"} value={card.banked == null || key === "yet" ? "—" : fmt(card.banked)} sub={state} />
        <Tile label="Games left" value={card.gamesLeft} sub={card.nextGame ? <>next {card.nextGame.day} <Opp team={card.nextGame.opponent} away={card.nextGame.away} /></> : "none this week"} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="On the table" value={fmt(n.x)} sub={state} />
        <Tile label="Expected if held" value={fmt(n.held)} sub={heldNote(card) ? `(${heldNote(card)})` : n.listedOut ? "listed out next game" : `${n.k} ${n.k === 1 ? "game" : "games"} left`} />
      </div>
      <div className="grid grid-cols-2 gap-3 px-1">
        <Pair label="Later game beats it" value={pct(n.pIfPlays)} sub="if he plays" />
        <Pair label="Next game, 8 in 10" value={n.range ? `${fmt(n.range.p10)}-${fmt(n.range.p90)}` : "unknown"} sub={`n=${n.n} games`} />
      </div>
    </div>
  );
}

/** "1 game left: Sun vs SAC · decide before his next game tonight." */
export function WhenLine({ card, tipAt = null, tz = DEFAULT_TZ, nowMs = null }) {
  const left = remainingGames(card);
  // the move is asked for by the decide-by time (DECIDE_BUFFER_MIN before the tip), tip kept visible
  const db = tipAt ? decideBy(tipAt, tz, { nowMs }) : null;
  const decide = db ? (db.passed ? `Decide now (tips ${db.tipText})` : `Decide by ${db.byText} (tips ${db.tipText})`) : null;
  return (
    <p className="text-note text-muted">
      {left.length ? (
        <>
          {left.length} {left.length === 1 ? "game" : "games"} left:{" "}
          {left.map((g, i) => (
            <span key={g.date}>
              {i > 0 ? ", " : ""}
              {g.day} <Opp team={g.opponent} away={g.away} />
            </span>
          ))}
        </>
      ) : (
        gamesLeftText(card)
      )}
      {/* One deadline per player: with the engine's own deadline (shown by the model's
          call above), the older "Decide before his next game" sentence is left out. */}
      {card.decision.kind === "lock_or_hold" && card.decision.deadlineText && !(card.decision.deadline && card.decision.action) ? (decide ? `. ${decide}.` : `. Decide ${card.decision.deadlineText}.`) : "."}
    </p>
  );
}
