/**
 * DYNASTY DURATION and the TIMELINE COHERENCE INDEX (TCI).
 *
 * ---------------------------------------------------------------------------------
 * The idea
 * ---------------------------------------------------------------------------------
 * Every dynasty asset is a claim on production at some point in TIME. A 33-year-old
 * star pays out now and stops; a 20-year-old pays out later and for longer; a 2029
 * first pays out later still. Two rosters can hold identical total value and be in
 * completely different competitive situations, because the value sits at different
 * points on the timeline. Total value alone cannot see this.
 *
 * Fixed income solved this problem decades ago with MACAULAY DURATION: the
 * cash-flow-weighted average time until you are paid. We apply the same construct to
 * dynasty assets, using the age curve as the payout profile.
 *
 *   D_asset = sum_t ( t * w_t ) / sum_t ( w_t )
 *
 * where w_t is the value the asset is expected to deliver t seasons from now. For a
 * player that is the age curve walked forward from their current age; for a pick it is
 * the same profile shifted by however many seasons until the pick converts to a rookie.
 * Duration comes out in SEASONS: "this asset's value arrives, on average, N seasons
 * from now."
 *
 * ---------------------------------------------------------------------------------
 * The proprietary part: Timeline Coherence Index
 * ---------------------------------------------------------------------------------
 * Roster duration alone tells you WHEN your value lands. It does not tell you whether
 * your assets AGREE with each other. That distinction matters enormously, because the
 * canonical dynasty mistake is not being early or late, it is being BOTH AT ONCE:
 * holding a 33-year-old star next to a stack of 2029 firsts. Neither timeline is served.
 * Every dynasty manager has a name for this ("stuck in the middle") and nobody
 * quantifies it.
 *
 * So we measure the value-weighted DISPERSION of duration across the roster and invert
 * it into an index:
 *
 *   sigma = sqrt( sum_i v_i * (D_i - D_roster)^2 / sum_i v_i )
 *   TCI   = 100 * (1 - min(1, sigma / sigmaRef))
 *
 * TCI near 100 means the roster's assets all pay off at about the same time, whether
 * that time is now or in four years. TCI near 0 means the roster is straddling: it owns
 * two different teams that happen to share a logo.
 *
 * Crucially, coherence is DIRECTION-FREE. A great rebuild and a great contender both
 * score high. That is deliberate: the metric measures whether you have a plan, not
 * whether we approve of it. Combined with duration it produces a genuine 2x2, and the
 * only bad quadrant is incoherence.
 *
 * This is computable here only because players and picks are already valued on one
 * common scale. That is what makes it defensible rather than a gimmick.
 */
import type { LeagueHistory } from "../history";
import { VALUATION_CONFIG, ageMultiplier, type ValuationConfig } from "../valuation";
import { pickCapital } from "../picks";
import { analyzeRoster } from "../roster";

/** Seasons of payout profile to look ahead. Beyond this, value is negligible. */
const HORIZON = 12;
/**
 * Reference dispersion for normalising TCI, in seasons.
 *
 * Calibrated against the genuinely straddled case rather than an abstract worst case.
 * A roster split half-and-half between a 33-year-old core (duration ~1.9) and 2028
 * picks (duration ~7.2) has a value-weighted dispersion of about 2.65. An initial
 * SIGMA_REF of 4 came from a theoretical extreme that no real roster reaches, and it
 * compressed every observed team into TCI 62-80, which is useless resolution.
 *
 * At 3 the index spreads properly: dispersion 0 -> 100, 1.0 -> 67, 1.5 -> 50,
 * 2.5 -> 17, 3.0+ -> 0.
 *
 * TCI is ABSOLUTE in construction, in the narrow sense that a roster's score depends
 * only on its own assets and not on the other thirteen: the same roster scores the same
 * in any league. That makes it comparable ACROSS SEASONS of this league, and it is why
 * the digest can subtract two readings and get a real movement.
 *
 * It does NOT establish cross-league comparability, and an earlier version of this
 * comment claimed it did. The constant is a calibration, and it was calibrated to the
 * dispersion actually observed across THIS league's fourteen rosters - 3 was chosen
 * because 4 compressed them all into TCI 62-80. A league with a different roster size,
 * different lineup shape, or a different pick-to-player mix would produce a different
 * observed spread, and its rosters would be graded on a scale tuned to somebody else's.
 * Two leagues' TCIs are on the same formula; whether they are on the same scale is
 * unverified, and we have exactly one league to check against.
 */
