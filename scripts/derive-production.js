/**
 * OFFLINE CALIBRATION - derives the IN-LEAGUE PRODUCTION INDEX from this league's own
 * weekly scoring record.
 *
 *   pnpm derive:production
 *
 * Run by hand, never from a render path, and its output is pasted into
 * `lib/valuation/production.js` as a committed constant with the run date recorded
 * there. Exactly the arrangement `scripts/derive-age-curve.js` uses, for exactly the
 * same reason - but here the cold-start argument is even sharper: `lib/history.js`
 * ALREADY refuses to load weekly matchups live (`loadMatchups` is fixture-only,
 * measured at ~110 requests and ~15s), so an input derived from them cannot possibly
 * be computed per request. It is derived once, per completed season, offline.
 *
 * ---------------------------------------------------------------------------------
 * WHAT THIS MEASURES, AND HOW IT DIFFERS FROM THE AGE CURVE
 * ---------------------------------------------------------------------------------
 * `lib/valuation/ageCurve.js` answers a POPULATION question - how production generally
 * rises and falls with age, across 4,587 NBA player-seasons, most of them belonging to
 * players who were never in this league. It is deliberately blind to the individual.
 *
 * This answers the PER-PLAYER question the model had no input for at all: how much has
 * THIS player actually produced HERE, in this league's own currency. The two compose
 * and neither replaces the other. Nothing in this file re-derives an age effect, and
 * the production index is never conditioned on age.
 *
 * ---------------------------------------------------------------------------------
 * THE ENDPOINT, AND WHAT `players_points` ACTUALLY IS
 * ---------------------------------------------------------------------------------
 * `GET /v1/league/{id}/matchups/{week}` carries `players_points`: a map of every
 * player on that roster that week to the points he banked. One request per league-week,
 * 14 rosters per response.
 *
 * IT IS ONE GAME, NOT THE WEEK'S SUM. This league runs Sleeper's LOCK-IN format: a
 * slotted player scores the single game that locked, not everything he played that
 * week. Verified here rather than assumed, against three players across 23 weeks of
 * 2025: `players_points` equalled the week's SUM in 4-8 weeks of 23, and equalled a
 * single game in the rest. `lib/lab/regret/source.js` documents the same fact from the
 * other direction (it is why the regret ledger needs a separate per-player stats
 * request to reconstruct "what else was available").
 *
 * That is a FEATURE for this measurement and it is the reason this endpoint is used in
 * preference to `GET /v1/stats/nba/regular/{season}` - the season-totals blob
 * `derive-age-curve.js` reads, which would cover more players in one request. Season
 * totals measure NBA production. `players_points` measures what this league actually
 * banked, in the units this league actually pays in, one locked game per week. For a
 * PRICE in this league, that is the right currency and the other one is a proxy for it.
 *
 * ---------------------------------------------------------------------------------
 * THE METRIC, AND THE FOUR THINGS IT IS CONFOUNDED BY
 * ---------------------------------------------------------------------------------
 * Per player-season: MEAN POINTS BANKED PER ROSTERED WEEK, zeros included, divided by
 * that season's own mean across qualifying player-seasons.
 *
 *  - MEAN PER WEEK, not the season total. A season total is proportional to how many
 *    weeks the player happened to spend on someone's roster, which ranges 8 to 23 in
 *    this window - a 3x artifact of roster churn read as a 3x difference in production.
 *    Measured both ways: the total scored a HIGHER partial correlation (0.447 vs 0.412),
 *    and it is rejected anyway, because weeks-rostered predicts next season's
 *    weeks-rostered, so part of that edge is the target leaking into the predictor.
 *  - ZEROS INCLUDED. A week on a roster that banked nothing is a real zero, not missing
 *    data - the same discipline `derive-age-curve.js` applies to a season a player
 *    dropped out of. Excluding them scores a player on his good weeks only.
 *  - ERA-NORMALIZED per season. Scoring settings are byte-identical across the chain
 *    (checked below), but pace is not: the season means run 14.05 to 14.82.
 *
 * The four confounds, stated rather than dressed up, because this is a genuinely
 * partial instrument:
 *
 *  1. OPPORTUNITY. Minutes are in here. A player on a bad team who plays 34 minutes
 *     outscores a better player on a deep team who plays 22. For a fantasy PRICE that
 *     is mostly correct - fantasy points are what you buy - but it is not a talent
 *     measure and must not be read as one.
 *  2. THE MANAGER'S LOCK. In a lock-in league the owner chooses which game locks, so a
 *     started week's figure is production filtered through one manager's choice.
 *     Averaging over 8+ weeks dilutes it; it does not remove it.
 *  3. SELECTION ON ROSTERING. Only players someone rostered here appear at all, and
 *     only for the seasons they were rostered. This league holds ~266 roster spots
 *     against ~500 NBA players who play real minutes, so "not in this table" carries no
 *     information about the player - which is exactly why the missing case is a stated
 *     fallback and never a zero.
 *  4. AVAILABILITY, AND IT OVERLAPS THE INJURY TERM. The largest limitation here, and
 *     measured rather than waved at. A player hurt for eleven weeks banks eleven zeros,
 *     so production charges him for an absence `lib/valuation/injury.js` is also looking
 *     at. On the live league: of the 20 largest value DROPS, 12 carry a current injury
 *     flag against 3.9 expected by chance (49 of 250 rostered players are flagged), and
 *     the mean move is -210 for a flagged player against +46 for an unflagged one.
 *
 *     The two terms are not measuring the same quantity - the injury multiplier prices
 *     the FORWARD RISK implied by a current flag, and deliberately sits near 1.0 for most
 *     of them because Sleeper's `injury_status` is near-noise (config.js: 110 of 120 live
 *     flags are "DTD"), while production records output that did not happen. On this
 *     league's real numbers the stacking is mostly mild for exactly that reason: Franz
 *     Wagner's injury multiplier is 0.95, Jalen Williams' 0.95, Trae Young's 0.98. It is
 *     not always mild - Tyrese Haliburton takes a 0.73 injury multiplier AND the largest
 *     production drop in the league (-1,917), and he is the clearest case of two terms
 *     charging for one Achilles rupture.
 *
 *     NOT FIXED HERE, on purpose. The obvious repair - dropping weeks a player was
 *     flagged out - needs its own calibration, and the nearest variant was measured and
 *     is worse on both axes: excluding zero weeks scores partial rho 0.394 against 0.412
 *     and drops coverage from 269 qualifying player-seasons to 234. Folding an untested
 *     second change into this one would make the before/after unattributable. First thing
 *     to re-measure.
 *
 * ---------------------------------------------------------------------------------
 * THE WINDOW, AND WHY IT IS TWO SEASONS
 * ---------------------------------------------------------------------------------
 * Measured, not chosen. Rank-rank persistence of this metric, season t against t-k,
 * across the four completed seasons:
 *
 *     lag 1   rho 0.541  (n = 633)
 *     lag 2   rho 0.455  (n = 356)
 *     lag 3   rho 0.192  (n = 153)
 *
 * Lag 3 is inside its own noise, so the window stops at two seasons rather than using
 * everything available. The two seasons are combined with weights proportional to those
 * same persistence figures (0.54 / 0.46), renormalized over whichever of the two a
 * player actually has - so a player with only the most recent season gets that season,
 * not a diluted one.
 *
 * ---------------------------------------------------------------------------------
 * SAMPLE SIZE IS NOT THE BINDING UNCERTAINTY - COVERAGE IS
 * ---------------------------------------------------------------------------------
 * Split-half reliability of the weekly mean (odd weeks against even weeks, 964
 * player-seasons with 16+ weeks) is r = 0.932 at ~11 weeks each. Spearman-Brown puts
 * the implied shrinkage constant at K = 0.8 WEEKS, which makes the 8-week floor already
 * 0.91 reliable and a full season 0.97. So no per-player shrinkage term is applied: it
 * would range 0.91 to 0.99 and be decoration. The floor exists to exclude cameos, and
 * that is all it needs to do.
 *
 * What DOES vary enormously is whether a player is in the table at all. That is
 * reported here and surfaced in the app rather than smoothed over.
 */
