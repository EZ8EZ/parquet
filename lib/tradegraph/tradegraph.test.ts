import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import { deriveManagerProfile } from "../derive/manager";
import type { LeagueHistory } from "../history";
import type { Transaction } from "../providers/types";
import {
  RING,
  abbreviate,
  buildAssetMoves,
  buildHoldings,
  buildTradeGraph,
  buildTradeTree,
  rankTradeRoots,
  ringOrder,
  tradeParties,
} from "./index";

/** Clone a history with extra transactions appended, chronologically. */
function withTransactions(
  h: LeagueHistory,
  extra: Transaction[],
): LeagueHistory {
  return {
    ...h,
    transactions: [...h.transactions, ...extra].sort(
      (a, b) => a.created - b.created,
    ),
  };
}

function trade(
  id: string,
  rosterIds: number[],
  adds: Record<string, number>,
  drops: Record<string, number>,
  created = 1_700_000_000_000,
): Transaction {
  return {
    transactionId: id,
    type: "trade",
    status: "complete",
    season: "2024",
    week: 5,
    created,
    statusUpdated: created,
    creator: null,
    rosterIds,
    consenterIds: rosterIds,
    adds,
    drops,
    draftPicks: [],
  };
}

describe("trade graph", () => {
  const h = buildFixtureHistory();
  const graph = buildTradeGraph(h);

  it("has one node per roster, positioned on the ring", () => {
    expect(graph.nodes.length).toBe(h.rosters.length);
    for (const n of graph.nodes) {
      const d = Math.hypot(n.x - RING.cx, n.y - RING.cy);
      expect(d).toBeCloseTo(RING.r, 1);
    }
    // Node ids are the roster ids, exactly once each.
    const ids = graph.nodes.map((n) => n.rosterId).sort((a, b) => a - b);
    expect(ids).toEqual(h.rosters.map((r) => r.rosterId).sort((a, b) => a - b));
  });

  it("gives every manager a unique abbreviation", () => {
    const abbrs = graph.nodes.map((n) => n.abbr);
    expect(new Set(abbrs).size).toBe(abbrs.length);
    for (const a of abbrs) expect(a.length).toBeLessThanOrEqual(3);
  });

  it("marks the viewing manager", () => {
    const me = graph.nodes.filter((n) => n.isMe);
    expect(me.length).toBe(1);
    expect(me[0].rosterId).toBe(h.me.rosterId);
  });

  it("builds one undirected edge per trading pair, no self loops", () => {
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeLessThanOrEqual(graph.possiblePairs);
    const keys = new Set<string>();
    for (const e of graph.edges) {
      expect(e.a).toBeLessThan(e.b);
      expect(e.key).toBe(`${e.a}-${e.b}`);
      expect(keys.has(e.key)).toBe(false);
      keys.add(e.key);
      expect(e.count).toBeGreaterThan(0);
      expect(e.tradeIds.length).toBe(e.count);
    }
  });

  it("agrees with the dossier derivation on edge weights", () => {
    expect(graph.weightsAgree).toBe(true);
    for (const e of graph.edges) {
      const p = deriveManagerProfile(h, e.a);
      const found = p.tradePartners.find((t) => t.rosterId === e.b);
      expect(found?.count).toBe(e.count);
    }
  });

  it("counts every trade exactly once", () => {
    const trades = h.transactions.filter((t) => t.type === "trade");
    expect(graph.totalTrades).toBe(trades.length);
    expect(graph.trades.length).toBe(trades.length);
  });

  it("is deterministic across two calls", () => {
    const again = buildTradeGraph(buildFixtureHistory());
    expect(JSON.stringify(again)).toBe(JSON.stringify(graph));
    // And the layout specifically, since that is the part with a search in it.
    expect(again.nodes.map((n) => [n.rosterId, n.x, n.y])).toEqual(
      graph.nodes.map((n) => [n.rosterId, n.x, n.y]),
    );
  });

  it("orders the ring deterministically and as a permutation", () => {
    const ids = [1, 2, 3, 4, 5, 6];
    const w = (a: number, b: number) => (Math.abs(a - b) === 1 ? 5 : 0);
    const first = ringOrder(ids, w);
    const second = ringOrder(ids, w);
    expect(first).toEqual(second);
    expect([...first].sort((a, b) => a - b)).toEqual(ids);
  });

  it("puts frequent partners next to each other on the ring", () => {
    // 1-2 and 3-4 are tight pairs; they should end up adjacent on the circle.
    const ids = [1, 2, 3, 4, 5, 6];
    const heavy = new Set(["1-2", "3-4"]);
    const w = (a: number, b: number) => {
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      return heavy.has(k) ? 10 : 0;
    };
    const order = ringOrder(ids, w);
    const step = (a: number, b: number) => {
      const i = order.indexOf(a);
      const j = order.indexOf(b);
      const d = Math.abs(i - j);
      return Math.min(d, order.length - d);
    };
    expect(step(1, 2)).toBe(1);
    expect(step(3, 4)).toBe(1);
  });
});

