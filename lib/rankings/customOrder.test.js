import { describe, expect, it } from "vitest";
import {
  CUSTOM_RANK_COOKIE,
  customOrderFromCookieHeader,
  encodeCustomOrderCookie,
  MAX_RANKED_IN_COOKIE,
  parseCustomOrder,
  parseCustomOrderCookie,
  reorder,
  syncCustomOrder,
} from "./customOrder";
describe("legacy localStorage parse (migration read only)", () => {
  it("reads the shape the pre-cookie board wrote", () => {
    // The old write path was JSON.stringify over the id list. Nothing writes
    // this any more, but a board saved before the cookie existed still reads.
    expect(parseCustomOrder(JSON.stringify(["c", "a", "b"]))).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(parseCustomOrder(JSON.stringify([]))).toEqual([]);
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
    expect(parseCustomOrder('["a", 1, "b", null, "c"]')).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
describe("cookie codec", () => {
  it("round-trips a real-shaped order", () => {
    const ids = ["2577", "1658", "1970", "p12", "some_id-9"];
    expect(parseCustomOrderCookie(encodeCustomOrderCookie(ids))).toEqual(ids);
  });
  it("round-trips the empty order", () => {
    expect(parseCustomOrderCookie(encodeCustomOrderCookie([]))).toEqual([]);
  });
  it("treats a missing cookie as no custom ranking", () => {
    expect(parseCustomOrderCookie(null)).toEqual([]);
    expect(parseCustomOrderCookie(undefined)).toEqual([]);
    expect(parseCustomOrderCookie("")).toEqual([]);
  });
  it("rejects an unversioned or wrongly-versioned value outright", () => {
    // A future schema change must expire old cookies, not half-read them.
    expect(parseCustomOrderCookie("2577~1658")).toEqual([]);
    expect(parseCustomOrderCookie("v2.2577~1658")).toEqual([]);
  });
  it("degrades to empty on garbage rather than throwing", () => {
    expect(parseCustomOrderCookie("!!!")).toEqual([]);
    expect(parseCustomOrderCookie("v1.")).toEqual([]);
  });
  it("emits only cookie-legal octets, so nothing depends on percent-encoding", () => {
    const encoded = encodeCustomOrderCookie(["2577", "1658", "p3"]);
    // RFC 6265 excludes comma, semicolon, whitespace, backslash and double quote
    // from a cookie value. This is why the codec uses `.` and `~` and not JSON.
    expect(encoded).toMatch(/^[A-Za-z0-9_.~-]+$/);
  });
  it("drops ids that could not be real player ids", () => {
    // A hand-edited cookie must not be able to smuggle a separator through.
    expect(parseCustomOrderCookie("v1.2577~bad;id~1658")).toEqual([
      "2577",
      "1658",
    ]);
    expect(encodeCustomOrderCookie(["2577", "a,b", "1658"])).toBe(
      "v1.2577~1658",
    );
  });
  it("drops duplicates, which would otherwise give one player two ranks", () => {
    // customSource assigns rank by position, so a repeated id is not a harmless
    // duplicate: it is one player holding two different opinions at once.
    expect(parseCustomOrderCookie("v1.2577~1658~2577")).toEqual([
      "2577",
      "1658",
    ]);
  });
  it("caps the order on both encode and parse so the cookie cannot grow unbounded", () => {
    const many = Array.from(
      { length: MAX_RANKED_IN_COOKIE + 50 },
      (_, i) => `p${i}`,
    );
    expect(encodeCustomOrderCookie(many).split("~")).toHaveLength(
      MAX_RANKED_IN_COOKIE,
    );
    const oversized = `v1.${many.join("~")}`;
    expect(parseCustomOrderCookie(oversized)).toHaveLength(
      MAX_RANKED_IN_COOKIE,
    );
  });
  it("stays well inside the 4KB cookie limit at a realistic board size", () => {
    // /rank's pool is 120 players; Sleeper ids are 4 to 5 digits.
    const ids = Array.from({ length: 120 }, (_, i) => `${1000 + i * 7}`);
    expect(encodeCustomOrderCookie(ids).length).toBeLessThan(1024);
  });
});
describe("customOrderFromCookieHeader (the client's read path)", () => {
  const value = encodeCustomOrderCookie(["2577", "1658", "p3"]);
  it("finds the cookie in a realistic multi-cookie header", () => {
    const header = `parquet_roster=3; ${CUSTOM_RANK_COOKIE}=${value}; parquet_digest_seen=x.y`;
    expect(customOrderFromCookieHeader(header)).toEqual(["2577", "1658", "p3"]);
  });
  it("reads a header containing only this cookie, with and without padding", () => {
    expect(
      customOrderFromCookieHeader(`${CUSTOM_RANK_COOKIE}=${value}`),
    ).toEqual(["2577", "1658", "p3"]);
    expect(
      customOrderFromCookieHeader(`  ${CUSTOM_RANK_COOKIE} = ${value} `),
    ).toEqual(["2577", "1658", "p3"]);
  });
  it("returns empty when the cookie is absent, the header is empty, or null", () => {
    expect(customOrderFromCookieHeader("parquet_roster=3; other=1")).toEqual(
      [],
    );
    expect(customOrderFromCookieHeader("")).toEqual([]);
    expect(customOrderFromCookieHeader(null)).toEqual([]);
    expect(customOrderFromCookieHeader(undefined)).toEqual([]);
  });
  it("does not match a cookie whose name merely contains ours", () => {
    expect(
      customOrderFromCookieHeader(`x_${CUSTOM_RANK_COOKIE}=${value}`),
    ).toEqual([]);
  });
  it("agrees with the server read on the same value", () => {
    // Client and server both funnel into parseCustomOrderCookie; this pins the
    // header-splitting layer on top of it to the same answer.
    expect(
      customOrderFromCookieHeader(`${CUSTOM_RANK_COOKIE}=${value}`),
    ).toEqual(parseCustomOrderCookie(value));
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
