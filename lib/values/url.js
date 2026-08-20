/**
 * URL STATE FOR /values - filters, sort, page size and a focused row, all read from
 * and written to the query string. Mirrors the shape lib/tradegraph/url.ts set for
 * /web (DECISIONS D30): one dependency-free module owns the mapping, so the reader
 * (ValuesList) and every writer (this same list, plus SearchPanel's player links,
 * which build a `focus` link with `valuesFocusHref` below) can never drift apart.
 *
 * Params, all optional:
 *   pos=PG      position filter; absent means "All"
 *   q=wemban    name search
 *   sort=age    sort order; absent means "value"
 *   n=120       how many rows are paged in; absent means one page
 *   focus=<id>  a player to expand, scroll to and briefly highlight on arrival
 */
export const VALUE_FILTERS = ["All", "PG", "SG", "SF", "PF", "C"];
/**
 * How many rows /values ranks, off the whole corpus rather than off the rostered set.
 *
 * Shared rather than inlined because /methodology now reports what share of THESE rows
 * rest on a production record, and that figure is only meaningful if it is counted over
 * the same rows the board actually draws. Two pages holding the same literal is how the
 * disclosure ends up describing a list nobody renders.
 */
export const VALUE_ROWS = 260;
// A URL is untrusted input - a hand-edited or stale link degrades to the default
// rather than throwing. Sized generously above anything this app would ever put in
// one of these params (player ids and search text are both short).
const MAX_TEXT = 100;
const MAX_LIMIT = 100_000;
export function parseValuesParams(params, page) {
  const posRaw = params.get("pos");
  const pos = VALUE_FILTERS.includes(posRaw ?? "") ? posRaw : "All";
  const q = (params.get("q") ?? "").trim().slice(0, MAX_TEXT);
  const sort = params.get("sort") === "age" ? "age" : "value";
  const nRaw = Number(params.get("n"));
  const limit =
    Number.isFinite(nRaw) && nRaw > 0
      ? Math.min(Math.floor(nRaw), MAX_LIMIT)
      : page;
  const focusRaw = (params.get("focus") ?? "").trim();
  const focus = focusRaw ? focusRaw.slice(0, MAX_TEXT) : null;
  return { pos, q, sort, limit, focus };
}
/** The inverse: state to a query string, `""` when there is nothing to say. */
export function valuesQueryString(state, page) {
  const p = new URLSearchParams();
  if (state.pos !== "All") p.set("pos", state.pos);
  if (state.q) p.set("q", state.q);
  if (state.sort !== "value") p.set("sort", state.sort);
  if (state.limit !== page) p.set("n", String(state.limit));
  if (state.focus) p.set("focus", state.focus);
  const s = p.toString();
  return s ? `?${s}` : "";
}
/** The canonical link for one player's row on /values - the only one search uses. */
export function valuesFocusHref(playerId) {
  return `/values?focus=${encodeURIComponent(playerId)}`;
}
