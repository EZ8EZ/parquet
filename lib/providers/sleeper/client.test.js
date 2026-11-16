/**
 * The Sleeper client and the provider's cache-policy choices. No network: every test
 * hands the client its own `fetchImpl`.
 */
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  CACHE_POLICIES,
  SleeperError,
  cacheInit,
  createSleeperClient,
} from "./client.js";
import { SleeperProvider } from "./index.js";
import { collectTransactions, collectTradedPicks } from "../../ingest.js";
import { describeGaps } from "../../util/gaps.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** A fetch that never answers, and rejects only when its signal aborts. */
function hangingFetch(calls = []) {
  return (url, init) => {
    calls.push({ url, init });
    return new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason));
    });
  };
}

const noSleep = () => Promise.resolve();

describe("timeouts", () => {
  it("aborts a hung request after timeoutMs and reports kind=timeout", async () => {
    const client = createSleeperClient({
      fetchImpl: hangingFetch(),
      timeoutMs: 20,
      sleep: noSleep,
    });
    const t0 = Date.now();
    const err = await client
      .get("/v1/state/nba", z.any(), { policy: "league" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(SleeperError);
    expect(err.kind).toBe("timeout");
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("does not retry a timeout (the wait already happened)", async () => {
    const calls = [];
    const client = createSleeperClient({
      fetchImpl: hangingFetch(calls),
      timeoutMs: 10,
      sleep: noSleep,
    });
    await client.get("/v1/x", z.any(), { policy: "league" }).catch(() => {});
    expect(calls).toHaveLength(1);
  });

  it("a timed-out transaction week surfaces as a GAP, not as an empty week", async () => {
    const provider = new SleeperProvider({
      client: createSleeperClient({
        fetchImpl: hangingFetch(),
        timeoutMs: 10,
        sleep: noSleep,
      }),
      completeLeagues: new Set(),
      completeDrafts: new Set(),
    });
    const gaps = [];
    const chain = [{ leagueId: "L1", season: "2025", status: "complete" }];
    const txs = await collectTransactions(provider, chain, gaps);
    expect(txs).toEqual([]);
    expect(gaps).toHaveLength(25);
    expect(gaps[0]).toMatchObject({
      endpoint: "transactions",
      season: "2025",
      reason: "timeout",
    });
    expect(describeGaps(gaps)).toMatch(/transactions \(2025\)/);
  });
});

describe("partial failure is recorded", () => {
  it("one failed week is a gap; the other weeks' rows still arrive", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.endsWith("/transactions/7")) return json({ error: "x" }, 404);
      const week = Number(url.split("/").pop());
      if (week === 3)
        return json([
          {
            transaction_id: "t1",
            type: "trade",
            status: "complete",
            created: 1,
            leg: 3,
            roster_ids: [1, 2],
          },
        ]);
      return json([]);
    });
    const provider = new SleeperProvider({
      client: createSleeperClient({ fetchImpl, sleep: noSleep }),
      completeLeagues: new Set(),
    });
    const gaps = [];
    const txs = await collectTransactions(
      provider,
      [{ leagueId: "L1", season: "2024", status: "complete" }],
      gaps,
    );
    expect(txs.map((t) => t.transactionId)).toEqual(["t1"]);
    expect(gaps).toEqual([
      {
        endpoint: "transactions",
        season: "2024",
        week: 7,
        id: "L1",
        reason: "http",
      },
    ]);
  });

  it("a failed traded-picks snapshot is a gap, not a thrown corpus", async () => {
    const fetchImpl = vi.fn(async (url) =>
      url.includes("/L-old/") ? json({}, 500) : json([]),
    );
    const provider = new SleeperProvider({
      client: createSleeperClient({ fetchImpl, sleep: noSleep, retries: 1 }),
      completeLeagues: new Set(),
    });
    const gaps = [];
    await collectTradedPicks(
      provider,
      [
        { leagueId: "L-old", season: "2023", status: "complete" },
        { leagueId: "L-new", season: "2026", status: "in_season" },
      ],
      gaps,
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ endpoint: "traded_picks", season: "2023" });
  });
});

