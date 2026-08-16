/**
 * THE AGE CURVE, MEASURED.
 *
 * The multipliers in `config.ageAnchors` used to be hand-set. They are now the table
 * below, derived from 4,587 real NBA player-seasons (2013-14 through 2025-26) scored
 * under THIS league's own scoring settings. `scripts/derive-age-curve.ts` carries the
 * method, the endpoint notes, and the argument for every choice; it is run by hand and
 * its output is pasted here, because a calibration constant does not need recomputing
 * on every request and D25's cold-start budget could not afford it if it did (14
 * requests, ~2.5MB).
 *
 * The one-paragraph version, since the numbers below are meaningless without it:
 *
 *   For every player who cleared 30 games and 500 minutes in a season, his production
 *   was scored under this league's formula, taken per 36 minutes, and divided by that
 *   season's own league mean - so a role change is not read as decline and the
 *   three-point era is not read as everyone improving. Then the SAME players were
 *   followed forward five seasons. A player who was no longer clearing the bar
 *   contributed a ZERO, not a missing value, which is the whole difference between
 *   this and the age curves that conclude 36-year-olds are fine: the 36-year-olds
 *   still playing are fine, and half of them are not still playing. `stillPlaying`
 *   below is that number, and it is the most striking column in the table.
 *   `multiplier` is the discounted sum of those five seasons at 0.9 per season.
 *
 * WHAT THIS IS NOT. It is a production curve, not a market curve. It says when NBA
 * players decline; it does not say when this league's fourteen managers stop paying
 * for them. That second question is a social fact about prices that cannot be
 * reconstructed from games that were played before the league existed, and
 * `./exitWindow.ts` measures what little of it five seasons of trades can support -
 * and then declines to calibrate anything against it.
 */
/**
 * Ages 19 through 36. The span is where every one of the five horizon cells still
 * holds at least 30 observations; at 37 the thinnest cell is 15 and at 39 it is 7, so
 * the table stops rather than drawing a line through a handful of careers.
 *
 * 19 and 20 share a multiplier, and 31 and 32 share one, because the isotonic
 * smoother pooled each pair: their raw values ran the wrong way by less than their
 * own sampling noise. Nothing else in the series needed pooling.
 */
export const DERIVED_AGE_CURVE = [
  { age: 19, multiplier: 1.16, cohort: 100, stillPlaying: 0.81 },
  { age: 20, multiplier: 1.16, cohort: 194, stillPlaying: 0.89 },
  { age: 21, multiplier: 1.071, cohort: 296, stillPlaying: 0.8 },
  { age: 22, multiplier: 1.045, cohort: 351, stillPlaying: 0.82 },
  { age: 23, multiplier: 1.018, cohort: 413, stillPlaying: 0.82 },
  { age: 24, multiplier: 1.006, cohort: 418, stillPlaying: 0.84 },
  { age: 25, multiplier: 0.97, cohort: 414, stillPlaying: 0.82 },
  { age: 26, multiplier: 0.934, cohort: 381, stillPlaying: 0.82 },
  { age: 27, multiplier: 0.902, cohort: 367, stillPlaying: 0.81 },
  { age: 28, multiplier: 0.877, cohort: 337, stillPlaying: 0.76 },
  { age: 29, multiplier: 0.862, cohort: 278, stillPlaying: 0.81 },
  { age: 30, multiplier: 0.771, cohort: 247, stillPlaying: 0.77 },
  { age: 31, multiplier: 0.719, cohort: 217, stillPlaying: 0.68 },
  { age: 32, multiplier: 0.719, cohort: 158, stillPlaying: 0.72 },
  { age: 33, multiplier: 0.671, cohort: 133, stillPlaying: 0.73 },
  { age: 34, multiplier: 0.586, cohort: 97, stillPlaying: 0.59 },
  { age: 35, multiplier: 0.57, cohort: 66, stillPlaying: 0.67 },
  { age: 36, multiplier: 0.533, cohort: 54, stillPlaying: 0.51 },
];
/** Provenance, stated wherever the curve is shown. */
export const AGE_CURVE_PROVENANCE = {
  /** First and last NBA season in the sample, Sleeper's start-year convention (D14). */
  firstSeason: "2013",
  lastSeason: "2025",
  seasons: 13,
  /** Player-seasons clearing 30 games and 500 minutes. */
  playerSeasons: 4587,
  minGames: 30,
  minMinutes: 500,
  /** Seasons of remaining production the multiplier represents, and the discount. */
  horizon: 5,
  discountPerSeason: 0.9,
  /** Fewest observations a horizon cell may hold and still be reported. */
  minCell: 30,
  /** The date `scripts/derive-age-curve.ts` was last run. */
  derivedOn: "2026-08-08",
};
/** Youngest and oldest age the sample supports. Outside this the curve holds flat. */
export const CURVE_SUPPORTED_MIN = DERIVED_AGE_CURVE[0].age;
export const CURVE_SUPPORTED_MAX =
  DERIVED_AGE_CURVE[DERIVED_AGE_CURVE.length - 1].age;
