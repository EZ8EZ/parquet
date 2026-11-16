/**
 * Lock state from what Sleeper does expose. The API has no lock flag; a lock is certain
 * only when the banked score differs from the latest completed game and matches an
 * earlier one (study section 2: 34 certain, 50 ambiguous, 10 reset, 4 mid-game, n=98).
 * States: "locked" | "unknown_until_next_tip" | "reset". Never "unlocked".
 * null with a reason when no state applies (no game yet, empty slot, unexplained score).
 */
const EPS = 0.011;
const same = (a, b) => Math.abs(a - b) < EPS;

/**
 * banked: the slot's starters_points. weekGames: this week's team games for the player,
 * date-sorted, each { status, row } where row is his log row (or null) for that game.
 */
export function inferLockState(banked, weekGames) {
  if (banked == null) return { state: null, reason: "empty_slot", certain: false, score: null };
  const done = weekGames.filter((g) => g.status === "complete");
  const live = weekGames.find((g) => g.status === "in_game") || null;
  const fpOf = (g) => (g.row && g.row.sp > 0 ? g.row.fp : 0);
  const playedDone = done.filter((g) => g.row && g.row.sp > 0);

  if (live) {
    const liveFp = fpOf(live);
    const earlier = playedDone.some((g) => same(fpOf(g), banked));
    if (earlier && !same(liveFp, banked)) return { state: "locked", reason: "banked_matches_earlier_game", certain: true, score: banked };
    if (!earlier && same(liveFp, banked) && playedDone.length > 0)
      return { state: "reset", reason: "reset_at_tip_now_tracking_live_game", certain: true, score: banked };
    if (!playedDone.length) return { state: null, reason: "first_game_in_progress", certain: false, score: banked };
    return { state: null, reason: "mid_game_unexplained", certain: false, score: banked };
  }
  if (!done.length) return { state: null, reason: "no_game_yet", certain: false, score: banked };
  const latest = done[done.length - 1];
  const latestFp = fpOf(latest);
  const earlierDone = done.slice(0, -1);
  if (same(banked, latestFp)) {
    if (latestFp === 0 && !(latest.row && latest.row.sp > 0)) {
      if (playedDone.length > 0) return { state: "reset", reason: "latest_game_dnp", certain: true, score: 0 };
      return { state: null, reason: "no_game_played_yet", certain: false, score: 0 };
    }
    // No game left this week: locked or not, this is the slot's score.
    if (!weekGames.some((g) => g.status === "pre_game" || g.status === "postponed"))
      return { state: null, reason: "final_game_score_stands", certain: false, score: banked };
    return { state: "unknown_until_next_tip", reason: "banked_equals_latest_game", certain: false, score: banked };
  }
  if (earlierDone.some((g) => g.row && g.row.sp > 0 && same(fpOf(g), banked)))
    return { state: "locked", reason: "banked_matches_earlier_game", certain: true, score: banked };
  return { state: null, reason: "banked_matches_no_loaded_game", certain: false, score: banked };
}
