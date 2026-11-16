import { AlertTriangle, ChevronRight } from "lucide-react";
import { Card, Chip } from "@/components/ui";
import { playerSubtitle } from "@/lib/lockin/view";
import { DecisionFigures, Hazards, LeanChip, WhenLine } from "./Decision";
import { DeckTrigger } from "./PlayerDeck";

/** The live decision: who, the figures side by side, the lean, and the player's sheet one tap away. */
export function DecisionHero({ card }) {
  return (
    <Card pad="sm" as="article" id={`lk-${card.playerId}`} className="scroll-mt-20 space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-lede font-semibold text-ink">{card.name}</h3>
        <span className="text-meta text-secondary">{playerSubtitle(card)}</span>
        {card.injury?.status && (
          <Chip tone="negative" size="sm" icon={AlertTriangle}>
            {card.injury.status}
          </Chip>
        )}
      </div>
      <Hazards card={card} />
      <DecisionFigures card={card} />
      <LeanChip lean={card.lean} />
      <WhenLine card={card} />
      <DeckTrigger playerId={card.playerId} label={`${card.name}: charts, record and method. Show details`} className="-mx-3 -mb-3 rounded-b-card border-t border-border">
        <span className="flex min-h-12 items-center justify-between px-3 text-note font-semibold text-accent-text">
          Charts, record and method
          <ChevronRight size={18} aria-hidden="true" />
        </span>
      </DeckTrigger>
    </Card>
  );
}
