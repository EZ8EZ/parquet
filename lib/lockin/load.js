/**
 * Loaders for the lock-in desk. The Sleeper client is injected as
 *   fetchJson(url, { schema, immutable }) => Promise<data>
 * so this module never imports a client. Every failure becomes a named gap in the
 * result (SHELVED S1: the previous attempt failed silently in bare catch blocks).
 * Budget: at most 40 requests for a cold roster-week, fan-out 8.
 */
import { z } from "zod";
import { indexSchedule } from "./normalize.js";
import { easternDate, resolveWeek } from "./calendar.js";
import { loadTips } from "./tipTimes.js"; // lockin-sequence
import { weekConsensus } from "./consensus.js"; // lockin-fixes M1

export const LOAD_BUDGET = Object.freeze({ maxRequests: 110, fanOut: 8, shapeGames: 30 });

const V1 = "https://api.sleeper.app/v1";
const API = "https://api.sleeper.app";
export const urls = {
  state: () => `${V1}/state/nba`,
  league: (id) => `${V1}/league/${id}`,
  rosters: (id) => `${V1}/league/${id}/rosters`,
  matchups: (id, w) => `${V1}/league/${id}/matchups/${w}`,
  schedule: (s) => `${API}/schedule/nba/regular/${s}`,
  players: () => `${V1}/players/nba`,
  users: (id) => `${V1}/league/${id}/users`, // lockin-opponent
  playerLog: (pid, s) => `${API}/stats/nba/player/${pid}?season_type=regular&season=${s}&grouping=week`,
};

const num = z.number().nullish();
export const schemas = {
  // lockin-opponent: names, avatars
  users: z.array(z.object({ user_id: z.string(), display_name: z.string().nullish(), avatar: z.string().nullish(), metadata: z.record(z.string(), z.unknown()).nullish() })),
  state: z.object({ week: z.number().nullish(), season: z.string(), season_type: z.string() }),
  league: z.object({
    league_id: z.string(),
    season: z.string(),
    status: z.string(),
    roster_positions: z.array(z.string()),
    scoring_settings: z.record(z.string(), z.number()),
    settings: z.record(z.string(), z.unknown()).nullish(),
  }),
  rosters: z.array(
    z.object({
      roster_id: z.number(),
      players: z.array(z.string()).nullish(),
      reserve: z.array(z.string()).nullish(),
      taxi: z.array(z.string()).nullish(),
      owner_id: z.string().nullish(), // lockin-opponent
      settings: z.record(z.string(), z.unknown()).nullish(), // lockin-opponent
    }),
  ),
  matchups: z
    .array(
      z.object({
        roster_id: z.number(),
        matchup_id: z.number().nullish(),
        starters: z.array(z.string()).nullish(),
        starters_points: z.array(z.number()).nullish(),
        players: z.array(z.string()).nullish(),
        points: num,
      }),
    )
    .nullish(),
  schedule: z.array(
    z.object({
      game_id: z.string(),
      week: z.number(),
      date: z.string(),
      status: z.string(),
      home: z.object({ team: z.string(), points: num, starters: z.array(z.string()).nullish(), scoring: z.array(z.object({ type: z.string() })).nullish() }),
      away: z.object({ team: z.string(), points: num, starters: z.array(z.string()).nullish(), scoring: z.array(z.object({ type: z.string() })).nullish() }),
    }),
  ),
  players: z.record(
    z.string(),
    z
      .object({
        full_name: z.string().nullish(),
        first_name: z.string().nullish(),
        last_name: z.string().nullish(),
        team: z.string().nullish(),
        position: z.string().nullish(),
        fantasy_positions: z.array(z.string()).nullish(),
        injury_status: z.string().nullish(),
        injury_body_part: z.string().nullish(),
      })
      .nullable(),
  ),
  playerLog: z.union([
    z.record(
      z.string(),
      z.array(
        z.object({
          date: z.string().nullish(),
          game_id: z.string().nullish(),
          team: z.string().nullish(),
          opponent: z.string().nullish(),
          is_away_team: z.boolean().nullish(),
          updated_at: z.unknown(),
          stats: z.record(z.string(), z.number().nullable()).nullish(),
        }),
      ),
    ),
    z.array(z.unknown()),
  ]),
};

