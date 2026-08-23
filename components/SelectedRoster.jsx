"use client";
/**
 * THE SELECTED ROSTER - one panel, about a roster rather than about a chart.
 *
 * ---------------------------------------------------------------------------------
 * WHERE IT SITS, AND WHY THAT IS NOT AN ARBITRARY CHOICE
 * ---------------------------------------------------------------------------------
 * This panel used to live INSIDE `CoherenceFragilityQuadrant`, which meant it only
 * existed on one of the two lenses: selecting a roster and switching to the window map
 * made the roster's own numbers disappear, even though the window map is the chart that
 * knows the most about it. It sits between the board and the list now, outside both
 * charts, because its subject is a roster and not whichever chart happens to be showing.
 *
 * ---------------------------------------------------------------------------------
 * THE LEAD SENTENCE IS `windowThesis`, WHICH WAS COMPUTED AND UNUSED HERE
 * ---------------------------------------------------------------------------------
 * `windowThesis(me, them)` has existed since D6/D19-clean and had exactly one caller,
 * the trade finder. It is the one sentence in the app that reads another roster's window
 * against the viewer's and says what the relationship IS - overlapping, dated clear
 * before, dated clear after - conditional on a posture stated in the same sentence, and
 * ranking nobody. /league computed both windows on every render and never joined them.
 *
 * IT RETURNS NULL MORE OFTEN THAN IT RETURNS A SENTENCE, and that is the honest answer
 * rather than a gap to paper over: on the live league seven of fourteen rosters have no
 * readable single window, so a null here is the common case. The panel renders the
 * REASON in that case, through `RefusalMark`, with the code from the closed register
 * (lib/refusal.js) - and the reason is built on the server, so the sentence a reader gets
 * for a split roster is the same sentence the same condition produces on the chart above
 * and in the finder's window column.
 *
 * ---------------------------------------------------------------------------------
 * THE LINK /league NEVER HAD
 * ---------------------------------------------------------------------------------
 * `/managers/compare?a={ownerId}&b={ownerId}` has been built for rounds and /league had
 * zero inbound links to it, which is a real hole: this page's entire job is putting the
 * viewer next to thirteen other managers, and the app's own two-manager sheet was one
 * URL away and unreachable from here. It is one line, only rendered when both owner ids
 * are real, and never for the viewer against themselves.
 */
import Link from "next/link";
import { ChevronRight, GitCompare } from "lucide-react";
import { PostureGlyph } from "@/components/PostureTag";
import { RefusalMark } from "@/components/RefusalMark";
import { Tag } from "@/components/ui";
import { useLeagueSelection } from "@/components/LeagueSelection";
export function SelectedRoster({ rosters, myOwnerId }) {
  const { selected } = useLeagueSelection();
  const r = rosters[String(selected)] ?? null;
  if (!r) return null;
  const canCompare =
    myOwnerId != null && r.ownerId != null && r.ownerId !== myOwnerId;
  return (
    <div
      className={
        `mt-1.5 rounded-[--radius] border p-2.5 ` +
        (r.isMe ? "border-accent-edge bg-accent-wash" : "border-border bg-surface")
      }
    >
      <p className="line-clamp-1 text-body font-semibold leading-tight text-ink">
        <span className="mr-1.5 figure text-meta text-secondary">{r.n}</span>
        {r.name}
        {r.isMe && (
          <span className="ml-1.5 text-meta text-accent-text">you</span>
        )}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Tag tone={r.quadrant === "splitTopHeavy" ? "negative" : "neutral"}>
          {r.quadrantLabel}
        </Tag>
        {/* The window leads, because the board above is the window map and this is the
            one place a selected roster's span is printed as text. A refused window
            prints its code (D95), never a dash. */}
        <span className="figure text-meta text-secondary">{r.window}</span>
        <span className="figure text-meta text-secondary">
          {r.tci} TCI ·{" "}
          <span className="text-muted">
            <PostureGlyph posture={r.posture} className="mr-1" />
            {r.posture}
          </span>
        </span>
        <span className="figure text-meta text-secondary">
          {r.fragility} RFI · {r.fragilityBand}
        </span>
      </div>

      {/* THE LEAD READING: their window against yours, or the stated reason there is
          no such reading. One or the other always renders, never neither. */}
      {r.thesis ? (
        <p className="mt-1.5 text-note leading-snug text-ink/85">{r.thesis}</p>
      ) : (
        <RefusalMark className="mt-1.5">{r.thesisRefusal}</RefusalMark>
      )}

      {/* The RFI number on its own means nothing without the league it was scored
          against, and the axis has no colour to carry that. So it is said. */}
      {r.moreFragileThan != null && (
        <p className="mt-1 text-meta leading-snug text-secondary">
          More fragile than {r.moreFragileThan} of the other {r.peers} rosters.
        </p>
      )}

      {r.spofName && (
        <p className="mt-1.5 text-meta leading-snug text-muted">
          breaks first:{" "}
          <span className="font-semibold text-ink">{r.spofName}</span>
          {r.spofShare != null && (
            <>
              {" "}
              <span className="figure">
                ({r.spofShare}% of startable value)
              </span>
            </>
          )}
        </p>
      )}

      <p className="mt-1.5 text-note leading-snug text-muted">{r.thesisQuad}</p>

      <div className="mt-1 flex flex-wrap items-center gap-x-3">
        <Link
          href={`/managers/${r.rosterId}`}
          className="inline-flex min-h-11 items-center gap-0.5 text-meta font-semibold text-accent-text"
        >
          Open the dossier
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
        {canCompare && (
          <Link
            href={`/managers/compare?a=${myOwnerId}&b=${r.ownerId}`}
            className="inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-accent-text"
          >
            <GitCompare size={13} aria-hidden="true" />
            Side by side with you
          </Link>
        )}
      </div>
    </div>
  );
}
