/**
 * OFFLINE CALIBRATION - derives the dynasty age curve from real NBA box scores,
 * scored under THIS league's own scoring settings.
 *
 *   pnpm tsx scripts/derive-age-curve.ts
 *
 * Run by hand, never from a render path. Its output is pasted into
 * `lib/valuation/ageCurve.ts` as a committed constant, with the sample size and the
 * run date recorded there. A calibration constant does not need recomputing on every
 * request, and D25's cold-start budget forbids it: this makes 14 network requests and
 * reads 2.5MB, which is an order of magnitude more than the whole corpus costs.
 *
 * ---------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------
 * The league is five seasons old. Its own trade record is far too thin to calibrate an
 * age curve against (see `lib/valuation/exitWindow.ts`, which measures exactly that and
 * refuses). But the age curve is not really a question about this league's trades. It
 * is a question about when NBA production declines, and those games were all played -
 * this league simply did not exist to watch them. The scoring settings are known, the
 * box scores are public, so the arithmetic is available for as far back as the data
 * goes. That is reconstruction, not inference.
 *
 * ---------------------------------------------------------------------------------
 * THE ENDPOINT
 * ---------------------------------------------------------------------------------
 * `GET https://api.sleeper.app/v1/stats/nba/regular/{season}` returns SEASON TOTALS for
 * every player, keyed by player id: one request per season, ~200KB. Verified against
 * 2013-2025; 2012 and earlier return a ~17KB stub with no stat lines, which is where
 * the window starts.
 *
 * NOT to be confused with `GET /v1/stats/nba/regular/{season}/{week}`, which looks like
 * the weekly sibling and is the trap documented in lib/lab/regret/source.ts: it returns
 * only the last game of the week and covers ~557 players. The season aggregate has no
 * such problem - it carries `gp`, `sp` (seconds played) and every counting stat this
 * league scores, including `dd`, `td`, `tf`, `ff` and both point bonuses. Checked: not
 * one of this league's thirteen scoring keys is missing from the blobs.
 *
 * Birth dates come from `GET /v1/players/nba`, which carries RETIRED players too - all
 * 414 qualified 2015-16 players resolve, so the sample is not silently restricted to
 * whoever is still active today.
 *
 * ---------------------------------------------------------------------------------
 * THE METHOD, AND THE THREE BIASES IT HAS TO SURVIVE
 * ---------------------------------------------------------------------------------
 * 1. ERA. Pace and three-point volume moved enormously across this window; a 2013 line
 *    and a 2025 line are not comparable on raw totals. Two normalisations, both
 *    applied: production is measured PER 36 MINUTES (so a role change is not read as
 *    decline), and each season is divided by THAT SEASON's own mean among qualified
 *    players (so a league-wide scoring boom is not read as everyone improving). What
 *    survives both is a player's standing relative to his own era.
 *
 * 2. SURVIVORSHIP - the one that ruins naive age curves. Averaging production by age
 *    across whoever happened to be playing asks "how good are the 36-year-olds still in
 *    the league", and the answer is "very good, that is why they are still in it". This
 *    derivation never compares different players. It follows the SAME players forward:
 *    for every player qualified at age a, his production k seasons later is recorded as
 *    a ratio to his own age-a production, and a player who is no longer qualified
 *    contributes a ratio of ZERO rather than dropping out of the average. Falling out
 *    of the league is the largest part of what ageing costs a dynasty asset, and
 *    counting it as missing data instead of as a zero is precisely the mistake.
 *
 * 3. HORIZON. A dynasty multiplier is not about this season, it is about what is left.
 *    So the curve is the discounted sum of the next `HORIZON` seasons of expected
 *    relative production, at `DISCOUNT` per season - the same 0.9 the pick model
 *    already uses for a season of futurity, so the two agree about what a year costs.
 *    The k=0 term is 1.0 by construction, which is why the curve has a floor: a player
 *    who produces this season and never again is still worth this season.
 *
 * Monotonicity is imposed afterwards by isotonic regression (pool-adjacent-violators,
 * weighted by cell size) rather than assumed: the raw series is already monotone
 * everywhere except two adjacent pairs (19/20 and 31/32) whose gaps are inside their
 * own sampling noise, and PAVA pools exactly those and leaves everything else alone.
 *
 * Finally the whole curve is scaled so its PEAK is exactly 1.16, the peak the hand-set
 * anchors already had. That is deliberate and it is D28: `theoreticalMaxMultiplier()`
 * multiplies the largest age anchor into the constant every value in the app is divided
 * by, so moving the peak would rescale every price in the product and silently shift
 * what `tierOf()`'s thresholds mean. Only the SHAPE of the curve is being recalibrated,
 * and the shape is the entire content of an age curve - the level cancels.
 */
