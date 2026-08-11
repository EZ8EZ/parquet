/**
 * LOCK-IN SOURCE DATA - the two Sleeper endpoints the Lab's lock-in surfaces need,
 * and nothing else in the app touches.
 *
 * ONE READER: /lab/regret. There were two until the committee review of 2026-08-10
 * shelved /lab/startline (SHELVED.md, S1). A third endpoint went with it -
 * `GET /schedule/nba/regular/{season}`, the whole NBA calendar with per-quarter
 * scores and starting fives - because the shelved board and game log were its only
 * callers, and a dead reader of an undocumented endpoint is a liability, not a spare.
 *
 * ---------------------------------------------------------------------------------
 * Cost discipline (D25)
 * ---------------------------------------------------------------------------------
 * This module is loaded ON DEMAND by /lab/regret and is NEVER reachable from
 * `assembleCorpus()`. The corpus cold path is a 1.4s budget to protect, and a full
 * season here is ~23 matchup requests plus one per player who spent a week on the
 * roster (30-60), which would triple it for one page's benefit. Everything is
 * memoized behind the same single-flight promise-slot pattern `getPlayers()` uses in
 * lib/providers/sleeper - store the in-flight PROMISE, set `resolvedAt` only once it
 * settles, and DELETE the slot on rejection so a transient failure does not pin a
 * rejected promise for the rest of the TTL window.
 *
 * ---------------------------------------------------------------------------------
 * Both endpoints are UNDOCUMENTED. Treat them as fragile.
 * ---------------------------------------------------------------------------------
 *  - `GET /v1/league/{id}/matchups/{week}` carries `starters` (7 ids, in
 *    `roster_positions` order), `starters_points` (the points each slot actually
 *    banked) and `players` (the roster that week). Documented for head-to-head
 *    scoring; the lock-in semantics below are not documented anywhere.
 *  - `GET /stats/nba/player/{id}?season_type=regular&season={s}&grouping=week` returns
 *    week -> array of per-GAME box scores. This is the only source for "what else was
 *    available", and it is on a different host path than /v1 entirely.
 *
 * VERIFIED HERE, NOT ASSUMED. Two facts were established against the real league
 * before any of this was written, because the whole feature is wrong without them:
 *
 *  1. `players_points[id]` is NOT the player's best game. For a slotted player it is
 *     the game that locked; for everyone else it tracks the latest game played. So it
 *     cannot stand in for "the best that was available" and the per-player stats
 *     request is genuinely required. (Measured: across 14 sampled players x 23 weeks,
 *     97 of 322 player-weeks had `players_points` below that player's best game.)
 *  2. `GET /v1/stats/nba/regular/{season}/{week}` is a TRAP that looks like the cheap
 *     way to do this. It returns only the last game of the week and covers roughly 557
 *     players. It is not used here and must not be.
 */
import { z } from "zod";

const V1 = "https://api.sleeper.app/v1";
const STATS = "https://api.sleeper.app";

/** One roster's week in a lock-in league. */
export interface LockInMatchup {
  rosterId: number;
  week: number;
  /** Seven entries, in `roster_positions` order. "0" or "" means an unfilled slot. */
  starters: string[];
  /** Points each slot banked. Same length and order as `starters`. */
  startersPoints: number[];
  /** Every player on the roster that week, slotted or not. */
  players: string[];
  points: number;
}

/** One NBA game a player played, with the raw box score. */
export interface PlayerGame {
  /** ISO date, e.g. "2025-11-17". */
  date: string | null;
  opponent: string | null;
  /** Sleeper's own game id. Kept so a line can be joined to a schedule row. */
  gameId: string | null;
  /** True when the player's team was the road side. */
  isAway: boolean | null;
  /** Seconds played. 0 for a DNP that still appears in the feed. */
  secondsPlayed: number;
  /** The raw stat line. Scored by the LEAGUE's own settings, never by `pts_std`. */
  stats: Record<string, number>;
}

const RawMatchup = z.object({
  roster_id: z.number(),
  starters: z.array(z.string()).nullish(),
  starters_points: z.array(z.number()).nullish(),
  players: z.array(z.string()).nullish(),
  points: z.number().nullish(),
});
// Sleeper returns `null` (not `[]`) for a week that does not exist.
const RawMatchupArr = z.array(RawMatchup).nullish();

