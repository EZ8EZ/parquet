import { describe, expect, it } from "vitest";
import {
  EMPTY_WEB_URL,
  edgeKeyForTrade,
  managerWebHref,
  parseWebParams,
  tradeWebHref,
  webQueryString,
  type WebUrlState,
} from "./url";

/** The real reader the page hands `parseWebParams`. */
function read(query: string) {
  return new URLSearchParams(query);
}

describe("parseWebParams", () => {
  it("reads nothing out of nothing", () => {
    expect(parseWebParams(read(""))).toEqual(EMPTY_WEB_URL);
  });

  it("reads a manager, a pair and a season", () => {
    expect(parseWebParams(read("manager=abc"))).toMatchObject({
      selection: { kind: "node", ownerId: "abc" },
      mode: "web",
    });
    expect(parseWebParams(read("pair=abc-def"))).toMatchObject({
      selection: { kind: "edge", key: "abc-def" },
    });
    expect(parseWebParams(read("season=2024")).season).toBe("2024");
  });

  it("reads a trade as a trade, not as a selection", () => {
    const s = parseWebParams(read("trade=tx9"));
    expect(s.tradeId).toBe("tx9");
    // The strand it lights up is resolved from the graph, which this module cannot
    // see, so the selection is deliberately still empty here.
    expect(s.selection).toBeNull();
  });

  it("resolves a conflicting link down to its most specific part", () => {
    const s = parseWebParams(read("trade=tx9&pair=a-b&manager=a"));
    expect(s.tradeId).toBe("tx9");
    expect(s.selection).toBeNull();

    const t = parseWebParams(read("pair=a-b&manager=a"));
    expect(t.selection).toEqual({ kind: "edge", key: "a-b" });
  });

  it("only accepts the one mode that is not the default", () => {
    expect(parseWebParams(read("mode=trees")).mode).toBe("trees");
    expect(parseWebParams(read("mode=WEB")).mode).toBe("web");
    expect(parseWebParams(read("mode=nonsense")).mode).toBe("web");
  });

  it("treats a hand-edited URL as untrusted rather than throwing", () => {
    expect(parseWebParams(read("manager=&season=%20%20")).selection).toBeNull();
    expect(parseWebParams(read("season=%20%20")).season).toBeNull();
    expect(parseWebParams(read(`trade=${"x".repeat(300)}`)).tradeId).toBeNull();
    // A coalesced multi-team id (four stitched transactions) has to survive: this is
    // the real shape of the league's biggest deals, not an edge case.
    const coalesced = `coalesced-${["981392784131178496", "981392875004981248", "981393045398618112", "981396413038772224"].join("+")}`;
    expect(parseWebParams(read(`trade=${encodeURIComponent(coalesced)}`)).tradeId).toBe(
      coalesced,
    );
    // ...and so does a trees root built on top of one.
    expect(
      parseWebParams(read(`asset=${encodeURIComponent(`${coalesced}|p:1648`)}`)).asset,
    ).toBe(`${coalesced}|p:1648`);
    expect(parseWebParams(read("manager=%20abc%20"))).toMatchObject({
      selection: { kind: "node", ownerId: "abc" },
    });
  });
});

describe("webQueryString", () => {
  it("says nothing when there is nothing to say", () => {
    expect(webQueryString(EMPTY_WEB_URL)).toBe("");
  });

  it("round-trips every web-mode state through parse", () => {
    const states: WebUrlState[] = [
      { ...EMPTY_WEB_URL, season: "2024" },
      { ...EMPTY_WEB_URL, selection: { kind: "node", ownerId: "111" } },
      { ...EMPTY_WEB_URL, selection: { kind: "edge", key: "111-222" } },
      { ...EMPTY_WEB_URL, tradeId: "tx1" },
      { ...EMPTY_WEB_URL, tradeId: "tx1", season: "2023" },
      { ...EMPTY_WEB_URL, mode: "trees", asset: "tx1|p:42" },
    ];
    for (const s of states) {
      expect(parseWebParams(read(webQueryString(s)))).toEqual(s);
    }
  });

  it("writes only the params belonging to the mode on screen", () => {
    // A web-mode link does not carry a trees root, and vice versa: the URL
    // describes what is being looked at, not everything the page remembers.
    expect(
      webQueryString({ ...EMPTY_WEB_URL, asset: "tx1|p:42", season: "2024" }),
    ).toBe("?season=2024");
    expect(
      webQueryString({
        ...EMPTY_WEB_URL,
        mode: "trees",
        asset: "tx1|p:42",
        season: "2024",
        tradeId: "tx1",
      }),
    ).toBe("?mode=trees&asset=tx1%7Cp%3A42");
  });

  it("prefers the linked deal over the pair it sits on", () => {
    expect(
      webQueryString({
        ...EMPTY_WEB_URL,
        tradeId: "tx1",
        selection: { kind: "edge", key: "111-222" },
      }),
    ).toBe("?trade=tx1");
  });
});

describe("edgeKeyForTrade", () => {
  const edges = [
    { key: "a-b", tradeIds: ["t1", "t2"] },
    { key: "a-c", tradeIds: ["t2", "t3"] },
  ];

  it("finds the strand a deal sits on", () => {
    expect(edgeKeyForTrade(edges, "t1")).toBe("a-b");
    expect(edgeKeyForTrade(edges, "t3")).toBe("a-c");
  });

  it("resolves a multi-team deal deterministically", () => {
    // t2 is genuinely on both strands; the panel renders the whole deal either way.
    expect(edgeKeyForTrade(edges, "t2")).toBe("a-b");
  });

  it("returns null for a deal with no strand", () => {
    expect(edgeKeyForTrade(edges, "nope")).toBeNull();
    expect(edgeKeyForTrade([], "t1")).toBeNull();
  });
});

describe("hrefs", () => {
  it("builds the one trade URL in the app", () => {
    expect(tradeWebHref("1234567890")).toBe("/web?trade=1234567890");
  });

  it("survives an id needing encoding", () => {
    const href = tradeWebHref("a b&c");
    expect(href).toBe("/web?trade=a+b%26c");
    // What matters is that the reader gets the id back intact.
    expect(parseWebParams(read(href.split("?")[1])).tradeId).toBe("a b&c");
  });

  it("builds a manager URL", () => {
    expect(managerWebHref("999")).toBe("/web?manager=999");
  });
});
