import { cachedValuePlayers, injuryLabel } from "./valuation/index.js";
import { leagueTiers, tierResolver } from "./rankings/tiers.js";
import { pickCapital } from "./picks.js";
import { loadSeasonRosters } from "./metrics/skill.js";
import { coreAgeBandOf } from "./metrics/axes.js";
// Exported so any module that needs "the five real NBA positions this league
// actually rosters, in a stable order" (lib/lab/leverage, at least) shares this one
// literal instead of retyping it - the position taxonomy has exactly one home.
export const POS_ORDER = ["PG", "SG", "SF", "PF", "C"];
/*
 * THIS FIELD USED TO BE CALLED `window` AND USED TO SAY `rebuilding` / `balanced` /
 * `win-now`, which were three words it had no standing to say: it measures the
 * value-weighted age of the top 8 players and nothing else. Posture - a different
 * classifier, on a different input (duration over players AND picks), answering a
 * different question - said `rebuilding` and `balanced` too, and /league printed both on
 * one row. See lib/metrics/axes.js for the measurement and the argument; the banding
 * itself, still league-relative for the reason it always was, lives there now so the two
 * vocabularies are declared together and cannot quietly re-collide.
 *
 * The relative/absolute argument that used to sit here is in `coreAgeBandOf`, unchanged;
 * D29 in DECISIONS.md carries the same amendment.
 */
export function analyzeRoster(h, rosterId) {
  const roster = h.rostersById.get(rosterId);
  // Cached: this is called once PER ROSTER by leagueValueRanking below, and every
  // call needs the identical league-wide value map - see cachedValuePlayers for why
  // recomputing it 14 times over was the single biggest cold-start cost found.
  const valuesMap = cachedValuePlayers(h);
  // Tiers break at natural cliffs in the LEAGUE-WIDE value distribution (not at
  // hardcoded thresholds, and not per-roster - a "Franchise" label has to mean the
  // same thing on every team's page). The floor (10% of the top asset) bounds the
  // cliff search to assets anyone actually tiers; same recipe as /values, so the
  // labels agree everywhere.
  const leagueValuesDesc = [...valuesMap.values()]
    .map((v) => v.value)
    .filter((v) => v > 0)
    .sort((a, b) => b - a);
  const tierFor = tierResolver(leagueTiers(leagueValuesDesc));
  const valued = (roster?.players ?? [])
    .map((pid) => {
      const p = h.players.get(pid);
      if (!p) return null;
      const v = valuesMap.get(pid);
      return {
        playerId: pid,
        name: p.fullName,
        team: p.team,
        position: p.position,
        age: p.age,
        injury: injuryLabel(
          {
            status: p.injuryStatus,
            bodyPart: p.injuryBodyPart,
            notes: p.injuryNotes,
          },
          { short: true },
        ),
        injuryDetail: injuryLabel({
          status: p.injuryStatus,
          bodyPart: p.injuryBodyPart,
          notes: p.injuryNotes,
        }),
        value: v.value,
        tier: tierFor(v.value)?.label ?? "Fringe",
        espnId: p.espnId,
        consensusRank: p.searchRank,
        breakdown: {
          base: v.base,
          age: v.ageMultiplier,
          injury: v.injuryMultiplier,
          role: v.roleMultiplier,
          position: v.positionMultiplier,
        },
      };
    })
    .filter(Boolean);
  valued.sort((a, b) => b.value - a.value);
  const playerValue = valued.reduce((s, v) => s + v.value, 0);
  const picks = pickCapital(h, rosterId);
  const totalValue = playerValue + picks.total;
  // Core age: value-weighted average of the top 8 by value.
  const top = valued.slice(0, 8).filter((v) => v.age != null);
  const wsum = top.reduce((s, v) => s + v.value, 0);
  const coreAge = wsum
    ? Math.round((top.reduce((s, v) => s + v.age * v.value, 0) / wsum) * 10) /
      10
    : null;
  // Positional strength.
  const posMap = new Map();
  for (const v of valued) {
    const pos = v.position ?? "?";
    const cur = posMap.get(pos) ?? { count: 0, value: 0 };
    cur.count++;
    cur.value += v.value;
    posMap.set(pos, cur);
  }
  const byPosition = POS_ORDER.filter((p) => posMap.has(p)).map((pos) => ({
    pos,
    count: posMap.get(pos).count,
    value: posMap.get(pos).value,
  }));
  // Core-age band. Absolute thresholds here are a fallback for a standalone call with
  // no league context - `leagueValueRanking` below overrides this with the
  // league-relative version, which is the one every page should actually be showing.
  const coreAgeBand = coreAgeBandOf(coreAge);
  const user = roster?.ownerId ? h.usersById.get(roster.ownerId) : undefined;
  return {
    rosterId,
    ownerName: user?.displayName ?? `Roster ${rosterId}`,
    teamName: user?.teamName ?? null,
    valued,
    totalValue,
    playerValue,
    picks,
    coreAge,
    byPosition,
    coreAgeBand,
    record: {
      wins: roster?.settings.wins ?? 0,
      losses: roster?.settings.losses ?? 0,
    },
  };
}
/** Total roster value for every team, for league-wide ranking. */
export function leagueValueRanking(h) {
  const analyses = h.rosters.map((r) => analyzeRoster(h, r.rosterId));
  const leagueCoreAges = analyses
    .map((a) => a.coreAge)
    .filter((a) => a != null);
  return analyses
    .map((a) => ({
      ...a,
      coreAgeBand: coreAgeBandOf(a.coreAge, leagueCoreAges),
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}
/**
 * Standings for ONE season's roster snapshot: win differential first, then points as
 * the tiebreak. Pulled out of `currentFormByRoster` so any caller that already knows
 * which season it wants (rather than "whichever one was last played") can get the
 * identical ranking instead of re-deriving it - e.g. a season recap, which needs the
 * last COMPLETE season specifically, a stricter bar than "played at all".
 */
export function rankSeasonRosters(rosters, season, isLive) {
  const ranked = [...rosters].sort((a, b) => {
    const aw = a.settings.wins - a.settings.losses;
    const bw = b.settings.wins - b.settings.losses;
    if (bw !== aw) return bw - aw;
    return b.settings.fpts - a.settings.fpts;
  });
  const out = new Map();
  ranked.forEach((r, i) => {
    out.set(r.rosterId, {
      season,
      isLive,
      wins: r.settings.wins,
      losses: r.settings.losses,
      ties: r.settings.ties,
      fpts: r.settings.fpts,
      rank: i + 1,
      teams: ranked.length,
    });
  });
  return out;
}
export async function currentFormByRoster(h) {
  const bySeason = await loadSeasonRosters(h);
  const seasonsDesc = [...bySeason.keys()].sort((a, b) => b.localeCompare(a));
  for (const season of seasonsDesc) {
    const rosters = bySeason.get(season);
    const played = rosters.some(
      (r) => r.settings.wins + r.settings.losses > 0 || r.settings.fpts > 0,
    );
    if (!played) continue;
    return rankSeasonRosters(
      rosters,
      season,
      season === h.currentLeague.season,
    );
  }
  return new Map();
}
