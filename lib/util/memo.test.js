import { describe, expect, it, vi } from "vitest";
import { createMemo } from "./memo.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createMemo - the shared single-flight memo", () => {
  it("joins concurrent callers onto ONE load (single-flight)", async () => {
    const memo = createMemo({ ttlMs: 60_000 });
    const d = deferred();
    const load = vi.fn(() => d.promise);
    const a = memo.get("k", load);
    const b = memo.get("k", load);
    const c = memo.get("k", load);
    d.resolve(42);
    expect(await Promise.all([a, b, c])).toEqual([42, 42, 42]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reuses a resolved value within the TTL and reloads after it", async () => {
    vi.useFakeTimers();
    try {
      const memo = createMemo({ ttlMs: 1000 });
      let n = 0;
      const load = vi.fn(async () => ++n);
      expect(await memo.get("k", load)).toBe(1);
      expect(await memo.get("k", load)).toBe(1);
      vi.advanceTimersByTime(1001);
      expect(await memo.get("k", load)).toBe(2);
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not expire a load that is still in flight", async () => {
    vi.useFakeTimers();
    try {
      const memo = createMemo({ ttlMs: 10 });
      const d = deferred();
      const load = vi.fn(() => d.promise);
      const a = memo.get("k", load);
      vi.advanceTimersByTime(1000);
      const b = memo.get("k", load);
      d.resolve("x");
      expect(await a).toBe("x");
      expect(await b).toBe("x");
      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shares a REJECTION with every joined caller, then forgets it", async () => {
    const memo = createMemo({ ttlMs: 60_000 });
    const d = deferred();
    const load = vi.fn(() => d.promise);
    const a = memo.get("k", load);
    const b = memo.get("k", load);
    d.reject(new Error("sleeper down"));
    await expect(a).rejects.toThrow("sleeper down");
    await expect(b).rejects.toThrow("sleeper down");
    expect(memo.peek("k")).toBeNull();
    // The next caller gets a fresh attempt, not the pinned rejection.
    const ok = vi.fn(async () => "back");
    expect(await memo.get("k", ok)).toBe("back");
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("a stale rejection does not evict a newer slot", async () => {
    const memo = createMemo({ ttlMs: 60_000 });
    const first = deferred();
    const a = memo.get("k", () => first.promise);
    const b = memo.get("k", async () => "fresh", { fresh: true });
    first.reject(new Error("late"));
    await expect(a).rejects.toThrow("late");
    expect(await b).toBe("fresh");
    expect(await memo.peek("k")).toBe("fresh");
  });

  it("a synchronous throw in load is a rejection, not a crash", async () => {
    const memo = createMemo({ ttlMs: 60_000 });
    await expect(
      memo.get("k", () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(memo.peek("k")).toBeNull();
  });

  it("ttlMs can depend on the value (short life for a result with gaps)", async () => {
    vi.useFakeTimers();
    try {
      const memo = createMemo({ ttlMs: (v) => (v.gaps.length ? 10 : 10_000) });
      let call = 0;
      const load = async () => ({ gaps: call++ === 0 ? ["x"] : [] });
      const first = await memo.get("k", load);
      vi.advanceTimersByTime(11);
      const second = await memo.get("k", load);
      expect(second).not.toBe(first);
      vi.advanceTimersByTime(11);
      expect(await memo.get("k", load)).toBe(second);
    } finally {
      vi.useRealTimers();
    }
  });
  it("a zero-TTL memo forgets a settled slot (in-flight de-dup only)", async () => {
    const memo = createMemo({ ttlMs: 0 });
    let n = 0;
    const a = memo.get("k", async () => ++n);
    const b = memo.get("k", async () => ++n);
    expect(await a).toBe(1);
    expect(await b).toBe(1);
    expect(memo.peek("k")).toBeNull();
    expect(await memo.get("k", async () => ++n)).toBe(2);
  });
});
