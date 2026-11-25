/**
 * One roster's week as facts: per-player logs and week games, and the seven slots with
 * their inferred lock states. The same rules as the viewing roster's board (index.js),
 * so the opponent is read exactly the way the viewer's own team is.
 */
import { normalizeSeasonLog, mergeLogs, completionRule } from "./normalize.js";
import { inferLockState } from "./lockState.js";
import { assumedLockState } from "./assume.js";
import { withKnownLock } from "./knownLocks.js";

/**
 * L: loader output. ids: player ids; logsRaw: { [pid]: { current, prior, prior2 } };
 * matchup: { starters, starters_points }; nameOf(id).
 */
export function teamFacts({ L, ids, logsRaw, matchup, nameOf, dir, assume = [] }) {
  const S = L.scheduleIdx;
  const isComplete = completionRule(S, L.season);
  const week = L.resolved.week;
  const P = new Map();
  for (const pid of ids) {
    const raw = logsRaw?.[pid] || {};
    const parts = [];
    if (raw.current) parts.push(normalizeSeasonLog(raw.current, { playerId: pid, season: L.season, scoring: L.league.scoring_settings, isComplete }));
    if (raw.prior) parts.push(normalizeSeasonLog(raw.prior, { playerId: pid, season: L.prevSeason, scoring: L.league.scoring_settings, isComplete }));
    if (raw.prior2) parts.push(normalizeSeasonLog(raw.prior2, { playerId: pid, season: L.prevSeason2, scoring: L.league.scoring_settings, isComplete }));
    const log = mergeLogs(...parts);
    const cur = log.filter((g) => g.season === L.season && g.team);
    const who = dir.get(pid) || null;
    const team = cur.length ? cur[cur.length - 1].team : (who?.team ?? null);
    const byGame = new Map(log.filter((g) => g.gameId).map((g) => [g.gameId, g]));
    const weekGames = (team ? S.teamWeek.get(`${team}|${week}`) || [] : []).map((g) => ({ gameId: g.gameId, date: g.date, status: g.status, row: byGame.get(g.gameId) || null }));
    const remaining = weekGames.filter((g) => g.status === "pre_game" || g.status === "postponed");
    const live = weekGames.find((g) => g.status === "in_game") || null;
    P.set(pid, { pid, who, log, team, weekGames, remaining, live, noData: !raw.current || !team });
  }
  const labels = (L.league.roster_positions || []).filter((p) => p !== "BN" && p !== "IR" && p !== "TAXI");
  const starters = matchup?.starters || [];
  const sp = matchup?.starters_points || [];
  // lockin-assume: the viewer's assumptions for this side override the inferred lock state
  const byIndex = new Map(assume.map((a) => [a.slot, a]));
  const applied = [];
  const slots = labels.map((label, i) => {
    const pid = starters[i] && starters[i] !== "0" ? starters[i] : null;
    const banked = pid ? (sp[i] ?? 0) : null;
    const p = pid ? P.get(pid) : null;
    let ls = pid ? inferLockState(banked, (p?.weekGames || []).map((g) => ({ status: g.status, row: g.row }))) : { state: null, reason: "empty_slot", certain: false };
    ls = withKnownLock(ls, { leagueId: L.league?.league_id ?? null, season: L.season, week, rosterId: matchup?.roster_id, playerId: pid, banked });
    const e = byIndex.get(i);
    let assumedScore = null;
    if (e) {
      const r = assumedLockState(ls, e.state, { banked, gamesLeft: p && !p.noData ? p.remaining.length : 0, live: !!p?.live, score: e.score ?? null });
      applied.push({ side: "theirs", slot: i, state: e.state, score: e.score ?? null, label, playerId: pid, banked, inferred: ls.state, inferredReason: ls.reason, contradicts: r.contradicts });
      ls = r.ls;
      if (r.ls.typed) assumedScore = r.ls.score;
    }
    return { index: i, label, playerId: pid, name: pid ? (nameOf(pid) ?? `Player ${pid}`) : null, banked, lockState: ls.state, lockStateReason: ls.reason, lockCertain: !!ls.certain, ...(assumedScore != null ? { assumedScore } : {}) };
  });
  return { P, slots, labels, applied };
}
