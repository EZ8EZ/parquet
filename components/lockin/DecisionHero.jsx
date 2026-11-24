import { AlertTriangle, ChevronRight } from "lucide-react";
import { Card, Chip } from "@/components/ui";
import { decisionNumbers, fmt, playerSubtitle } from "@/lib/lockin/view";
import { winCompare } from "@/lib/lockin/matchupView";
import { DecisionFigures, Hazards, LeanChip, WhenLine } from "./Decision";
import { DeckTrigger } from "./PlayerDeck";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { ModelCall, WinFigures, WinGain } from "./WinCall";
import { ProfileBar } from "./ProfileBar";
import { AvailabilityDots } from "./AvailabilityDots";

/** The points figures in one line, for Home when the win chances lead the card. */
function PointsLine({ card }) {
  const n = decisionNumbers(card);
  if (!n) return null;
  return (
    <p className="text-note text-muted">
      On the table <span className="figure font-bold text-ink">{fmt(n.x)}</span> · Expected if held <span className="figure font-bold text-ink">{fmt(n.held)}</span>
      {n.listedOut ? " (listed out next game)" : ""}
    </p>
  );
}

/**
 * The live decision: who, the model's call, lock vs hold in win chance, the points
 * figures, the lean, the boom/bust profile and his chance to play, and the player's
 * sheet one tap away. `compact` (Home) prints the points figures as one line when the
 * win chances are there.
 */
export function DecisionHero({ card, winProb = null, compact = false }) {
  const head = !!winCompare(card, winProb);
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
      <ModelCall card={card} />
      <WinFigures card={card} winProb={winProb} compact={compact} />
      {compact && head ? <PointsLine card={card} /> : <DecisionFigures card={card} />}
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* the model's call above already says "if not already locked" */}
        <LeanChip lean={card.lean} hideConditional={!!card.decision?.action} />
        <WinGain card={card} winProb={winProb} />
      </span>
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