import "./_env.js";
const V1 = "https://api.sleeper.app/v1";
/** Weeks to probe per season. Beyond the last scored leg the endpoint returns null. */
const MAX_WEEK = 23;
/** Rostered weeks a player-season needs before it is scored at all. */
const MIN_WEEKS = 8;
/**
 * Completed seasons to include, most recent first. Two, because lag-3 persistence
 * (0.192) is inside its own noise - see the header.
 */
const WINDOW = 2;
/** Combination weights, proportional to measured lag-1 / lag-2 persistence. */
const RECENCY = [0.54, 0.46];
async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return await res.json();
}
/** Bounded fan-out, same shape `loadPlayerSeasons` uses in lib/lab/regret/source.js. */
async function mapLimit(items, limit, fn) {
  const queue = [...items];
  const out = [];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (;;) {
        const item = queue.shift();
        if (item === undefined) return;
        out.push(await fn(item));
      }
    }),
  );
  return out;
}
async function main() {
  const { getLeagueHistory } = await import("../lib/history.js");
  const h = await getLeagueHistory();
  // Scoring is a per-season league setting. `players_points` is computed by Sleeper
  // under whatever that season's settings were, so a chain with two formulas would be
  // summing two different currencies. Checked rather than assumed, exactly as
  // derive-age-curve.js checks it.
  const shapes = new Set(
    h.chain.map((c) =>
      JSON.stringify(
        Object.fromEntries(Object.entries(c.scoringSettings).sort()),
      ),
    ),
  );
  if (shapes.size !== 1) {
    console.warn(
      `WARNING: ${shapes.size} distinct scoring settings across the chain. ` +
        `players_points is scored per season, so the seasons are not comparable.`,
    );
  }
  // COMPLETED seasons only, most recent first. A season still being played is a
  // partial year and would read as a collapse in production for everyone in it.
  const completed = h.chain
    .filter((c) => c.status === "complete")
    .sort((a, b) => Number(b.season) - Number(a.season))
    .slice(0, WINDOW);
  console.log(
    `seasons in window (most recent first): ${completed.map((c) => c.season).join(", ")}`,
  );
  /** season -> playerId -> { weeks, sum } */
  const bySeason = new Map();
  let requests = 0;
  let playerWeeks = 0;
  for (const league of completed) {
    /** @type {Map<string, { weeks: number, sum: number }>} */
    const acc = new Map();
    const weeks = await mapLimit(
      Array.from({ length: MAX_WEEK }, (_, i) => i + 1),
      8,
      async (w) => {
        requests++;
        return {
          w,
          rows: await getJson(`${V1}/league/${league.leagueId}/matchups/${w}`),
        };
      },
    );
    let scoredWeeks = 0;
    for (const { rows } of weeks) {
      let any = false;
      for (const row of rows ?? []) {
        for (const [id, pts] of Object.entries(row.players_points ?? {})) {
          any = true;
          playerWeeks++;
          const e = acc.get(id) ?? { weeks: 0, sum: 0 };
          e.weeks++;
          e.sum += pts;
          acc.set(id, e);
        }
      }
      if (any) scoredWeeks++;
    }
    bySeason.set(league.season, acc);
    console.log(
      `  ${league.season}: ${scoredWeeks} scored weeks, ${acc.size} distinct players rostered`,
    );
  }
  // Era-normalize each season by its own mean across qualifying player-seasons.
  /** season -> playerId -> normalized index (1.0 = that season's average) */
  const norm = new Map();
  let playerSeasons = 0;
  for (const [season, acc] of bySeason) {
    const rows = [...acc]
      .filter(([, e]) => e.weeks >= MIN_WEEKS)
      .map(([id, e]) => [id, e.sum / e.weeks]);
    const mean = rows.reduce((s, [, v]) => s + v, 0) / (rows.length || 1);
    norm.set(season, new Map(rows.map(([id, v]) => [id, v / mean])));
    playerSeasons += rows.length;
    console.log(
      `  ${season}: ${rows.length} player-seasons with ${MIN_WEEKS}+ rostered weeks, ` +
        `mean ${mean.toFixed(2)} pts per locked game`,
    );
  }
  const seasons = completed.map((c) => c.season);
  const weeksOf = (id) =>
    seasons.reduce((s, y) => s + (bySeason.get(y).get(id)?.weeks ?? 0), 0);
  /** @type {{ id: string, index: number, weeks: number, seasons: number }[]} */
  const rows = [];
  const everyone = new Set(seasons.flatMap((y) => [...norm.get(y).keys()]));
  for (const id of everyone) {
    let num = 0;
    let den = 0;
    let n = 0;
    seasons.forEach((y, i) => {
      const v = norm.get(y).get(id);
      if (v == null) return;
      num += RECENCY[i] * v;
      den += RECENCY[i];
      n++;
    });
    if (den <= 0) continue;
    rows.push({ id, index: num / den, weeks: weeksOf(id), seasons: n });
  }
  rows.sort((a, b) => b.index - a.index || a.id.localeCompare(b.id));
  const bySeasonCount = {};
  for (const r of rows) bySeasonCount[r.seasons] = (bySeasonCount[r.seasons] ?? 0) + 1;
  console.log(
    `\n${rows.length} players indexed (${JSON.stringify(bySeasonCount)} by qualifying seasons)`,
  );
  console.log(`${requests} requests, ${playerWeeks} player-weeks read`);
  const idx = rows.map((r) => r.index);
  console.log(
    `index: max ${idx[0].toFixed(3)} p90 ${idx[Math.floor(idx.length * 0.1)].toFixed(3)} ` +
      `median ${idx[Math.floor(idx.length * 0.5)].toFixed(3)} ` +
      `p10 ${idx[Math.floor(idx.length * 0.9)].toFixed(3)} min ${idx[idx.length - 1].toFixed(3)}`,
  );
  console.log(`\n// paste into lib/valuation/production.js`);
  console.log(`export const DERIVED_PRODUCTION = [`);
  for (const r of rows) {
    console.log(
      `  ["${r.id}", ${r.index.toFixed(3)}, ${r.weeks}, ${r.seasons}],`,
    );
  }
  console.log(`];`);
  console.log(`\nplayerSeasons: ${playerSeasons}`);
  console.log(`playerWeeks: ${playerWeeks}`);
  console.log(`seasons: ${seasons.join(", ")}`);
  console.log(`derivedOn: ${new Date().toISOString().slice(0, 10)}`);
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
