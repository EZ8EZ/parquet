/**
 * SleeperProvider — the real read-only provider.
 * Base: https://api.sleeper.app/v1  (no auth, ~1000 req/min).
 * Every response is Zod-validated in ./schemas before it reaches the app.
 */
import { z } from "zod";
import type {
  BracketGame,
  BracketKind,
  DraftMeta,
  DraftPick,
  League,
  LeagueDetail,
  LeagueProvider,
  LeagueUser,
  Matchup,
  Player,
  Roster,
  TradedPick,
  Transaction,
  User,
} from "../types";
import {
  RawBracketArr,
  RawDraft,
  RawDraftArr,
  RawLeague,
  RawLeagueArr,
  RawLeagueUserArr,
  RawMadeDraftPickArr,
  RawMatchupArr,
  RawPlayerMap,
  RawRosterArr,
  RawTradedPickArr,
  RawTransactionArr,
  RawUser,
  toBracketGame,
  toDraftMeta,
  toLeague,
  toLeagueDetail,
  toLeagueUser,
  toMadeDraftPick,
  toMatchup,
  toPlayer,
  toRoster,
  toTradedPick,
  toTransaction,
  toUser,
} from "./schemas";

const BASE = "https://api.sleeper.app/v1";

async function getJson<T>(
  path: string,
  schema: z.ZodType<T>,
  { retries = 3, noStore = false }: { retries?: number; noStore?: boolean } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { accept: "application/json" },
        // Sleeper data is highly cacheable. The players payload is too big for the
        // data cache (>2MB), so it opts out and is memoized in-process instead.
        cache: noStore ? "no-store" : undefined,
        ...(noStore ? {} : { next: { revalidate: 3600 } }),
      });
      if (res.status === 429) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`Sleeper ${path} -> HTTP ${res.status}`);
      const json = await res.json();
      return schema.parse(json);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(300 * (attempt + 1));
    }
  }
  throw new Error(
    `Sleeper request failed after ${retries + 1} attempts: ${path}: ${String(
      lastErr,
    )}`,
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SleeperProvider implements LeagueProvider {
  readonly name = "sleeper";

  async getUser(username: string): Promise<User> {
    return toUser(await getJson(`/user/${encodeURIComponent(username)}`, RawUser));
  }

  async getLeagues(
    userId: string,
    sport: string,
    season: string,
  ): Promise<League[]> {
    const raw = await getJson(
      `/user/${userId}/leagues/${sport}/${season}`,
      RawLeagueArr,
    );
    return raw.map(toLeague);
  }

  async getLeague(leagueId: string): Promise<LeagueDetail> {
    return toLeagueDetail(await getJson(`/league/${leagueId}`, RawLeague));
  }

  async getRosters(leagueId: string): Promise<Roster[]> {
    const raw = await getJson(`/league/${leagueId}/rosters`, RawRosterArr);
    return raw.map(toRoster);
  }

  async getUsers(leagueId: string): Promise<LeagueUser[]> {
    const raw = await getJson(`/league/${leagueId}/users`, RawLeagueUserArr);
    return raw.map(toLeagueUser);
  }

  async getTransactions(leagueId: string, week: number): Promise<Transaction[]> {
    // Season is stamped by the caller/ingest; getLeague resolves it here so the
    // Transaction.season field is always populated even for a bare call.
    const detail = await this.getLeague(leagueId);
    const raw = await getJson(
      `/league/${leagueId}/transactions/${week}`,
      RawTransactionArr,
    );
    return raw.map((t) => toTransaction(t, detail.season));
  }

  /** Same as getTransactions but avoids re-fetching the league for its season. */
  async getTransactionsForSeason(
    leagueId: string,
    week: number,
    season: string,
  ): Promise<Transaction[]> {
    const raw = await getJson(
      `/league/${leagueId}/transactions/${week}`,
      RawTransactionArr,
    );
    return raw.map((t) => toTransaction(t, season));
  }

  async getMatchups(leagueId: string, week: number): Promise<Matchup[]> {
    const raw = await getJson(
      `/league/${leagueId}/matchups/${week}`,
      RawMatchupArr,
    );
    return raw.map((m) => toMatchup(m, week));
  }

  async getBracket(leagueId: string, kind: BracketKind): Promise<BracketGame[]> {
    const raw = await getJson(
      `/league/${leagueId}/${kind}_bracket`,
      RawBracketArr,
    );
    return (raw ?? []).map(toBracketGame);
  }

  async getTradedPicks(leagueId: string): Promise<TradedPick[]> {
    const raw = await getJson(
      `/league/${leagueId}/traded_picks`,
      RawTradedPickArr,
    );
    return raw.map(toTradedPick);
  }

  async getPlayers(): Promise<Player[]> {
    // /players/nba is ~3.3MB — over Next's 2MB fetch-cache limit, so it can't use
    // the data cache. Memoize in-process (rosters change far more often than the
    // player universe) to avoid re-downloading it on every render. `memo()` is
    // single-flight (see its docstring below), so concurrent cold callers join one
    // 2.46MB download instead of each issuing their own.
    return memo(playersCache, "players", PLAYERS_TTL_MS, async () => {
      const raw = await getJson(`/players/nba`, RawPlayerMap, { noStore: true });
      return Object.values(raw).map(toPlayer);
    });
  }

  /**
   * Drafts for a league season.
   *
   * The list endpoint OMITS `slot_to_roster_id` (verified — see API_NOTES), and that
   * map is the entire basis of pick lineage, so each draft is re-fetched
   * individually to hydrate it. Drafts are immutable once complete, so both steps
   * are memoized aggressively.
   */
  async getDrafts(leagueId: string): Promise<DraftMeta[]> {
    return memo(draftsCache, leagueId, DRAFTS_TTL_MS, async () => {
      const raw = await getJson(`/league/${leagueId}/drafts`, RawDraftArr);
      return Promise.all(
        raw.map(async (d) => {
          try {
            return toDraftMeta(await getJson(`/draft/${d.draft_id}`, RawDraft));
          } catch {
            // Hydration failed — return the list shape. Lineage degrades to
            // "no draft data" for this season rather than throwing.
            return toDraftMeta(d);
          }
        }),
      );
    });
  }

  async getDraftPicks(draftId: string): Promise<DraftPick[]> {
    return memo(draftPicksCache, draftId, DRAFTS_TTL_MS, async () => {
      const raw = await getJson(
        `/draft/${draftId}/picks`,
        RawMadeDraftPickArr,
      );
      // Sleeper already returns these in order; sort defensively by the API's own
      // pick_no (never recomputed — snake drafts break the round/slot formula).
      return raw.map(toMadeDraftPick).sort((a, b) => a.pickNo - b.pickNo);
    });
  }
}

interface MemoSlot<T> {
  promise: Promise<T>;
  resolvedAt?: number;
}

const playersCache = new Map<string, MemoSlot<Player[]>>();
const PLAYERS_TTL_MS = 6 * 60 * 60 * 1000; // 6h - the player universe is stable

/**
 * Lightweight in-process memo (same intent as `playersCache`): drafts are read on
 * every board render and one league season costs 1 + N requests to hydrate.
 */
const draftsCache = new Map<string, MemoSlot<DraftMeta[]>>();
const draftPicksCache = new Map<string, MemoSlot<DraftPick[]>>();
const DRAFTS_TTL_MS = 30 * 60 * 1000; // 30m - a live draft still refreshes

/**
 * SINGLE-FLIGHT memo, keyed. Stores the in-flight PROMISE, not the resolved value
 * (mirrors the fix to `getCorpus` in lib/history.ts) — the players payload alone is
 * 2.46MB and 157ms, so N concurrent cold callers previously each downloaded their own
 * copy instead of joining one. `resolvedAt` is only set once the promise settles: a
 * caller arriving mid-load always joins it (nothing to expire yet), and the TTL is
 * anchored to completion time exactly as before once there is a value that can go
 * stale. On rejection the slot is deleted so a transient failure doesn't pin a
 * rejected promise for the rest of the TTL window (mirrors `ensureIngested` in
 * lib/ingest.ts).
 */
async function memo<T>(
  cache: Map<string, MemoSlot<T>>,
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit) {
    if (hit.resolvedAt === undefined) return hit.promise;
    if (Date.now() - hit.resolvedAt < ttlMs) return hit.promise;
  }
  const slot: MemoSlot<T> = {} as MemoSlot<T>;
  slot.promise = load()
    .then((value) => {
      slot.resolvedAt = Date.now();
      return value;
    })
    .catch((err) => {
      if (cache.get(key) === slot) cache.delete(key);
      throw err;
    });
  cache.set(key, slot);
  return slot.promise;
}
