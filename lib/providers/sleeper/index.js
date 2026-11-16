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
  RawProjectionMap,
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
  toMarketEntry,
  toMatchup,
  toPlayer,
  toRoster,
  toTradedPick,
  toTransaction,
  toUser,
} from "./schemas.js";
import { unstable_cache } from "next/cache";
import { createMemo } from "../../util/memo.js";
import { sleeperClient } from "./client.js";

/**
 * League ids this process has seen reported as `complete` (status on /league/{id}).
 * Module-level because `getLeagueProvider()` hands out a fresh provider per call, and
 * every corpus assembly reads each chain league before anything scoped to it. A caller
 * holding the league object can also pass `{ complete }` directly; either signal
 * selects the forever policy. Not knowing only costs a shorter lifetime, never a wrong
 * answer. Cache lifetimes are tabulated once, in ./client.js.
 */
const completeLeagueIds = new Set();
/** Draft ids seen with status `complete`, for the same reason. */
const completeDraftIds = new Set();

/** True for a league object whose season is over and can no longer change. */
export function isCompleteLeague(league) {
  return league?.status === "complete";
}

/**
 * Per-instance request de-duplication on top of the shared data cache (lib/util/memo).
 * Short, because the data cache is the real cache; this only stops concurrent callers
 * on one instance from each doing the same work, and keeps the players list's identity
 * stable between back-to-back renders.
 */
const playersMemo = createMemo({ ttlMs: 10 * 60_000 });
const draftsMemo = createMemo({ ttlMs: 60_000 });

/** Seconds the trimmed players projection is kept in the shared cache. */
const PLAYERS_REVALIDATE_S = 3_600;
/** The 2.5 MB players download gets longer than the default 5 s per attempt. */
const PLAYERS_TIMEOUT_MS = 15_000;

