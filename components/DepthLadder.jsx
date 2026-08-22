import Link from "next/link";
import { RefusalMark } from "@/components/RefusalMark";
/**
 * ONE POSITION GROUP AS RUNGS - the partial order Sleeper published, drawn as the
 * partial order Sleeper published.
 *
 * ---------------------------------------------------------------------------------
 * WHAT WAS WRONG WITH THE LIST THIS REPLACES
 * ---------------------------------------------------------------------------------
 * The previous surface rendered `group.entries` as a flat `<ul>`, one player per row,
 * with a paragraph underneath explaining that some of the rows were actually level with
 * each other. That paragraph was doing a job the geometry was actively undoing. A stack
 * of equal rows is read top-down as a ranking by every reader who has ever seen a
 * leaderboard, and no caption survives that: the reader has already concluded that row
 * one is the starter before reaching the sentence saying they cannot know that.
 *
 * On the live payload the conclusion is wrong constantly, not occasionally. 44 of 149
 * (team, position) groups put two or more players on the same order, and 18 groups have
 * NO ORDER 1 AT ALL - MEM's power forwards come back 2, 2, 3, so a list of them puts a
 * player at the top of the page whom Sleeper never called first. "Top row = starter" is
 * not a small imprecision on those 18 groups; it is a fact the page invented.
 *
 * ---------------------------------------------------------------------------------
 * THE GEOMETRY, AND WHAT EACH PART OF IT REFUSES TO SAY
 * ---------------------------------------------------------------------------------
 * ONE RUNG PER DISTINCT STATED ORDER, and players sharing an order share the rung, side
 * by side, with nothing drawn between them. A shared rung cannot be read as "one of
 * these is above the other" the way two rows can, which is why this replaced the
 * sentence rather than joining it. Where three share an order (CHA's power forwards, all
 * at 2) the rung wraps rather than squeezing three names into 390px - wrapping inside
 * one rung is still one rung, because the divider between rungs is what separates them
 * and there is none inside.
 *
 * RUNGS ARE EVENLY SPACED. Orders 1, 2, 5 draw three rungs, not five with two empty.
 * The integer is a sort key and not a count - 117 of 149 groups are non-contiguous - so
 * proportional spacing would draw two gaps that nobody is missing from and claim a
 * precision the feed does not carry. The integers themselves are never printed.
 *
 * NO ROW IS STYLED AS FIRST. There is no accent on the top rung, no "starter" label, no
 * numbering anywhere in this component. On 18 groups that styling would be false, and a
 * treatment that is false on 12% of the data is not a treatment with an exception - it
 * is the wrong treatment. The only accent in the ladder marks OWNERSHIP, which is a fact
 * about this league's rosters rather than a claim about the chart.
 *
 * THE STILE IS ORTHOGONAL, deliberately (D96). A vertical line with horizontal ticks is
 * data; the 45-degree diagonal is reserved product-wide for a refusal, and the only
 * diagonal on this page is inside `RefusalMark`. It is also hidden on a one-rung group,
 * where an axis with a single tick would be drawing an ordering nobody stated.
 *
 * A UL AND NOT AN OL, still, and now the markup agrees with the drawing instead of
 * fighting it: an ordered list tells a screen reader "item 1 of 5", which is the exact
 * ordinal 44 groups cannot support.
 */
/**
 * A single charted player. Three ownership states and only one of them is chromatic.
 *
 * `border-accent-edge bg-surface` for the viewer's other players is not a new idiom -
 * it is `app/league/page.jsx`'s own treatment for the viewer's row, chosen there for
 * exactly this situation and for exactly this reason: the row carries arbitrary child
 * content validated against the default ground, so the border marks it and the wash is
 * left alone. The full wash stays reserved for the anchor, which is a different claim
 * ("this is the player you asked about") and already carries `aria-current`.
 *
 * Rivals and free agents get NO chromatic treatment at all. A hue per ownership class
 * would be a three-way colour scale over people, which is a verdict (D6); who holds a
 * player is stated in his own meta line in words, where it cannot be misread as a grade.
 */
