/**
 * Live-night refresh. A cold desk load is ~39 requests; a refresh during a night needs only
 * what can have changed since the last load:
 *   - matchups (lineups, banked points, live slot scores)     1
 *   - the season schedule (game status, periods for the clock) 1
 *   - this season's log of each player whose game today is live or has finished since
 *     the last load                                            one each
 * Reused: state, league, rosters, players, tip times (scores feed), prior-season logs, and
 * the logs of players with no game in progress or newly final.
 */
import { createRequester, schemas, urls } from "./load.js";
import { indexSchedule } from "./normalize.js";
import { easternDate } from "./calendar.js";
import { assembleDesk } from "./index.js";
import { loadWeekInputs } from "./load.js";

export const REFRESH_BUDGET = Object.freeze({ maxRequests: 20, fanOut: 8 });

/** Cold load returning the inputs too, so a later refresh can reuse them. */
export async function loadDeskState({ rosterId, leagueId, fetchJson, now = new Date(), players = null, week = null }) {
  const inputs = await loadWeekInputs({ fetchJson, leagueId, rosterId, now, players, week });
  return { inputs, desk: assembleDesk(inputs, { rosterId, leagueId, now }) };
}

/** Which players need a fresh log: a game today that is live, or final but not final at the last load. */
export function playersToRefresh(inputs, scheduleIdxNew, today) {
  const old = inputs.scheduleIdx;
  const out = [];
  for (const pid of inputs.playerIds || []) {
    const raw = inputs.logsRaw?.[pid]?.current;
    if (!raw || Array.isArray(raw)) continue;
    const rowsToday = Object.values(raw).flat().filter((g) => g.date === today && g.game_id);
    const hit = rowsToday.some((g) => {
      const now = scheduleIdxNew.games.get(g.game_id)?.status;
      const before = old?.games.get(g.game_id)?.status;
      return now === "in_game" || (now === "complete" && before !== "complete");
    });
    if (hit) out.push(pid);
  }
  return out;
}

/**
 * Refresh a desk state in place of a cold load. Returns { inputs, desk, refreshed }, where
 * refreshed = { requests, players } names exactly what was fetched.
 */
export async function refreshDeskState(state, { rosterId, leagueId, fetchJson, now = new Date() }) {
  const L = state.inputs;
  if (!L || L.resolved?.kind !== "week" || !L.matchup) return loadDeskState({ rosterId, leagueId, fetchJson, now });
  const rq = createRequester(fetchJson, REFRESH_BUDGET);
  const today = easternDate(now);
  const [matchups, scheduleRaw] = await Promise.all([
    rq.get("matchups", urls.matchups(leagueId, L.resolved.week), schemas.matchups),
    rq.get("schedule", urls.schedule(L.season), schemas.schedule),
  ]);
  const scheduleIdx = scheduleRaw ? indexSchedule(scheduleRaw, L.season) : L.scheduleIdx;
  const ids = playersToRefresh(L, scheduleIdx, today);
  const logsRaw = { ...L.logsRaw };
  await rq.pool(ids, async (pid) => {
    const fresh = await rq.get("playerLog", urls.playerLog(pid, L.season), schemas.playerLog, { subject: pid });
    if (fresh) logsRaw[pid] = { ...logsRaw[pid], current: fresh };
  });
  const mine = matchups ? matchups.find((m) => m.roster_id === Number(rosterId)) || null : L.matchup;
  const inputs = {
    ...L,
    today,
    scheduleIdx,
    matchups: matchups ?? L.matchups,
    matchup: mine ?? L.matchup,
    logsRaw,
    gaps: rq.gaps,
    requests: rq.requests,
    budgetMax: rq.maxRequests,
  };
  const desk = assembleDesk(inputs, { rosterId, leagueId, now });
  return { inputs, desk, refreshed: { requests: rq.requests.length, players: ids } };
}
