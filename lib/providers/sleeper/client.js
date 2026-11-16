/**
 * THE SLEEPER HTTP CLIENT - the only code in the app that talks to api.sleeper.app.
 * Every caller (the provider in ./index.js, lib/lab/regret/source.js) goes through
 * `client.get(path, schema, { policy })`, which gives each request:
 *
 *  - a per-attempt TIMEOUT (AbortSignal, 5 s by default). A hung Sleeper used to hang
 *    the render; now it fails that one request, which the caller records as a gap.
 *    Timeouts are not retried: the wait already happened, and the corpus is re-assembled
 *    within seconds when it carries a gap (lib/history.js), so a retry here would only
 *    double the time a reader stares at a blank page.
 *  - the retry behaviour the old `getJson` had: 429 backs off 1 s, 2 s, 3 s; network
 *    errors and 5xx back off 300 ms, 600 ms, 900 ms; up to 3 retries. A 4xx other than
 *    429 is an answer, not a blip, and is no longer retried.
 *  - Zod validation at the edge. A response that fails its schema is an error (kind
 *    `invalid`), never a partially-typed object.
 *  - caching through NEXT'S FETCH DATA CACHE, not module memory. The data cache lives in
 *    .next/cache (or the platform's shared cache on Vercel), so it survives a process
 *    restart and is shared by every serverless instance. Module memos are empty on every
 *    cold instance, which is exactly when a reader is waiting.
 *  - in-flight de-duplication per instance (lib/util/memo.js): concurrent identical
 *    requests share one fetch. Passing an AbortSignal opts a fetch out of React's
 *    per-render memoization, so this is what replaces it.
 *
 * ---------------------------------------------------------------------------------
 * CACHE LIFETIMES - the one table. Every request names one of these policies.
 * ---------------------------------------------------------------------------------
 *  policy          lifetime   used for
 *  --------------  ---------  -----------------------------------------------------
 *  immutable       forever    anything belonging to a league whose status is
 *                             `complete`: transactions, traded picks, brackets,
 *                             drafts (list + hydrated), rosters, users, matchups,
 *                             and that season's per-player game logs. Also any draft
 *                             whose own status is `complete` and its picks, which
 *                             cannot change once the draft is over.
 *  pastLeague      1 day      /league/{id} for a league that is not the active one.
 *                             Its status is what decides `immutable` for everything
 *                             else, so it cannot itself be cached forever unseen.
 *  league          5 min      /league/{id} for the active league (status, leg).
 *  rosters         5 min      current rosters (waivers and trades move them).
 *  transactions    5 min      current-season transaction weeks.
 *  tradedPicks     5 min      current traded-pick snapshot.
 *  drafts          5 min      current drafts and picks while a draft is not complete.
 *  matchups        5 min      current-season matchups (lock-in scores move nightly).
 *  playerStats     15 min     current-season per-player game logs (~90 KB each).
 *  users           1 hour     current league users (team names, avatars).
 *  brackets        1 hour     current playoff brackets.
 *  market          1 hour     /projections (dynasty ADP); ADP moves daily at most.
 *  userLookup      1 day      /user/{name} and a user's league list.
 *  players         1 hour     /players/nba. NOT the fetch cache: the raw payload is
 *                             ~2.5 MB, over the data cache's 2 MB per-entry limit, so
 *                             it is fetched `no-store` and the TRIMMED projection the
 *                             app uses (toPlayer, ~0.85 MB for 2,177 players) is cached
 *                             with `unstable_cache` instead (see ./index.js).
 *
 * A stale entry is served while it is refreshed in the background (Next's fetch cache
 * semantics), and a failed refresh leaves the stale copy in place. So after the first
 * successful fetch, a Sleeper outage degrades to slightly old data rather than to a gap;
 * a gap only appears when there has never been a good copy.
 */
import { createMemo } from "../../util/memo.js";

export const SLEEPER_ORIGIN = "https://api.sleeper.app";
export const DEFAULT_TIMEOUT_MS = 5_000;
const CACHE_TAG = "sleeper";

