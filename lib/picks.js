import { ordinal, rosterName } from "./derive/describe.js";
import { cachedValuePlayers, pickValue } from "./valuation/index.js";
import { playoffPlaces, seasonResults } from "./playoffs.js";
/**
 * D115. Has this season's rookie draft already run for the current league?
 *
 * A spent pick is not capital: once the draft is `complete` the pick became a player
 * (already on someone's roster and valued as one), so counting it again would value
 * the same asset twice. Reads `h.completedDraftSeasons` (assembled in lib/history.js);
 * a corpus without it reads as "no draft has run" - the honest default when the
 * provider has no draft data (D19), not a guess that it has.
 *
 * @param {{ completedDraftSeasons?: Set<string> }} h
 * @param {string|number} season
 */
export function isPickSeasonSpent(h, season) {
  return h.completedDraftSeasons?.has(String(season)) ?? false;
}
/**
 * Which future seasons the league currently tracks TRADEABLE picks for. The one
 * enumeration every pick-capital surface goes through (roster, power ranking, TCI,
 * duration, trade builder/finder, game plan, counterfactual - all via `pickCapital`).
 *
 * Sleeper's traded_picks snapshot keeps a season after its draft has run (D115), so
 * seasons whose draft is complete are excluded here. The empty-snapshot fallback is
 * the first season at or after the current one whose draft has NOT run: after the
 * 2026 draft that is 2027, never the spent 2026.
 *
 * @returns {string[]}
 */
export function tradeablePickSeasons(h) {
  const cur = h.currentSeasonYear;
  const set = new Set();
  for (const tp of h.tradedPicks) {
    const y = parseInt(tp.season, 10);
    if (y >= cur && !isPickSeasonSpent(h, y)) set.add(y);
  }
  if (set.size === 0) {
    let y = cur;
    while (isPickSeasonSpent(h, y)) y++;
    set.add(y);
  }
  return [...set].sort((a, b) => a - b).map(String);
}
const futureSeasons = tradeablePickSeasons;
function ownerOf(h, season, round, original) {
  const tp = h.tradedPicks.find(
    (p) => p.season === season && p.round === round && p.rosterId === original,
  );
  return tp ? tp.ownerId : original;
}
/**
 * Rank every roster by current strength, 1 = strongest.
 *
 * This is what lets a future pick be priced by WHO OWES IT rather than as a generic
 * "a first". A first from the league's worst team is close to a lottery pick; a first
 * from the best team is a late one.
 *
 * > [!warning] Records are useless in the preseason.
 * > Verified on the live league: in `pre_draft` status every roster reads 0-0 with
 * > 0 fpts. Sorting on that is a no-op, which silently left rank == roster_id, so
 * > pick values were being driven by arbitrary league ids. Whenever the current
 * > season has no games played we therefore rank by ROSTER TALENT instead, which is
 * > a real preseason signal and the same thing a human uses to guess draft order.
 *
 * Talent is measured with the same valuation the rest of the app uses, so the two
 * can never disagree. This function does NOT call `analyzeRoster` (that would recurse
 * through `pickCapital` back into here); it values players directly.
 */
