/**
 * PLAYOFFS - who actually won, and what that means for the draft.
 *
 * Until this existed, the app had no concept of a champion at all: every "best season"
 * figure anywhere in it, Season Recap included, was regular-season record only. For a
 * dynasty companion built on memory, the single fact a league remembers longest was
 * the one thing it could not tell you.
 *
 * Two jobs, one bracket:
 *
 *   1. WHO WON. Final placements come off the bracket's placement games - a game
 *      carrying `p` decides that place, winner takes `p` and loser `p + 1`. Verified
 *      against all four complete seasons of the real league.
 *
 *   2. WHAT DRAFTS NEXT. `pickValue` has always believed `originalTeamRank: 1` means
 *      the CHAMPION (there is a test named "makes the champion pick last"), but
 *      `strengthRanks` was handing it a regular-season record rank. A title-winning
 *      6-seed was therefore priced as if it drafted sixth-from-last. `finalStandings`
 *      below is what makes the model's own stated intent true.
 *
 * ATTRIBUTION. Bracket entries carry `roster_id` and nothing else, so crediting a
 * title to a PERSON goes through `principals.ownerAt(season, rosterId)` - the primitive
 * D22 exists to enforce. Roster 11 changed hands between 2024 and 2025 in this league,
 * which is exactly the case a roster-keyed join gets wrong.
 */
/**
 * Final places from a bracket's placement games.
 *
 * Deliberately reads ONLY games carrying a placement. Advancement games say who moved
 * on, not where anyone finished, and inferring a place from "lost in round 2" would be
 * guessing at a bracket shape this function has no business assuming.
 *
 * An undecided game (no winner yet, i.e. playoffs in progress) contributes nothing
 * rather than half a result.
 */
export function placementsFrom(games) {
  const out = new Map();
  for (const g of games) {
    if (g.placement == null || g.winner == null || g.loser == null) continue;
    out.set(g.winner, g.placement);
    out.set(g.loser, g.placement + 1);
  }
  return out;
}
/** The champion, or null when no championship game has been decided. */
export function championFrom(games) {
  for (const g of games) {
    if (g.placement === 1 && g.winner != null) return g.winner;
  }
  return null;
}
export function seasonResult(season, games) {
  const placeByRoster = placementsFrom(games);
  let runnerUp = null;
  for (const [rosterId, place] of placeByRoster)
    if (place === 2) runnerUp = rosterId;
  return {
    season,
    placeByRoster,
    championRosterId: championFrom(games),
    runnerUpRosterId: runnerUp,
    placesDecided: placeByRoster.size,
  };
}
/** Every season with a decided result, oldest first. */
export function seasonResults(h) {
  const out = [];
  for (const league of h.chain) {
    const games = h.brackets.get(league.season);
    if (!games || games.length === 0) continue;
    const r = seasonResult(league.season, games);
    if (r.championRosterId != null) out.push(r);
  }
  return out;
}
/**
 * Every title in league history, credited to the principal who actually won it.
 *
 * `ownerAt` is the whole point: a roster that changed hands would otherwise hand a
 * departed manager's ring to their successor.
 */
export function titles(h, principals) {
  return seasonResults(h).map((r) => ({
    season: r.season,
    rosterId: r.championRosterId,
    ownerId: principals.ownerAt(r.season, r.championRosterId),
  }));
}
/** ownerId -> the seasons they won, oldest first. */
export function titlesByOwner(h, principals) {
  const out = new Map();
  for (const t of titles(h, principals)) {
    if (!t.ownerId) continue;
    const list = out.get(t.ownerId) ?? [];
    list.push(t.season);
    out.set(t.ownerId, list);
  }
  return out;
}
/**
 * Where the most recently decided playoffs left the teams that reached them.
 *
 * ONLY the playoff finishers, deliberately. This does not attempt a full 1..14 order,
 * because the teams that missed have no playoff result to rank them by and this module
 * has no better signal for them than the caller already has - `strengthRanks` owns that
 * part and keeps its existing record-or-talent ordering for them. Splitting it this way
 * is what stops the fix for the playoff teams becoming a regression for everyone else.
 *
 * Null when no season has a decided champion.
 */
export function playoffPlaces(h) {
  const results = seasonResults(h);
  const latest = results[results.length - 1];
  if (!latest || latest.placeByRoster.size === 0) return null;
  return latest.placeByRoster;
}
