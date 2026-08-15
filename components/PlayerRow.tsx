import type { ReactNode } from "react";
import { PlayerAvatar } from "./PlayerAvatar";
import { fmtValue } from "@/lib/ui";

export function PlayerRow({
  name,
  team,
  position,
  age,
  value,
  tier,
  playerId,
  right,
  injury,
}: {
  name: string;
  team?: string | null;
  position?: string | null;
  age?: number | null;
  value?: number;
  tier?: string;
  playerId?: string | null;
  right?: ReactNode;
  /**
   * What is actually wrong, e.g. "Knee · Surgery" - `injuryLabel()`, not a raw
   * `injury_status`. Sleeper's status word says "DTD" for a ruptured Achilles and
   * "DTD" for a bruised quad, so it was never worth the space it took up. Null for a
   * healthy player AND for load management, which is not an injury.
   */
  injury?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[--radius-sm] border border-border bg-surface px-3 py-2.5">
      <PlayerAvatar name={name} team={team} playerId={playerId} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-ink">{name}</span>
          {injury && (
            <span className="rounded bg-negative-wash px-1 text-[10px] font-semibold text-negative">
              {injury}
            </span>
          )}
        </div>
        <div className="text-meta text-secondary">
          {position ?? "-"}
          {team ? ` · ${team}` : ""}
          {age != null ? ` · ${age}y` : ""}
        </div>
      </div>
      {right ?? (
        value != null && (
          <div className="text-right">
            <div className="figure text-sm font-semibold text-ink">
              {fmtValue(value)}
            </div>
            {tier && <div className="text-[10px] text-secondary">{tier}</div>}
          </div>
        )
      )}
    </div>
  );
}
