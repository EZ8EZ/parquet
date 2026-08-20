/**
 * WHAT THE LEAGUE BOARD IS SHOWING, AND WHICH ROSTER IS SELECTED, in the URL.
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
export const BOARD_AXES = ["windows", "fragility"];
/**
 * The window map leads. It was `duration` for one round - the duration x TCI scatter -
 * and that chart's two numbers are exactly the two the window map reads its quartiles
 * from, expressed on an axis of real seasons instead of an abstract one. A shared
 * `?board=duration` link therefore still opens on the successor to the chart it was
 * pointing at, because an unrecognised value falls through to the default below.
 */
export const DEFAULT_BOARD = "windows";
export const BOARD_PARAM = "board";
/**
 * THE TABS ARE QUESTIONS NOW, NOT CHART-TYPE NOUNS.
 *
 * They read "Windows" / "Fragility" - the names of the instruments - with the reading
 * demoted to the sub-label. That is backwards for a two-item control where both items
 * are the SAME fourteen rosters seen through different lenses: a reader choosing between
 * two nouns is choosing a chart, and a reader choosing between two questions is choosing
 * what they want to know. The question leads and the axis pair goes underneath, where it
 * is still available to anyone who wants to know which instrument they are looking at.
 *
 * "Whose season runs through a few names" IS NOT "who can't absorb a hit", and the
 * difference is not stylistic. RFI measures how concentrated a roster's startable value
 * is; it does not measure resilience, and lib/metrics/quadrant.js is explicit that the
 * most torn-down roster in a league scores LOW because a roster with nothing to lose
 * loses nothing - so "can't absorb a hit" would be false at the low end of its own axis
 * and a grade at the high end (D6, D23). The quadrant's own gists already say the true
 * thing - "running through a short list of names" - and this is that, as a question.
 */
export const BOARD_TABS = [
  // "who pays off before you" rather than "when everyone pays off": the axis orders
  // rosters against each other inside a narrow band, and a caption promising "when"
  // was the strongest calendar claim on the page. See components/WindowMap.jsx.
  {
    id: "windows",
    label: "Who pays off before you",
    axes: "seasons x rosters",
  },
  {
    id: "fragility",
    label: "Whose season runs through a few names",
    axes: "TCI x RFI",
  },
];
function isBoard(v) {
  return v != null && BOARD_AXES.includes(v);
}
/**
 * WHICH ROSTER IS SELECTED, and why it is a second param rather than a second scheme.
 *
 * Selection drives BOTH lenses at once - the bar that lifts off the window map and the
 * dot that grows a ring on the quadrant are one state - so it has to survive a tab
 * switch, and a reader who says "look at row 9 on the fragility board" has to be able to
 * send that as a link. Both facts are the same fact: the two params compose, so
 * `leagueSearch` merges rather than replaces and switching tabs cannot silently drop the
 * selection the way two independent writers of `?...` would.
 *
 * A roster id is a small positive integer in this app (1..totalRosters). Nothing here
 * validates it against the league, deliberately: this module has no league to check
 * against, and a syntactically fine id for a roster that does not exist has to degrade
 * at the point of use, where the roster list is. So this returns a NUMBER or null, and
 * the caller resolving it to a roster is the one that falls back.
 */
export const ROSTER_PARAM = "roster";
/** The selected roster id from a query string, or null. Never throws. */
export function readRoster(search) {
  try {
    const v = new URLSearchParams(search).get(ROSTER_PARAM);
    if (v == null || !/^\d{1,4}$/.test(v)) return null;
    const n = Number(v);
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}
/** Read the board out of a query string. Anything unrecognised is the default. */
export function readBoard(search) {
  try {
    const v = new URLSearchParams(search).get(BOARD_PARAM);
    return isBoard(v) ? v : DEFAULT_BOARD;
  } catch {
    return DEFAULT_BOARD;
  }
}
/**
 * THE ONE WRITER. The query string for a patch of league state, given whatever else is
 * already in the URL.
 *
 * A default value DROPS its param rather than writing it, so the canonical /league URL
 * stays clean and two readers who never touched a control share the same link. For the
 * board that default is `DEFAULT_BOARD`; for the roster it is null, which is what the
 * page resolves to "your own roster" - so /league with no params is still the viewer's
 * own seat, and `?roster=9` is the only case that needs saying out loud.
 *
 * Only the keys PRESENT in `patch` are touched. Everything else on the URL - the other
 * league param, and anything a future round adds - is carried through untouched, which
 * is the property that lets the tabs and the roster selectors both write here without
 * either one clearing the other.
 *
 * @param {string} search the current query string, with or without a leading "?"
 * @param {{ board?: string, roster?: number|null }} patch
 */
export function leagueSearch(search, patch) {
  let params;
  try {
    params = new URLSearchParams(search);
  } catch {
    params = new URLSearchParams();
  }
  if ("board" in patch) {
    if (patch.board === DEFAULT_BOARD) params.delete(BOARD_PARAM);
    else params.set(BOARD_PARAM, String(patch.board));
  }
  if ("roster" in patch) {
    if (patch.roster == null) params.delete(ROSTER_PARAM);
    else params.set(ROSTER_PARAM, String(patch.roster));
  }
  const q = params.toString();
  return q ? `?${q}` : "";
}
/** `leagueSearch` for a board alone. Kept because a board switch is its own event. */
export function boardSearch(search, board) {
  return leagueSearch(search, { board });
}
/** `leagueSearch` for a roster alone. */
export function rosterSearch(search, roster) {
  return leagueSearch(search, { roster });
}
