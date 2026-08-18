/**
 * Single-flight coverage for `getCorpus` (private to history.ts, exercised only
 * through `getLeagueHistory`/`invalidateHistory`).
 *
 * The bug this guards against: `cachedCorpus` used to store the RESOLVED value, never
 * an in-flight promise, so N concurrent cold callers each ran their own full corpus
 * assembly. Measured against the real league, 5 concurrent `getLeagueHistory()` calls
 * after an invalidate issued 725 Sleeper requests (5x the ~145-request cost of one
 * assembly) — a defect serious enough that Sleeper's documented penalty for exceeding
 * its rate guidance is an IP block. `getUsers` is the spy target because it is called
 * exactly once per assembly (inside the initial `Promise.all` in `assembleCorpus`) and
 * nowhere else on the `getLeagueHistory` path, so its call count IS the assembly
 * count.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLeagueHistory, invalidateHistory } from "./history.js";
import { FixtureProvider } from "./providers/fixture/index.js";
beforeEach(() => {
  invalidateHistory();
});
afterEach(() => {
  vi.restoreAllMocks();
  invalidateHistory();
});
describe("getCorpus single-flight", () => {
  it("dedupes N concurrent cold callers into exactly one assembly", async () => {
    const spy = vi.spyOn(FixtureProvider.prototype, "getUsers");
    const results = await Promise.all(
      Array.from({ length: 5 }, () => getLeagueHistory()),
    );
    expect(spy).toHaveBeenCalledTimes(1);
    // Every caller must have joined the SAME assembly, not five equal-looking ones —
    // reference equality on the heavy identity-independent parts of the corpus proves
    // they share one underlying object (and matters elsewhere: lib/valuation/index.ts's
    // WeakMap keys on `h.players` identity).
    for (const r of results.slice(1)) {
      expect(r.chain).toBe(results[0].chain);
      expect(r.players).toBe(results[0].players);
      expect(r.transactions).toBe(results[0].transactions);
    }
  });
  it("does not re-assemble for a second wave within the TTL", async () => {
    const spy = vi.spyOn(FixtureProvider.prototype, "getUsers");
    await getLeagueHistory();
    await Promise.all([getLeagueHistory(), getLeagueHistory()]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it("clears the slot on rejection so a transient failure does not pin it", async () => {
    const spy = vi.spyOn(FixtureProvider.prototype, "getUsers");
    spy.mockRejectedValueOnce(new Error("simulated transient Sleeper failure"));
    await expect(getLeagueHistory()).rejects.toThrow(
      "simulated transient Sleeper failure",
    );
    expect(spy).toHaveBeenCalledTimes(1);
    // The next caller must get a FRESH attempt, not the same rejected promise replayed
    // forever — this is the exact failure mode `ensureIngested()` in lib/ingest.ts
    // already guards against, which this mirrors.
    await expect(getLeagueHistory()).resolves.toBeDefined();
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it("a rejection does not poison callers that were already in flight before it", async () => {
    // Two callers race in on the same in-flight promise; that promise ultimately
    // rejects. Both must see the rejection (nobody hangs, nobody gets a stale value),
    // and the slot must be clear afterwards for the next caller to retry.
    const spy = vi.spyOn(FixtureProvider.prototype, "getUsers");
    spy.mockRejectedValueOnce(new Error("boom"));
    const [a, b] = await Promise.allSettled([
      getLeagueHistory(),
      getLeagueHistory(),
    ]);
    expect(a.status).toBe("rejected");
    expect(b.status).toBe("rejected");
    expect(spy).toHaveBeenCalledTimes(1);
    await expect(getLeagueHistory()).resolves.toBeDefined();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
