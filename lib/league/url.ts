/**
 * WHICH PAIR OF AXES THE LEAGUE BOARD IS SHOWING, in the URL.
 *
 * /league used to render the same fourteen rosters four times: a duration x coherence
 * scatter, a coherence list, a coherence x fragility scatter with its own grouped list,
 * and the power ranking. Measured at 375px that was 3,379px of a 3,900px page. The two
 * scatters share their geometry and their subject and differ only in what sits on the
 * x axis, so they are now one chart with a toggle, and this module owns the mapping
 * between that toggle and the query string.
 *
 * It is in the URL for the same reason /web's selection, /values' filters and /trade's
 * package are (D30, D37): a view someone can reach and cannot link to is a view they
 * cannot show anyone else, and losing it to a back button is the bug D37 fixed three
 * times over.
 *
 * WRITE STRATEGY, decided rather than copied: `history.replaceState`, not
 * `router.replace`. /league is `force-dynamic` and its server render is the expensive
 * part - it runs `leagueValueRanking`, `leagueTimelines`, `leagueFragility` and a
 * season-walking `currentFormByRoster` over the whole chain. Routing on a tap of a
 * two-item segmented control would pay all of that again for a swap that needs no
 * server data at all. Same reasoning D37 gives for /values and /trade.
 *
 * Untrusted-input posture, also per D30: nothing here throws, and a hand-edited or
 * stale param degrades to the default rather than rendering an empty board.
 */

export const BOARD_AXES = ["windows", "fragility"] as const;
export type BoardAxes = (typeof BOARD_AXES)[number];

/**
 * The window map leads. It was `duration` for one round - the duration x TCI scatter -
 * and that chart's two numbers are exactly the two the window map reads its quartiles
 * from, expressed on an axis of real seasons instead of an abstract one. A shared
 * `?board=duration` link therefore still opens on the successor to the chart it was
 * pointing at, because an unrecognised value falls through to the default below.
 */
export const DEFAULT_BOARD: BoardAxes = "windows";

export const BOARD_PARAM = "board";

export const BOARD_TABS: { id: BoardAxes; label: string; axes: string }[] = [
  // "who pays off before you" rather than "when everyone pays off": the axis orders
  // rosters against each other inside a narrow band, and a caption promising "when"
  // was the strongest calendar claim on the page. See components/WindowMap.tsx.
  { id: "windows", label: "Windows", axes: "who pays off before you" },
  { id: "fragility", label: "Fragility", axes: "TCI x RFI" },
];

function isBoard(v: string | null): v is BoardAxes {
  return v != null && (BOARD_AXES as readonly string[]).includes(v);
}

/** Read the board out of a query string. Anything unrecognised is the default. */
export function readBoard(search: string): BoardAxes {
  try {
    const v = new URLSearchParams(search).get(BOARD_PARAM);
    return isBoard(v) ? v : DEFAULT_BOARD;
  } catch {
    return DEFAULT_BOARD;
  }
}

/**
 * The query string for a board, given whatever else is already in the URL. The default
 * board drops the param entirely, so the canonical /league URL stays clean and two
 * readers who never touched the toggle share the same link.
 */
export function boardSearch(search: string, board: BoardAxes): string {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    params = new URLSearchParams();
  }
  if (board === DEFAULT_BOARD) params.delete(BOARD_PARAM);
  else params.set(BOARD_PARAM, board);
  const q = params.toString();
  return q ? `?${q}` : "";
}
