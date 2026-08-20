"use client";
/**
 * ONE SELECTED ROSTER, SHARED BY EVERYTHING ON /league THAT CAN SHOW ONE.
 *
 * ---------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------
 * Selection used to be private state inside `CoherenceFragilityQuadrant`. That made it
 * the only surface on the page that knew which roster the reader was looking at, with
 * three consequences the page could not fix from outside:
 *
 *   - Switching to the window map lost it, so the two lenses on the same fourteen
 *     rosters could not be read against each other.
 *   - The power ranking under both charts had no idea a selection existed, so the one
 *     list that prints every number in text could not be the control surface for the
 *     charts that draw them.
 *   - It was not addressable. "Look at row 9 on the fragility board" was an
 *     instruction rather than a link, which is the thing D30 and D37 keep fixing.
 *
 * So selection is page state, in `?roster=` (lib/league/url.js), and this provider owns
 * it. Everything that can select - the ranking rows, the seat card's comparison chips,
 * the quadrant's dots - calls the same `select`, so there is exactly one selection idiom
 * on the page rather than one per component.
 *
 * WRITE STRATEGY: `history.replaceState`, same as the board toggle and for the same
 * reason (lib/league/url.js). /league is `force-dynamic` and its server render walks the
 * league four times; routing on a tap of a roster row would pay all of that again for a
 * swap that needs no server data at all. `leagueSearch` MERGES, so a selection write
 * cannot drop the board param and a board write cannot drop the selection.
 *
 * ---------------------------------------------------------------------------------
 * THE LIVE REGION, AND WHY IT IS HERE RATHER THAN IN A CHART
 * ---------------------------------------------------------------------------------
 * A sighted reader taps a row and watches a bar lift, a dot grow a ring, and a panel
 * change. A screen-reader user taps the same row and, before this, got nothing at all:
 * `aria-pressed` flips on the control they are standing on, and every other consequence
 * of the tap happens somewhere else in the document. So one polite live region announces
 * the newly selected roster's key facts, sitting at the provider level because the facts
 * span both lenses and neither chart owns them.
 *
 * IT DOES NOT ANNOUNCE ON MOUNT. The initial selection is not something the reader did -
 * it is the URL, or their own roster - and a live region that fires on page load reads
 * out a fact nobody asked for over the top of whatever the page was already saying.
 * `announced` therefore starts null and is only ever set by `select`.
 *
 * The sentences come from the server (`factsById`), for the reason every other string in
 * this app comes from a derivation rather than a component: what a screen-reader user
 * hears has to be the same claim a sighted reader sees, and the only way to guarantee
 * that is for both to read one string.
 */
import { createContext, useContext, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { leagueSearch, readRoster } from "@/lib/league/url";
const SelectionContext = createContext(null);
/**
 * @param {Object} props
 * @param {number|null} props.myRosterId the viewer's own roster, the fallback selection
 * @param {number[]} props.rosterIds every selectable roster, for validating the param
 * @param {Record<string, string>} props.factsById one sentence per roster, for the
 *   live region. Server-built so it cannot disagree with what the page prints.
 * @param {React.ReactNode} props.children
 */
export function LeagueSelectionProvider({
  myRosterId,
  rosterIds,
  factsById,
  children,
}) {
  const params = useSearchParams();
  /*
   * Seeded from the query string exactly once, through `useSearchParams` so the SERVER
   * render already has the right selection and a shared /league?roster=9 link opens on
   * roster 9 rather than flipping to it after hydration.
   *
   * THE VALIDATION THAT `readRoster` DELIBERATELY DOES NOT DO happens here, because
   * this is the first place with a league to check against: a syntactically fine id for
   * a roster that does not exist falls back to the viewer's own seat rather than to an
   * empty panel.
   */
  const [selected, setSelected] = useState(() => {
    const fromUrl = readRoster(params.toString());
    if (fromUrl != null && rosterIds.includes(fromUrl)) return fromUrl;
    return myRosterId ?? rosterIds[0] ?? null;
  });
  const [announced, setAnnounced] = useState(null);
  const value = useMemo(
    () => ({
      selected,
      isSelected: (id) => id === selected,
      select(id) {
        if (id === selected) return;
        setSelected(id);
        setAnnounced(factsById[String(id)] ?? null);
        const { pathname, search, hash } = window.location;
        window.history.replaceState(
          null,
          "",
          `${pathname}${leagueSearch(search, { roster: id })}${hash}`,
        );
      },
    }),
    [selected, factsById],
  );
  return (
    <SelectionContext.Provider value={value}>
      {children}
      {/* Polite, not assertive: choosing a roster is not an interruption, and a reader
          moving down fourteen rows with a keyboard would be talked over by an assertive
          region on every one of them. `sr-only` rather than hidden - an aria-hidden or
          display:none region announces nothing. */}
      <div aria-live="polite" className="sr-only">
        {announced}
      </div>
    </SelectionContext.Provider>
  );
}
/** The selection, for any control or view on /league. Throws outside the provider. */
export function useLeagueSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx)
    throw new Error(
      "useLeagueSelection must be used inside LeagueSelectionProvider",
    );
  return ctx;
}
/**
 * ONE ROSTER AS A TAPPABLE CHIP - the second of the page's TWO selection idioms, and
 * there are deliberately only two.
 *
 * The rows in the power ranking are the primary one; this is for the places that name a
 * SET of rosters in passing - the seat card's comparison buckets, the crossed-boards
 * thesis - where a full row per roster would be a third and fourth rendering of the same
 * fourteen teams, which is exactly what round 8 spent 3,379px unwinding.
 *
 * It lives here rather than in either caller so there is one implementation. A chip that
 * selects in the seat card and a chip that only looks like it selects under the board
 * would be the same class of bug as two classifiers sharing a vocabulary.
 *
 * A real `<button aria-pressed>`, not a styled span: this is a control, and the only
 * thing that makes a control reachable by keyboard and announceable by a screen reader
 * is being one. `min-h-11` because every interactive control in this app clears 44px
 * (DESIGN.md), chip scale included.
 */
export function RosterChip({ roster }) {
  const { isSelected, select } = useLeagueSelection();
  const on = isSelected(roster.rosterId);
  return (
    <button
      type="button"
      onClick={() => select(roster.rosterId)}
      aria-pressed={on}
      className={
        `inline-flex min-h-11 max-w-full items-center gap-1 rounded-full border px-2 text-meta transition-colors ` +
        (on
          ? "border-ink bg-surface font-semibold text-ink"
          : "border-border bg-surface text-secondary hover:border-border-strong hover:text-ink")
      }
    >
      <span className="figure text-micro text-faint">{roster.n}</span>
      <span className="truncate">{roster.name}</span>
    </button>
  );
}