/** Regular-season length when the league does not say (Sleeper `playoff_week_start`). */
const DEFAULT_REGULAR_SEASON_WEEKS = 20;
function gamesPlayed(r) {
  const s = r.settings;
  return (s.wins ?? 0) + (s.losses ?? 0) + (s.ties ?? 0);
}
function talentOrder(h) {
  const vals = cachedValuePlayers(h);
  const talent = (rosterId) => {
    const roster = h.rostersById.get(rosterId);
    if (!roster) return 0;
    // Top 10 only: a contender is defined by its starters, not by bench filler.
    return roster.players
      .map((pid) => vals.get(pid)?.value ?? 0)
      .sort((a, b) => b - a)
      .slice(0, 10)
      .reduce((s, v) => s + v, 0);
  };
  const scored = h.rosters.map((r) => ({ r, t: talent(r.rosterId) }));
  scored.sort((a, b) => b.t - a.t || a.r.rosterId - b.r.rosterId);
  return scored.map((s) => s.r);
}
function recordOrder(h) {
  const pct = (r) => {
    const gp = gamesPlayed(r);
    return gp ? ((r.settings.wins ?? 0) + 0.5 * (r.settings.ties ?? 0)) / gp : 0;
  };
  return [...h.rosters].sort(
    (a, b) =>
      pct(b) - pct(a) ||
      b.settings.fpts - a.settings.fpts ||
      a.rosterId - b.rosterId,
  );
}
export function strengthRanks(h) {
  const played = h.rosters.some(
    (r) => gamesPlayed(r) > 0 || r.settings.fpts > 0,
  );
  const talent = talentOrder(h);
  let ordered = talent;
  if (played) {
    /*
     * IN SEASON: blend record rank and roster-value rank, weighting the record by the
     * share of the regular season played (gp / regular-season weeks, capped at 1), so
     * week 3 of 20 is 15% record and 85% roster value, and the final week is all record.
     */
    const weeks =
      (h.currentLeague.settings?.playoff_week_start ?? 0) - 1 > 0
        ? h.currentLeague.settings.playoff_week_start - 1
        : DEFAULT_REGULAR_SEASON_WEEKS;
    const gp = Math.max(...h.rosters.map(gamesPlayed));
    const w = Math.min(1, gp / weeks);
    const recordRank = new Map(recordOrder(h).map((r, i) => [r.rosterId, i]));
    const talentRank = new Map(talent.map((r, i) => [r.rosterId, i]));
    const score = (r) =>
      w * (recordRank.get(r.rosterId) ?? 0) +
      (1 - w) * (talentRank.get(r.rosterId) ?? 0);
    ordered = [...h.rosters].sort(
      (a, b) =>
        score(a) - score(b) ||
        (recordRank.get(a.rosterId) ?? 0) - (recordRank.get(b.rosterId) ?? 0) ||
        a.rosterId - b.rosterId,
    );
  }
  /*
   * CANDIDATE 44. `pickValue` has always treated rank 1 as the CHAMPION - there is a
   * test called "makes the champion pick last" - but this function only ever handed it
   * a regular-season (or preseason-talent) order, so a title-winning lower seed was
   * priced as a mid-table team.
   *
   * A decided bracket overrides that for the teams it actually ranks: the playoff
   * finishers take their real finishing places, 1..N. Everyone else keeps the order
   * `ordered` just computed and follows on behind them - which is both correct (a team
   * that missed the playoffs finished behind every team that made them) and important,
   * because in the offseason those rosters have no record at all and their talent
   * ordering above is the only real signal they have. Ranking them by an empty record
   * instead would have fixed eight teams by breaking six.
   *
   * ONLY UNTIL THE CURRENT SEASON HAS A SCORED GAME, unless the decided bracket IS the
   * current season's. A finished bracket is last season's answer; once this season has
   * results, slotting every future pick by it priced a 3-0 team's first as a lottery
   * pick and a 1-2 team's as the champion's.
   */
  const latest = seasonResults(h).at(-1);
  const bracketIsCurrent =
    latest != null && String(latest.season) === String(h.currentSeasonYear);
  const places = !played || bracketIsCurrent ? playoffPlaces(h) : null;
  const m = new Map();
  if (places) {
    for (const [rosterId, place] of places) m.set(rosterId, place);
    let next = Math.max(...places.values()) + 1;
    for (const r of ordered) {
      if (!m.has(r.rosterId)) m.set(r.rosterId, next++);
    }
    return m;
  }
  ordered.forEach((r, i) => m.set(r.rosterId, i + 1));
  return m;
}
export function pickCapital(h, rosterId, opts = {}) {
  const ownership = opts.ownership ?? "held";
  const cur = h.currentSeasonYear;
  const rounds = h.currentLeague.settings.draft_rounds || 3;
  const teams = h.currentLeague.totalRosters || h.rosters.length;
  const seasons = futureSeasons(h);
  const ranks = strengthRanks(h);
  const picks = [];
  for (const season of seasons) {
    for (let round = 1; round <= rounds; round++) {
      for (let original = 1; original <= teams; original++) {
        const owner =
          ownership === "original"
            ? original
            : ownerOf(h, season, round, original);
        if (owner !== rosterId) continue;
        const acquired = original !== rosterId;
        const fromName = acquired ? rosterName(h, original) : null;
        const seasonsOut = parseInt(season, 10) - cur;
        const value = pickValue(round, seasonsOut, {
          originalTeamRank: ranks.get(original),
          teams,
          rounds,
          playoffTeams: h.currentLeague.settings.playoff_teams,
          season,
        });
        picks.push({
          season,
          round,
          originalRoster: original,
          acquired,
          fromName,
          value,
          label: `${season} ${ordinal(round)}${fromName ? ` (via ${fromName})` : ""}`,
        });
      }
    }
  }
  picks.sort((a, b) => b.value - a.value);
  const firsts = picks.filter((p) => p.round === 1).length;
  return {
    picks,
    total: picks.reduce((s, p) => s + p.value, 0),
    firsts,
    extraFirsts: firsts - seasons.length, // baseline = own 1 first per season
    seasons,
  };
}
