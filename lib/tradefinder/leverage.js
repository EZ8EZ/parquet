/**
 * D75 named this integration and set it aside as too close to the same day's already-
 * shipped Positional Leverage Index (D68) to read as that round's step change - "real
 * and buildable... a later round should still do it." This is that later round.
 *
 * WHAT THIS ANSWERS, that /lab/leverage's own page cannot: not "where does my roster
 * sit today" but "where would this specific deal LEAVE me" - the single number a
 * manager actually needs before accepting a package, at the position(s) the package
 * actually moves.
 *
 * WHY THE LEAGUE'S OWN POOLS NEED NO RECOMPUTATION PER PACKAGE. `leaguePositionPools`
 * (lib/lab/leverage) totals every rostered asset's value BY POSITION, LEAGUE-WIDE - a
 * player traded from one roster in this league to another still sits in that same
 * league-wide pool afterwards, at the same value. A two-roster trade changes who OWNS
 * value at a position; it does not change how much of it exists at that position
 * leaguewide. So `leagueSharePos`, `scarcityByPos`, `replacementByPos` and `topByPos`
 * are IDENTICAL before and after any trade this finder proposes, and the only thing a
 * package can actually move is the viewer's own `ownShare` at the position(s) it
 * touches. That is what makes this cheap: one league-wide pass per page (already paid
 * for once, see below), then arithmetic over five numbers per package.
 *
 * SCOPED TO THE VIEWER'S OWN ROSTER, ON PURPOSE (D75's explicit instruction). This
 * module never scores the partner's leverage or the other twelve rosters' - a page
 * about the trade in front of the viewer has no use for what it does to leaguemates
 * nobody is dealing with today, and running `buildLeverageProfile` fourteen times per
 * package instead of one would be pure cost for a fact nobody asked.
 */
import { buildLeverageProfile } from "../lab/leverage/index.js";
import { POS_ORDER } from "../roster.js";
/**
 * How much the viewer's own Leverage score (already an integer 0-100, the same scale
 * /lab/leverage prints) has to move before a package is worth a line here. Below this,
 * the package would not even move what the Lab page itself would show - printing a
 * delta anyway would be a line every package carries rather than one that means
 * something, the identical bar `SPOF_SHIFT_MIN` already draws next to this for the
 * Fragility note.
 */
export const LEVERAGE_SHIFT_MIN = 1;
/**
 * The viewer's own `byPosition` mix, adjusted for one package - assets leaving
 * subtracted, assets arriving added, at whichever of the five canonical positions
 * they carry. Picks and position-less assets touch neither side, matching how the
 * index itself excludes both (D68's own "what this deliberately does not measure").
 * Floored at 0 defensively; a package this finder proposes never sends more value at a
 * position than the viewer's own roster holds there, but a synthetic or malformed
 * package should read as "nothing left" rather than a negative position value.
 */
function applyPackageToByPosition(byPosition, give, get) {
  const map = new Map(POS_ORDER.map((p) => [p, 0]));
  for (const row of byPosition) if (map.has(row.pos)) map.set(row.pos, row.value);
  const touched = new Set();
  for (const a of give) {
    if (a.kind === "player" && a.position && map.has(a.position)) {
      touched.add(a.position);
      map.set(a.position, map.get(a.position) - a.value);
    }
  }
  for (const a of get) {
    if (a.kind === "player" && a.position && map.has(a.position)) {
      touched.add(a.position);
      map.set(a.position, map.get(a.position) + a.value);
    }
  }
  return {
    byPosition: POS_ORDER.map((pos) => ({
      pos,
      value: Math.max(0, map.get(pos) ?? 0),
    })),
    touched,
  };
}
/**
 * The pure comparison, mirroring `fragilityNoteFor`'s shape one file over: two
 * already-computed profiles in, a note or null out, so the "is this worth printing"
 * rule is pinned by test without having to manufacture a roster that happens to
 * produce it. Never a verdict (D6, D19) - a number and the position(s) it moved at,
 * nothing about whether that movement is good.
 */
export function leverageShiftFor(before, after, touchedPositions) {
  if (!before || !after) return null;
  if (before.score == null || after.score == null) return null;
  if (!touchedPositions || touchedPositions.size === 0) return null;
  if (Math.abs(after.score - before.score) < LEVERAGE_SHIFT_MIN) return null;
  return {
    before: before.score,
    after: after.score,
    positions: POS_ORDER.filter((p) => touchedPositions.has(p)),
  };
}
/**
 * One package's effect on the viewer's own Positional Leverage score, or null when
 * there is nothing real to report (no position touched, no roster to score, or the
 * move is too small to clear the noise floor above).
 *
 * `pools` is `leaguePositionPools(h, ...)`, computed ONCE by the caller and shared
 * across every package on the page - see this file's header for why the pools
 * themselves never need to change per package. `analysis` is the viewer's own
 * `leagueValueRanking` row (has `byPosition` and `rosterId`); pass the SAME analysis
 * object `pools` was built from, so "before" reads the identical roster the league
 * pools already account for.
 */
export function packageLeverageShift(pools, analysis, give, get) {
  if (!analysis) return null;
  const before = buildLeverageProfile(pools, analysis);
  const { byPosition: afterByPosition, touched } = applyPackageToByPosition(
    analysis.byPosition,
    give,
    get,
  );
  // `valued: []` is deliberate, not a shortcut that lost data: buildLeverageProfile
  // only reads `valued` to name a position's single top asset for display, which this
  // module never surfaces (no "after" roster page exists to link a name to). Leaving
  // it real would mean reconstructing a full post-trade asset list for a field this
  // caller discards - work with no reader.
  const after = buildLeverageProfile(pools, {
    ...analysis,
    byPosition: afterByPosition,
    valued: [],
  });
  return leverageShiftFor(before, after, touched);
}
