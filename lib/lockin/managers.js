/**
 * How each manager plays lock-in, fitted offline (scripts/lockin/manager_profiles.mjs) and
 * committed here. Per manager, keyed by owner user_id (succession-safe): recency-weighted
 * (half-life in weeks), shrunk first toward his own earlier seasons, then toward the league:
 *   value = (n_eff * own + K * prior) / (n_eff + K),  shrinkage = K / (n_eff + K)
 * Intent is read at desk time from record, standing and this season's signals.
 */

// Replaced by the fit; until then provisional and labelled as such.
export const LEAGUE_PROFILE = Object.freeze({
  fitted: false,
  unknownLockedShare: 0.5,
  lockTiming: { earlyShare: 0.4, cutoffDay: "Thu" },
  lockThreshold: { median: 28, vsForecast: 1.2 },
  emptySlotRate: 0.02,
  zeroRate: 0.05,
  benchUse: 0.65,
  pointsVsRulePerSlot: -1.4,
  weeks: 0,
  source: "provisional defaults; not yet fitted",
});
export const MANAGER_PROFILES = Object.freeze({});
export const PROFILE_FIT = Object.freeze({ halfLifeWeeks: 23, credibilityK: 12, fittedAt: null, seasons: [] });

/** Profile view for an owner (pinned shape), league values attached for comparison. */
export function profileFor(ownerId, table = MANAGER_PROFILES, league = LEAGUE_PROFILE, fit = PROFILE_FIT) {
  const own = ownerId ? table[ownerId] : null;
  const p = own || league;
  return {
    lockTiming: { earlyShare: p.lockTiming.earlyShare, cutoffDay: league.lockTiming.cutoffDay, league: league.lockTiming.earlyShare },
    lockThreshold: { median: p.lockThreshold.median, vsForecast: p.lockThreshold.vsForecast, league: league.lockThreshold.vsForecast },
    emptySlotRate: { value: p.emptySlotRate, league: league.emptySlotRate },
    zeroRate: { value: p.zeroRate, league: league.zeroRate },
    benchUse: { value: p.benchUse, league: league.benchUse },
    unknownLockedShare: p.unknownLockedShare,
    pointsVsRulePerSlot: p.pointsVsRulePerSlot,
    weeks: own ? own.weeks : 0,
    shrinkage: own ? own.shrinkage : 1,
    halfLifeWeeks: fit.halfLifeWeeks,
    seasons: own ? own.seasons : [],
    source: own ? "manager" : league.fitted ? "league" : "provisional",
  };
}

/**
 * Intent from evidence. record: { wins, losses }; rank among teams by wins then points;
 * playoff line = 8 of 14. Signals this season: empty slots and unlocked-DNP zeros per week.
 * Returns label, confidence, and the evidence lines it rests on (copy states facts only).
 */
export function intentOf({ wins, losses, rank, teams = 14, playoffSpots = 8, weeksPlayed, emptyPerWeek = null, zerosPerWeek = null, league = LEAGUE_PROFILE }) {
  const evidence = [];
  let score = 0;
  if (rank != null) {
    evidence.push(`${wins}-${losses}, ${ordinal(rank)} of ${teams} (top ${playoffSpots} make the playoffs)`);
    const games = wins + losses;
    const share = games ? wins / games : 0.5;
    if (rank <= playoffSpots - 2 && share >= 0.5) score += 1;
    else if (rank > playoffSpots + 2 || (games >= 3 && share <= 0.25)) score -= 1;
  }
  if (emptyPerWeek != null) {
    const leagueEmpty = league.emptySlotRate * 7;
    if (emptyPerWeek > 2 * leagueEmpty + 0.3) {
      score -= 1;
      evidence.push(`${emptyPerWeek.toFixed(1)} empty slots a week this season (league ${leagueEmpty.toFixed(1)})`);
    }
  }
  if (zerosPerWeek != null) {
    const leagueZero = league.zeroRate * 7;
    if (zerosPerWeek > 2 * leagueZero + 0.3) {
      score -= 1;
      evidence.push(`${zerosPerWeek.toFixed(1)} slots a week ending at 0 from an unlocked DNP (league ${leagueZero.toFixed(1)})`);
    }
  }
  const label = score >= 1 ? "contending" : score <= -1 ? "rebuilding" : "middle";
  const weight = Math.min(1, (weeksPlayed ?? 0) / 8);
  const confidenceScore = Math.round(Math.min(1, Math.abs(score) * 0.35 + 0.2) * weight * 100) / 100;
  const confidence = confidenceScore >= 0.6 ? "high" : confidenceScore >= 0.3 ? "moderate" : "low";
  const phrase = label === "contending" ? "playing like a contender" : label === "rebuilding" ? "playing like a rebuild" : "playing like a middle team";
  return { label, confidence, confidenceScore, evidence, text: `${phrase}, based on ${evidence.length ? evidence.join("; ") : "too little this season to tell"}` };
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
