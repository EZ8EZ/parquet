import Link from "next/link";
import { ChevronRight, Hourglass, MoveRight } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { photosEnabled } from "@/lib/photos";
import { Tag } from "@/components/ui";
import { cn } from "@/lib/ui";
import { pickKey } from "@/lib/tradegraph";
import { lineageHref } from "@/lib/tradegraph/url";
/** Deep link straight to a pick on its season board. */
export function boardHref(season, pickNo) {
  return pickNo
    ? `/drafts/${season}?pick=${pickNo}#pick-${pickNo}`
    : `/drafts/${season}`;
}
/** "Team A -> Team B" with the arrow as the visual spine of the trade. */
function Hop({ from, to }) {
  return (
    <span className="flex min-w-0 items-center gap-1 text-meta text-faint">
      <span className="truncate">{from}</span>
      <MoveRight
        size={11}
        className="shrink-0 text-accent-text"
        aria-hidden="true"
      />
      <span className="truncate font-medium text-muted">{to}</span>
    </span>
  );
}
const PERSPECTIVE = {
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
function roundLabel(round) {
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
export function LineageCard({ l, perspective = null }) {
  const p = perspective ? PERSPECTIVE[perspective] : null;
  return (
    <div>
      <LineageCardBody l={l} p={p} />
      {/* THE PICK-SHAPED DOOR into provenance. A SIBLING of the card, never nested
            inside it: the card is already one `<Link>`, and an `<a>` inside an `<a>`
            is the exact invalid markup that threw a hydration error the last time this
            feature grew a second tap target (D30).
  
            /drafts owns the pick's story and provenance owns the player's - one
            derivation, two doors. The card above is unchanged. */}
      <Link
        href={lineageHref(pickKey(l.season, l.round, l.originalRoster))}
        className="flex min-h-11 items-center gap-1 px-2.5 text-meta font-semibold text-faint transition-colors hover:text-accent-text"
      >
        How this pick got where it went
        <ChevronRight size={12} aria-hidden="true" />
      </Link>
    </div>
  );
}
function LineageCardBody({ l, p }) {
  return (
    <Link
      href={boardHref(l.season, l.pickNo)}
      aria-label={
        l.resolved
          ? `${l.season} ${roundLabel(l.round)}: ${l.playerName}, pick ${l.pickNo}. Open the ${l.season} board.`
          : `${l.season} ${roundLabel(l.round)}: still in flight. Open the ${l.season} board.`
      }
      className={cn(
        "block rounded-[--radius] border bg-surface px-2.5 py-2 transition-colors hover:bg-surface-2",
        p ? p.border : "border-border",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 figure text-note font-semibold text-ink">
          {l.season} {roundLabel(l.round)}
        </span>
        {p && (
          <span className={cn("shrink-0 text-meta font-semibold", p.rail)}>
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
            <span className="block truncate text-body font-semibold leading-tight text-ink">
              {l.playerName}
            </span>
            <span className="block truncate text-meta leading-tight text-secondary">
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
          <span className="shrink-0 figure text-body font-semibold text-accent-text">
            #{l.pickNo}
          </span>
          <ChevronRight
            size={13}
            className="shrink-0 text-faint"
            aria-hidden="true"
          />
        </div>
      ) : (
        <div className="mt-1 flex items-start gap-1.5">
          <Hourglass
            size={12}
            className="mt-0.5 shrink-0 text-warn"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 text-meta leading-snug text-muted">
            {l.reasonText}{" "}
            <span className="text-faint">orig. {l.originalRosterName}</span>
          </span>
          <ChevronRight
            size={13}
            className="shrink-0 text-faint"
            aria-hidden="true"
          />
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
export function BoardPickRow({ p, highlighted }) {
  const inner = (
    <>
      {/* Pick number is the anchor for the eye when scanning surrounding picks. */}
      <span className="w-8 shrink-0 text-center">
        <span
          className={cn(
            "block figure text-body font-semibold leading-tight",
            p.isMine || highlighted ? "text-accent-text" : "text-muted",
          )}
        >
          {p.pickNo}
        </span>
        <span className="block figure text-meta leading-tight text-secondary">
          {p.round}.{String(p.draftSlot).padStart(2, "0")}
        </span>
      </span>

      {/* Same call as D73 made for ValueAssetRow and the /rank board: a monogram disc
          repeated across all 42 picks on a season board is pure decoration duplicating
          the name printed beside it (D72's own finding), so it only renders when this
          deploy has real photos on - a real, different face per pick is recognition,
          not decoration, and earns its place. This row never had the fix applied when
          D72/D73 shipped - it renders through a separate component from ValuesList's
          and RankingBoard's. */}
      {photosEnabled() && (
        <PlayerAvatar
          name={p.playerName ?? "?"}
          team={p.team}
          playerId={p.playerId}
          size="sm"
        />
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-semibold leading-tight text-ink">
          {p.playerName ?? "-"}
        </span>
        <span className="block truncate text-meta leading-tight text-secondary">
          {p.position ?? "-"}
          {p.team ? ` · ${p.team}` : ""}
          {p.age != null ? ` · ${p.age}y` : ""}
        </span>
      </span>

      {/* Was `truncate` on both lines: real team names clip on the live league
          ("Sweet Home We...", "The Terror Tw...", "Giddler on the...",
          screenshotted on a real 42-pick board) - the 34% cap is deliberate (it
          protects the player name column, the row's actual subject) but a clipped
          team name is still lost information, not saved space. `line-clamp-2` on
          each line keeps the whole name within the same width budget. */}
      <span className="max-w-[34%] shrink-0 text-right">
        <span
          className={cn(
            "block leading-snug line-clamp-2",
            p.isMine ? "font-semibold text-accent-text" : "text-muted",
          )}
        >
          {p.usedByName ?? "-"}
        </span>
        {p.wasTraded && (
          <span className="block leading-snug text-info line-clamp-2">
            via {p.originalRosterName}
          </span>
        )}
      </span>
    </>
  );
  const frame = cn(
    "flex min-h-11 items-center gap-2 rounded-[--radius-sm] border px-2 py-1",
    highlighted
      ? "border-accent bg-accent-wash"
      : p.isMine
        ? "border-accent-edge bg-surface-2"
        : "border-border bg-surface",
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
}) {
  return (
    <Link
      href={`/drafts/${season}`}
      aria-label={`${season} draft board`}
      className="flex min-h-11 flex-col justify-center rounded-[--radius-sm] border border-border bg-surface px-2.5 py-1.5 transition-colors hover:border-border-strong hover:bg-surface-2"
    >
      <span className="flex items-baseline gap-1.5">
        <span className="font-display text-lede font-semibold leading-none text-ink">
          {season}
        </span>
        {pickCount === 0 ? (
          <Tag tone="warn">upcoming</Tag>
        ) : (
          <span className="figure text-meta text-muted">{pickCount} picks</span>
        )}
        <ChevronRight
          size={13}
          aria-hidden="true"
          className="ml-auto shrink-0 text-faint"
        />
      </span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 figure text-meta text-secondary">
        <span>
          {rounds} rd · {teams} tm
        </span>
        {tradedCount > 0 && (
          <span className="text-info">{tradedCount} traded</span>
        )}
        {mineCount > 0 && (
          <span className="text-accent-text">{mineCount} yours</span>
        )}
      </span>
    </Link>
  );
}
