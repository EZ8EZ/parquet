/**
 * Storage glue for the /rank drag board: turning a drag gesture and a stored
 * string into the ordered id list `customSource()` expects.
 *
 * Kept out of ./index on purpose - that module is pure rank arithmetic with no
 * notion of storage, gestures, or a rankable pool that changes week to week.
 * This module is the only place that knows about any of that.
 *
 * The COOKIE is the store, and the only one. It is the single form both halves
 * of the app can read: the /rank board reads it off `document.cookie` on mount
 * (synchronous, no network hop, same timing localStorage had), and server
 * components read the same value out of the request via customOrderServer.ts -
 * which is what lets /trade/finder cite the viewer's own ranking at all. One
 * store means /rank and the finder can never tell two different stories about
 * what the viewer's opinion even is, which a localStorage-plus-mirror design
 * could (the two drift the moment one is cleared without the other).
 *
 * localStorage appears below only as a LEGACY migration source: earlier
 * versions of /rank saved there exclusively, so the first mount after this
 * change reads it once when no cookie exists yet, adopts it, and the mirror
 * write promotes it to the cookie. Nothing writes localStorage any more.
 */
/** Versioned so a future schema change can migrate or discard old saves instead
 *  of silently misreading them. */
export const CUSTOM_RANK_STORAGE_KEY = "parquet:custom-rank:v1";
/** Mirrors the `parquet_roster` / `parquet_digest_seen` convention: readable,
 *  non-httpOnly, one year. */
export const CUSTOM_RANK_COOKIE = "parquet_custom_rank";
/**
 * Upper bound on ranked players in one cookie. /rank's pool is 120 today; the
 * cap is what stops a larger future pool (or a hand-edited cookie) from pushing
 * the request headers toward the 4KB limit every browser enforces. 120 real
 * player ids encode to roughly 720 bytes, so this leaves plenty of room.
 */
export const MAX_RANKED_IN_COOKIE = 200;
const COOKIE_VERSION = "v1";
const ID_SEPARATOR = "~";
/**
 * Player ids as every provider in this app produces them: Sleeper's numeric
 * strings and the fixture generator's `p12`. Anything outside this cannot be a
 * real id, and letting it through would put the separator characters below into
 * a value that has to survive a cookie round trip.
 */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
export function isSafePlayerId(id) {
  return SAFE_ID.test(id);
}
/**
 * Encode an order for a cookie value.
 *
 * Uses only `.` and `~`, both legal cookie-octets, exactly as the digest marker
 * does - a comma or a quote would be at the mercy of whichever layer decides to
 * percent-encode it. The version prefix means a future shape change expires old
 * cookies instead of misreading them.
 */
export function encodeCustomOrderCookie(orderedPlayerIds) {
  const ids = orderedPlayerIds
    .filter(isSafePlayerId)
    .slice(0, MAX_RANKED_IN_COOKIE);
  return `${COOKIE_VERSION}.${ids.join(ID_SEPARATOR)}`;
}
/**
 * Parse a cookie value back into an order. Never throws.
 *
 * This is user-writable input, so anything unrecognised degrades to "no custom
 * ranking yet" rather than to a partially-trusted order. Duplicate ids are
 * dropped rather than kept, because `customSource` assigns rank by position and
 * a duplicate would silently hand one player two different ranks.
 */
export function parseCustomOrderCookie(raw) {
  if (!raw) return [];
  const dot = raw.indexOf(".");
  if (dot === -1 || raw.slice(0, dot) !== COOKIE_VERSION) return [];
  const body = raw.slice(dot + 1);
  if (body.length === 0) return [];
  const out = [];
  const seen = new Set();
  for (const id of body.split(ID_SEPARATOR)) {
    if (!isSafePlayerId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length === MAX_RANKED_IN_COOKIE) break;
  }
  return out;
}
/**
 * Read the custom-order cookie out of a cookie-header-shaped string, i.e. what
 * `document.cookie` hands a client component. Client code cannot touch
 * next/headers, so this is the client's half of the read path that
 * customOrderServer.ts provides for server components - both funnel into the
 * same `parseCustomOrderCookie`, so the two sides cannot parse differently.
 */
export function customOrderFromCookieHeader(header) {
  if (!header) return [];
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== CUSTOM_RANK_COOKIE) continue;
    return parseCustomOrderCookie(part.slice(eq + 1).trim());
  }
  return [];
}
/**
 * Parse whatever localStorage handed back. LEGACY READ ONLY: earlier versions
 * of /rank persisted here, so this exists to migrate an old save into the
 * cookie on first mount - nothing writes this format any more. Untrusted input
 * (a stale schema version, hand-edited storage, plain corruption) degrades to
 * "no custom ranking yet" instead of throwing and blanking the page.
 */
export function parseCustomOrder(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((x) => typeof x === "string");
}
/**
 * Move one entry to a new position in an ordered list, immutably.
 *
 * This is the one piece of pure logic behind the drag gesture: the pointer
 * handler only has to work out `toIndex` from where the finger is, then hand
 * off here, so the actual list surgery is unit-testable with no DOM involved.
 * Out-of-range or no-op moves return the input unchanged (same reference),
 * which lets a caller skip a re-render when nothing actually moved.
 */
export function reorder(list, fromIndex, toIndex) {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= list.length ||
    toIndex < 0 ||
    toIndex >= list.length
  ) {
    return list;
  }
  const next = list.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
/**
 * Reconcile a stored custom order against this week's rankable pool.
 *
 * A dynasty roster churns: a player traded away or dropped below the pool
 * cutoff shouldn't linger in the saved order forever, and a player who newly
 * entered the pool needs a slot or blending silently ignores them (their rank
 * just falls through to consensus, per blendSources - fine as a default, but
 * they should still be draggable). Order is preserved for everyone already
 * ranked; newcomers land at the end in whatever order the pool already has
 * them, which is consensus order.
 */
export function syncCustomOrder(stored, poolIds) {
  const pool = new Set(poolIds);
  const kept = stored.filter((id) => pool.has(id));
  const keptSet = new Set(kept);
  const additions = poolIds.filter((id) => !keptSet.has(id));
  return [...kept, ...additions];
}
