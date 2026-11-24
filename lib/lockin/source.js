/**
 * Wires the lock-in engine to the app: the shared Sleeper client for live data, the
 * synthetic week for LEAGUE_PROVIDER=fixture, and (development only) a recorded set of
 * Sleeper responses so a past moment of a real week can be re-rendered.
 *
 * Freshness. The client's data cache serves a stale entry while it refreshes in the
 * background, so the first render after a quiet spell would show last night's week. The
 * four reads that decide what the board says now (NBA state, league, this week's
 * matchups, the schedule) therefore skip the data cache and are shared in-process for
 * 30 s instead; game logs keep the client's table (2 min current season, forever past).
 * A final game whose log row has not landed yet reads "score updating" (lockState.js).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sleeperClient } from "../providers/sleeper/client.js";
import { activeLeagueId, getLeagueProvider, providerName } from "../providers/index.js";
import { createMemo } from "../util/memo.js";
import { buildWeekDesk } from "./index.js";
import { FIXTURE_LEAGUE_ID, FIXTURE_NOW, fixtureFetchJson } from "./fixture.js";
import { dayLabel, easternDate } from "./calendar.js";
import { tonightView } from "./tonightView.js";
import { schemas, urls } from "./load.js";

const PLAYERS_TIMEOUT_MS = 15_000;
const FRESH_MS = 30_000;

export const TAGS = Object.freeze({
  schedule: "lockin:schedule",
  log: (pid) => `lockin:log:${pid}`,
});

/** Client cache policy and refresh tags for an engine URL. Exported for tests. */
// M1: lifetimes for finished weeks (Sleeper serves several versions of them; nothing forever):
// an hour for a recent final week, a day once it is more than 7 days old.
const WEEK_LIFETIMES = Object.freeze({ pastWeek: "users", settledWeek: "pastLeague" });

