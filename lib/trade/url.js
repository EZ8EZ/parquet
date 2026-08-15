/**
 * URL STATE FOR /trade - the package you're building, written down.
 *
 * `TradeBuilder`'s give/get/pick selections used to live in plain `useState`, so
 * checking a player's value or a manager's dossier mid-build (both one tap away)
 * destroyed the whole package. Mirrors the pattern lib/tradegraph/url.ts set for
 * /web (DECISIONS D30): one dependency-free module owns the mapping between a URL
 * and a selection, so the reader (`TradeBuilder`) and the writer (the same
 * component, committing on every add/remove) can never drift apart.
 *
 * Ids only - no names, values or metadata, all of which are looked up fresh from
 * whichever player/pick pool the page hands the builder. That is also what makes a
 * shared link work on someone else's phone: `TradeBuilder` resolves an id against
 * the UNION of both sides' pools rather than "my roster" specifically, so it does
 * not matter whose roster the id nominally sits on for the person who opens the
 * link - only that the player or pick still exists in this league.
 *
 * Params, all optional, each a comma-joined list of ids:
 *   give=<ids>   players you send
 *   get=<ids>    players you receive
 *   gp=<ids>     picks you send   (pick id: "<season>-<round>-<originalRosterId>")
 *   rp=<ids>     picks you receive
 */
export const EMPTY_TRADE_PACKAGE = {
  give: [],
  get: [],
  givePicks: [],
  getPicks: [],
};
// A URL is untrusted input - a hand-edited or stale link degrades gracefully
// instead of throwing. Real player ids are short numeric strings and real pick ids
// are "<season>-<round>-<rosterId>" (rarely past 12 characters), so 80 is already
// generous; the count cap guards against someone pasting a novel into the address
// bar rather than reflecting any real roster size.
const MAX_ID_LEN = 80;
const MAX_IDS = 40;
function decodeList(raw) {
  if (!raw) return [];
  const out = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id || id.length > MAX_ID_LEN) continue;
    out.push(id);
    if (out.length >= MAX_IDS) break;
  }
  return out;
}
function encodeList(ids) {
  return ids
    .map((id) => id.trim())
    .filter(Boolean)
    .join(",");
}
/**
 * Bogus or unresolvable ids are NOT filtered here - this module only knows about
 * strings, not about which players or picks actually exist. `TradeBuilder` is the
 * side holding both pools, so it is the one that drops an id nothing resolves to
 * (same division of labour as `parseWebParams`/graph validation in
 * lib/tradegraph/url.ts).
 */
export function parseTradeParams(params) {
  return {
    give: decodeList(params.get("give")),
    get: decodeList(params.get("get")),
    givePicks: decodeList(params.get("gp")),
    getPicks: decodeList(params.get("rp")),
  };
}
/** The inverse: a package to a query string, `""` when there is nothing to say. */
export function tradeQueryString(pkg) {
  const p = new URLSearchParams();
  const give = encodeList(pkg.give);
  const get = encodeList(pkg.get);
  const gp = encodeList(pkg.givePicks);
  const rp = encodeList(pkg.getPicks);
  if (give) p.set("give", give);
  if (get) p.set("get", get);
  if (gp) p.set("gp", gp);
  if (rp) p.set("rp", rp);
  const s = p.toString();
  return s ? `?${s}` : "";
}
/** The canonical, shareable link for one package. */
export function tradeHref(pkg) {
  return `/trade${tradeQueryString(pkg)}`;
}
export function isEmptyTradePackage(pkg) {
  return (
    pkg.give.length === 0 &&
    pkg.get.length === 0 &&
    pkg.givePicks.length === 0 &&
    pkg.getPicks.length === 0
  );
}