const SIGMA_REF = 3;
/** Age at which an incoming rookie enters the league. */
const ROOKIE_AGE = 19;
/**
 * Career taper. The valuation age curve deliberately FLOORS rather than reaching zero,
 * because it prices a currently-active player and a 38-year-old starter is not worthless.
 * But a payout profile must terminate: production genuinely ends at retirement.
 *
 * Without this, an old player's profile carries a flat tail out to the horizon, which
 * pushes their duration UP and produced a frankly absurd result caught by test: a
 * 34-year-old scored a LONGER duration than a 27-year-old. Availability ramps from 1 to
 * 0 across these ages, so the series terminates and duration behaves monotonically.
 */
const TAPER_START = 33;
const TAPER_END = 41;

export function availability(age: number): number {
  if (age <= TAPER_START) return 1;
  if (age >= TAPER_END) return 0;
  return (TAPER_END - age) / (TAPER_END - TAPER_START);
}

export interface AssetDuration {
  id: string;
  label: string;
  kind: "player" | "pick";
  value: number;
  /** Seasons from now at which this asset's value arrives, on average. */
  duration: number;
}

export interface TimelineProfile {
  rosterId: number;
  teamName: string | null;
  ownerName: string;
  /** Value-weighted mean duration, in seasons. */
  rosterDuration: number;
  /** Value-weighted dispersion of duration, in seasons. */
  dispersion: number;
  /** 0-100. High = the roster's assets agree about when it wins. */
  tci: number;
  /** Total value considered (players + picks). */
  totalValue: number;
  /** Share of value that arrives within 2 seasons. */
  nowShare: number;
  /** Share of value that arrives 4+ seasons out. */
  laterShare: number;
  /** The classification the 2x2 implies. */
  posture: "contending" | "ascending" | "rebuilding" | "straddling";
  /** Plain-language read, written to be useful rather than flattering. */
  read: string;
  /** The individual assets, longest duration first. */
  assets: AssetDuration[];
}

/**
 * Payout weights for a player: how much value they deliver in each future season.
 * Uses the same age curve the valuation model uses, so the two cannot drift apart.
 */
function playerPayouts(
  age: number | null,
  cfg: ValuationConfig,
): number[] {
  const a = age ?? 25;
  const out: number[] = [];
  for (let t = 0; t < HORIZON; t++) {
    const at = a + t;
    // ageMultiplier encodes the value profile by age; availability terminates it at
    // retirement so the series has a finite end and duration stays monotonic in age.
    out.push(Math.max(0, ageMultiplier(at, cfg)) * availability(at));
  }
  return out;
}

/** Macaulay-style duration from a payout series. */
export function durationOf(payouts: number[]): number {
  let num = 0;
  let den = 0;
  for (let t = 0; t < payouts.length; t++) {
    num += t * payouts[t];
    den += payouts[t];
  }
  return den > 0 ? num / den : 0;
}

/** Duration of a player of a given age, in seasons. */
export function playerDuration(
  age: number | null,
  cfg: ValuationConfig = VALUATION_CONFIG,
): number {
  return durationOf(playerPayouts(age, cfg));
}

/**
 * Duration of a draft pick: the wait until it converts, plus the duration of the
 * rookie it becomes. A pick is a deferred claim on a long-duration asset, which is
 * exactly why pick-heavy rosters and veteran-heavy rosters are so hard to compare on
 * total value alone.
 */
export function pickDuration(
  seasonsOut: number,
  cfg: ValuationConfig = VALUATION_CONFIG,
): number {
  return Math.max(0, seasonsOut) + playerDuration(ROOKIE_AGE, cfg);
}

/** The three numbers a set of dated assets produces. See `coherenceOf`. */
export interface Coherence {
  /** Value-weighted mean duration, in seasons. UNROUNDED - see below. */
  rosterDuration: number;
  /** Value-weighted dispersion of duration, in seasons. UNROUNDED. */
  dispersion: number;
  /** 0-100, from SIGMA_REF. High = the assets agree about when they pay off. */
  tci: number;
  totalValue: number;
}

/**
 * TCI over an arbitrary bag of dated assets, not necessarily a real roster.
 *
 * Pulled out of `getTimelineProfile` (which now calls it) so a HYPOTHETICAL set of
 * assets can be scored on the identical formula and the identical SIGMA_REF - which is
 * the whole point: a counterfactual roster's coherence is only worth reading next to a
 * real one if neither was computed with its own constants.
 *
 * Returns duration and dispersion UNROUNDED, deliberately. `getTimelineProfile`
 * publishes them at 2dp but also feeds the raw duration to `classify` and to a
 * `toFixed(1)` in its own copy, and rounding twice can cross a boundary the single
 * rounding never would. Callers round for display; nothing here rounds for them.
 */