export function policyFor(url, immutable = false, lifetime = null) {
  const u = new URL(url);
  const p = u.pathname;
  if (/^\/v1\/league\/[^/]+\/matchups\//.test(p)) return { policy: lifetime && WEEK_LIFETIMES[lifetime] ? WEEK_LIFETIMES[lifetime] : "noStore", tags: [] };
  if (/^\/v1\/league\/[^/]+\/rosters$/.test(p)) return { policy: "rosters", tags: [] };
  if (/^\/v1\/league\/[^/]+$/.test(p)) return { policy: "league", tags: [] };
  if (p === "/v1/state/nba") return { policy: "noStore", tags: [] };
  if (p.startsWith("/schedule/")) return { policy: "matchups", tags: [TAGS.schedule] };
  // lockin-sequence: listed start times; they move only on postponement, so the schedule's
  // lifetime and refresh tag fit (a postponement shows in both)
  if (p.startsWith("/scores/")) return { policy: "matchups", tags: [TAGS.schedule] };
  const log = p.match(/^\/stats\/nba\/player\/([^/]+)$/);
  if (log) return immutable ? { policy: "immutable", tags: [] } : { policy: "playerStats", tags: [TAGS.log(log[1])] };
  return { policy: "noStore", tags: [] };
}

const fresh = createMemo({ ttlMs: FRESH_MS });

/** The engine's fetchJson over the shared client; uncached reads are shared for 30 s. */
export function sleeperFetchJson(url, { schema, immutable = false, lifetime = null } = {}) {
  const u = new URL(url);
  const { policy, tags } = policyFor(url, immutable, lifetime);
  const opts = { policy, tags };
  if (u.pathname === "/v1/players/nba") opts.timeoutMs = PLAYERS_TIMEOUT_MS;
  const get = () => sleeperClient.get(`${u.pathname}${u.search}`, schema, opts);
  return policy === "noStore" ? fresh.get(url, get) : get();
}

/**
 * Players whose current-season log can have changed since `desk` was built: a game
 * dated today or yesterday that is not final with his box score in, or in progress.
 * Everyone else's log, every prior-season log and the players list are reused.
 */
export function playersToRefresh(desk, started = null) {
  const today = desk?.today;
  if (!today) return [];
  const y = new Date(`${today}T12:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  const open = (c, g) => (g.date === today || g.date === yesterday) && !(g.status === "complete" && g.played != null) && (!started || started(c.team, g.date));
  return (desk.cards || []).filter((c) => (c.weekGames || []).some((g) => open(c, g))).map((c) => c.playerId);
}

/**
 * (team, date) => true when that game has tipped (in progress or final) per a fresh
 * schedule read. A log cannot change before its game starts, so a refresh before tip
 * re-reads no logs at all. Null when the schedule could not be read.
 */
async function startedLookup(season) {
  try {
    const raw = await sleeperClient.get(`/schedule/nba/regular/${season}`, schemas.schedule, { policy: "noStore" });
    const tipped = new Set();
    for (const g of raw) if (g.status === "in_game" || g.status === "complete") for (const side of [g.home, g.away]) tipped.add(`${side.team}|${g.date}`);
    return (team, date) => tipped.has(`${team}|${date}`);
  } catch {
    return null;
  }
}

const directories = new WeakMap();

/**
 * The corpus's players (a Map by id, or the provider's array, toPlayer shape) -> the
 * directory the engine reads.
 */
export function playersForDesk(players) {
  if (!players || typeof players !== "object") return null;
  const hit = directories.get(players);
  if (hit) return hit;
  const pairs = Array.isArray(players) ? players.map((p) => [p?.playerId, p]) : players instanceof Map ? [...players.entries()] : null;
  if (!pairs) return null;
  const out = {};
  for (const [id, p] of pairs) {
    if (!p || !id) continue;
    const positions = p.fantasyPositions?.length ? p.fantasyPositions : p.position ? [p.position] : [];
    out[id] = { id, name: p.fullName || null, team: p.team ?? null, positions, injuryStatus: p.injuryStatus ?? null, injuryBodyPart: p.injuryBodyPart ?? null };
  }
  directories.set(players, out);
  return out;
}

/** True only where a recorded moment may be replayed: never in a production build. */
export function replayAllowed(env = process.env) {
  return env.NODE_ENV !== "production" && !!env.LOCKIN_REPLAY_DIR;
}

const REPLAY_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const replays = createMemo({ ttlMs: 10 * 60_000 });

async function loadReplay(id) {
  if (!replayAllowed() || !REPLAY_ID.test(id || "")) return null;
  return replays.get(id, async () => {
    const file = path.join(process.env.LOCKIN_REPLAY_DIR, id, "responses.json");
    return JSON.parse(await readFile(file, "utf8"));
  });
}

const desks = createMemo({ ttlMs: 30_000 });

/**
 * One roster's WeekDesk for the active provider.
 * `players`: the corpus's players Map when the caller already holds it.
 * `replay`: id of a recorded moment; ignored unless replayAllowed().
 */
export async function loadLockDesk({ rosterId, players = null, replay = null }) {
  const id = Number(rosterId);
  if (replay && replayAllowed()) {
    const rec = await loadReplay(replay).catch(() => null);
    if (rec) {
      const fetchJson = async (url, { schema } = {}) => {
        if (!(url in rec.responses)) throw new Error(`not in recording ${replay}`);
        const copy = structuredClone(rec.responses[url]);
        return schema ? schema.parse(copy) : copy;
      };
      const leagueUrl = Object.keys(rec.responses).find((u) => /\/v1\/league\/[^/]+$/.test(u));
      const leagueId = leagueUrl ? leagueUrl.split("/").pop() : activeLeagueId();
      return desks.get(`replay|${replay}|${id}`, () => buildWeekDesk({ rosterId: id, leagueId, fetchJson, now: new Date(rec.capturedAt) }));
    }
  }
  if (providerName() === "fixture") {
    return desks.get(`fixture|${id}`, () => buildWeekDesk({ rosterId: id, leagueId: FIXTURE_LEAGUE_ID, fetchJson: fixtureFetchJson, now: FIXTURE_NOW }));
  }
  const leagueId = activeLeagueId();
  let directory = playersForDesk(players);
  if (!directory) directory = playersForDesk(await getLeagueProvider().getPlayers().catch(() => null));
  const key = `${leagueId}|${id}`;
  return desks.get(key, async () => {
    const desk = await buildWeekDesk({ rosterId: id, leagueId, fetchJson: sleeperFetchJson, players: directory });
    lastDesk.set(key, desk);
    return desk;
  });
}

const lastDesk = new Map();

/**
 * The roster's next game night from the most recent board built in this process for
 * `week` (schedule dates do not move within a week, so any age will do), as
 * { date, day, tonight, started }; null when no such board exists. Never loads anything.
 */
export function deskNextGameNight(rosterId, week, now = new Date()) {
  const d = lastDesk.get(`${activeLeagueId()}|${Number(rosterId)}`);
  if (!d || d.status !== "in_season" || d.week !== week) return null;
  const today = easternDate(now);
  const dates = d.cards.flatMap((c) => (c.weekGames || []).map((g) => g.date)).filter((x) => x >= today).sort();
  if (!dates.length) return null;
  const started = d.cards.some((c) => (c.weekGames || []).some((g) => g.status === "complete" || g.status === "in_game"));
  return { date: dates[0], day: dayLabel(dates[0]), tonight: dates[0] === today, started };
}

/**
 * Open lock-or-hold decisions on this roster's most recent board, if one was built in
 * this process in the last 10 minutes; otherwise null. Never loads anything (the
 * status bar renders on every page and must stay at one request).
 */
export function recentDeskLiveCount(rosterId, now = Date.now(), maxAgeMs = 10 * 60_000) {
  const d = lastDesk.get(`${activeLeagueId()}|${Number(rosterId)}`);
  if (!d || d.status !== "in_season" || now - Date.parse(d.generatedAt) > maxAgeMs) return null;
  // live lock-or-hold calls plus tonight's deadlines still ahead (tonightView.toDecide)
  return d.cards.filter((c) => c.urgencyRank <= 1).length + (tonightView(d, now)?.toDecide ?? 0);
}
const lastForced = new Map();
export const REFRESH_MIN_MS = 20_000;

/**
 * Plan a forced refresh for one roster: the cache tags to expire (tonight's schedule
 * and the logs of players whose games are live or finished since the last load) and the
 * in-process entries to drop. Rate-limited to one per roster per 20 s.
 * Returns { ok, tags, players, retryInMs }.
 */
export function planRefresh(rosterId, now = Date.now(), started = null) {
  const id = Number(rosterId);
  const prev = lastForced.get(id) ?? 0;
  if (now - prev < REFRESH_MIN_MS) return { ok: false, tags: [], players: [], retryInMs: REFRESH_MIN_MS - (now - prev) };
  lastForced.set(id, now);
  const key = `${activeLeagueId()}|${id}`;
  const players = playersToRefresh(lastDesk.get(key), started);
  desks.delete(key);
  // Only this roster's reads: its board, and the NBA state and this week's matchups
  // row it was built from (the shared 30 s copies other rosters may still be using).
  const last = lastDesk.get(key);
  fresh.delete(urls.state());
  if (last?.week != null) fresh.delete(urls.matchups(activeLeagueId(), last.week));
  // With a fresh schedule read showing nothing tipped since the last load, neither the
  // schedule nor any log can have changed: only state and matchups (uncached) re-read.
  const tags = [...(started && !players.length ? [] : [TAGS.schedule]), ...players.map(TAGS.log)];
  return { ok: true, tags, players, retryInMs: 0 };
}

/** planRefresh with a fresh schedule read deciding whose games have tipped. */
export async function planRefreshLive(rosterId) {
  const id = Number(rosterId);
  const prev = lastForced.get(id) ?? 0;
  if (Date.now() - prev < REFRESH_MIN_MS) return planRefresh(id);
  const desk = lastDesk.get(`${activeLeagueId()}|${id}`);
  const started = desk?.season && playersToRefresh(desk).length ? await startedLookup(desk.season) : null;
  return planRefresh(id, Date.now(), started);
}

export function isFixtureDesk(desk) {
  return desk?.leagueId === FIXTURE_LEAGUE_ID;
}
