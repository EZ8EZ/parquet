/**
 * THE POSITIONAL LEVERAGE INDEX (PLI) - answers a question neither existing
 * proprietary metric asks: not "when does this roster's value arrive" (Dynasty
 * Duration / TCI) and not "how much of it is load-bearing on a handful of assets"
 * (Roster Fragility Index), but WHERE, BY POSITION, DOES THIS ROSTER SIT RELATIVE TO
 * THE REST OF THE LEAGUE - which position is a real trade chip because the league is
 * short of it and you are not, and which position is a real exposure because the
 * league is short of it and so are you.
 *
 * ---------------------------------------------------------------------------------
 * THE FORMULA
 * ---------------------------------------------------------------------------------
 * For each of the five rosterable positions (PG/SG/SF/PF/C - `POS_ORDER`, lib/roster):
 *
 *   leagueSharePos(X)  = (league-wide value rostered at X) / (league-wide value
 *                         rostered at any of the five)
 *   ownShare(X, r)     = (roster r's value at X) / (roster r's total positioned value)
 *   deviation(X, r)    = ownShare(X, r) - leagueSharePos(X)
 *   scarcity(X)        = spread(X) / max_Y spread(Y),        spread(X) = top(X) - replacement(X)
 *   leverage(X, r)     = deviation(X, r) * scarcity(X)
 *   raw(r)             = sum over X of leverage(X, r)
 *   PLI(r)             = round(clamp(50 + 50 * raw(r) / LEVERAGE_REF, 0, 100))
 *
 * `top(X)` is the single most valuable rostered asset at X leaguewide; `replacement(X)`
 * is the value of the (teams * baseSlots(X))-th best, where `baseSlots(X)` is how many
 * times X appears as an EXACT (non-flex) lineup slot in this league's own
 * `rosterPositions` (derived via `lineupSlots`, never assumed - a league that started
 * two point guards a night would correctly treat PG as twice as scarce a DEMAND, not
 * that this one does). A position with a steep top-to-replacement drop is one where
 * elite production is rare and bench-level production at the same spot is plentiful -
 * the textbook definition of positional scarcity, derived from this league's actual
 * rostered pool rather than assumed from real-NBA priors.
 *
 * 50 is "your position mix matches the league's" - not "average value," a mix. A
 * roster with exactly zero total value cannot be scored at all (see `EMPTY_PLI`
 * below); a roster with SOME value but a mix identical to the league's own reads 50
 * regardless of how much total value it holds, which is the entire point: this is a
 * SHAPE question, not a HOW-GOOD-ARE-YOU question.
 *
 * ---------------------------------------------------------------------------------
 * THE CALIBRATION BUG THIS CAUGHT BEFORE IT SHIPPED
 * ---------------------------------------------------------------------------------
 * The first version of this metric used `rosterValue(X) / totalLeagueValue(X)` -
 * literal SHARE OF THE LEAGUE'S POOL AT THAT POSITION - directly as the deviation
 * term, with no `ownShare` normalisation. Measured against the real 14-roster league,
 * that version correlated with a roster's TOTAL VALUE at r = 0.975. It was not a
 * positional metric at all; it was a relabelled power ranking, because a stronger
 * roster holds an above-average share of value at nearly every position simply BY
 * HOLDING MORE VALUE, not by any positional choice it made. Dividing by the roster's
 * OWN total (own SHARE rather than league share) is what a normalized concentration
 * measure always needs to decouple scale from shape - the identical fix
 * `concentration()` in lib/metrics/fragility.js already applies to HHI, for the
 * identical reason. Re-measured after the fix: r = 0.253 against total roster value
 * on the same 14 rosters (r-squared 0.064 - six percent of the variance shared,
 * against essentially all of it before). Not literally zero - a stronger roster can
 * still afford to concentrate more value at one position without giving up ground
 * anywhere else - but a world away from the r = 0.975 that made the first version a
 * relabelled power ranking. This is what makes it a genuinely different signal from
 * "who is winning," not a restatement of it.
 *
 * ---------------------------------------------------------------------------------
 * LEVERAGE_REF, CALIBRATED THE SAME WAY SIGMA_REF AND EXPOSURE_REF WERE
 * ---------------------------------------------------------------------------------
 * `raw(r)` observed across this league's 14 real rosters spans -0.0707 to +0.0544 -
 * asymmetric (it is easier to be badly UNDER-weight several scarce positions at once
 * than to be extremely over-weight, since ownShare is bounded by 1 and
 * leagueSharePos(C) alone already claims a quarter of the pool). 0.08 sits just past
 * the observed extreme in EITHER direction (the RFI convention: a reference just
 * above the worst observed case, not a theoretical maximum nothing real reaches),
 * which spreads the 14 real rosters from PLI 6 to PLI 84 with nothing clipped at
 * either end and nothing bunched at 50.
 *
 * ---------------------------------------------------------------------------------
 * WHAT THIS DELIBERATELY DOES NOT MEASURE
 * ---------------------------------------------------------------------------------
 *  - WHETHER ANYONE WOULD ACTUALLY TRADE FOR IT. This is a pure supply-side read of
 *    where value already sits, not a demand signal from the other thirteen
 *    managers. A position can be scarce leaguewide and a specific manager can still
 *    have no interest in yours this week.
 *  - QUALITY WITHIN A POSITION BEYOND WHAT VALUE ALREADY PRICES. It is value-
 *    weighted throughout, so hoarding cheap bodies at a position cannot manufacture
 *    leverage - a bench center worth $50 barely moves ownShare. But it does not
 *    separately reward a top-3-at-the-position asset over a replacement-tier one
 *    beyond what the value model itself already says.
 *  - UTIL/FLEX DEMAND. Two of this league's seven starting slots are position-
 *    agnostic and are excluded from `baseSlots` entirely, which understates true
 *    demand somewhat at every position evenly rather than favouring one.
 *  - DRAFT PICKS. A future rookie has no resolvable position until he is drafted, so
 *    picks are excluded from both sides of the ratio - unlike TCI and RFI, which both
 *    price picks. A roster that is pick-heavy and player-light is scored on its
 *    player mix alone, which is a real and stated gap for a true rebuild.
 *  - THE FUTURE. This is a snapshot of today's rostered pool. A position that is
 *    scarce this month can turn shallow the moment a deep rookie class at that spot
 *    lands - which, since picks are unpriced here, this index would not see coming.
 *  - A HANDFUL OF UNRESOLVED-POSITION PLAYERS. `analyzeRoster`'s position field is
 *    read as-is with no fallback to a secondary listed position, matching how the
 *    rest of the app already reports "positional strength" - so a player with no
 *    primary position on record is excluded from both a roster's own total and the
 *    league pool, on both sides of every ratio, rather than silently guessed at.
 */