export function coherenceOf(
  assets: ReadonlyArray<{ value: number; duration: number }>,
): Coherence {
  const totalValue = assets.reduce((s, a) => s + a.value, 0);
  if (totalValue === 0) {
    return { rosterDuration: 0, dispersion: 0, tci: 0, totalValue: 0 };
  }
  const rosterDuration =
    assets.reduce((s, a) => s + a.value * a.duration, 0) / totalValue;
  const variance =
    assets.reduce((s, a) => s + a.value * Math.pow(a.duration - rosterDuration, 2), 0) /
    totalValue;
  const dispersion = Math.sqrt(variance);
  return {
    rosterDuration,
    dispersion,
    tci: Math.round(100 * (1 - Math.min(1, dispersion / SIGMA_REF))),
    totalValue,
  };
}

export interface TimelineOptions {
  cfg?: ValuationConfig;
  /**
   * Every roster's duration in this league, for RELATIVE classification.
   *
   * Contending is inherently competitive: a 3.8-season roster is a win-now team in a
   * league of rebuilders and a rebuilder in a league of veterans. Absolute thresholds
   * failed visibly on real data - with durations clustered 3.8-5.6 (3.6-5.5 before the
   * age-curve recalibration, which moved every roster's value-weighted arrival about a
   * year later), a fixed 2.6 cutoff classified NOBODY as contending, which cannot be
   * right for 14 teams. The recalibration moved the cluster and left the cutoff where it
   * was, so the absolute rule is now MORE wrong than when it was replaced, not less. Pass this and
   * posture is assigned by within-league percentile instead; omit it and the absolute
   * thresholds are used as a fallback.
   */
  leagueDurations?: number[];
}

export function getTimelineProfile(
  h: LeagueHistory,
  rosterId: number,
  optsOrCfg: TimelineOptions | ValuationConfig = {},
): TimelineProfile {
  const isCfg = (v: unknown): v is ValuationConfig =>
    !!v && typeof v === "object" && "maxValue" in (v as object);
  const opts: TimelineOptions = isCfg(optsOrCfg) ? { cfg: optsOrCfg } : optsOrCfg;
  const cfg = opts.cfg ?? VALUATION_CONFIG;
  const analysis = analyzeRoster(h, rosterId);
  const caps = pickCapital(h, rosterId);
  const assets: AssetDuration[] = [];

  for (const p of analysis.valued) {
    if (p.value <= 0) continue;
    assets.push({
      id: p.playerId,
      label: p.name,
      kind: "player",
      value: p.value,
      duration: playerDuration(p.age, cfg),
    });
  }
  for (const pk of caps.picks) {
    if (pk.value <= 0) continue;
    const seasonsOut = parseInt(pk.season, 10) - h.currentSeasonYear;
    assets.push({
      id: `${pk.season}-${pk.round}-${pk.originalRoster}`,
      label: pk.label,
      kind: "pick",
      value: pk.value,
      duration: pickDuration(seasonsOut, cfg),
    });
  }

  const { rosterDuration, dispersion, tci, totalValue } = coherenceOf(assets);
  if (totalValue === 0) {
    return {
      rosterId,
      teamName: analysis.teamName,
      ownerName: analysis.ownerName,
      rosterDuration: 0,
      dispersion: 0,
      tci: 0,
      totalValue: 0,
      nowShare: 0,
      laterShare: 0,
      posture: "straddling",
      read: "No valued assets to read a timeline from.",
      assets: [],
    };
  }

  const nowShare =
    assets.filter((a) => a.duration < 2).reduce((s, a) => s + a.value, 0) / totalValue;
  const laterShare =
    assets.filter((a) => a.duration >= 4).reduce((s, a) => s + a.value, 0) / totalValue;

  const { posture, read } = classify(
    rosterDuration,
    tci,
    nowShare,
    laterShare,
    opts.leagueDurations,
  );

  assets.sort((a, b) => b.duration - a.duration);
  return {
    rosterId,
    teamName: analysis.teamName,
    ownerName: analysis.ownerName,
    rosterDuration: Math.round(rosterDuration * 100) / 100,
    dispersion: Math.round(dispersion * 100) / 100,
    tci,
    totalValue,
    nowShare: Math.round(nowShare * 1000) / 1000,
    laterShare: Math.round(laterShare * 1000) / 1000,
    posture,
    read,
    assets,
  };
}

/** Incoherence threshold. Below this TCI the roster is straddling regardless of duration. */
const COHERENCE_FLOOR = 55;

