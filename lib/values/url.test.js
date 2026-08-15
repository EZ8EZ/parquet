import { describe, expect, it } from "vitest";
import { parseValuesParams, valuesFocusHref, valuesQueryString } from "./url";
const PAGE = 60;
/** The real reader the page and the client list both hand `parseValuesParams`. */
function read(query) {
  return new URLSearchParams(query);
}
describe("parseValuesParams", () => {
  it("defaults to All/value/first page/no focus when nothing is set", () => {
    expect(parseValuesParams(read(""), PAGE)).toEqual({
      pos: "All",
      q: "",
      sort: "value",
      limit: PAGE,
      focus: null,
    });
  });
  it("reads a position, a query, a sort and a page size", () => {
    expect(parseValuesParams(read("pos=PG"), PAGE).pos).toBe("PG");
    expect(parseValuesParams(read("q=wemban"), PAGE).q).toBe("wemban");
    expect(parseValuesParams(read("sort=age"), PAGE).sort).toBe("age");
    expect(parseValuesParams(read("n=180"), PAGE).limit).toBe(180);
    expect(parseValuesParams(read("focus=abc123"), PAGE).focus).toBe("abc123");
  });
  it("treats a hand-edited URL as untrusted rather than throwing", () => {
    expect(parseValuesParams(read("pos=Nonsense"), PAGE).pos).toBe("All");
    expect(parseValuesParams(read("sort=nonsense"), PAGE).sort).toBe("value");
    expect(parseValuesParams(read("n=-5"), PAGE).limit).toBe(PAGE);
    expect(parseValuesParams(read("n=abc"), PAGE).limit).toBe(PAGE);
    expect(parseValuesParams(read("q=%20%20"), PAGE).q).toBe("");
    expect(parseValuesParams(read("focus=%20%20"), PAGE).focus).toBeNull();
    expect(parseValuesParams(read(`q=${"x".repeat(300)}`), PAGE).q.length).toBe(
      100,
    );
  });
});
describe("valuesQueryString / parseValuesParams round trip", () => {
  it("round-trips the default state to an empty string", () => {
    const state = {
      pos: "All",
      q: "",
      sort: "value",
      limit: PAGE,
      focus: null,
    };
    expect(valuesQueryString(state, PAGE)).toBe("");
    expect(
      parseValuesParams(read(valuesQueryString(state, PAGE)), PAGE),
    ).toEqual(state);
  });
  it("round-trips a full state (filter, query, sort, deeper page and a focus)", () => {
    const state = {
      pos: "C",
      q: "wemban yama",
      sort: "age",
      limit: 180,
      focus: "player-9",
    };
    const qs = valuesQueryString(state, PAGE);
    expect(parseValuesParams(read(qs), PAGE)).toEqual(state);
  });
  it("omits the page-size param when the limit is already the default page", () => {
    const state = { pos: "PG", q: "", sort: "value", limit: PAGE, focus: null };
    expect(valuesQueryString(state, PAGE)).not.toContain("n=");
  });
});
describe("valuesFocusHref", () => {
  it("builds a focus link and encodes the id", () => {
    expect(valuesFocusHref("abc123")).toBe("/values?focus=abc123");
    expect(valuesFocusHref("weird id/with?chars")).toBe(
      "/values?focus=weird%20id%2Fwith%3Fchars",
    );
  });
});