/** Request wrapper: counts, enforces the budget, and turns every failure into a gap. */
export function createRequester(fetchJson, { maxRequests = LOAD_BUDGET.maxRequests, fanOut = LOAD_BUDGET.fanOut } = {}) {
  const gaps = [];
  const requests = [];
  async function get(source, url, schema, { immutable = false, subject = null, lifetime = null } = {}) {
    if (requests.length >= maxRequests) {
      gaps.push({ source, subject, url, code: "budget_exhausted", message: `request budget of ${maxRequests} reached` });
      return null;
    }
    requests.push({ source, url, immutable });
    let data;
    try {
      data = await fetchJson(url, lifetime ? { schema, immutable, lifetime } : { schema, immutable });
    } catch (err) {
      gaps.push({ source, subject, url, code: "fetch_failed", message: String(err?.message ?? err) });
      return null;
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      gaps.push({ source, subject, url, code: "shape_mismatch", message: `${issue?.path?.join(".") || "(root)"}: ${issue?.message}` });
      return null;
    }
    return parsed.data;
  }
  async function pool(items, fn) {
    const queue = [...items];
    const workers = Array.from({ length: Math.min(fanOut, queue.length) }, async () => {
      for (let it = queue.shift(); it !== undefined; it = queue.shift()) await fn(it);
    });
    await Promise.all(workers);
  }
  return { get, pool, gaps, requests, maxRequests };
}

const playedCount = (raw) => {
  if (!raw || Array.isArray(raw)) return 0;
  let n = 0;
  for (const games of Object.values(raw)) for (const g of games) if ((g.stats?.sp ?? 0) > 0) n++;
  return n;
};

/**
 * Everything one roster-week needs. Returns raw-but-validated payloads plus gaps and
 * request accounting; buildWeekDesk does the rest. `players` may be injected (the
 * app's corpus already holds /players/nba) to save the 2.5 MB request.
 */
export async function loadWeekInputs({ fetchJson, leagueId, rosterId, now = new Date(), week: weekOverride = null, players = null, budget = {} }) {
  const rq = createRequester(fetchJson, budget);
  const today = easternDate(now);
  const [state, league] = await Promise.all([
    rq.get("state", urls.state(), schemas.state),
    rq.get("league", urls.league(leagueId), schemas.league),
  ]);
  const base = { today, state, league, gaps: rq.gaps, requests: rq.requests, budgetMax: rq.maxRequests };
  if (!league) return { ...base, resolved: { kind: "unavailable", reason: "league not loaded" } };
  const season = league.season;
  const [scheduleRaw, rosters, playersRaw] = await Promise.all([
    rq.get("schedule", urls.schedule(season), schemas.schedule),
    rq.get("rosters", urls.rosters(leagueId), schemas.rosters),
    players ? Promise.resolve(null) : rq.get("players", urls.players(), schemas.players),
  ]);
  if (!scheduleRaw) return { ...base, resolved: { kind: "unavailable", reason: "schedule not loaded" } };
  const scheduleIdx = indexSchedule(scheduleRaw, season);
  if (!state && weekOverride == null) return { ...base, scheduleIdx, resolved: { kind: "unavailable", reason: "NBA state not loaded" } };
  const resolved = resolveWeek({ state, league, scheduleIdx, today, weekOverride });
  /** @type {Record<string, any>} */
  const out = { ...base, season, scheduleIdx, rosters, playersRaw, playersInjected: players, resolved };
  if (resolved.kind === "between_weeks" && resolved.completedWeek >= 1) {
    // One extra request: last week's final matchups, for the result line.
    out.lastMatchups = (await rq.get("matchups", urls.matchups(leagueId, resolved.completedWeek), schemas.matchups)) ?? null;
  }
  if (resolved.kind !== "week") return out;

  const week = resolved.week;
  const wk = [...scheduleIdx.games.values()].filter((g) => g.week === week);
  const lastDate = wk.map((g) => g.date).sort().pop();
  // M1: Sleeper serves several versions of a finished week, so no week is cached forever: a final
  // week gets a day once settled (more than 7 days old), an hour before that.
  const weekFinal = wk.length > 0 && wk.every((g) => g.status === "complete") && lastDate < shiftDate(today, -2);
  const matchups = await rq.get("matchups", urls.matchups(leagueId, week), schemas.matchups, weekFinal ? { lifetime: lastDate < shiftDate(today, -7) ? "settledWeek" : "pastWeek" } : {});
  out.matchups = matchups ?? null;
  out.weekFinal = weekFinal;
  const mine = (matchups || []).find((m) => m.roster_id === Number(rosterId)) || null;
  out.matchup = mine;
  if (!mine) return out;
  // lockin-sequence: tip times for tonight's ordering (1 request); a failure is a gap
  out.tipsRaw = await loadTips(rq, season, week);

  const roster = (rosters || []).find((r) => r.roster_id === Number(rosterId)) || null;
  const excluded = new Set([...(roster?.reserve || []), ...(roster?.taxi || [])]);
  const weekPlayers = [...new Set([...(mine.players || []), ...(mine.starters || [])])].filter((p) => p && p !== "0");
  const starters = new Set(mine.starters || []);
  out.excluded = weekPlayers.filter((p) => excluded.has(p) && !starters.has(p));
  out.playerIds = weekPlayers.filter((p) => !out.excluded.includes(p));
  if (!roster) rq.gaps.push({ source: "rosters", subject: String(rosterId), url: urls.rosters(leagueId), code: "roster_missing", message: "IR and taxi players could not be separated" });

  const logs = {};
  await rq.pool(out.playerIds, async (pid) => {
    logs[pid] = { current: await rq.get("playerLog", urls.playerLog(pid, season), schemas.playerLog, { subject: pid }) };
  });
  const prevSeason = String(Number(season) - 1);
  // lockin-opponent: the two prior seasons for every player on this roster, always: opponent
  // history draws on them all season, and past seasons are immutable (cached after first fetch).
  const prev2 = String(Number(season) - 2);
  await rq.pool(out.playerIds.flatMap((pid) => [[pid, prevSeason, "prior"], [pid, prev2, "prior2"]]), async ([pid, s, key]) => {
    logs[pid][key] = await rq.get("playerLog", urls.playerLog(pid, s), schemas.playerLog, { subject: pid, immutable: true });
  });
  out.prevSeason2 = prev2;
  out.logsRaw = logs;
  out.prevSeason = prevSeason;
  await loadOpponentInputs(rq, out, { leagueId, season, week, matchups, rosters });
  return out;
}