export class SleeperProvider {
  name = "sleeper";
  /**
   * @param {{
   *   client?: ReturnType<typeof import('./client.js').createSleeperClient>,
   *   activeLeagueId?: string,
   *   completeLeagues?: Set<string>,
   *   completeDrafts?: Set<string>,
   * }} [opts] `activeLeagueId` is set by getLeagueProvider(); the rest are test seams
   */
  constructor({ client, activeLeagueId, completeLeagues, completeDrafts } = {}) {
    this.client = client ?? sleeperClient;
    this.activeLeagueId = activeLeagueId ?? null;
    this.completeLeagues = completeLeagues ?? completeLeagueIds;
    this.completeDrafts = completeDrafts ?? completeDraftIds;
  }
  /** `immutable` for a complete league, else the named current-season policy. */
  policyFor(leagueId, current, hint) {
    return hint?.complete || this.completeLeagues.has(leagueId)
      ? "immutable"
      : current;
  }
  get(path, schema, policy, extra) {
    return this.client.get(path, schema, { policy, ...extra });
  }
  async getUser(username) {
    return toUser(
      await this.get(
        `/v1/user/${encodeURIComponent(username)}`,
        RawUser,
        "userLookup",
      ),
    );
  }
  async getLeagues(userId, sport, season) {
    const raw = await this.get(
      `/v1/user/${userId}/leagues/${sport}/${season}`,
      RawLeagueArr,
      "userLookup",
    );
    return raw.map(toLeague);
  }
  async getLeague(leagueId) {
    // The active league's status and leg move; any other league in the chain is a
    // past season whose status decides `immutable` for everything scoped to it.
    const past = this.activeLeagueId != null && leagueId !== this.activeLeagueId;
    const detail = toLeagueDetail(
      await this.get(
        `/v1/league/${leagueId}`,
        RawLeague,
        past ? "pastLeague" : "league",
      ),
    );
    if (isCompleteLeague(detail)) this.completeLeagues.add(leagueId);
    return detail;
  }
  async getRosters(leagueId, hint) {
    const raw = await this.get(
      `/v1/league/${leagueId}/rosters`,
      RawRosterArr,
      this.policyFor(leagueId, "rosters", hint),
    );
    return raw.map(toRoster);
  }
  async getUsers(leagueId, hint) {
    const raw = await this.get(
      `/v1/league/${leagueId}/users`,
      RawLeagueUserArr,
      this.policyFor(leagueId, "users", hint),
    );
    return raw.map(toLeagueUser);
  }
  async getTransactions(leagueId, week) {
    // Season is stamped by the caller/ingest; getLeague resolves it here so the
    // Transaction.season field is always populated even for a bare call.
    const detail = await this.getLeague(leagueId);
    return this.getTransactionsForSeason(leagueId, week, detail.season);
  }
  /** Same as getTransactions but avoids re-fetching the league for its season. */
  async getTransactionsForSeason(leagueId, week, season, hint) {
    const raw = await this.get(
      `/v1/league/${leagueId}/transactions/${week}`,
      RawTransactionArr,
      this.policyFor(leagueId, "transactions", hint),
    );
    return raw.map((t) => toTransaction(t, season));
  }
  async getMatchups(leagueId, week, hint) {
    const raw = await this.get(
      `/v1/league/${leagueId}/matchups/${week}`,
      RawMatchupArr,
      this.policyFor(leagueId, "matchups", hint),
    );
    return raw.map((m) => toMatchup(m, week));
  }
  async getBracket(leagueId, kind, hint) {
    const raw = await this.get(
      `/v1/league/${leagueId}/${kind}_bracket`,
      RawBracketArr,
      this.policyFor(leagueId, "brackets", hint),
    );
    return (raw ?? []).map(toBracketGame);
  }
  async getTradedPicks(leagueId, hint) {
    const raw = await this.get(
      `/v1/league/${leagueId}/traded_picks`,
      RawTradedPickArr,
      this.policyFor(leagueId, "tradedPicks", hint),
    );
    return raw.map(toTradedPick);
  }
  /**
   * The NBA player universe, as the app's trimmed `Player` projection.
   *
   * /players/nba is ~2.5 MB, over the fetch data cache's 2 MB per-entry limit, so the
   * download itself is `no-store`. What IS cached, in Next's shared cache through
   * `unstable_cache`, is the `toPlayer` projection (~0.85 MB for 2,177 players,
   * measured 2026-11-16), so a cold instance reads it from the cache instead of
   * re-downloading 2.5 MB. `unstable_cache` is the documented non-fetch cache for an
   * app not on Cache Components (node_modules/next/dist/docs/01-app/02-guides/
   * caching-without-cache-components.md). Outside a Next request (tests, scripts)
   * there is no cache to use and the load runs directly.
   */
  async getPlayers() {
    return playersMemo.get("players", () =>
      cachedOrDirect(
        () => this.loadPlayers(),
        ["sleeper-players-v1"],
        PLAYERS_REVALIDATE_S,
      ),
    );
  }
  async loadPlayers() {
    const raw = await this.get(`/v1/players/nba`, RawPlayerMap, "noStore", {
      timeoutMs: PLAYERS_TIMEOUT_MS,
    });
    return Object.values(raw).map(toPlayer);
  }
  /**
   * Drafts for a league season.
   *
   * The list endpoint OMITS `slot_to_roster_id` (verified - see API_NOTES), and that
   * map is the entire basis of pick lineage, so each draft is re-fetched individually
   * to hydrate it. A draft whose own status is `complete` cannot change again, so its
   * hydrated record is cached forever whatever season it belongs to.
   */
  async getDrafts(leagueId, hint) {
    return draftsMemo.get(leagueId, async () => {
      const policy = this.policyFor(leagueId, "drafts", hint);
      const raw = await this.get(
        `/v1/league/${leagueId}/drafts`,
        RawDraftArr,
        policy,
      );
      return Promise.all(
        raw.map(async (d) => {
          const done = d.status === "complete";
          if (done) this.completeDrafts.add(d.draft_id);
          try {
            return toDraftMeta(
              await this.get(
                `/v1/draft/${d.draft_id}`,
                RawDraft,
                done ? "immutable" : policy,
              ),
            );
          } catch (err) {
            // Hydration failed - return the list shape, which has no slot map, so
            // lineage reports this season's picks as unresolved. Marked, so the
            // draft index records the season as a gap rather than a real absence.
            return { ...toDraftMeta(d), hydrationError: err };
          }
        }),
      );
    });
  }
  /**
   * Sleeper's dynasty market for one season (D116): dynasty ADP, redraft ADP and a
   * per-game projected line, keyed by player id. ~190 KB, one request. Optional on the
   * provider interface; lib/history.js decides what a failure means for the corpus.
   * @param {string} season
   * @returns {Promise<Map<string, import('../types.js').MarketEntry>>}
   */
  async getMarket(season) {
    const raw = await this.get(
      `/v1/projections/nba/regular/${season}`,
      RawProjectionMap,
      "market",
    );
    const out = new Map();
    for (const [id, r] of Object.entries(raw)) out.set(id, toMarketEntry(r));
    return out;
  }
  async getDraftPicks(draftId, hint) {
    const done = hint?.complete || this.completeDrafts.has(draftId);
    const raw = await this.get(
      `/v1/draft/${draftId}/picks`,
      RawMadeDraftPickArr,
      done ? "immutable" : "drafts",
    );
    // Sleeper already returns these in order; sort defensively by the API's own
    // pick_no (never recomputed - snake drafts break the round/slot formula).
    return raw.map(toMadeDraftPick).sort((a, b) => a.pickNo - b.pickNo);
  }
}

/**
 * `unstable_cache` when a Next incremental cache is reachable, else a direct call.
 * Next throws an invariant when there is no cache at all (vitest, `node scripts/...`);
 * that one case falls through to running the load uncached.
 */
async function cachedOrDirect(load, keyParts, revalidate) {
  const cached = unstable_cache(load, keyParts, {
    revalidate,
    tags: ["sleeper"],
  });
  try {
    return await cached();
  } catch (err) {
    if (String(err?.message ?? "").includes("incrementalCache missing"))
      return load();
    throw err;
  }
}
