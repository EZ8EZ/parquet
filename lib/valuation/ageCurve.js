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
