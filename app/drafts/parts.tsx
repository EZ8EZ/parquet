import Link from "next/link";
import { ArrowRight, Hourglass, MoveRight } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Tag } from "@/components/ui";
import { cn } from "@/lib/ui";
import type { BoardPick, TradedPickLineage } from "@/lib/lineage";

/** Deep link straight to a pick on its season board. */
export function boardHref(season: string, pickNo?: number | null): string {
  return pickNo ? `/drafts/${season}?pick=${pickNo}#pick-${pickNo}` : `/drafts/${season}`;
}

/** "Team A -> Team B" with the arrow as the visual spine of the trade. */
function Hop({ from, to }: { from: string; to: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-faint">
      <span className="truncate">{from}</span>
      <MoveRight size={12} className="shrink-0 text-accent/70" aria-hidden="true" />
      <span className="truncate font-medium text-muted">{to}</span>
    </div>
  );
}

/**
 * Which side of the deal the viewing user was on. This is the whole point of the
 * feature - "gave" is the pick that got away, "got" is the one that paid off - so it
 * drives the card's tone rather than a generic "you were involved" badge.
 */
export type Perspective = "gave" | "got" | null;

const PERSPECTIVE: Record<
  "gave" | "got",
  { label: string; tone: "negative" | "positive"; border: string }
> = {
  gave: { label: "You gave up", tone: "negative", border: "border-negative/30" },
  got: { label: "You acquired", tone: "positive", border: "border-positive/30" },
};

function roundLabel(round: number): string {
  if (round === 1) return "1st";
  if (round === 2) return "2nd";
  if (round === 3) return "3rd";
  return `R${round}`;
}

/**
 * The headline card: a pick that was traded, and the player it turned into.
 * Unresolved picks (future / undrafted) render the same frame with a reason
 * instead of a player, so the list never has holes.
 */
export function LineageCard({
  l,
  perspective = null,
}: {
  l: TradedPickLineage;
  perspective?: Perspective;
}) {
  const p = perspective ? PERSPECTIVE[perspective] : null;
  return (
    <article
      className={cn(
        "rounded-[--radius] border bg-surface/70 p-3.5",
        p ? p.border : "border-border",
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-sm font-semibold tnum text-ink">
            {l.season} {roundLabel(l.round)}
          </div>
          <div className="mt-0.5 text-[11px] text-faint">
            orig. {l.originalRosterName}
          </div>
        </div>
        {p && <Tag tone={p.tone}>{p.label}</Tag>}
      </div>

      <Hop from={l.fromName} to={l.toName} />

      <div className="rule my-3" />

      {l.resolved ? (
        <Link
          href={boardHref(l.season, l.pickNo)}
          className="-mx-1.5 flex items-center gap-3 rounded-[--radius-sm] px-1.5 py-1.5 transition-colors hover:bg-surface-2"
        >
          <PlayerAvatar
            name={l.playerName ?? "?"}
            team={l.team}
            playerId={l.playerId}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink">
              {l.playerName}
            </div>
            <div className="text-[11px] text-faint">
              {l.position ?? "-"}
              {l.team ? ` · ${l.team}` : ""}
              {l.age != null ? ` · ${l.age}y` : ""}
            </div>
            {/* Multi-hop picks can end up somewhere other than the last recorded
                trade partner - name whoever actually spent it. */}
            {l.usedByName && l.usedByName !== l.toName && (
              <div className="mt-0.5 truncate text-[11px] text-muted">
                drafted by {l.usedByName}
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-sm font-semibold tnum text-accent">
              #{l.pickNo}
            </div>
            <div className="text-[10px] text-faint">board</div>
          </div>
          <ArrowRight size={14} className="shrink-0 text-faint" aria-hidden="true" />
        </Link>
      ) : (
        <div className="flex items-start gap-2 text-[12px] text-muted">
          <Hourglass size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
          <span>{l.reasonText}</span>
        </div>
      )}
    </article>
  );
}

/**
 * One row of a draft board. Stacked card, never a table cell — the board has to
 * stay readable at 390px, and "surrounding picks" only works if scanning down the
 * column is effortless.
 */
export function BoardPickRow({
  p,
  highlighted,
}: {
  p: BoardPick;
  highlighted: boolean;
}) {
  return (
    <li
      id={`pick-${p.pickNo}`}
      className={cn(
        "scroll-mt-20 flex items-center gap-3 rounded-[--radius-sm] border px-2.5 py-2",
        highlighted
          ? "border-accent bg-accent/[0.08]"
          : p.isMine
            ? "border-accent/30 bg-surface-2/70"
            : "border-border bg-surface/50",
      )}
    >
      {/* Pick number is the anchor for the eye when scanning surrounding picks. */}
      <div className="w-9 shrink-0 text-center">
        <div
          className={cn(
            "font-mono text-sm font-semibold tnum",
            p.isMine || highlighted ? "text-accent" : "text-muted",
          )}
        >
          {p.pickNo}
        </div>
        <div className="font-mono text-[9px] tnum text-faint">
          {p.round}.{String(p.draftSlot).padStart(2, "0")}
        </div>
      </div>

      <PlayerAvatar
        name={p.playerName ?? "?"}
        team={p.team}
        playerId={p.playerId}
        size="sm"
      />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink">
          {p.playerName ?? "-"}
        </div>
        <div className="truncate text-[11px] text-faint">
          {p.position ?? "-"}
          {p.team ? ` · ${p.team}` : ""}
          {p.age != null ? ` · ${p.age}y` : ""}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "truncate text-[11px]",
              p.isMine ? "font-semibold text-accent" : "text-muted",
            )}
          >
            {p.usedByName ?? "-"}
          </span>
          {p.wasTraded && (
            <Tag tone="info" className="px-1.5 py-0">
              via {p.originalRosterName}
            </Tag>
          )}
        </div>
      </div>
    </li>
  );
}
