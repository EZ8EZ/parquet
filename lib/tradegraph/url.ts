/**
 * THE TRADE URLS - one deal, one address.
 *
 * `tradeWebHref` used to build `/web?trade=<id>`, and every caller that wanted "show
 * me this deal" - the digest, global search, Manager Compare, the commissioner's
 * audit log - dropped its reader into a 14-node ring with one strand lit and a list
 * of that pair's other deals underneath. The deal itself was never the page. Now it
 * is: `dealHref` returns `/deals/<transactionId>`, and every one of those callers
 * keeps working through this one file.
 *
 * Deliberately dependency-free and pure: `dealHref` is called from the global search
 * CLIENT component, and importing it must not drag the trade-ledger derivation into
 * that bundle. Same reason `pairDealsHref` takes an already-built key rather than two
 * owner ids - the key convention belongs to `pairEdgeKey` in the derivation.
 *
 * The index at `/deals` takes two optional, mutually exclusive filters:
 *   manager=<ownerId>   one manager's deals
 *   pair=<edgeKey>      the deals between one pair
 * Neither is required and neither ever throws - see `parseDealsParams`.
 */

export interface DealsUrlState {
  /** A focused manager, by principal id. */
  manager: string | null;
  /** A focused pairing, by `pairEdgeKey`. */
  pair: string | null;
  /** null = every season. */
  season: string | null;
}

export const EMPTY_DEALS_URL: DealsUrlState = {
  manager: null,
  pair: null,
  season: null,
};

/**
 * The read side of `URLSearchParams` and of Next's `ReadonlyURLSearchParams`, stated
 * structurally so this file needs no framework import.
 */
export interface ParamReader {
  get(name: string): string | null;
}

/**
 * Only here to stop an absurd string being pushed through a filter - it is not a
 * format check. Sized off the longest thing this app actually puts in one of these
 * params, which is not a bare 19-digit transaction id: a commissioner-executed
 * multi-team deal arrives as several transactions and is stitched into one
 * `coalesced-<id>+<id>+...` id. A real one already runs past 100 characters, so a
 * tight cap here would silently refuse the league's biggest deals.
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
 * shapes they were written against. Nothing here throws: an unreadable param reads as
 * absent, which lands on the unfiltered index. Whether the ids actually exist in this
 * league is checked by the caller, which is the only side holding the ledger.
 */
export function parseDealsParams(params: ParamReader): DealsUrlState {
  const pair = one(params.get("pair"));
  const manager = one(params.get("manager"));
  // Most specific wins. A link naming a pair is a stronger statement of intent than
  // one naming a manager, so a URL carrying both resolves down instead of being
  // thrown out.
  return {
    manager: pair ? null : manager,
    pair,
    season: one(params.get("season")),
  };
}

/** The inverse: state to a query string, `""` when there is nothing to say. */
export function dealsQueryString(state: DealsUrlState): string {
  const p = new URLSearchParams();
  if (state.pair) p.set("pair", state.pair);
  else if (state.manager) p.set("manager", state.manager);
  if (state.season) p.set("season", state.season);
  const q = p.toString();
  return q ? `?${q}` : "";
}

/**
 * THE canonical URL for one deal. The only trade URL in the app - link from here.
 *
 * A transaction id can contain characters a path segment must escape (the coalescer
 * joins ids with `+`), so it is encoded rather than interpolated raw.
 */
export function dealHref(tradeId: string): string {
  return `/deals/${encodeURIComponent(tradeId)}`;
}

/** The deals between one pair. Takes an already-built `pairEdgeKey`. */
export function pairDealsHref(edgeKey: string): string {
  return `/deals${dealsQueryString({ ...EMPTY_DEALS_URL, pair: edgeKey })}`;
}

/** One manager's deals. */
export function managerDealsHref(ownerId: string): string {
  return `/deals${dealsQueryString({ ...EMPTY_DEALS_URL, manager: ownerId })}`;
}

/**
 * THE canonical URL for one asset's provenance rail.
 *
 * Every asset has one, including a player who has never been traded, so there is no
 * "does this asset have a story" check to make before linking - see the header of
 * lib/provenance for why the empty state was designed out rather than styled.
 */
export function lineageHref(assetKey: string): string {
  return `/lineage/${encodeURIComponent(assetKey)}`;
}

/** Convenience for the common case: a player id straight to their rail. */
export function playerLineageHref(playerId: string): string {
  return lineageHref(`p:${playerId}`);
}