import "./_env";

const STATS_BASE = "https://api.sleeper.app";

/** First season the endpoint carries real stat lines. 2012 and earlier return a stub. */
const FIRST_SEASON = 2013;
/** Last completed season. The current one is excluded: a partial year is not a season. */
const LAST_SEASON = 2025;

/** A player-season counts only if there is enough of it to mean anything. */
const MIN_GAMES = 30;
const MIN_MINUTES = 500;

/** Seasons of remaining production the multiplier is meant to represent. */
const HORIZON = 5;
/** Present-value discount per season out. Same constant as `pick.discountPerYear`. */
const DISCOUNT = 0.9;
/**
 * Fewest observations a (start age, horizon) cell may carry and still be reported.
 * Below this the curve stops rather than thinning into single deals: at 30 the tail
 * cells still hold 157 players, at 37 they hold 15.
 */
const MIN_CELL = 30;

/** The peak the hand-set anchors had. Held fixed so the D28 ceiling cannot move. */
const PEAK = 1.16;

interface StatLine {
  gp?: number;
  sp?: number;
  [k: string]: number | undefined;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

/**
 * Age during a season, taken at 1 January of the following calendar year - the rough
 * midpoint of an NBA season, which runs October to April. Season labels follow D14
 * (Sleeper's start-year convention), so "2015" is 2015-16.
 */
function ageDuringSeason(birthDate: string, seasonStart: number): number {
  const born = new Date(`${birthDate}T00:00:00Z`);
  const mid = new Date(Date.UTC(seasonStart + 1, 0, 1));
  let age = mid.getUTCFullYear() - born.getUTCFullYear();
  const monthDay = (d: Date) => d.getUTCMonth() * 100 + d.getUTCDate();
  if (monthDay(mid) < monthDay(born)) age--;
  return age;
}

function fantasyPoints(line: StatLine, scoring: Record<string, number>): number {
  let total = 0;
  for (const key of Object.keys(scoring)) total += scoring[key] * (line[key] ?? 0);
  return total;
}

/** Pool-adjacent-violators, weighted, enforcing a non-increasing sequence. */
function isotonicDecreasing(
  points: Array<{ age: number; value: number; weight: number }>,
): Map<number, number> {
  const blocks = points.map((p) => ({
    value: p.value,
    weight: p.weight,
    ages: [p.age],
  }));
  let i = 0;
  while (i < blocks.length - 1) {
    if (blocks[i].value < blocks[i + 1].value - 1e-12) {
      const a = blocks[i];
      const b = blocks[i + 1];
      blocks.splice(i, 2, {
        value: (a.value * a.weight + b.value * b.weight) / (a.weight + b.weight),
        weight: a.weight + b.weight,
        ages: [...a.ages, ...b.ages],
      });
      if (i > 0) i--;
    } else i++;
  }
  const out = new Map<number, number>();
  for (const b of blocks) for (const age of b.ages) out.set(age, b.value);
  return out;
}

async function main() {
  const { getLeagueHistory } = await import("@/lib/history");
  const h = await getLeagueHistory();

  // Scoring is a per-season league setting and could in principle differ across the
  // chain, which would mean a different formula per season. Checked here rather than
  // assumed; on this league all five seasons are byte-identical.
  const shapes = new Set(
    h.chain.map((c) =>
      JSON.stringify(
        Object.fromEntries(Object.entries(c.scoringSettings).sort()),
      ),
    ),
  );
  if (shapes.size !== 1) {
    console.warn(
      `WARNING: ${shapes.size} distinct scoring settings across the chain. This ` +
        `derivation assumes one formula and would need to be run per season.`,
    );
  }
  const scoring = h.currentLeague.scoringSettings;
  console.log(`scoring (all ${h.chain.length} seasons): ${JSON.stringify(scoring)}`);

  const players = await getJson<Record<string, { birth_date?: string | null }>>(
    `${STATS_BASE}/v1/players/nba`,
  );

  const seasons: string[] = [];
  for (let y = FIRST_SEASON; y <= LAST_SEASON; y++) seasons.push(String(y));

  /** season -> playerId -> era-relative production per 36 minutes */
  const bySeason = new Map<string, Map<string, number>>();
  let qualifiedTotal = 0;
  const missingKeys = new Set(Object.keys(scoring));

  for (const season of seasons) {
    const blob = await getJson<Record<string, StatLine | null>>(
      `${STATS_BASE}/v1/stats/nba/regular/${season}`,
    );
    const rows: Array<{ id: string; per36: number }> = [];
    for (const [id, line] of Object.entries(blob)) {
      if (!line) continue;
      for (const k of Object.keys(line)) missingKeys.delete(k);
      const minutes = (line.sp ?? 0) / 60;
      if ((line.gp ?? 0) < MIN_GAMES || minutes < MIN_MINUTES) continue;
      if (!players[id]?.birth_date) continue;
      rows.push({ id, per36: (fantasyPoints(line, scoring) / minutes) * 36 });
    }
    const mean = rows.reduce((s, r) => s + r.per36, 0) / (rows.length || 1);
    bySeason.set(season, new Map(rows.map((r) => [r.id, r.per36 / mean])));
    qualifiedTotal += rows.length;
    console.log(
      `  ${season}: ${String(rows.length).padStart(3)} qualified, mean ${mean.toFixed(1)} fpts/36`,
    );
  }
  console.log(
    `qualified player-seasons (${MIN_GAMES}+ games, ${MIN_MINUTES}+ minutes): ${qualifiedTotal}`,
  );
  console.log(
    `scoring keys absent from every stat blob: ${[...missingKeys].join(", ") || "(none)"}`,
  );

  // (start age, horizon) -> forward production ratios, ZERO for a season not played.
  const cells = new Map<string, { sum: number; n: number; gone: number }>();
  for (let si = 0; si < seasons.length; si++) {
    for (const [id, rel] of bySeason.get(seasons[si])!) {
      const birth = players[id]!.birth_date!;
      const age = ageDuringSeason(birth, Number(seasons[si]));
      for (let k = 0; k <= HORIZON; k++) {
        if (si + k >= seasons.length) break;
        const later = bySeason.get(seasons[si + k])!.get(id);
        const key = `${age}|${k}`;
        const cell = cells.get(key) ?? { sum: 0, n: 0, gone: 0 };
        cell.sum += later ? later / rel : 0;
        cell.n++;
        if (!later) cell.gone++;
        cells.set(key, cell);
      }
    }
  }

  const raw: Array<{
    age: number;
    remaining: number;
    cohort: number;
    thinnestCell: number;
    stillPlaying: number;
  }> = [];
  for (let age = 15; age <= 50; age++) {
    let remaining = 1;
    let thinnest = Infinity;
    let complete = true;
    for (let k = 1; k <= HORIZON; k++) {
      const cell = cells.get(`${age}|${k}`);
      if (!cell || cell.n < MIN_CELL) {
        complete = false;
        break;
      }
      thinnest = Math.min(thinnest, cell.n);
      remaining += Math.pow(DISCOUNT, k) * (cell.sum / cell.n);
    }
    if (!complete) continue;
    const next = cells.get(`${age}|1`)!;
    raw.push({
      age,
      remaining,
      cohort: cells.get(`${age}|0`)!.n,
      thinnestCell: thinnest,
      stillPlaying: 1 - next.gone / next.n,
    });
  }

  const smoothed = isotonicDecreasing(
    raw.map((r) => ({ age: r.age, value: r.remaining, weight: r.cohort })),
  );
  const peak = Math.max(...smoothed.values());
  const reference = smoothed.get(27)!;

  console.log(
    `\nage  cohort  thinnest  playing+1   raw    smoothed   vs 27    anchor`,
  );
  for (const r of raw) {
    const s = smoothed.get(r.age)!;
    console.log(
      ` ${r.age}   ${String(r.cohort).padStart(4)}     ${String(r.thinnestCell).padStart(4)}      ` +
        `${(r.stillPlaying * 100).toFixed(0).padStart(3)}%   ${r.remaining.toFixed(3)}    ` +
        `${s.toFixed(3)}     ${(s / reference).toFixed(3)}    ${((s / peak) * PEAK).toFixed(3)}`,
    );
  }

  console.log(`\n// paste into lib/valuation/ageCurve.ts`);
  console.log(`export const DERIVED_AGE_CURVE: DerivedAgeRow[] = [`);
  for (const r of raw) {
    const s = smoothed.get(r.age)!;
    console.log(
      `  { age: ${r.age}, multiplier: ${((s / peak) * PEAK).toFixed(3)}, ` +
        `cohort: ${r.cohort}, stillPlaying: ${r.stillPlaying.toFixed(2)} },`,
    );
  }
  console.log(`];`);
  console.log(`\nplayerSeasons: ${qualifiedTotal}`);
  console.log(`seasons: ${seasons[0]}-${seasons[seasons.length - 1]}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