/** Lifetimes in seconds; `false` = cache forever; `"no-store"` = never cache. */
export const CACHE_POLICIES = Object.freeze({
  immutable: false,
  pastLeague: 86_400,
  league: 300,
  rosters: 300,
  transactions: 300,
  tradedPicks: 300,
  drafts: 300,
  matchups: 300,
  playerStats: 900,
  users: 3_600,
  brackets: 3_600,
  market: 3_600,
  userLookup: 86_400,
  noStore: "no-store",
});

/** The fetch `init` caching fields for a named policy. Exported for tests. */
export function cacheInit(policy) {
  if (!(policy in CACHE_POLICIES))
    throw new Error(`Unknown Sleeper cache policy: ${policy}`);
  const life = CACHE_POLICIES[policy];
  if (life === "no-store") return { cache: "no-store" };
  if (life === false)
    return { cache: "force-cache", next: { tags: [CACHE_TAG] } };
  return { next: { revalidate: life, tags: [CACHE_TAG] } };
}

/**
 * A failed Sleeper request. `kind` is what a gap reports:
 * `timeout` | `http` | `network` | `invalid`.
 */
export class SleeperError extends Error {
  constructor(message, { path, kind, status = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "SleeperError";
    this.path = path;
    this.kind = kind;
    this.status = status;
  }
}

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isAbort(err) {
  return err?.name === "TimeoutError" || err?.name === "AbortError";
}

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 *   retries?: number,
 *   sleep?: (ms: number) => Promise<void>,
 * }} [opts]
 */
export function createSleeperClient({
  fetchImpl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = 3,
  sleep = realSleep,
} = {}) {
  // Late-bound so Next's patched global fetch (which owns the data cache) is used.
  const doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));
  const inflight = createMemo({ ttlMs: 0 });

  async function attempt(path, schema, policy, perAttemptMs, maxRetries) {
    let lastErr;
    for (let i = 0; i <= maxRetries; i++) {
      let res;
      try {
        res = await doFetch(`${SLEEPER_ORIGIN}${path}`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(perAttemptMs),
          ...cacheInit(policy),
        });
      } catch (err) {
        if (isAbort(err)) {
          throw new SleeperError(
            `Sleeper ${path} timed out after ${perAttemptMs} ms`,
            { path, kind: "timeout", cause: err },
          );
        }
        lastErr = new SleeperError(`Sleeper ${path}: ${String(err)}`, {
          path,
          kind: "network",
          cause: err,
        });
        if (i < maxRetries) await sleep(300 * (i + 1));
        continue;
      }
      if (res.status === 429) {
        lastErr = new SleeperError(`Sleeper ${path} -> HTTP 429`, {
          path,
          kind: "http",
          status: 429,
        });
        if (i < maxRetries) await sleep(1000 * (i + 1));
        continue;
      }
      if (!res.ok) {
        lastErr = new SleeperError(`Sleeper ${path} -> HTTP ${res.status}`, {
          path,
          kind: "http",
          status: res.status,
        });
        if (res.status < 500) break;
        if (i < maxRetries) await sleep(300 * (i + 1));
        continue;
      }
      let json;
      try {
        json = await res.json();
      } catch (err) {
        if (isAbort(err)) {
          throw new SleeperError(
            `Sleeper ${path} timed out after ${perAttemptMs} ms`,
            { path, kind: "timeout", cause: err },
          );
        }
        throw new SleeperError(`Sleeper ${path}: unreadable body`, {
          path,
          kind: "invalid",
          cause: err,
        });
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new SleeperError(`Sleeper ${path}: response failed validation`, {
          path,
          kind: "invalid",
          cause: parsed.error,
        });
      }
      return parsed.data;
    }
    throw lastErr;
  }

  return {
    /**
     * @template T
     * @param {string} path starting with `/`, relative to https://api.sleeper.app
     * @param {import('zod').ZodType<T>} schema
     * @param {{ policy: keyof typeof CACHE_POLICIES, timeoutMs?: number, retries?: number }} opts
     * @returns {Promise<T>}
     */
    get(path, schema, { policy, timeoutMs: t = timeoutMs, retries: r = retries }) {
      return inflight.get(`${policy}|${path}`, () =>
        attempt(path, schema, policy, t, r),
      );
    },
  };
}

/** The shared default client. */
export const sleeperClient = createSleeperClient();
