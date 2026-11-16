import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/ui";
import { SLOT_STATES, basisText, decisionNumbers, fmt, gamesLeftText, pct, slotStateKey } from "@/lib/lockin/view";
import { StateIcon } from "./StateIcon";
import { LeanLine } from "./LeanLine";
import { PlayerDetail } from "./PlayerDetail";

function Who({ card }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {card.slotLabel && <span className="font-mono text-micro font-semibold text-faint">{card.slotLabel}</span>}
      <h3 className="font-display text-lede font-semibold leading-tight text-ink">{card.name}</h3>
      <span className="text-micro text-muted">
        {[card.team, card.positions.join("/")].filter(Boolean).join(" · ") || "team unknown"}
        {card.role === "bench" ? " · bench" : ""}
      </span>
      {card.injury?.status && (
        <span className="rounded-full border border-negative-edge bg-negative-wash px-2 py-0.5 text-micro font-medium text-negative">
          {card.injury.status}
          {card.injury.bodyPart ? ` (${card.injury.bodyPart})` : ""}
        </span>
      )}
    </div>
  );
}

function slotKeyOf(card) {
  if (!card.lockState) return null;
  return slotStateKey({ playerId: card.playerId, lockState: card.lockState.state, lockStateReason: card.lockState.reason });
}

function Num({ label, value, sub }) {
  return (
    <div className="min-w-0">
      <dt className="text-micro leading-tight text-muted">{label}</dt>
      <dd className="figure mt-0.5 text-lede font-semibold leading-tight text-ink">{value}</dd>
      {sub && <dd className="text-micro leading-tight text-faint">{sub}</dd>}
    </div>
  );
}

function Detail({ card, today, open }) {
  return (
    <details className="group mt-2 border-t border-border" open={open}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-meta font-semibold text-muted hover:text-accent-text">
        Charts and history
        <ChevronRight size={12} aria-hidden="true" className="disclosure-chevron shrink-0 group-open:rotate-90" />
      </summary>
      <PlayerDetail card={card} today={today} />
    </details>
  );
}

/** A live card: a hazard or a lock-or-hold decision. */
export function DecisionCard({ card, record, today, open = false, methodHref }) {
  const n = decisionNumbers(card);
  const key = slotKeyOf(card);
  return (
    <article id={`lk-${card.playerId}`} className={cn("card-lit scroll-mt-4 rounded-[var(--radius)] border bg-surface p-3", card.hazards.length ? "border-warn-edge" : "border-border")}>
      {card.hazards.map((h) => (
        <p key={h.code} className="mb-2 flex gap-2 rounded-[var(--radius-sm)] border border-warn-edge bg-warn-wash px-2 py-1.5 text-meta leading-snug text-ink">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="mt-0.5 shrink-0 text-warn">
            <path d="M7 1.5l5.8 10.5H1.2z" fill="currentColor" />
            <rect x="6.3" y="5" width="1.4" height="3.8" fill="var(--color-bg)" />
            <rect x="6.3" y="9.6" width="1.4" height="1.4" fill="var(--color-bg)" />
          </svg>
          <span>{h.text}</span>
        </p>
      ))}
      <Who card={card} />
      <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
        <p className="figure font-display text-display font-semibold leading-none text-ink">{card.banked == null ? "-" : fmt(card.banked)}</p>
        <p className="pb-0.5 text-meta leading-tight text-muted">
          on the table
          {key && (
            <span className="mt-0.5 flex items-center gap-1 text-ink">
              <StateIcon state={key} /> {SLOT_STATES[key].label}
            </span>
          )}
        </p>
      </div>
      <p className="mt-2 text-meta leading-snug text-ink">
        {gamesLeftText(card)}
        {card.decision.deadlineText ? <span className="text-muted">. Decide {card.decision.deadlineText}.</span> : null}
      </p>
      {n && (
        <dl className="mt-3 grid grid-cols-3 gap-2 rounded-[var(--radius-sm)] bg-surface-2 p-2">
          <Num label="Expected if held" value={fmt(n.held)} sub={n.listedOut ? "listed out next game" : null} />
          <Num label="Later game beats it, if he plays" value={pct(n.pIfPlays)} sub={`${n.k} ${n.k === 1 ? "game" : "games"} left`} />
          <Num label="Next game, 8 in 10" value={n.range ? `${fmt(n.range.p10)}-${fmt(n.range.p90)}` : "unknown"} />
        </dl>
      )}
      {card.forecast && <p className="mt-1.5 text-micro text-faint">Forecast {basisText(card.forecast)}.</p>}
      <LeanLine lean={card.lean} record={record} methodHref={methodHref} />
      <Detail card={card} today={today} open={open} />
    </article>
  );
}

/** A lineup call or a player with nothing to decide: one compact row, charts on demand. */
export function QuietCard({ card, today, open = false }) {
  const key = slotKeyOf(card);
  const fc = card.forecast;
  return (
    <article id={`lk-${card.playerId}`} className="scroll-mt-4 rounded-[var(--radius)] border border-border bg-surface px-3 pt-2.5">
      <div className="flex items-start justify-between gap-3">
        <Who card={card} />
        {card.banked != null && <span className="figure shrink-0 text-lede font-semibold text-ink">{fmt(card.banked)}</span>}
      </div>
      {key && (
        <p className="mt-1 flex items-center gap-1 text-micro text-muted">
          <StateIcon state={key} /> {SLOT_STATES[key].label}
        </p>
      )}
      <p className="mt-1 text-meta leading-snug text-ink">
        {card.decision.kind === "none" ? card.decision.text : gamesLeftText(card)}
        {card.decision.kind === "lineup" && <span className="text-muted">. {card.decision.text}.</span>}
      </p>
      {card.decision.kind === "lineup" && fc && fc.basis !== "league-prior" && (
        <p className="mt-0.5 text-micro text-muted">
          Next game, 8 in 10: <span className="figure text-ink">{fmt(fc.range.p10)}-{fmt(fc.range.p90)}</span> ({basisText(fc)})
        </p>
      )}
      <Detail card={card} today={today} open={open} />
    </article>
  );
}
