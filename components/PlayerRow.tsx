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
  espnId,
  right,
  injuryStatus,
}: {
  name: string;
  team?: string | null;
  position?: string | null;
  age?: number | null;
  value?: number;
  tier?: string;
  espnId?: string | null;
  right?: ReactNode;
  injuryStatus?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[--radius-sm] border border-border bg-surface/60 px-3 py-2.5">
      <PlayerAvatar name={name} team={team} espnId={espnId} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-ink">{name}</span>
          {injuryStatus && (
            <span className="rounded bg-negative/15 px-1 text-[10px] font-semibold text-negative">
              {injuryStatus}
            </span>
          )}
        </div>
        <div className="text-[11px] text-faint">
          {position ?? "—"}
          {team ? ` · ${team}` : ""}
          {age != null ? ` · ${age}y` : ""}
        </div>
      </div>
      {right ?? (
        value != null && (
          <div className="text-right">
            <div className="font-mono text-sm font-semibold tnum text-ink">
              {fmtValue(value)}
            </div>
            {tier && <div className="text-[10px] text-faint">{tier}</div>}
          </div>
        )
      )}
    </div>
  );
}