describe("multi-team trades", () => {
  const base = buildFixtureHistory();
  // A real one exists in the live league (rosters 6, 7 and 11 in 2023), rebuilt by
  // lib/derive/coalesce into a single transaction with three parties.
  const threeWay = trade(
    "fx-3team",
    [6, 7, 11],
    { p6: 6, p7: 7, p11: 11 },
    { p6: 7, p7: 11, p11: 6 },
  );
  const h = withTransactions(base, [threeWay]);
  const graph = buildTradeGraph(h);

  it("reads all three parties", () => {
    expect(tradeParties(threeWay)).toEqual([6, 7, 11]);
    const rec = graph.trades.find((t) => t.id === "fx-3team")!;
    expect(rec.parties).toEqual([6, 7, 11]);
    expect(rec.multiTeam).toBe(true);
    expect(rec.sides.length).toBe(3);
    expect(graph.multiTeamCount).toBe(1);
  });

  it("produces one edge per participating pair", () => {
    for (const key of ["6-7", "6-11", "7-11"]) {
      const e = graph.edges.find((x) => x.key === key);
      expect(e, `edge ${key} should exist`).toBeDefined();
      expect(e!.tradeIds).toContain("fx-3team");
    }
    // No pair is invented that wasn't in the deal.
    const touched = graph.edges.filter((e) => e.tradeIds.includes("fx-3team"));
    expect(touched.length).toBe(3);
  });

  it("still agrees with the dossier derivation on those weights", () => {
    expect(graph.weightsAgree).toBe(true);
  });

  it("counts a 3-team deal once per manager, not once per pair", () => {
    const rec = graph.trades.filter((t) => t.id === "fx-3team");
    expect(rec.length).toBe(1);
  });
});

describe("asset lineage", () => {
  const h = buildFixtureHistory();
  const moves = buildAssetMoves(h);
  const holdings = buildHoldings(h);
  const names: Record<number, string> = {};
  for (const n of buildTradeGraph(h).nodes) names[n.rosterId] = n.name;
  const ctx = { moves, holdings, names };

  it("records a move for every asset that changed hands in a trade", () => {
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      expect(m.from).not.toBe(m.to);
      expect(m.assetKey.startsWith("p:") || m.assetKey.startsWith("k:")).toBe(true);
      expect(m.label.length).toBeGreaterThan(0);
    }
    // Chronological.
    for (let i = 1; i < moves.length; i++) {
      expect(moves[i].created).toBeGreaterThanOrEqual(moves[i - 1].created);
    }
  });

  it("builds a tree rooted at the manager who gave the asset up", () => {
    const roots = rankTradeRoots(ctx);
    expect(roots.length).toBeGreaterThan(0);
    const top = roots[0];
    const tree = buildTradeTree(ctx, top.moveId)!;
    expect(tree).not.toBeNull();
    expect(tree.direction).toBe("out");
    expect(tree.from).toBe(top.owner);
    // Every child is something that came back to the same manager.
    for (const c of tree.children) expect(c.to).toBe(top.owner);
    // Every branch states an outcome rather than trailing off.
    const walk = (n: typeof tree): void => {
      expect(n.outcome).toBeTruthy();
      n.children.forEach(walk);
    };
    walk(tree);
  });

  it("respects the depth cap and is deterministic", () => {
    const roots = rankTradeRoots(ctx);
    const a = buildTradeTree({ ...ctx, maxDepth: 2 }, roots[0].moveId);
    const b = buildTradeTree({ ...ctx, maxDepth: 2 }, roots[0].moveId);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const depth = (n: typeof a): number =>
      n && n.children.length ? 1 + Math.max(...n.children.map(depth)) : 1;
    expect(depth(a)).toBeLessThanOrEqual(3);
  });

  it("returns null for an unknown root", () => {
    expect(buildTradeTree(ctx, "nope")).toBeNull();
  });
});

describe("abbreviate", () => {
  it("uses initials for multi-word names and letters for handles", () => {
    const taken = new Set<string>();
    expect(abbreviate("Sweet Home Wembanyama", taken)).toBe("SHW");
    expect(abbreviate("6-Month Plan", taken)).toBe("6MP");
    expect(abbreviate("mjrooney20", taken)).toBe("MJR");
  });

  it("breaks collisions deterministically", () => {
    const taken = new Set<string>();
    expect(abbreviate("Old Man Ball", taken)).toBe("OMB");
    expect(abbreviate("Odd Muddy Boots", taken)).toBe("OM2");
  });
});
