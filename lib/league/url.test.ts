import { describe, expect, it } from "vitest";
import { DEFAULT_BOARD, boardSearch, readBoard } from "./url";

describe("league board url", () => {
  it("reads a known board", () => {
    expect(readBoard("?board=fragility")).toBe("fragility");
    expect(readBoard("?board=duration")).toBe("duration");
  });

  it("degrades an unknown, empty or hand-mangled param to the default", () => {
    for (const s of ["", "?", "?board=", "?board=nonsense", "?other=1", "?%%%"]) {
      expect(readBoard(s)).toBe(DEFAULT_BOARD);
    }
  });

  it("drops the param for the default board so the canonical URL stays clean", () => {
    expect(boardSearch("?board=fragility", "duration")).toBe("");
    expect(boardSearch("", "duration")).toBe("");
  });

  it("preserves any other params already on the URL", () => {
    expect(boardSearch("?focus=abc", "fragility")).toBe("?focus=abc&board=fragility");
    expect(boardSearch("?board=fragility&focus=abc", "duration")).toBe("?focus=abc");
  });

  it("round-trips", () => {
    for (const b of ["duration", "fragility"] as const) {
      expect(readBoard(boardSearch("", b))).toBe(b);
    }
  });
});