import { leagueValueRanking } from "../../roster.js";
import { lineupSlots } from "../../metrics/fragility.js";
import { POS_ORDER } from "../../roster.js";
/** REF just above the worst of the observed -0.0707..+0.0544 range - see header. */
export const LEVERAGE_REF = 0.08;
/** How many EXACT (non-flex) slots at position X this league's lineup asks for. */
export function baseSlotCounts(h) {
  const slots = lineupSlots(h);
  const out = new Map(POS_ORDER.map((p) => [p, 0]));
  for (const s of slots) if (out.has(s)) out.set(s, out.get(s) + 1);
  return out;
}
/**
 * League-wide pool of individually valued, positioned assets, plus the aggregate
 * mix and each position's top/replacement/scarcity - the shared reference every
 * roster is measured against. Computed once per call site, the same shape
 * `leagueFragility`'s replacement level and `leagueTimelines`' duration list are:
 * a first pass over the whole league before any one roster can be scored.
 *
 * `analyses` defaults to a fresh `leagueValueRanking(h)`, but a caller that has
 * already paid for that pass (`/trade/finder` computes it once for its own board
 * before this module ever runs) can hand its own ranking in instead, so a single
 * page render never runs the league-wide ranking twice for two proprietary
 * metrics that both need it. This is the "genuinely shared computation" carve-out
 * D68 reserved for touching this module - the pool math itself is unchanged.
 */
export function leaguePositionPools(h, analyses = leagueValueRanking(h)) {
  const teams = h.currentLeague.totalRosters || h.rosters.length || 1;
  const baseSlots = baseSlotCounts(h);
  const pool = new Map(POS_ORDER.map((p) => [p, []]));
  for (const a of analyses) {
    for (const v of a.valued) {
      if (v.value <= 0 || !pool.has(v.position)) continue;
      pool.get(v.position).push(v.value);
    }
  }
  const totalByPos = new Map(
    POS_ORDER.map((p) => [p, pool.get(p).reduce((s, v) => s + v, 0)]),
  );
  const grandTotal = [...totalByPos.values()].reduce((s, v) => s + v, 0);
  const replacementByPos = new Map(
    POS_ORDER.map((p) => {
      const sorted = [...pool.get(p)].sort((a, b) => b - a);
      // Floored at 1 so a lineup shape with zero exact slots at X (all-flex) still
      // reads a real body rather than indexing before the array - a portability
      // guard, not a case this league's own PG/SG/SF/PF/C/UTIL/UTIL shape hits.
      const needed = Math.max(1, teams * (baseSlots.get(p) ?? 0));
      const idx = Math.min(sorted.length, needed) - 1;
      return [p, idx >= 0 ? (sorted[idx] ?? 0) : 0];
    }),
  );
  const topByPos = new Map(
    POS_ORDER.map((p) => [p, Math.max(0, ...pool.get(p), 0)]),
  );
  const spreadByPos = new Map(
    POS_ORDER.map((p) => [
      p,
      Math.max(0, topByPos.get(p) - replacementByPos.get(p)),
    ]),
  );
  const maxSpread = Math.max(0, ...spreadByPos.values());
  const scarcityByPos = new Map(
    POS_ORDER.map((p) => [
      p,
      maxSpread > 0 ? spreadByPos.get(p) / maxSpread : 0,
    ]),
  );
  const leagueSharePos = new Map(
    POS_ORDER.map((p) => [
      p,
      grandTotal > 0 ? totalByPos.get(p) / grandTotal : 0,
    ]),
  );
  return {
    analyses,
    teams,
    baseSlots,
    totalByPos,
    grandTotal,
    replacementByPos,
    topByPos,
    spreadByPos,
    scarcityByPos,
    leagueSharePos,
  };
}
function clamp(n, lo, hi) {
  return n < lo ? lo : n > hi ? hi : n;
}
/** The one roster with nothing positioned to read leverage from. */
function emptyProfile(rosterId, teamName, ownerName) {
  return {
    rosterId,
    teamName,
    ownerName,
    score: null,
    raw: 0,
    positions: [],
    bestPosition: null,
    worstPosition: null,
    read: "No positioned value to read leverage from.",
  };
}
/**
 * One roster's leverage profile against a league's pools (from `leaguePositionPools`).
 * Pure - the pools are computed once by the caller and shared across every roster,
 * the same pattern RFI's `leagueFragility` and TCI's `leagueTimelines` both use.
 */
