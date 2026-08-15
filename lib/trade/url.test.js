import { describe, expect, it } from "vitest";
import {
  EMPTY_TRADE_PACKAGE,
  isEmptyTradePackage,
  parseTradeParams,
  tradeHref,
  tradeQueryString,
} from "./url";
/** The real reader `TradeBuilder` hands `parseTradeParams`. */
function read(query) {
  return new URLSearchParams(query);
}
describe("parseTradeParams / tradeQueryString round trip", () => {
  it("round-trips an empty package to an empty string", () => {
    expect(tradeQueryString(EMPTY_TRADE_PACKAGE)).toBe("");
    expect(parseTradeParams(read(""))).toEqual(EMPTY_TRADE_PACKAGE);
  });
  it("round-trips a package with only one side populated", () => {
    const pkg = { give: ["p1", "p2"], get: [], givePicks: [], getPicks: [] };
    const qs = tradeQueryString(pkg);
    expect(qs).toBe("?give=p1%2Cp2");
    expect(parseTradeParams(read(qs))).toEqual(pkg);
  });
  it("round-trips a full package - players and picks on both sides", () => {
    const pkg = {
      give: ["4066648", "9999"],
      get: ["p3"],
      givePicks: ["2027-1-3"],
      getPicks: ["2028-2-9", "2029-1-1"],
    };
    expect(parseTradeParams(read(tradeQueryString(pkg)))).toEqual(pkg);
  });
  it("round-trips ids that don't resolve to anything real - the codec doesn't validate", () => {
    const pkg = {
      give: ["bogus-id-xyz", "not-a-real-player"],
      get: [],
      givePicks: ["also-bogus"],
      getPicks: [],
    };
    expect(parseTradeParams(read(tradeQueryString(pkg)))).toEqual(pkg);
  });
  it("drops blank entries and collapses double commas rather than keeping empty ids", () => {
    expect(parseTradeParams(read("give=a,,b,%20,c"))).toMatchObject({
      give: ["a", "b", "c"],
    });
  });
  it("caps id length and count instead of accepting an unbounded param", () => {
    const tooLong = "x".repeat(200);
    expect(parseTradeParams(read(`give=${tooLong}`)).give).toEqual([]);
    const many = Array.from({ length: 60 }, (_, i) => `p${i}`).join(",");
    expect(parseTradeParams(read(`give=${many}`)).give.length).toBe(40);
  });
  it("treats a missing param as an empty list, not a crash", () => {
    expect(parseTradeParams(read("get=p1"))).toEqual({
      give: [],
      get: ["p1"],
      givePicks: [],
      getPicks: [],
    });
  });
});
describe("isEmptyTradePackage", () => {
  it("is true only when every side is empty", () => {
    expect(isEmptyTradePackage(EMPTY_TRADE_PACKAGE)).toBe(true);
    expect(
      isEmptyTradePackage({
        give: ["p1"],
        get: [],
        givePicks: [],
        getPicks: [],
      }),
    ).toBe(false);
    expect(
      isEmptyTradePackage({
        give: [],
        get: [],
        givePicks: ["2027-1-1"],
        getPicks: [],
      }),
    ).toBe(false);
  });
});
describe("tradeHref", () => {
  it("builds a full shareable /trade link", () => {
    expect(tradeHref(EMPTY_TRADE_PACKAGE)).toBe("/trade");
    expect(
      tradeHref({ give: ["p1"], get: ["p2"], givePicks: [], getPicks: [] }),
    ).toBe("/trade?give=p1&get=p2");
  });
});
