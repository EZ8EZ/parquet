import { describe, expect, it } from "vitest";
import {
  parseCustomOrder,
  reorder,
  serializeCustomOrder,
  syncCustomOrder,
} from "./customOrder";

describe("serialize/parse round trip", () => {
  it("round-trips an ordered list", () => {
    const ids = ["c", "a", "b"];
    expect(parseCustomOrder(serializeCustomOrder(ids))).toEqual(ids);
  });

  it("round-trips the empty list", () => {
    expect(parseCustomOrder(serializeCustomOrder([]))).toEqual([]);
  });

  it("treats null (never visited) as no custom ranking", () => {
    expect(parseCustomOrder(null)).toEqual([]);
  });

  it("degrades to empty on corrupted JSON rather than throwing", () => {
    expect(parseCustomOrder("{not json")).toEqual([]);
    expect(parseCustomOrder("")).toEqual([]);
  });

  it("degrades to empty on valid JSON of the wrong shape", () => {
    expect(parseCustomOrder("42")).toEqual([]);
    expect(parseCustomOrder('{"a":1}')).toEqual([]);
    expect(parseCustomOrder("null")).toEqual([]);
  });

  it("drops non-string entries rather than failing the whole parse", () => {
    expect(parseCustomOrder('["a", 1, "b", null, "c"]')).toEqual(["a", "b", "c"]);
  });
});

describe("reorder", () => {
  it("moves an entry forward", () => {
    expect(reorder(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an entry backward", () => {
    expect(reorder(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("is a no-op when from equals to", () => {
    const list = ["a", "b", "c"];
    expect(reorder(list, 1, 1)).toBe(list); // same reference: skip a re-render
  });

  it("leaves the list untouched on an out-of-range index", () => {
    const list = ["a", "b", "c"];
    expect(reorder(list, -1, 1)).toBe(list);
    expect(reorder(list, 0, 3)).toBe(list);
    expect(reorder(list, 5, 0)).toBe(list);
  });

  it("preserves every element exactly once regardless of from/to", () => {
    const list = ["a", "b", "c", "d", "e"];
    for (let from = 0; from < list.length; from++) {
      for (let to = 0; to < list.length; to++) {
        const result = reorder(list, from, to);
        expect(result).toHaveLength(list.length);
        expect([...result].sort()).toEqual([...list].sort());
      }
    }
  });

  it("does not mutate the input list", () => {
    const list = ["a", "b", "c"];
    reorder(list, 0, 2);
    expect(list).toEqual(["a", "b", "c"]);
  });
});

describe("syncCustomOrder", () => {
  it("keeps stored order for players still in the pool", () => {
    const synced = syncCustomOrder(["c", "a", "b"], ["a", "b", "c"]);
    expect(synced.slice(0, 3)).toEqual(["c", "a", "b"]);
  });

  it("drops ids that fell out of the pool", () => {
    const synced = syncCustomOrder(["c", "a", "b"], ["a", "c"]);
    expect(synced).toEqual(["c", "a"]);
  });

  it("appends newcomers at the end, in pool order", () => {
    const synced = syncCustomOrder(["b", "a"], ["a", "b", "c", "d"]);
    expect(synced).toEqual(["b", "a", "c", "d"]);
  });

  it("is idempotent once synced against the same pool", () => {
    const pool = ["a", "b", "c", "d"];
    const once = syncCustomOrder(["c", "a"], pool);
    const twice = syncCustomOrder(once, pool);
    expect(twice).toEqual(once);
  });

  it("returns exactly the pool, reordered, never more or fewer ids", () => {
    const pool = ["a", "b", "c", "d", "e"];
    const stored = ["z", "c", "y", "a"]; // z/y are stale, not in the pool
    const synced = syncCustomOrder(stored, pool);
    expect([...synced].sort()).toEqual([...pool].sort());
  });

  it("falls back to pool order untouched when nothing was stored", () => {
    const pool = ["a", "b", "c"];
    expect(syncCustomOrder([], pool)).toEqual(pool);
  });
});
