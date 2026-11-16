import { AlertTriangle } from "lucide-react";
import { Chip, List, ListRow, SectionHeader } from "@/components/ui";

/**
 * Starters with an injury tag who still have games this week, with games left from the
 * lock-in desk. Injured starters in a hazard are shown on that card instead.
 */
export function InjuredStarters({ injured }) {
  if (!injured?.length) return null;
  return (
    <section aria-labelledby="injured-title">
      <SectionHeader id="injured-title" title="Injured starters" />
      <List>
        {injured.map((s) => (
          <li key={s.playerId}>
          <ListRow
            leading={s.label}
            title={s.name}
            badge={
              <Chip tone="negative" size="sm" icon={AlertTriangle}>
                {s.status}
                {s.bodyPart ? ` · ${s.bodyPart}` : ""}
              </Chip>
            }
            value={s.gamesLeft}
            valueSub={`${s.gamesLeft === 1 ? "game" : "games"} left${s.nextDay ? `, ${s.nextDay}` : ""}`}
          />
          </li>
        ))}
      </List>
    </section>
  );
}
