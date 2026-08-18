import { ordinal, rosterName } from "./derive/describe.js";
import { cachedValuePlayers, pickValue } from "./valuation/index.js";
import { playoffPlaces } from "./playoffs.js";
/** Which future seasons the league currently tracks tradeable picks for. */
function futureSeasons(h) {
  const cur = h.currentSeasonYear;
  const set = new Set();
  for (const tp of h.tradedPicks) {
    const y = parseInt(tp.season, 10);
    if (y >= cur) set.add(y);
  }
  if (set.size === 0) set.add(cur);
  return [...set].sort((a, b) => a - b).map(String);
}
function ownerOf(h, season, round, original) {
  const tp = h.tradedPicks.find(
    (p) => p.season === season && p.round === round && p.rosterId === original,
  );
  return tp ? tp.ownerId : original;
}
export function unrecordedPickMoves(h) {
  // Every (season, round, originalRoster) the transaction log accounts for.
  const explained = new Set();
  for (const t of h.transactions) {
    for (const dp of t.draftPicks) {
      explained.add(`${dp.season}|${dp.round}|${dp.rosterId}`);
    }
  }
  const out = [];
  for (const tp of h.tradedPicks) {
    if (tp.ownerId === tp.rosterId) continue; // still with its original team
    const key = `${tp.season}|${tp.round}|${tp.rosterId}`;
    if (explained.has(key)) continue;
    out.push({
      season: tp.season,
      round: tp.round,
      originalRoster: tp.rosterId,
      fromRoster: tp.previousOwnerId,
      toRoster: tp.ownerId,
      label: `${tp.season} ${ordinal(tp.round)} (orig. ${rosterName(h, tp.rosterId)})`,
    });
  }
  return out;
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
export function strengthRanks(h) {
  const played = h.rosters.some(
    (r) => r.settings.wins + r.settings.losses > 0 || r.settings.fpts > 0,
  );
  let ordered;
  if (played) {
    ordered = [...h.rosters].sort((a, b) => {
      const aw = a.settings.wins - a.settings.losses;
      const bw = b.settings.wins - b.settings.losses;
      if (bw !== aw) return bw - aw;
      return b.settings.fpts - a.settings.fpts;
    });
  } else {
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
    ordered = scored.map((s) => s.r);
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
   */
  const places = playoffPlaces(h);
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