/**
 * THE STAR-TIER ADJUSTMENT (D74). `DERIVED_AGE_CURVE` above is a population average -
 * it does not condition on talent tier at all, by design (see the file header). The
 * owner's challenge - Luka Doncic (27, live Sleeper consensus #3) pricing narrowly
 * BELOW Alperen Sengun (24, consensus #10) - was re-examined the same way this file's
 * own header re-examines everything: measured, not asserted. This is the measurement.
 *
 * THE METHOD, run as a variant of `scripts/derive-age-curve.js` against the SAME
 * 4,587-player-season corpus, the same per-36/era-relative normalization, the same
 * forward-tracking-with-zero-for-non-qualifiers rule, and the same 0.9/5-season
 * discount - changing exactly one thing: every player-season is also tagged against
 * that SEASON's own top decile by era-relative production (cohort sizes 33-38 a
 * season, mean 35.8 across the 13 seasons - a percentile rather than a fixed count
 * because the qualifying pool itself ranges 330-420 across the sample, and a fixed
 * count would sample a thin season and a deep one at different effective tiers; 10%
 * of ~358 lands almost exactly on a season's All-NBA (15) plus All-Star (24) pool
 * plus its best snubs, which is what "star tier" means in the dynasty-market sense
 * the owner is asking about - a real top-10-ish asset, not merely an above-average
 * starter).
 *
 * THE RESULT. Comparing the STAR cohort's own discounted forward-production curve
 * against the POPULATION curve, in the SAME units (both are already a multiple of
 * the player's own current-season output, so the ratio needs no re-normalizing): the
 * two track within noise from 21 to 26 (raw ratios 1.10-1.19, bouncing without a
 * clean trend - the age range where a star and an average qualifier are both still
 * rising or at peak, so there is little reason either would diverge yet). From 27
 * on the raw ratios are ALREADY nearly monotone before any smoothing (1.094, 1.172,
 * 1.239, 1.235, 1.264) - a real, clean, and large effect (stars keep 9-26% MORE of
 * their own current production, discounted forward, than an average qualifier of the
 * same age) that starts almost exactly where this model already treats age as
 * starting to matter (27 is `injury.ageReference`, and 30 is `firstCliffAge()` on
 * this very table). That is the basketball story dynasty theory tells about "stars
 * age gracefully": not that young stars improve differently, but that elite talent
 * resists the DECLINE phase better than a replacement-level contemporary - and the
 * data only shows that story from 27 onward, not before it.
 *
 * WHY THE TABLE STARTS AT 27 AND NOT 21. Two honest reasons, not one convenient one.
 * First, the evidence: 21-26's raw ratios do not clear their own noise (no clean
 * trend, cohort n as low as 22-47 a cell) the way 27-31's do (already monotone
 * pre-smoothing). Second, extending a correction below 27 would require touching
 * `theoreticalMaxMultiplier`'s ceiling - a star-adjusted 21-year-old prices at 1.071
 * (population) * 1.106 (the 21-26 block's own smoothed ratio) = 1.185, ABOVE the
 * whole app's 1.16 ceiling, which would rescale every value in the product to
 * accommodate a correction the data does not cleanly support in the first place. Not
 * applying it there is therefore the conservative reading of a genuinely noisier
 * result, not a boundary drawn to land on any one player's exact age - the raw ratio
 * at 26 (1.101) and at 27 (1.094) are themselves nearly identical; the table's own
 * floor of 1.0 below age 27 UNDERSTATES whatever real effect exists there rather than
 * inventing one, and it is stated here rather than smoothed away.
 *
 * WHY THIS IS A SEPARATE TABLE AND NOT A REWRITE OF `DERIVED_AGE_CURVE`. The
 * population curve is not wrong - it is exactly what it has always claimed to be, an
 * average across every qualifying player regardless of tier. This is a second,
 * narrower measurement: how much LESS a top-decile player should be discounted,
 * relative to that population average, once decline starts. It multiplies onto the
 * ordinary age multiplier rather than replacing it, so a non-star player's price is
 * completely unaffected and D28's peak-anchor invariant on `DERIVED_AGE_CURVE` itself
 * is untouched.
 *
 * `cohort` is the number of top-decile player-seasons at that baseline age across the
 * 13-season sample; `thinnestCell` is the smallest of the five forward-horizon cells
 * behind it (star cohorts are roughly a tenth the size of the population ones by
 * construction, so this is reported per-row rather than gated at a single global bar
 * the way `MIN_CELL` gates the population table).
 */
