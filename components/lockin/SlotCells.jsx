import { Check, Lock, PencilLine, RotateCcw } from "lucide-react";
import { cn } from "@/lib/ui";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { StateIcon } from "./StateIcon";
import { DeckTrigger } from "./PlayerDeck";
import { AssumeTile } from "./AssumeTile";

const FACE = {
  locked: "bg-accent-wash text-accent-text",
  final: "bg-elevated text-ink",
  yet: "bg-transparent text-muted ring-1 ring-inset ring-border-strong",
  // sunken, no outline: the dashed outline belongs to assumed tiles alone
  empty: "bg-bg text-faint",
};

/** The glyph that says the state in the tile itself (no legend needed). An assumption gets a pencil, never the real lock. */
function Glyph({ k, assumed = null }) {
  if (assumed) return <PencilLine size={10} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-secondary" />;
  if (k === "locked") return <Lock size={11} strokeWidth={2.5} aria-hidden="true" className="shrink-0" />;
  if (k === "final") return <Check size={11} strokeWidth={3} aria-hidden="true" className="shrink-0" />;
  if (k === "reset") return <RotateCcw size={11} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-faint" />;
  if (k === "live" || k === "unresolved") return <StateIcon state={k} className="size-[11px]" />;
  return null;
}

/**
 * The seven slots as tiles (slotTiles(desk)): label above, the player's face, then the
 * score, or the tip time ("7p") / day when he has not played. State is in the tile: a
 * violet wash and lock when locked, a check when the score stands, a reset glyph, a
 * hairline outline before his game. A violet underline marks a slot whose lock-or-hold
 * call is open. A slot the viewer can make an assumption about opens the what-if
 * choice (AssumeTile); an assumed slot shows a dashed outline and a pencil, never the
 * lock glyph. Other tiles open the player.
 */
export function SlotCells({ tiles, className }) {
  return (
    <ol aria-label="Your starting slots this week" className={cn("grid gap-1.5", className)} style={{ gridTemplateColumns: `repeat(${tiles.length || 7}, minmax(0, 1fr))` }}>
      {tiles.map((t) => {
        const face = (
          <span className="flex flex-col items-center gap-1">
            <span aria-hidden="true" className="text-micro font-semibold text-secondary">
              {t.label}
            </span>
            <span data-slot-state={t.key} data-assumed={t.assumed ?? undefined} className={cn("relative flex h-[58px] w-full min-w-0 flex-col items-center justify-center gap-1 rounded-control", t.assumed ? "bg-surface-2 text-ink outline-1 -outline-offset-1 outline-dashed outline-secondary" : FACE[t.key] ?? "bg-surface-2 text-ink")}>
              {t.flag && (
                <span aria-hidden="true" className={cn("absolute right-0.5 top-0.5 rounded px-[3px] text-[10px] font-extrabold leading-[13px]", t.flag === "out" ? "bg-negative-wash text-negative" : "bg-warn-wash text-warn")}>
                  {t.flag === "out" ? "O" : "Q"}
                </span>
              )}
              {t.playerId ? <PlayerAvatar name={t.name ?? t.playerId} team={t.team} playerId={t.playerId} size="xs" decorative className={t.key === "yet" ? "opacity-60" : undefined} /> : <span aria-hidden="true" className="size-6" />}
              <span aria-hidden="true" className={cn("flex items-center gap-px figure font-bold leading-none", t.key === "yet" ? "text-micro" : t.assumed ? "text-meta tracking-tight" : "text-note", t.key === "reset" && "text-faint")}>
                <Glyph k={t.key} assumed={t.assumed} />
                {t.text}
              </span>
              {t.call && <span aria-hidden="true" className="absolute inset-x-2.5 bottom-0 h-[3px] rounded-t-full bg-accent" />}
            </span>
          </span>
        );
        return (
          <li key={t.index} className="min-w-0" data-slot-call={t.call ? "" : undefined}>
            {t.choices ? (
              <AssumeTile tile={t} label={`${t.assumed ? `${t.label} ${t.text}, ${t.name ?? "empty"}, you assumed ${t.assumed === "locked" ? "locked" : "playing on"}` : t.spoken}. What if`} detailsId={t.playerId}>
                {face}
              </AssumeTile>
            ) : t.playerId ? (
              <DeckTrigger playerId={t.playerId} label={`${t.spoken}. Show details`} className="block w-full rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                {face}
              </DeckTrigger>
            ) : (
              <span role="img" aria-label={t.spoken} className="block">
                {face}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