// lockin-opponent: this week's opponent (same matchup_id), his logs, league users, and
// past weeks' final matchups for the viewing manager's history. Prior-season logs only
// for opponent players with fewer than 10 played games this season (thin forecast), to
// keep a cold desk near 70 requests. Past weeks: an hour, a day once older than 7 days, and
// read through weekConsensus (M1) because Sleeper serves more than one version of them.
export const OPPONENT_BUDGET = Object.freeze({ historyWeeks: 8, priorBelowGames: 10 });
async function loadOpponentInputs(rq, out, { leagueId, season, week, matchups, rosters }) {
  const mine = out.matchup;
  const opp = mine?.matchup_id != null ? (matchups || []).find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== mine.roster_id) || null : null;
  out.oppMatchup = opp;
  const pastWeeks = [];
  for (let w = week - 1; w >= 1 && pastWeeks.length < OPPONENT_BUDGET.historyWeeks; w--) pastWeeks.push(w);
  const [users, ...past] = await Promise.all([
    rq.get("users", urls.users(leagueId), schemas.users),
    ...pastWeeks.map((w) => rq.get("matchups", urls.matchups(leagueId, w), schemas.matchups, { lifetime: week - w > 1 ? "settledWeek" : "pastWeek" })),
  ]);
  out.users = users;
  out.pastMatchups = pastWeeks.map((w, i) => {
    const c = weekConsensus(`${leagueId}|${w}`, past[i] ?? null);
    return { week: w, matchups: c.data ?? null, unstable: c.unstable, versions: c.versions };
  });
  if (!opp) return;
  const oroster = (rosters || []).find((r) => r.roster_id === opp.roster_id) || null;
  const oexcluded = new Set([...(oroster?.reserve || []), ...(oroster?.taxi || [])]);
  const ostarters = new Set(opp.starters || []);
  out.oppPlayerIds = [...new Set([...(opp.players || []), ...(opp.starters || [])])].filter((p) => p && p !== "0" && (!oexcluded.has(p) || ostarters.has(p)));
  const ologs = {};
  const todo = out.oppPlayerIds.filter((pid) => !out.logsRaw[pid]);
  await rq.pool(todo, async (pid) => {
    ologs[pid] = { current: await rq.get("playerLog", urls.playerLog(pid, season), schemas.playerLog, { subject: pid }) };
  });
  const thin = todo.filter((pid) => playedCount(ologs[pid].current) < OPPONENT_BUDGET.priorBelowGames);
  await rq.pool(thin, async (pid) => {
    ologs[pid].prior = await rq.get("playerLog", urls.playerLog(pid, String(Number(season) - 1)), schemas.playerLog, { subject: pid, immutable: true });
  });
  out.oppLogsRaw = ologs;
}

export function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
