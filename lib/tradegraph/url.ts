/**
 * URL STATE FOR /web - what you are looking at, written down.
 *
 * The trade web's selection used to live in component state, which meant a deal you
 * had just dug out of a 14-manager ring could not be reloaded, bookmarked, or sent to
 * anybody. Two other features hit that wall from the outside: global search had no
 * trade URL to link a result at, and the digest had none to cite. This module is the
 * one place the mapping between a URL and a selection is defined, so both directions
 * (page reads it, other surfaces build it) can never drift apart.
 *
 * Deliberately dependency-free and pure: `tradeWebHref` is called from the global
 * search client component, and importing it must not drag the whole trade-graph
 * derivation into that bundle.
 *
 * Params, all optional:
 *   mode=trees          trees mode; absent means the web ring
 *   season=2024         season filter; absent means all seasons
 *   manager=<ownerId>   a focused manager
 *   pair=<edgeKey>      a focused pair of managers
 *   trade=<txId>        one specific deal (resolves to its pair, and marks the deal)
 *   asset=<moveId>      trees mode root
 */

export type WebSelection =
  | { kind: "node"; ownerId: string }
  | { kind: "edge"; key: string }
  | null;

export interface WebUrlState {
  mode: "web" | "trees";
  /** null = every season, i.e. the "All seasons" chip. */
  season: string | null;
  selection: WebSelection;
  /**
   * A deep-linked deal. Kept separate from `selection` rather than being a third
   * selection kind: the web has no per-trade geometry to light up, so a trade
   * resolves to its pair's strand and this only decides which deal in that pair's
   * list gets marked as the one that was linked.
   */
  tradeId: string | null;
  /** Trees mode root - an `AssetMove` id. */
  asset: string | null;
}

export const EMPTY_WEB_URL: WebUrlState = {
  mode: "web",
  season: null,
  selection: null,
  tradeId: null,
  asset: null,
};

/**
 * The read side of `URLSearchParams` and of Next's `ReadonlyURLSearchParams`, stated
 * structurally so this file needs no framework import.
 */
export interface ParamReader {
  get(name: string): string | null;
}

/**
 * Only here to stop an absurd string being pushed through the panels - it is not a
 * format check. Sized off the longest thing this app actually puts in one of these
 * params, which is not a bare 19-digit transaction id: a commissioner-executed
 * multi-team deal arrives as several transactions and is stitched into one
 * `coalesced-<id>+<id>+...` id, and an `AssetMove` id then appends a pipe and an
 * asset key on top of that. A real one already runs past 100 characters, so a tight
 * cap here would silently refuse to open the league's biggest deals.
 */
const MAX_PARAM = 256;

function one(v: string | null): string | null {
  if (v == null) return null;
  const s = v.trim();
  if (!s || s.length > MAX_PARAM) return null;
  return s;
}

/**
 * A URL is untrusted input - anyone can hand-edit one, and old links outlive the
 * shapes they were written against. Nothing here throws: an unreadable param reads
 * as absent, which lands on the same overview the page shows with no params at all.
 * Whether the ids actually exist in this league is checked by the caller, which is
 * the only side holding the graph.
 */
export function parseWebParams(params: ParamReader): WebUrlState {
  const trade = one(params.get("trade"));
  const pair = one(params.get("pair"));
  const manager = one(params.get("manager"));

  // Most specific wins. A link naming one deal is a stronger statement of intent
  // than one naming a pair, and a pair is stronger than a manager, so a URL
  // carrying more than one resolves down instead of being thrown out.
  const selection: WebSelection = trade
    ? null
    : pair
      ? { kind: "edge", key: pair }
      : manager
        ? { kind: "node", ownerId: manager }
        : null;

  return {
    mode: one(params.get("mode")) === "trees" ? "trees" : "web",
    season: one(params.get("season")),
    selection,
    tradeId: trade,
    asset: one(params.get("asset")),
  };
}

/**
 * The inverse: state to a query string, `""` when there is nothing to say.
 *
 * Only the params that belong to the mode being viewed are written. The URL is a
 * description of what is on screen, not a dump of every filter the component
 * remembers - a web-mode link carrying a stale trees root would invite someone to
 * "fix" one of the two later.
 */
export function webQueryString(state: WebUrlState): string {
  const p = new URLSearchParams();
  if (state.mode === "trees") {
    p.set("mode", "trees");
    if (state.asset) p.set("asset", state.asset);
  } else {
    if (state.season) p.set("season", state.season);
    if (state.tradeId) p.set("trade", state.tradeId);
    else if (state.selection?.kind === "edge") p.set("pair", state.selection.key);
    else if (state.selection?.kind === "node")
      p.set("manager", state.selection.ownerId);
  }
  const q = p.toString();
  return q ? `?${q}` : "";
}

/**
 * Which pair's strand a given deal belongs to, or null if the graph has no strand
 * for it (a deal whose parties never resolved to principals has no pair to sit on -
 * see `buildTradeGraph`'s `ownerParties`).
 *
 * A multi-team deal genuinely belongs to several pairs. The first is not an
 * arbitrary pick in an information sense: the panel for any of them renders the
 * whole deal, every side included, so every candidate strand shows the same thing.
 */
export function edgeKeyForTrade(
  edges: readonly { key: string; tradeIds: readonly string[] }[],
  tradeId: string,
): string | null {
  for (const e of edges) {
    if (e.tradeIds.includes(tradeId)) return e.key;
  }
  return null;
}

/** The canonical URL for one deal. The only trade URL in the app - link from here. */
export function tradeWebHref(tradeId: string): string {
  return `/web${webQueryString({ ...EMPTY_WEB_URL, tradeId })}`;
}

/**
 * The canonical URL for one pair's strand. Takes an already-built edge key rather than
 * two owner ids: the key convention belongs to the graph (`pairEdgeKey`), and this
 * module stays free of that import on purpose - a client bundle that only wants a
 * trade link must not pull the whole trade-graph derivation in behind it.
 */
export function pairWebHref(edgeKey: string): string {
  return `/web${webQueryString({
    ...EMPTY_WEB_URL,
    selection: { kind: "edge", key: edgeKey },
  })}`;
}

/** The canonical URL for a manager's strands on the web. */
export function managerWebHref(ownerId: string): string {
  return `/web${webQueryString({
    ...EMPTY_WEB_URL,
    selection: { kind: "node", ownerId },
  })}`;
}