const RawGame = z.object({
  date: z.string().nullish(),
  opponent: z.string().nullish(),
  week: z.number().nullish(),
  game_id: z.string().nullish(),
  is_away_team: z.boolean().nullish(),
  stats: z.record(z.string(), z.number()).nullish(),
});
/** Keyed by week number as a string. `[]` for a season with no data at all. */
const RawWeekly = z.union([z.record(z.string(), z.array(RawGame)), z.array(z.unknown())]);

async function getJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  // `cache: "no-store"` for the same reason `/players/nba` opts out: the weekly stats
  // payload runs ~90KB per player and the schedule-shaped responses are larger still,
  // and Next's fetch cache has a 2MB per-entry ceiling that fails loudly when crossed.
  // The in-process memo below is the cache.
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return schema.parse(await res.json());
}

// ---------------------------------------------------------------- memo

interface Slot<T> {
  promise: Promise<T>;
  resolvedAt?: number;
}
const TTL_MS = 30 * 60 * 1000;
const matchupCache = new Map<string, Slot<LockInMatchup[]>>();
const statsCache = new Map<string, Slot<Map<number, PlayerGame[]>>>();

async function memo<T>(
  cache: Map<string, Slot<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit) {
    if (hit.resolvedAt === undefined) return hit.promise;
    if (Date.now() - hit.resolvedAt < TTL_MS) return hit.promise;
  }
  const slot: Slot<T> = {} as Slot<T>;
  slot.promise = load()
    .then((v) => {
      slot.resolvedAt = Date.now();
      return v;
    })
    .catch((err) => {
      if (cache.get(key) === slot) cache.delete(key);
      throw err;
    });
  cache.set(key, slot);
  return slot.promise;
}

/** Test hook, and the reload path for a season still being played. */
export function invalidateLockInCache(): void {
  matchupCache.clear();
  statsCache.clear();
}

// ---------------------------------------------------------------- loaders

/** One week of lock-in lineups for every roster. Empty array if the week never ran. */
export async function loadLockInWeek(
  leagueId: string,
  week: number,
): Promise<LockInMatchup[]> {
  return memo(matchupCache, `${leagueId}|${week}`, async () => {
    const raw = await getJson(`${V1}/league/${leagueId}/matchups/${week}`, RawMatchupArr);
    return (raw ?? []).map((m) => ({
      rosterId: m.roster_id,
      week,
      starters: m.starters ?? [],
      startersPoints: m.starters_points ?? [],
      players: m.players ?? [],
      points: m.points ?? 0,
    }));
  });
}

/** Every game a player played that season, grouped by fantasy week. */
export async function loadPlayerSeason(
  playerId: string,
  season: string,
): Promise<Map<number, PlayerGame[]>> {
  return memo(statsCache, `${playerId}|${season}`, async () => {
    const raw = await getJson(
      `${STATS}/stats/nba/player/${playerId}?season_type=regular&season=${season}&grouping=week`,
      RawWeekly,
    );
    const out = new Map<number, PlayerGame[]>();
    if (Array.isArray(raw)) return out; // season with no data at all
    for (const [wk, games] of Object.entries(raw)) {
      const week = parseInt(wk, 10);
      if (!Number.isFinite(week)) continue;
      out.set(
        week,
        games.map((g) => ({
          date: g.date ?? null,
          opponent: g.opponent ?? null,
          gameId: g.game_id ?? null,
          isAway: g.is_away_team ?? null,
          secondsPlayed: g.stats?.sp ?? 0,
          stats: g.stats ?? {},
        })),
      );
    }
    return out;
  });
}

/** Fetch many players' seasons with a bounded fan-out. */
export async function loadPlayerSeasons(
  playerIds: string[],
  season: string,
  concurrency = 8,
): Promise<Map<string, Map<number, PlayerGame[]>>> {
  const out = new Map<string, Map<number, PlayerGame[]>>();
  const queue = [...new Set(playerIds)];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (;;) {
      const id = queue.shift();
      if (id === undefined) return;
      try {
        out.set(id, await loadPlayerSeason(id, season));
      } catch {
        // One unreachable player must not sink the ledger. A player with no games
        // loaded is simply absent from the available pool, and the surface counts
        // and reports how many that was rather than pretending the pool was complete.
      }
    }
  });
  await Promise.all(workers);
  return out;
}