export const STAR_AGE_ADJUSTMENT = [
  { age: 27, ratio: 1.139, cohort: 41, thinnestCell: 25 },
  { age: 28, ratio: 1.172, cohort: 39, thinnestCell: 25 },
  { age: 29, ratio: 1.237, cohort: 36, thinnestCell: 22 },
  { age: 30, ratio: 1.237, cohort: 25, thinnestCell: 17 },
  { age: 31, ratio: 1.264, cohort: 23, thinnestCell: 12 },
];
/** Provenance for the star-tier table, stated alongside `AGE_CURVE_PROVENANCE`. */
export const STAR_AGE_ADJUSTMENT_PROVENANCE = {
  ...AGE_CURVE_PROVENANCE,
  starPercentile: 0.1,
  meanCohortPerSeason: 35.8,
  /** Below this age the table applies no adjustment at all (ratio 1.0) - see the
   *  header above for why 27, not 21, is the honest floor. */
  appliedFromAge: 27,
  derivedOn: "2026-08-15",
};
/**
 * Below `STAR_AGE_ADJUSTMENT`'s first row, no correction (1.0) - the data does not
 * cleanly support one there (see the header above). Beyond the last row, hold flat at
 * the last measured ratio, the same convention `ageMultiplier` already uses for
 * `DERIVED_AGE_CURVE` past `CURVE_SUPPORTED_MAX`.
 */
export function starAgeAdjustment(age, rows = STAR_AGE_ADJUSTMENT) {
  if (age == null || age < rows[0].age) return 1.0;
  if (age >= rows[rows.length - 1].age) return rows[rows.length - 1].ratio;
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    if (age >= a.age && age <= b.age) {
      const t = (age - a.age) / (b.age - a.age);
      return a.ratio + t * (b.ratio - a.ratio);
    }
  }
  return 1.0;
}
/**
 * Live proxy for "top decile of that season's own qualified pool", the definition
 * the derivation above actually used. There is no way to recompute a live era-
 * relative production percentile inside a per-player pricing call without scoring
 * the whole corpus first, but Sleeper's own `searchRank` is already the model's
 * trusted stand-in for current standing everywhere else in this file's sibling
 * modules (D70: "anchored to Sleeper's own real-time expert consensus of how good a
 * player looks RIGHT NOW") - so the SAME rank the base-value term already spends its
 * whole trust budget on is reused here rather than inventing a second notion of
 * "good". `STAR_SEARCH_RANK_CUTOFF` is the derivation's own mean cohort size (35.8),
 * rounded up to the next whole player, not a separately chosen round number.
 */
export const STAR_SEARCH_RANK_CUTOFF = 36;
export function isStarTier(searchRank, cutoff = STAR_SEARCH_RANK_CUTOFF) {
  return searchRank != null && searchRank <= cutoff;
}
/**
 * The first age past the model's neutral point where the measured curve steps down
 * hard rather than drifting.
 *
 * DERIVED, never typed. A dynasty curve declines everywhere, so "declines" is not a
 * useful thing to mark. What is useful is where the decline stops being gradual, and
 * that is answerable from the table itself: take every year-over-year fall across the
 * supported span, take their median, and find the first age past `referenceAge` whose
 * fall is at least `factor` times that median.
 *
 * On the current table the typical year costs about 3.6% and the answer is 30, which
 * costs 10.6% - the steepest single birthday anywhere before 34, and nearly three
 * times an ordinary year. Recomputed rather than hardcoded so that re-running the
 * derivation moves the marker with the data instead of leaving a stale constant
 * pointing at an age the curve no longer says anything special about.
 */
export function firstCliffAge(
  rows = DERIVED_AGE_CURVE,
  referenceAge = 27,
  factor = 1.5,
) {
  const drops = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].multiplier;
    drops.push({
      age: rows[i].age,
      drop: prev > 0 ? 1 - rows[i].multiplier / prev : 0,
    });
  }
  const moving = drops
    .map((d) => d.drop)
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  if (!moving.length) return null;
  const median = moving[Math.floor(moving.length / 2)];
  const hit = drops.find(
    (d) => d.age > referenceAge && d.drop >= factor * median,
  );
  return hit?.age ?? null;
}
/**
 * Is this asset priced on the far side of the curve's first cliff?
 *
 * The one predicate behind the quiet marker on /values and /roster. It is a statement
 * about where a price sits on a published curve - nothing more. It is deliberately NOT
 * a verdict about the player and must never be worded as one (D6): the model already
 * charged him for his age, the marker only says which part of the curve did the
 * charging. Whether that makes him a sell is a judgement the app does not make.
 */
export function pastFirstCliff(age, rows = DERIVED_AGE_CURVE) {
  const cliff = firstCliffAge(rows);
  return cliff != null && age != null && age >= cliff;
}
