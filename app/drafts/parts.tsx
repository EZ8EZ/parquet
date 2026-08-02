import Link from "next/link";
import { ChevronRight, Hourglass, MoveRight } from "lucide-react";
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
    <span className="flex min-w-0 items-center gap-1 text-[11px] text-faint">
      <span className="truncate">{from}</span>
      <MoveRight size={11} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="truncate font-medium text-muted">{to}</span>
    </span>
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
  { label: string; tone: "negative" | "positive"; border: string; rail: string }
> = {
  gave: {
    label: "You gave up",
    tone: "negative",
    border: "border-negative/30",
    rail: "text-negative",
  },
  got: {
    label: "You acquired",
    tone: "positive",
    border: "border-positive/30",
    rail: "text-positive",
  },
};

function roundLabel(round: number): string {
  if (round === 1) return "1st";
  if (round === 2) return "2nd";
  if (round === 3) return "3rd";
  return `R${round}`;
}

/**
 * The headline card: a pick that was traded, and the player it turned into.
 *
 * The whole card is one tap target that lands on the pick's own board row (or the
 * board itself while the pick is still in flight), so nothing here is inert text.
 * Unresolved picks render the same frame with a reason instead of a player, so the
 * list never has holes.
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
    <Link
      href={boardHref(l.season, l.pickNo)}
      aria-label={
        l.resolved
          ? `${l.season} ${roundLabel(l.round)}: ${l.playerName}, pick ${l.pickNo}. Open the ${l.season} board.`
          : `${l.season} ${roundLabel(l.round)}: still in flight. Open the ${l.season} board.`
      }
      className={cn(
        "block rounded-[--radius] border bg-surface/70 px-2.5 py-2 transition-colors hover:bg-surface-2",
        p ? p.border : "border-border",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-mono text-[12px] font-semibold tnum text-ink">
          {l.season} {roundLabel(l.round)}
        </span>
        {p && (
          <span className={cn("shrink-0 text-[11px] font-semibold", p.rail)}>
            {p.label}
          </span>
        )}
        <span className="min-w-0 flex-1 overflow-hidden">
          <Hop from={l.fromName} to={l.toName} />
        </span>
      </div>

      {l.resolved ? (
        <div className="mt-1 flex items-center gap-2">
          <PlayerAvatar
            name={l.playerName ?? "?"}
            team={l.team}
            playerId={l.playerId}
            size="sm"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
              {l.playerName}
            </span>
            <span className="block truncate text-[11px] leading-tight text-faint">
              {l.position ?? "-"}
              {l.team ? ` · ${l.team}` : ""}
              {l.age != null ? ` · ${l.age}y` : ""}
              {" · orig. "}
              {l.originalRosterName}
              {/* Multi-hop picks can end up somewhere other than the last recorded
                  trade partner - name whoever actually spent it. */}
              {l.usedByName && l.usedByName !== l.toName
                ? ` · drafted by ${l.usedByName}`
                : ""}
            </span>
          </span>
          <span className="shrink-0 font-mono text-[13px] font-semibold tnum text-accent">
            #{l.pickNo}
          </span>
          <ChevronRight size={13} className="shrink-0 text-faint" aria-hidden="true" />
        </div>
      ) : (
        <div className="mt-1 flex items-start gap-1.5">
          <Hourglass
            size={12}
            className="mt-0.5 shrink-0 text-warn"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-muted">
            {l.reasonText}{" "}
            <span className="text-faint">orig. {l.originalRosterName}</span>
          </span>
          <ChevronRight size={13} className="shrink-0 text-faint" aria-hidden="true" />
        </div>
      )}
    </Link>
  );
}

/**
 * One row of a draft board. Stacked row, never a table cell - the board has to stay
 * readable at 390px, and "surrounding picks" only works if scanning down the column
 * is effortless. The row links to the dossier of whoever made the pick.
 */