/**
 * Fraction of the league this roster is shorter-dated than. 1 = shortest in league.
 *
 * THE DENOMINATOR EXCLUDES SELF, SO THE NUMERATOR HAS TO AS WELL. `leagueDurations` is
 * built in `leagueTimelines`' first pass from `rosterDuration`, which is ROUNDED to 2dp,
 * while `classify` is called with the unrounded value - so a roster whose duration
 * rounded UP counted itself as longer-dated than itself, and every one of those was
 * inflated by exactly 1/(n-1), 7.7pp on this fourteen-roster league, on 9 of 14 rosters.
 * Rounding the incoming value the same way makes self compare EQUAL rather than greater,
 * which the strict `>` then drops, matching the denominator. Ties between two genuinely
 * equal rosters are excluded from each other's numerator too, which is the ordinary
 * handling for a percentile and is the same answer either way.
 */
export function shortnessPercentile(duration: number, leagueDurations?: number[]): number | null {
  if (!leagueDurations || leagueDurations.length < 4) return null;
  const self = Math.round(duration * 100) / 100;
  const shorter = leagueDurations.filter((d) => d > self).length;
  return shorter / (leagueDurations.length - 1);
}

function classify(
  duration: number,
  tci: number,
  nowShare: number,
  laterShare: number,
  leagueDurations?: number[],
): { posture: TimelineProfile["posture"]; read: string } {
  const pctNow = Math.round(nowShare * 100);
  const pctLater = Math.round(laterShare * 100);
  const pct = shortnessPercentile(duration, leagueDurations);

  if (tci < COHERENCE_FLOOR) {
    return {
      posture: "straddling",
      read:
        `Your assets do not agree about when you win. ${pctNow}% of your value pays off ` +
        `inside two seasons while ${pctLater}% does not arrive for four or more, and the ` +
        `spread between them (${duration.toFixed(1)} seasons on average, dispersion ` +
        `high) is what "stuck in the middle" actually looks like as a number. This is ` +
        `the most expensive position in dynasty: the win-now assets decay while you ` +
        `wait for the young ones, and the young ones are not helped by the wait. Pick a ` +
        `direction and make the timeline agree with it.`,
    };
  }
  // Relative when we have league context, absolute otherwise.
  const isShort = pct != null ? pct >= 0.75 : duration < 2.6;
  const isLong = pct != null ? pct <= 0.25 : duration >= 4.2;

  /**
   * The forced curve, stated out loud.
   *
   * Percentile classification is what made posture work at all (absolute cutoffs once
   * found zero contenders in a fourteen-team league), and it has a cost nothing in the
   * app admitted to: the quartile boundaries mean roughly a quarter of coherent rosters
   * are labelled contending no matter how the league is actually built. In a league of
   * pure rebuilders, somebody is still "contending". The label is a RANK, and a reader
   * who takes it as a standard is reading something we did not say.
   */
  const relative = (label: string, share: string) =>
    pct != null
      ? ` One thing "${label}" does not mean: an absolute standard. It is the ${share} ` +
        `of THIS league by duration, so somebody carries the label in every league, ` +
        `however that league is built.`
      : "";

  if (isShort) {
    return {
      posture: "contending",
      read:
        `A coherent win-now roster: ${pctNow}% of your value pays off within two ` +
        `seasons and the assets are aligned about it. That is a real plan, but it has an ` +
        `expiry date, and every season you do not convert it costs you value that cannot ` +
        `be recovered.` + relative("contending", "shortest-dated quarter"),
    };
  }
  if (isLong) {
    return {
      posture: "rebuilding",
      read:
        `A coherent rebuild: ${pctLater}% of your value arrives four or more seasons out ` +
        `and your assets agree on the timeline. The risk here is not incoherence, it is ` +
        `patience. Value this far out is probabilistic, and a rebuild that never picks a ` +
        `window to open just keeps deferring.` +
        relative("rebuilding", "longest-dated quarter"),
    };
  }
  return {
    posture: "ascending",
    read:
      `An ascending roster: value concentrated around ${duration.toFixed(1)} seasons ` +
      `out, with the assets broadly aligned. This is the strongest place to be, because ` +
      `your core matures together rather than in sequence. The decision ahead is when to ` +
      `convert future capital into the last piece, not whether to blow it up.` +
      relative("ascending", "middle half"),
  };
}

/** Timeline profiles for every roster, most coherent first. */
export function leagueTimelines(
  h: LeagueHistory,
  cfg: ValuationConfig = VALUATION_CONFIG,
): TimelineProfile[] {
  // Two passes: the first establishes the league's duration distribution, the second
  // classifies each roster against it. Posture is only meaningful in context.
  const first = h.rosters.map((r) => getTimelineProfile(h, r.rosterId, { cfg }));
  const leagueDurations = first.map((p) => p.rosterDuration);
  return h.rosters
    .map((r) => getTimelineProfile(h, r.rosterId, { cfg, leagueDurations }))
    .sort((a, b) => b.tci - a.tci);
}
