/**
 * URL SHAPE FOR THE DEPTH CHART - `/depth/LAL?player=1234`.
 *
 * WHY THE TEAM IS THE PATH AND THE PLAYER IS A QUERY PARAM. The content of that page
 * is one team's chart; the player is where the reader arrived from and who gets
 * highlighted when they get there. Putting the player in the path would claim the page
 * is about him, and then two readers looking at the same fifteen names would be at two
 * different addresses. This is the same split `/values?focus=` already uses for the
 * same reason (lib/values/url.js): the list is the page, the focused row is a lens on
 * it.
 *
 * One dependency-free module owns the mapping, so the page that reads the params and
 * every row that writes a link cannot drift apart.
 */
/** Player ids are short numeric strings on Sleeper; the cap is for hand-edited URLs. */
const MAX_ID = 64;
/**
 * The canonical link to a team's depth chart, optionally anchored on one player.
 * @param {string|null|undefined} team
 * @param {string|null|undefined} [playerId]
 * @returns {string|null} null when there is no team, so a caller with a free agent
 *   renders nothing instead of linking to `/depth/`
 */
export function depthChartHref(team, playerId) {
  const abbr = team ? String(team).trim().toUpperCase() : "";
  if (!abbr) return null;
  const base = `/depth/${encodeURIComponent(abbr)}`;
  return playerId ? `${base}?player=${encodeURIComponent(playerId)}` : base;
}
/**
 * The anchored player from a Next.js `searchParams` object. Untrusted input: a stale
 * or hand-edited link degrades to "no anchor" rather than throwing, and an id that is
 * not on the team simply highlights nothing (the page says so).
 *
 * @param {Record<string, string|string[]|undefined>|null|undefined} sp
 * @returns {string|null}
 */
export function readAnchorId(sp) {
  if (!sp) return null;
  const raw = sp.player;
  const one = Array.isArray(raw) ? raw[0] : raw;
  if (typeof one !== "string") return null;
  const trimmed = one.trim().slice(0, MAX_ID);
  return trimmed || null;
}
