import { AlertTriangle } from "lucide-react";
import { Chip, ListRow } from "@/components/ui";
import { SLOT_STATES, fmt, gamesLeftText, leanView } from "@/lib/lockin/view";
import { slotKeyOf } from "./Decision";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { StateIcon } from "./StateIcon";
import { DeckTrigger } from "./PlayerDeck";

/** One player as a list row; tapping opens his sheet. */
export function PlayerRow({ card }) {
  const key = slotKeyOf(card);
  const v = leanView(card.lean);
  const hazard = card.hazards[0];
  const line = hazard ? hazard.text : card.decision.kind === "none" ? card.decision.text : gamesLeftText(card);
  const state = key ? SLOT_STATES[key].label : "Bench";
  return (
    <li>
      <DeckTrigger playerId={card.playerId} hint="Show details">
        <ListRow
          as="span"
          chevron
          leading={card.slotLabel ?? "BN"}
          avatar={<PlayerAvatar name={card.name} team={card.team} playerId={card.playerId} size="sm" decorative />}
          title={card.name}
          badge={
            <>
              {card.injury?.status && (
                <Chip tone="negative" size="sm" icon={AlertTriangle}>
                  {card.injury.status}
                </Chip>
              )}
              {v && (
                <Chip tone={v.nearlyEven ? "neutral" : "accent"} size="sm">
                  {v.conditional ? "If not already locked, model leans" : "Model leans"} {v.value} · {v.confidence}
                </Chip>
              )}
            </>
          }
          meta={
            <span className="flex items-start gap-1">
              {key && <StateIcon state={key} className="mt-px" />}
              <span>{[key && line !== state ? state : null, line].filter(Boolean).join(" · ")}</span>
            </span>
          }
          value={card.banked != null ? fmt(card.banked) : null}
        />
      </DeckTrigger>
    </li>
  );
}