describe("cache policy: completed seasons forever, current season short", () => {
  function recordingProvider(opts = {}) {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => {
      calls.push({ url, init });
      if (url.match(/\/league\/[^/]+$/)) {
        const id = url.split("/").pop();
        return json({
          league_id: id,
          name: "NSL",
          season: id === "CUR" ? "2026" : "2025",
          sport: "nba",
          status: id === "CUR" ? "in_season" : "complete",
          previous_league_id: id === "CUR" ? "OLD" : null,
        });
      }
      return json([]);
    });
    const provider = new SleeperProvider({
      client: createSleeperClient({ fetchImpl, sleep: noSleep }),
      activeLeagueId: "CUR",
      completeLeagues: new Set(),
      completeDrafts: new Set(),
      ...opts,
    });
    const initFor = (suffix) => calls.find((c) => c.url.endsWith(suffix))?.init;
    return { provider, calls, initFor };
  }

  it("a complete league's transactions use force-cache with no revalidate; the current season's do not", async () => {
    const { provider, initFor } = recordingProvider();
    await collectTransactions(provider, [
      { leagueId: "OLD", season: "2025", status: "complete" },
      { leagueId: "CUR", season: "2026", status: "in_season" },
    ]);
    const old = initFor("/league/OLD/transactions/1");
    const cur = initFor("/league/CUR/transactions/1");
    expect(old.cache).toBe("force-cache");
    expect(old.next?.revalidate).toBeUndefined();
    expect(cur.cache).toBeUndefined();
    expect(cur.next.revalidate).toBe(CACHE_POLICIES.transactions);
    expect(cur.next.revalidate).toBeGreaterThan(0);
    // Both carry a timeout signal.
    expect(old.signal).toBeInstanceOf(AbortSignal);
    expect(cur.signal).toBeInstanceOf(AbortSignal);
  });

  it("learns completeness from /league/{id} itself, without a hint", async () => {
    const { provider, initFor } = recordingProvider();
    await provider.getLeague("OLD");
    await provider.getLeague("CUR");
    await provider.getRosters("OLD");
    await provider.getRosters("CUR");
    expect(initFor("/league/OLD/rosters").cache).toBe("force-cache");
    expect(initFor("/league/CUR/rosters").next.revalidate).toBe(
      CACHE_POLICIES.rosters,
    );
    // The league reads themselves: the active league short, a past one a day.
    expect(initFor("/league/CUR").next.revalidate).toBe(CACHE_POLICIES.league);
    expect(initFor("/league/OLD").next.revalidate).toBe(
      CACHE_POLICIES.pastLeague,
    );
  });

  it("the players payload (over the 2 MB entry limit) is never put in the fetch cache", async () => {
    const { provider, initFor } = recordingProvider();
    await provider.loadPlayers().catch(() => {});
    expect(initFor("/players/nba").cache).toBe("no-store");
  });

  it("cacheInit maps every policy to valid Next fetch options", () => {
    for (const name of Object.keys(CACHE_POLICIES)) {
      const init = cacheInit(name);
      // Never both cache:no-store and a revalidate (Next ignores conflicting pairs).
      if (init.cache === "no-store") expect(init.next).toBeUndefined();
      if (init.cache === "force-cache")
        expect(init.next?.revalidate).toBeUndefined();
    }
    expect(() => cacheInit("nope")).toThrow();
  });
});

describe("retry rules kept", () => {
  it("backs off and retries a 429, then succeeds", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () =>
      ++n < 3 ? json({}, 429) : json({ ok: true }),
    );
    const sleep = vi.fn(noSleep);
    const client = createSleeperClient({ fetchImpl, sleep });
    const out = await client.get("/v1/x", z.object({ ok: z.boolean() }), {
      policy: "league",
    });
    expect(out).toEqual({ ok: true });
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it("rejects a payload that fails its schema as kind=invalid, without retrying", async () => {
    const fetchImpl = vi.fn(async () => json({ nope: 1 }));
    const client = createSleeperClient({ fetchImpl, sleep: noSleep });
    const err = await client
      .get("/v1/x", z.object({ ok: z.boolean() }), { policy: "league" })
      .catch((e) => e);
    expect(err.kind).toBe("invalid");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates concurrent identical requests on one instance", async () => {
    const fetchImpl = vi.fn(async () => json([]));
    const client = createSleeperClient({ fetchImpl, sleep: noSleep });
    await Promise.all([
      client.get("/v1/a", z.any(), { policy: "league" }),
      client.get("/v1/a", z.any(), { policy: "league" }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
