import { describe, expect, it } from "vitest";
import { DEFAULT_BOARD, boardSearch, readBoard } from "./url";
describe("league board url", () => {
  it("reads a known board", () => {
    expect(readBoard("?board=fragility")).toBe("fragility");
    expect(readBoard("?board=windows")).toBe("windows");
  });
  it("degrades an unknown, empty or hand-mangled param to the default", () => {
    // `duration` is in this list on purpose: it was the shipped id of the scatter the
    // window map replaced, so a link someone sent last round has to land somewhere
    // real rather than on an empty board.
    for (const s of [
      "",
      "?",
      "?board=",
      "?board=nonsense",
      "?board=duration",
      "?other=1",
      "?%%%",
    ]) {
      expect(readBoard(s)).toBe(DEFAULT_BOARD);
    }
  });
  it("drops the param for the default board so the canonical URL stays clean", () => {
    expect(boardSearch("?board=fragility", "windows")).toBe("");
    expect(boardSearch("", "windows")).toBe("");
  });
  it("preserves any other params already on the URL", () => {
    expect(boardSearch("?focus=abc", "fragility")).toBe(
      "?focus=abc&board=fragility",
    );
    expect(boardSearch("?board=fragility&focus=abc", "windows")).toBe(
      "?focus=abc",
    );
  });
  it("round-trips", () => {
    for (const b of ["windows", "fragility"]) {
      expect(readBoard(boardSearch("", b))).toBe(b);
    }
  });
});
