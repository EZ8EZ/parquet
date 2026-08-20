import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOARD,
  boardSearch,
  leagueSearch,
  readBoard,
  readRoster,
  rosterSearch,
} from "./url.js";
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
describe("league roster selection url", () => {
  it("reads a roster id", () => {
    expect(readRoster("?roster=9")).toBe(9);
    expect(readRoster("?board=fragility&roster=12")).toBe(12);
  });
  it("degrades anything that is not a positive integer id to no selection", () => {
    // Null, not a throw and not a zero: the page resolves "no selection" to the
    // viewer's own roster, so a mangled param lands on the seat the reader owns.
    for (const s of [
      "",
      "?",
      "?roster=",
      "?roster=0",
      "?roster=-3",
      "?roster=1.5",
      "?roster=abc",
      "?board=windows",
      "?%%%",
    ]) {
      expect(readRoster(s)).toBeNull();
    }
  });
  it("takes the first of a repeated param rather than refusing the whole URL", () => {
    // `URLSearchParams.get` semantics, asserted rather than assumed: a duplicated key
    // is a hand-edited or double-appended URL, and the first value is a real reading of
    // it. Refusing outright would drop a selection over somebody else's bug.
    expect(readRoster("?roster=9&roster=abc")).toBe(9);
    expect(readRoster("?roster=abc&roster=9")).toBeNull();
  });
  it("drops the param when nothing is selected, so the canonical URL stays clean", () => {
    expect(rosterSearch("?roster=9", null)).toBe("");
    expect(rosterSearch("", null)).toBe("");
  });
  it("round-trips", () => {
    for (const id of [1, 7, 14])
      expect(readRoster(rosterSearch("", id))).toBe(id);
  });
});
describe("board and roster coexist", () => {
  /*
   * THE PROPERTY THIS MODULE GREW A SECOND PARAM FOR. Selection drives both lenses, so
   * it has to survive a tab switch - and a tab has to survive a selection. Two
   * independent writers of `?...` would each clobber the other's param, which is what
   * these assertions pin.
   */
  it("keeps the selection when the board changes", () => {
    expect(boardSearch("?roster=9", "fragility")).toBe(
      "?roster=9&board=fragility",
    );
    expect(readRoster(boardSearch("?roster=9", "fragility"))).toBe(9);
    // Including when the board returns to the default and drops its own param.
    expect(boardSearch("?roster=9&board=fragility", "windows")).toBe(
      "?roster=9",
    );
  });
  it("keeps the board when the selection changes", () => {
    expect(rosterSearch("?board=fragility", 12)).toBe(
      "?board=fragility&roster=12",
    );
    expect(readBoard(rosterSearch("?board=fragility", 12))).toBe("fragility");
    expect(rosterSearch("?board=fragility&roster=9", null)).toBe(
      "?board=fragility",
    );
  });
  it("carries through a param neither control owns", () => {
    expect(leagueSearch("?focus=abc", { board: "fragility", roster: 4 })).toBe(
      "?focus=abc&board=fragility&roster=4",
    );
  });
  it("touches only the keys present in the patch", () => {
    const both = "?board=fragility&roster=9";
    expect(leagueSearch(both, {})).toBe(both);
    expect(leagueSearch(both, { roster: 2 })).toBe("?board=fragility&roster=2");
    expect(leagueSearch(both, { board: "windows" })).toBe("?roster=9");
  });
});
