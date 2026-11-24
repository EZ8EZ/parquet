import { AlertTriangle, CornerDownRight } from "lucide-react";
import { Chip } from "@/components/ui";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { cn } from "@/lib/ui";
import { LeanChip } from "./Decision";
import { DeckTrigger } from "./PlayerDeck";

/**
 * Rough win chance if lock / if hold as two neutral bars on a 0-100 scale. Information
 * beside the lean, never styled as the pick; greyed with "too close to call" when the
 * engine says the difference is inside its noise and calibration floor.
 */
function Bar({ label, pctText, value, real }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-meta text-secondary">{label}</span>
        <span className={cn("figure text-body", real ? "font-bold text-ink" : "font-semibold text-secondary")}>{pctText}</span>
      </span>
      <span aria-hidden="true" className="relative block h-1.5 overflow-hidden rounded-full bg-elevated">
        <span className={cn("absolute inset-y-0 left-0 rounded-full", real ? "bg-muted" : "bg-border-strong")} style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
    </span>
  );
}

export function WinPair({ win, className }) {
  if (!win) return null;
  const real = win.real;
  return (
    <span className={cn("block border-t border-border pt-2.5", className)} data-win-compare data-win-real={String(real)}>
      <span className="block text-micro text-secondary">
        Rough win chance{!real && <span> · too close to call</span>}
      </span>
      <span className="mt-1 grid grid-cols-2 gap-4">
        <Bar label="if lock" pctText={win.lockPct} value={win.lock} real={real} />
        <Bar label="if hold" pctText={win.holdPct} value={win.hold} real={real} />
      </span>
    </span>
  );
}

function CallBody({ r }) {
  return (
    <span className="block px-3.5 pb-3 pt-3.5">
      <span className="flex items-start gap-3">
        <PlayerAvatar name={r.name} team={r.team} playerId={r.playerId} size="md" decorative />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-body font-semibold text-ink">{r.name}</span>
            {r.listed && (
              <Chip size="sm" tone={/^(out|suspended)/i.test(r.listed) ? "negative" : "warn"} icon={AlertTriangle}>
                {r.listed}
              </Chip>
            )}
          </span>
          <span className="mt-0.5 block text-meta text-secondary">
            {r.slotLabel ? `${r.slotLabel} · ` : ""}
            <span className={cn("font-semibold", r.urgent ? "text-warn" : "text-ink")}>{r.title}</span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block figure text-score font-bold text-ink">{r.xText}</span>
          <span className="block text-micro text-secondary">on the table</span>
        </span>
      </span>
      {r.hazard && (
        <span className="mt-2.5 flex gap-2 rounded-control bg-warn-wash px-3 py-2 text-meta text-ink">
          <AlertTriangle size={14} aria-hidden="true" className="mt-px shrink-0 text-warn" />
          <span>{r.hazard}</span>
        </span>
      )}
      {r.lean && (
        <span className="mt-2.5 block">
          <LeanChip lean={r.lean} hideConditional prefix={r.leanPrefix} />
        </span>
      )}
      {r.triggers.length > 0 && (
        <span className="mt-2 block space-y-1">
          {r.triggers.map((t) => (
            <span key={t.text} className="flex gap-1.5 text-meta text-muted">
              <CornerDownRight size={14} aria-hidden="true" className="mt-px shrink-0 text-secondary" />
              <span>
                {t.text}
                {t.now && <span className="text-secondary"> ({t.now})</span>}
              </span>
            </span>
          ))}
        </span>
      )}
      <WinPair win={r.win} className="mt-3" />
    </span>
  );
}

/**
 * "Your calls" on Home: every live lock-or-hold decision as one row (callRows), soonest
 * deadline first. The whole row opens the player's sheet. `extra(row)` renders below a
 * row, outside its button (the leave-it-to-chance control lives there).
 */
export function CallList({ rows, extra = null }) {
  if (!rows.length) return null;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-card bg-surface" aria-label="Your calls">
      {rows.map((r) => (
        <li key={r.playerId} data-call={r.action ?? "hazard"}>
          <DeckTrigger playerId={r.playerId} label={`${r.name}, ${r.xText} on the table: ${r.title}. Show details`} className="transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent">
            <CallBody r={r} />
          </DeckTrigger>
          {extra?.(r)}
        </li>
      ))}
    </ul>
  );
}
