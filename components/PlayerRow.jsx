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
}) {
  return (
    <div className="flex items-center gap-3 rounded-[--radius-sm] border border-border bg-surface px-3 py-2.5">
      <PlayerAvatar name={name} team={team} playerId={playerId} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-ink">
            {name}
          </span>
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
      {right ??
        (value != null && (
          <div className="text-right">
            <div className="figure text-sm font-semibold text-ink">
              {fmtValue(value)}
            </div>
            {tier && <div className="text-[10px] text-secondary">{tier}</div>}
          </div>
        ))}
    </div>
  );
}