export function BoardPickRow({
  p,
  highlighted,
}: {
  p: BoardPick;
  highlighted: boolean;
}) {
  const inner = (
    <>
      {/* Pick number is the anchor for the eye when scanning surrounding picks. */}
      <span className="w-8 shrink-0 text-center">
        <span
          className={cn(
            "block font-mono text-[13px] font-semibold leading-tight tnum",
            p.isMine || highlighted ? "text-accent" : "text-muted",
          )}
        >
          {p.pickNo}
        </span>
        <span className="block font-mono text-[11px] leading-tight tnum text-faint">
          {p.round}.{String(p.draftSlot).padStart(2, "0")}
        </span>
      </span>

      <PlayerAvatar
        name={p.playerName ?? "?"}
        team={p.team}
        playerId={p.playerId}
        size="sm"
      />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
          {p.playerName ?? "-"}
        </span>
        <span className="block truncate text-[11px] leading-tight text-faint">
          {p.position ?? "-"}
          {p.team ? ` · ${p.team}` : ""}
          {p.age != null ? ` · ${p.age}y` : ""}
        </span>
      </span>

      <span className="max-w-[34%] shrink-0 text-right">
        <span
          className={cn(
            "block truncate text-[11px] leading-tight",
            p.isMine ? "font-semibold text-accent" : "text-muted",
          )}
        >
          {p.usedByName ?? "-"}
        </span>
        {p.wasTraded && (
          <span className="block truncate text-[11px] leading-tight text-info">
            via {p.originalRosterName}
          </span>
        )}
      </span>
    </>
  );

  const frame = cn(
    "flex min-h-11 items-center gap-2 rounded-[--radius-sm] border px-2 py-1",
    highlighted
      ? "border-accent bg-accent/[0.08]"
      : p.isMine
        ? "border-accent/30 bg-surface-2/70"
        : "border-border bg-surface/50",
  );

  return (
    <li id={`pick-${p.pickNo}`} className="scroll-mt-16">
      {p.usedByRoster != null ? (
        <Link
          href={`/managers/${p.usedByRoster}`}
          aria-label={`Pick ${p.pickNo}: ${p.playerName ?? "no player"}, taken by ${p.usedByName ?? "unknown"}. Open their dossier.`}
          className={cn(frame, "transition-colors hover:bg-surface-2")}
        >
          {inner}
        </Link>
      ) : (
        <div className={frame}>{inner}</div>
      )}
    </li>
  );
}

/** Compact season tile for the board index. Whole tile is the tap target. */
export function SeasonTile({
  season,
  rounds,
  teams,
  pickCount,
  tradedCount,
  mineCount,
}: {
  season: string;
  rounds: number;
  teams: number;
  pickCount: number;
  tradedCount: number;
  mineCount: number;
}) {
  return (
    <Link
      href={`/drafts/${season}`}
      aria-label={`${season} draft board`}
      className="flex min-h-11 flex-col justify-center rounded-[--radius-sm] border border-border bg-surface/60 px-2.5 py-1.5 transition-colors hover:border-border-strong hover:bg-surface-2"
    >
      <span className="flex items-baseline gap-1.5">
        <span className="font-display text-[17px] font-semibold leading-none text-ink">
          {season}
        </span>
        {pickCount === 0 ? (
          <Tag tone="warn">upcoming</Tag>
        ) : (
          <span className="font-mono text-[11px] tnum text-muted">
            {pickCount} picks
          </span>
        )}
        <ChevronRight
          size={13}
          aria-hidden="true"
          className="ml-auto shrink-0 text-faint"
        />
      </span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 font-mono text-[11px] tnum text-faint">
        <span>
          {rounds} rd · {teams} tm
        </span>
        {tradedCount > 0 && <span className="text-info">{tradedCount} traded</span>}
        {mineCount > 0 && <span className="text-accent">{mineCount} yours</span>}
      </span>
    </Link>
  );
}