function EntryCell({ entry, anchorId, holder, valueHref }) {
  const own = holder(entry.playerId);
  const href = valueHref(entry.playerId);
  const isAnchor = entry.playerId === anchorId;
  const ground = isAnchor
    ? "border-accent-edge bg-accent-wash"
    : own?.isMe
      ? "border-accent-edge bg-surface"
      : "border-border bg-surface";
  return (
    <div
      aria-current={isAnchor ? "true" : undefined}
      /* `basis-[8rem]`, not 10: at 390px the card's inner width is about 306px, and a
         10rem basis makes two cells demand 326px and wrap. 8rem lets a tied PAIR - by
         far the common case, 41 of the 44 tied groups - sit side by side as intended,
         and lets a triple wrap to 2+1 inside its brace rather than to 1+1+1. */
      className={`min-w-0 flex-1 basis-[8rem] rounded-[--radius-sm] border px-2.5 py-1.5 ${ground}`}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          {/* The name WRAPS where the meta line truncates. On a shared rung two cells
              split ~300px between them, and `truncate` turned a tied player into
              "Malik Dia..." - dropping the one piece of information the rung exists to
              carry, on exactly the groups this component was rebuilt for. A name is
              allowed a second line; the meta beside it is not, because it is already a
              summary and its own last clause is the least load-bearing. Single-cell
              rungs have room and never wrap in practice. */}
          <span className="block text-body font-semibold leading-tight text-ink">
            {href ? (
              <Link href={href} className="hover:text-accent-text">
                {entry.name}
              </Link>
            ) : (
              entry.name
            )}
          </span>
          <span className="figure block truncate text-meta leading-tight text-secondary">
            {entry.offPosition
              ? `listed ${entry.listedPosition}`
              : (entry.listedPosition ?? "position not stated")}
            {entry.age != null ? ` · ${entry.age}y` : ""}
            {entry.injuryStatus ? ` · ${entry.injuryStatus}` : ""}
            {own
              ? own.isMe
                ? " · your roster"
                : ` · ${own.name}`
              : " · not held in this league"}
          </span>
        </span>
        {own && !own.isMe && (
          <Link
            href={`/managers/${own.rosterId}`}
            className="inline-flex min-h-11 shrink-0 items-center px-1 text-meta font-semibold text-accent-text"
            aria-label={`${own.name}: read the dossier`}
          >
            Dossier
          </Link>
        )}
      </div>
    </div>
  );
}
/**
 * WHO IN THIS LEAGUE HOLDS THIS GROUP - one mark per charted player, and a count in the
 * accessible name because a strip of marks is not a reading on its own (D47 rule 1).
 *
 * A unit strip and not a bar or a percentage, because the number is 2 to 6. Every group
 * on the live payload has between 1 and 6 charted players (142 of 149 have 2 to 6), and
 * at that size a proportion is a worse answer than a count: "3 of 5" is a fact a reader
 * can check against the five names directly below it, where "60%" is a figure they have
 * to take on trust and cannot verify from the same card. One mark per player also means
 * the strip's length IS the group size, so it needs no axis and no label to be read.
 *
 * The one-charted-player case draws nothing: a single mark is not a count of anything a
 * reader could not get faster from the line of text beside it.
 *
 * Three states, one hue. Accent fill is the viewer - the app's single accent, the same
 * one the row border uses. A neutral fill is somebody else in the league. An outline is
 * nobody. The rival and the free agent are separated by FILL rather than by colour on
 * purpose, because a hue for "rival" would make this a three-colour scale over people.
 */
