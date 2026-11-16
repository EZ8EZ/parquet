import Link from "next/link";
import { ChevronRight, Hourglass } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { photosEnabled } from "@/lib/photos";
import { Chip, ListRow } from "@/components/ui";
import { pickKey } from "@/lib/tradegraph";
import { lineageHref } from "@/lib/tradegraph/url";
import { draftedByName } from "@/lib/lineage";

/** Deep link straight to a pick on its season board. */
export function boardHref(season, pickNo) {
  return pickNo ? `/drafts/${season}?pick=${pickNo}#pick-${pickNo}` : `/drafts/${season}`;
}

function roundLabel(round) {
  if (round === 1) return "1st";
  if (round === 2) return "2nd";
  if (round === 3) return "3rd";
  return `R${round}`;
}

const PERSPECTIVE = { gave: "You gave up", got: "You acquired" };

/**
 * One traded pick traced to what it became: a row into the pick on its season board,
 * then a second, sibling link into the pick's provenance ("how it got where it went").
 * Siblings, never nested: an <a> inside an <a> broke hydration once (D30). The
 * perspective chip is neutral; giving a pick up is a fact, not a loss (D6). Callers
 * stack these; each is its own rounded group.
 */
export function LineageCard({ l, perspective = null, inList = false, showBadge = true }) {
  const draftedBy = draftedByName(l, perspective);
  const hop = `${l.fromName} → ${l.toName}`;
  const label = `${l.season} ${roundLabel(l.round)}`;
  const Wrap = inList ? "li" : "div";
  return (
    <Wrap className={inList ? undefined : "overflow-hidden rounded-card bg-surface"}>
      <ListRow
        // A pick not yet made has no draft board to open (the season's draft has not
        // run), so its row does not navigate.
        href={l.resolved ? boardHref(l.season, l.pickNo) : undefined}
        aria-label={l.resolved ? `${label}: ${l.playerName}, pick ${l.pickNo}. Open the ${l.season} board.` : undefined}
        avatar={
          l.resolved ? (
            <PlayerAvatar name={l.playerName ?? "?"} team={l.team} playerId={l.playerId} size="sm" />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full bg-surface-2 text-warn">
              <Hourglass size={14} aria-hidden="true" />
            </span>
          )
        }
        title={l.resolved ? l.playerName : `${label}, not drafted yet`}
        badge={perspective && showBadge ? <Chip size="sm">{PERSPECTIVE[perspective]}</Chip> : null}
        meta={
          l.resolved ? (
            <>
              <span className="figure">{label}</span> · {hop}
              {[l.position, l.team].filter(Boolean).length ? ` · ${[l.position, l.team].filter(Boolean).join(" · ")}` : ""}
              {l.originalRosterName !== l.fromName ? ` · orig. ${l.originalRosterName}` : ""}
              {draftedBy ? ` · drafted by ${draftedBy}` : ""}
            </>
          ) : (
            <>
              {hop} · {l.reasonText} · orig. {l.originalRosterName}
            </>
          )
        }
        value={l.resolved ? `#${l.pickNo}` : null}
      />
      <Link
        href={lineageHref(pickKey(l.season, l.round, l.originalRoster))}
        className="-mt-2 flex min-h-11 items-center gap-0.5 pl-[60px] pr-4 text-meta font-medium text-secondary transition-colors hover:text-accent-text"
      >
        How this pick got there
        <ChevronRight size={14} aria-hidden="true" />
      </Link>
    </Wrap>
  );
}

/**
 * One pick on a season board, inside a List. The pick number leads; the player's name
 * wraps (D111); the roster that made the pick and, for a traded slot, the roster it
 * came from sit under it. Links to that manager's dossier. `highlighted` is the pick a
 * deep link pointed at (wash + "Linked" chip); the viewer's own pick gets wash + "You".
 */
export function BoardPickRow({ p, highlighted }) {
  const mine = p.isMine;
  const props = {
    leading: p.pickNo,
    highlight: mine || highlighted,
    avatar: photosEnabled() ? (
      <PlayerAvatar name={p.playerName ?? "?"} team={p.team} playerId={p.playerId} size="sm" />
    ) : null,
    title: p.playerName ?? "No player",
    badge: (
      <>
        {mine && (
          <Chip size="sm" tone="accent">
            You
          </Chip>
        )}
        {highlighted && (
          <Chip size="sm" tone="info">
            Linked
          </Chip>
        )}
      </>
    ),
    meta: (
      <>
        <span className="figure">
          {p.round}.{String(p.draftSlot).padStart(2, "0")}
        </span>
        {[p.position, p.team, p.age != null ? `${p.age}y` : null].filter(Boolean).map((x) => ` · ${x}`)}
        <span className="block">
          {p.usedByName ?? "unknown"}
          {p.wasTraded && <span className="text-info"> via {p.originalRosterName}</span>}
        </span>
      </>
    ),
  };
  return (
    <li id={`pick-${p.pickNo}`} className="scroll-mt-28" aria-current={highlighted ? "true" : undefined}>
      {p.usedByRoster != null ? (
        <ListRow
          href={`/managers/${p.usedByRoster}`}
          aria-label={`Pick ${p.pickNo}: ${p.playerName ?? "no player"}, taken by ${p.usedByName ?? "unknown"}. Open their dossier.`}
          {...props}
        />
      ) : (
        <ListRow {...props} />
      )}
    </li>
  );
}
