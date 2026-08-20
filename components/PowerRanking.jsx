"use client";
/**
 * THE POWER RANKING - the text rendering of both charts AND their control surface.
 *
 * ---------------------------------------------------------------------------------
 * IT WAS ALREADY THE FIRST OF THOSE. NOW IT IS BOTH
 * ---------------------------------------------------------------------------------
 * This list has carried every number both charts draw for a round: the window, TCI with
 * its posture, RFI, the core-age phrase. Fourteen SVG spans and fourteen SVG dots have
 * no screen-reader path of their own beyond one summary label, so this list has always
 * been the authoritative reading of the same data.
 *
 * What it was NOT was a control. Selection lived inside the quadrant, driven by a rail of
 * fourteen 44px buttons whose accessible names were the roster's metrics and whose ORDER
 * was the quadrant's own reading order (most-incoherent first) rather than the ranking's -
 * so a keyboard user tabbed through fourteen unlabelled-looking swatches in an order
 * nothing on the page explained, to drive a chart they could not see. That rail is
 * deleted. The rows drive selection now, which fixes the same problem from the other end:
 * the control surface is the list a reader was already reading, in the order it is
 * already in, with the roster's name as the first thing in its accessible name.
 *
 * ---------------------------------------------------------------------------------
 * THE DOSSIER LINK IS INSIDE THE SELECTED ROW, AND THAT WAS A MEASUREMENT
 * ---------------------------------------------------------------------------------
 * The row used to be one thing: a `<Link>` to the dossier wrapping the whole row, with a
 * decorative chevron. Making the row a selector cannot just delete that link - a
 * fourteen-roster list where the only route to a dossier is "select, then scroll back up
 * to the panel" is worse than what it replaced - and a button inside a link is not a
 * thing, so the two cannot be nested.
 *
 * The obvious fix was a permanent 44px link column beside the selector. Measured on the
 * live league at 390px, that column cost 270px across fourteen rows - 1,742px of list
 * against 1,472px without it - because taking 44px out of the text column pushes most
 * rows from three lines to four. On a page whose height round 8 spent three renderings
 * unwinding, 270px for a control that is only wanted on one row at a time is the wrong
 * trade.
 *
 * So it renders in the SELECTED row only, on its own line under the figures: zero width
 * cost on the other thirteen, a real labelled 44px target, and it appears exactly where
 * the reader's thumb already is rather than three inches up the page. The selected-roster
 * panel above the list keeps its own copy for a reader coming the other way - same
 * destination, one entry point per reading position.
 */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PostureGlyph } from "@/components/PostureTag";
import { TeamAvatar } from "@/components/TeamAvatar";
import { DeltaValue } from "@/components/ui";
import { useLeagueSelection } from "@/components/LeagueSelection";
import { fmtValue } from "@/lib/ui";
export function PowerRanking({ rows }) {
  return (
    /*
     * THE GROUP IS ON THE WRAPPER, NOT ON THE `<ul>`, and axe caught the difference.
     *
     * `role="group"` on the list itself OVERRIDES its implicit `role="list"`, which
     * orphans all fourteen `<li>` children - "List item parent element has a role that
     * is not role=list", serious, 14 nodes, in this repo's own registry-driven axe sweep.
     * A wrapper carries the group label and the list keeps being a list, so the selectors
     * are both grouped and enumerable.
     */
    <div role="group" aria-label="Select a roster to read on both boards">
      <ul className="space-y-1">
        {rows.map((r) => (
          <Row key={r.rosterId} r={r} />
        ))}
      </ul>
    </div>
  );
}
function Row({ r }) {
  const { isSelected, select } = useLeagueSelection();
  const on = isSelected(r.rosterId);
  return (
    <li
      className={
        `overflow-hidden rounded-[--radius-sm] border transition-colors ` +
        // THE SELECTION RULE, as the row's own left border: the same orthogonal ink mark
        // the window map's ordinal gutter uses, so one state has one mark on this page,
        // and it costs the text column nothing because a border is not a flex child.
        (on
          ? "border-ink border-l-2 bg-surface-2"
          : r.isMe
            ? "border-accent-edge bg-surface hover:border-border-strong hover:bg-surface-2"
            : "border-border bg-surface hover:border-border-strong hover:bg-surface-2")
      }
    >
      <button
        type="button"
        onClick={() => select(r.rosterId)}
        aria-pressed={on}
        // The name first, then the two boards' figures in the order the row prints
        // them. This is the string a screen-reader user hears when they land on the
        // control, and it is the same set of facts the live region reads back when the
        // selection lands - one derivation, both readings.
        aria-label={r.facts}
        className="flex min-h-11 w-full min-w-0 items-center gap-2.5 px-2.5 py-1.5 text-left"
      >
        <span
          aria-hidden="true"
          className={
            `w-4 shrink-0 text-center figure text-meta ` +
            (on ? "font-semibold text-ink" : "text-secondary")
          }
        >
          {r.n}
        </span>
        <TeamAvatar
          name={r.name}
          avatarId={r.avatarId}
          teamLogoUrl={r.teamLogoUrl}
          size="sm"
          isMe={r.isMe}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-body font-semibold leading-tight text-ink">
              {r.name}
            </span>
            {r.isMe && (
              <span className="shrink-0 rounded-full bg-accent-wash px-1.5 text-meta font-semibold leading-tight text-accent-text">
                you
              </span>
            )}
          </span>
          {/* Owner name, record, standing, core age. `line-clamp-2` rather than
                `truncate`: this is real content and a single line cut a rank number
                mid-digit on the live board. */}
          <span className="mt-px line-clamp-2 block figure text-meta text-secondary">
            {r.ownerName} · {r.record} ·{" "}
            {/* The core-age word, in the neutral tone the posture words wear for the
                same reason (components/PostureTag): an age is not a grade, and a colour
                would say otherwise in half a second. */}
            <span className="text-muted">{r.age}</span>
          </span>
          {/* WINDOW FIRST, NUMBERS NEXT, WORD LAST, and that ordering is the whole
                design of this line: at 375px it has no room to spare, so if anything
                has to give it should be the recoverable half (the posture word), not
                TCI or RFI. The window leads because the default board is the window
                map and this is the only TEXT rendering of what it draws.
                `line-clamp-2` so a wrap never slices a word - "straddling" rendered as
                "strad..." on the live board when this was `truncate`. */}
          <span className="line-clamp-2 block figure text-meta text-secondary">
            <span className="text-muted">{r.window}</span> · TCI{" "}
            <span className="text-muted">{r.tci}</span> · RFI{" "}
            <span className="text-muted">{r.fragility}</span> ·{" "}
            <span className="text-muted">
              <PostureGlyph posture={r.posture} className="mr-1" />
              {r.posture}
            </span>
          </span>
          <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-elevated">
            <span
              className={`block h-full rounded-full ${r.isMe ? "bg-accent" : "bg-accent-strong"}`}
              style={{ width: `${r.pct}%` }}
            />
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block figure text-body font-semibold leading-tight text-ink">
            {fmtValue(r.totalValue)}
          </span>
          <span className="block whitespace-nowrap figure text-meta leading-tight text-secondary">
            1sts <DeltaValue n={r.extraFirsts} />
          </span>
        </span>
      </button>
      {/* Revealed on selection only - see the header on why a permanent column here
          cost 270px of page for a control wanted on one row at a time. */}
      {on && (
        <Link
          href={`/managers/${r.rosterId}`}
          className="flex min-h-11 items-center gap-0.5 border-t border-border px-2.5 text-meta font-semibold text-accent-text"
        >
          Open the dossier
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      )}
    </li>
  );
}