function OwnershipStrip({ entries, holder }) {
  if (entries.length < 2) return null;
  const held = entries.filter((e) => holder(e.playerId));
  const mine = held.filter((e) => holder(e.playerId)?.isMe);
  const label =
    `${held.length} of ${entries.length} held in this league` +
    (mine.length > 0 ? `, ${mine.length} on your roster` : ", none on yours");
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 items-center gap-[3px]"
    >
      {entries.map((e) => {
        const own = holder(e.playerId);
        return (
          <span
            key={e.playerId}
            aria-hidden="true"
            className={`h-2 w-2 rounded-[1px] border ${
              own?.isMe
                ? "border-accent bg-accent"
                : own
                  ? "border-border-strong bg-border-strong"
                  : "border-border bg-transparent"
            }`}
          />
        );
      })}
    </span>
  );
}
/**
 * @param {{
 *   group: import('@/lib/depth').DepthGroup,
 *   anchorId: string|null,
 *   holder: (playerId: string) => ({rosterId: number, isMe: boolean, name: string}|null),
 *   valueHref: (playerId: string) => (string|null),
 * }} props
 */
export function DepthLadder({ group, anchorId, holder, valueHref }) {
  const charted = group.layers.flat();
  return (
    <>
      {charted.length > 0 && (
        <div className="relative pl-3">
          {/* The stile. `inset-y-3` stops it at roughly the first and last ticks
              instead of overshooting into the card's padding, and it is absent
              entirely on a single rung - see the header. */}
          {group.layers.length > 1 && (
            <span
              aria-hidden="true"
              className="absolute inset-y-3 left-0 w-px bg-border"
            />
          )}
          <ul className="space-y-1.5">
            {group.layers.map((rung) => (
              <li key={`rung-${rung[0].order}`} className="relative">
                {group.layers.length > 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 -left-3 h-px w-2 bg-border"
                  />
                )}
                {/* THE BRACE, and it is not decoration. A shared rung is only
                    self-evident while the tied cells sit side by side, and at 390px
                    two cells carrying a full name each do not always fit on one line
                    - the first build of this component wrapped them into a column,
                    which is precisely the stacked pair that reads as a ranking. So
                    the tie is encoded by ENCLOSURE rather than by adjacency: a
                    vertical brace spanning the whole rung, with the tick meeting its
                    middle, says "these are one rung" whether they wrapped or not.
                    Single-entry rungs get no brace, because there is nothing to
                    bracket together. */}
                {rung.length > 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 -left-1 w-px bg-border-strong"
                  />
                )}
                <div className="flex flex-wrap items-stretch gap-1.5">
                  {rung.map((entry) => (
                    <EntryCell
                      key={entry.playerId}
                      entry={entry}
                      anchorId={anchorId}
                      holder={holder}
                      valueHref={valueHref}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* OFF THE AXIS, NOT AT THE BOTTOM OF IT. A player the chart places at this
          position but gives no order to is incomparable to everyone on the ladder,
          so he sits outside it carrying the refusal that says why. Appending him to
          the last rung would have made the geometry say "behind them all", which is
          the one thing the missing field cannot say.

          This never renders against Sleeper: position and order arrive together on
          all 593 on-team players (`PROVIDER_PAIRS_POSITION_AND_ORDER`). It is here so
          that if that ever changes, the entry lands here rather than on a rung. */}
      {group.unordered.length > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          <RefusalMark className="mb-1.5">
            Absent from the source: Sleeper places{" "}
            {group.unordered.length === 1 ? "this player" : "these players"} at{" "}
            {group.position} but states no order there, so{" "}
            {group.unordered.length === 1 ? "he" : "they"} cannot be placed
            against anyone above and{" "}
            {group.unordered.length === 1 ? "is" : "are"} not on the ladder at
            all. That is a missing field in the source, not a low position.
          </RefusalMark>
          <div className="flex flex-wrap items-stretch gap-1.5">
            {group.unordered.map((entry) => (
              <EntryCell
                key={entry.playerId}
                entry={entry}
                anchorId={anchorId}
                holder={holder}
                valueHref={valueHref}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
export { OwnershipStrip };