export function buildLeverageProfile(pools, analysis) {
  const totalPositioned = POS_ORDER.reduce((s, p) => {
    const row = analysis.byPosition.find((b) => b.pos === p);
    return s + (row?.value ?? 0);
  }, 0);
  if (totalPositioned <= 0) {
    return emptyProfile(analysis.rosterId, analysis.teamName, analysis.ownerName);
  }
  const positions = POS_ORDER.map((pos) => {
    const row = analysis.byPosition.find((b) => b.pos === pos);
    const val = row?.value ?? 0;
    const ownShare = val / totalPositioned;
    const leagueShare = pools.leagueSharePos.get(pos) ?? 0;
    const deviation = ownShare - leagueShare;
    const scarcity = pools.scarcityByPos.get(pos) ?? 0;
    const leverage = deviation * scarcity;
    // The single most valuable asset THIS roster holds at this position, for a
    // concrete, nameable read - the same idea as RFI naming a single point of
    // failure rather than only reporting an HHI number.
    const top = analysis.valued
      .filter((v) => v.position === pos && v.value > 0)
      .sort((a, b) => b.value - a.value)[0];
    return {
      pos,
      value: val,
      ownShare: round3(ownShare),
      leagueShare: round3(leagueShare),
      deviation: round3(deviation),
      scarcity: round3(scarcity),
      leverage,
      topAsset: top ? { name: top.name, value: top.value } : null,
    };
  });
  const raw = positions.reduce((s, p) => s + p.leverage, 0);
  const score = Math.round(clamp(50 + (50 * raw) / LEVERAGE_REF, 0, 100));
  let bestPosition = positions[0];
  let worstPosition = positions[0];
  for (const p of positions) {
    if (p.leverage > bestPosition.leverage) bestPosition = p;
    if (p.leverage < worstPosition.leverage) worstPosition = p;
  }
  return {
    rosterId: analysis.rosterId,
    teamName: analysis.teamName,
    ownerName: analysis.ownerName,
    score,
    raw: round4(raw),
    positions,
    bestPosition,
    worstPosition,
    read: readFor(score, bestPosition, worstPosition),
  };
}
function readFor(score, best, worst) {
  const pct = (x) => `${Math.round(x * 100)}%`;
  const bestLine =
    best.leverage > 0.002
      ? `${best.pos} is your clearest structural edge: ${pct(best.ownShare)} of your positioned value sits there against a league average of ${pct(best.leagueShare)}, at a position with a real drop-off from its best assets to replacement level.` +
        (best.topAsset ? ` Your top ${best.pos} is ${best.topAsset.name}.` : "")
      : `Nothing here reads as a real structural edge - your best position (${best.pos}) is only a little above the league's own mix.`;
  const worstLine =
    worst.leverage < -0.002
      ? ` ${worst.pos} is your clearest exposure: only ${pct(worst.ownShare)} of your positioned value there against a league average of ${pct(worst.leagueShare)}, at a position where the drop from elite to replacement is steep - if that spot breaks, the league has little to offer you back for it in a trade.`
      : ` Nothing reads as a real exposure either - your thinnest position (${worst.pos}) is close to the league's own mix.`;
  return (
    `Positional Leverage ${score}: 50 is "your position mix matches the league's own," ` +
    `not "your roster is average." ${bestLine}${worstLine}`
  );
}
/** Every roster's leverage profile, most leveraged first. */
export function leagueLeverage(h) {
  const pools = leaguePositionPools(h);
  return pools.analyses
    .map((a) => buildLeverageProfile(pools, a))
    .sort(
      (a, b) =>
        (b.score ?? -1) - (a.score ?? -1) ||
        b.raw - a.raw ||
        a.rosterId - b.rosterId,
    );
}
function round3(n) {
  return Math.round(n * 1000) / 1000;
}
function round4(n) {
  return Math.round(n * 10000) / 10000;
}
