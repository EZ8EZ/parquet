import { AlertTriangle, ChevronRight, CornerDownRight, Hourglass, Lock } from "lucide-react";
import { Chip } from "@/components/ui";
import { cn } from "@/lib/ui";
import { decisionNumbers, distChart, fmt, pct, playerSubtitle } from "@/lib/lockin/view";
import { Hazards, LeanChip } from "./Decision";
import { heldNote } from "@/lib/lockin/matchupView";
import { DeckTrigger } from "./PlayerDeck";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { NextGameChart } from "./NextGameChart";
import { SlotRivals } from "./SlotRivals";
import { ProfileBar } from "./ProfileBar";
import { AvailabilityDots } from "./AvailabilityDots";
import { WinPair } from "./CallList";

/** How far the projected margin is from the line that would flip the call (both on one track). */
function TriggerGauge({ t }) {
  if (t.threshold == null || t.lead == null || t.threshold <= 0 || t.lead < 0) return null;
  const max = Math.max(t.threshold, t.lead) * 1.25 || 1;
  const at = (v) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  return (
    <span className="mt-1.5 block" aria-hidden="true">
      <span className="relative block h-1.5 rounded-full bg-elevated">
        <span className="absolute -inset-y-1 w-0.5 rounded-full bg-ink" style={{ left: at(t.threshold) }} />
        <span className="absolute -top-[3px] size-3 -translate-x-1/2 rounded-full bg-them ring-2 ring-surface" style={{ left: at(t.lead) }} />
      </span>
      <span className="mt-1 flex justify-between text-micro text-secondary">
        <span>their lead now {t.lead}</span>
        <span>flips at {t.threshold}</span>
      </span>
    </span>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className="min-w-0 rounded-control bg-surface-2 p-2.5">
      <p className="text-micro leading-tight text-secondary">{label}</p>
      <p className="mt-1 figure text-lede font-bold text-ink">{value}</p>
      {sub && <p className="text-micro text-faint">{sub}</p>}
    </div>
  );
}

/**
 * A lock-or-hold card on the lock board. The call leads, in a banner: the headline with
 * its decide-by time ("Wait until 7:20 PM, then lock · locks at 7:30"), the model's lean
 * (from points, with an "At the deadline:" prefix under a wait), why that deadline, and
 * what would change the call with a gauge from the current margin to the flip. Then the
 * picture that explains the lean (his next game's outcomes against the score on the
 * table), three figures, the rough win chances, boom/bust and his chance to play, and
 * the player's sheet one tap away. `row` is this card's callRows entry.
 */
export function DecisionHero({ card, row, winProb = null }) {
  void winProb;
  const n = decisionNumbers(card);
  const dist = distChart(card);
  const lockLean = card.lean?.value === "lock";
  const Icon = row?.action === "lock_now" ? Lock : Hourglass;
  return (
    <article id={`lk-${card.playerId}`} className="scroll-mt-20 rounded-card bg-surface p-3.5" data-call={row?.action ?? "none"}>
      <div className="flex items-start gap-3">
        <PlayerAvatar name={card.name} team={card.team} playerId={card.playerId} size="md" decorative />
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lede font-semibold text-ink">
            {card.name}
            {card.injury?.status && (
              <Chip tone={/^out/i.test(card.injury.status) ? "negative" : "warn"} size="sm" icon={AlertTriangle}>
                {card.injury.status}
              </Chip>
            )}
          </h3>
          <p className="text-meta text-secondary">{playerSubtitle(card)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="figure text-display font-bold text-ink">{n ? fmt(n.x) : card.banked == null ? "—" : fmt(card.banked)}</p>
          <p className="text-micro text-secondary">on the table</p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <Hazards card={card} />
      </div>

      {row && (
        <div className={cn("mt-3 rounded-control p-3", lockLean ? "bg-accent-wash ring-1 ring-inset ring-accent-edge" : "bg-surface-2 ring-1 ring-inset ring-border-strong")} data-model-call={row.action}>
          <p className="text-micro text-secondary">{row.conditional ? "The model's call, if not already locked" : "The model's call"}</p>
          <p className={cn("mt-0.5 flex items-start gap-1.5 text-lede font-bold", row.urgent ? "text-warn" : "text-ink")}>
            <Icon size={18} aria-hidden="true" className={cn("mt-0.5 shrink-0", row.urgent ? "text-warn" : lockLean ? "text-accent-text" : "text-secondary")} />
            <span>{row.title}</span>
          </p>
          {row.lean && (
            <p className="mt-2">
              <LeanChip lean={row.lean} hideConditional prefix={row.leanPrefix} />
            </p>
          )}
          {/* when the points basis and win chance disagree the chip reads marginal; say why on the card */}
          {row.leanWhy && <p className="mt-1.5 text-meta text-muted" data-lean-why>{row.leanWhy}</p>}
          {row.reason && <p className="mt-2 text-meta text-muted">Deadline: {row.reason}.</p>}
          {row.triggers.length > 0 && (
            <ul className="mt-2 space-y-2" aria-label="What would change the call">
              {row.triggers.map((t) => (
                <li key={t.text} className="text-meta text-ink">
                  <span className="flex gap-1.5">
                    <CornerDownRight size={14} aria-hidden="true" className="mt-px shrink-0 text-secondary" />
                    <span>
                      {t.text}
                      {t.now && <span className="text-secondary"> ({t.now})</span>}
                    </span>
                  </span>
                  <TriggerGauge t={t} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {dist.ok && n && (
        <div className="mt-4">
          <p className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-note font-semibold text-ink">His next game vs {fmt(n.x)} now</span>
            <span className="text-micro text-secondary">{dist.n} equally likely outcomes</span>
          </p>
          <NextGameChart g={dist} />
        </div>
      )}

      {n && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Tile label="Expected if held" value={fmt(n.held)} sub={heldNote(card) ? `(${heldNote(card)})` : n.listedOut ? "listed out next game" : `${n.k} ${n.k === 1 ? "game" : "games"} left`} />
          <Tile label="Later game beats it" value={pct(n.pIfPlays)} sub="if he plays" />
          <Tile label="Next game, 8 in 10" value={n.range ? `${fmt(n.range.p10)}–${fmt(n.range.p90)}` : "unknown"} sub={`n=${n.n} games`} />
        </div>
      )}

      <SlotRivals card={card} className="mt-4 rounded-control bg-surface-2 p-3" />

      {row?.win && <WinPair win={row.win} className="mt-3" />}

      <div className="mt-3 space-y-2">
        {card.profile && <ProfileBar profile={card.profile} x={card.stopping?.x ?? null} compact />}
        <AvailabilityDots card={card} />
      </div>

      <DeckTrigger playerId={card.playerId} label={`${card.name}: charts, record and method. Show details`} className="-mx-3.5 -mb-3.5 mt-3 rounded-b-card border-t border-border">
        <span className="flex min-h-12 items-center justify-between px-3.5 text-note font-semibold text-accent-text">
          Charts, record and method
          <ChevronRight size={18} aria-hidden="true" />
        </span>
      </DeckTrigger>
    </article>
  );
}
