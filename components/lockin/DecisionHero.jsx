import { AlertTriangle, ChevronRight } from "lucide-react";
import { Card, Chip } from "@/components/ui";
import { heldNote, roughen } from "@/lib/lockin/matchupView";
import { decisionNumbers, fmt, playerSubtitle } from "@/lib/lockin/view";
import { DecisionFigures, Hazards, LeanChip, WhenLine } from "./Decision";
import { DeckTrigger } from "./PlayerDeck";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { ModelCall, WinFigures, leanPrefix } from "./WinCall";
import { ProfileBar } from "./ProfileBar";
import { AvailabilityDots } from "./AvailabilityDots";

/** The points figures in one line, for Home. */
function PointsLine({ card }) {
  const n = decisionNumbers(card);
  if (!n) return null;
  return (
    <p className="text-note text-muted">
      On the table <span className="figure text-lede font-bold text-ink">{fmt(n.x)}</span> · Expected if held <span className="figure text-lede font-bold text-ink">{fmt(n.held)}</span>
      {heldNote(card) ? ` (${heldNote(card)})` : n.listedOut ? " (listed out next game)" : ""}
    </p>
  );
}

/**
 * The live decision: who, the model's call, the points figures and the lean (which
 * rests on points), win chance if locked and if held as information beside it, the
 * boom/bust profile and his chance to play, and the player's sheet one tap away.
 * `compact` (Home) prints the points figures as one line.
 */
export function DecisionHero({ card, winProb = null, compact = false, tz, today = null, nowMs }) {
  return (
    <Card pad="sm" as="article" id={`lk-${card.playerId}`} className="scroll-mt-20 space-y-3">
      <div className="flex items-center gap-3">
        <PlayerAvatar name={card.name} team={card.team} playerId={card.playerId} size="md" decorative />
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-lede font-semibold text-ink">{card.name}</h3>
          <span className="text-meta text-secondary">{playerSubtitle(card)}</span>
          {card.injury?.status && (
            <Chip tone="negative" size="sm" icon={AlertTriangle}>
              {card.injury.status}
            </Chip>
          )}
        </div>
      </div>
      <Hazards card={card} />
      <ModelCall card={card} tz={tz} today={today} nowMs={nowMs} />
      {compact ? <PointsLine card={card} /> : <DecisionFigures card={card} />}
      {/* on Home the model's call above already says "if not already locked" */}
      <LeanChip lean={card.lean} hideConditional={compact && !!card.decision?.action} prefix={leanPrefix(card)} />
      {/* when the points basis and win chance disagree the chip reads marginal; say why on the card */}
      {card.lean?.basisDisagrees && card.lean.reason && <p className="text-note text-muted" data-lean-why>{roughen(card.lean.reason).replace(/\.?$/, ".")}</p>}
      <WinFigures card={card} winProb={winProb} />
      {card.profile && <ProfileBar profile={card.profile} x={card.stopping?.x ?? null} compact={compact} />}
      <AvailabilityDots card={card} />
      {!(compact && card.decision?.action) && <WhenLine card={card} />}
      <DeckTrigger playerId={card.playerId} label={`${card.name}: charts, record and method. Show details`} className="-mx-3 -mb-3 rounded-b-card border-t border-border">
        <span className="flex min-h-12 items-center justify-between px-3 text-note font-semibold text-accent-text">
          Charts, record and method
          <ChevronRight size={18} aria-hidden="true" />
        </span>
      </DeckTrigger>
    </Card>
  );
}
