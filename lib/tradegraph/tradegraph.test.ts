import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import { deriveManagerProfile } from "../derive/manager";
import { buildPrincipals, type PrincipalIndex } from "../principals";
import type { LeagueHistory } from "../history";
import type { LeagueUser, Roster, Transaction } from "../providers/types";
import {
  RING,
  abbreviate,
  buildAssetMoves,
  buildHoldings,
  buildTradeGraph,
  buildTradeTree,
  pairEdgeKey,
  playerKey,
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
  season = "2024",
  week = 5,
): Transaction {
  return {
    transactionId: id,
    type: "trade",
    status: "complete",
    season,
    week,
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

/**
 * A `PrincipalIndex` for a history where nothing has changed hands - every roster's
 * current owner is treated as having held it every season in the chain. This is what
 * every league looked like before principals existed, and it is the baseline the
 * "no handover" tests prove stays byte-identical.
 */
function principalsFor(h: LeagueHistory): PrincipalIndex {
  const users = new Map<string, LeagueUser>(h.usersById);
  return buildPrincipals(
    h.chain.map((l) => ({
      season: l.season,
      owners: new Map(
        h.rosters
          .filter((r) => !!r.ownerId)
          .map((r) => [r.rosterId, r.ownerId as string]),
      ),
      users,
    })),
    h.rosters as Roster[],
    users,
  );
}

/**
 * A `PrincipalIndex` simulating one roster changing hands mid-history: `rosterId`
 * is held by `departedOwnerId` for every season before `handoverSeason`, and by its
 * real current owner from `handoverSeason` on - mirroring roster 11 in the live
 * league (NSLKB through 2024, kdewitt4 from 2025). Every other roster is left alone.
 */
function principalsWithHandover(
  h: LeagueHistory,
  rosterId: number,
  handoverSeason: string,
  departedOwnerId: string,
  departedName: string,
): PrincipalIndex {
  const currentUsers = new Map<string, LeagueUser>(h.usersById);
  const departedUser: LeagueUser = {
    userId: departedOwnerId,
    displayName: departedName,
    avatar: null,
    teamName: null,
    teamLogoUrl: null,
    isOwner: false,
    isBot: false,
  };
  const seasonsAsc = h.chain.map((l) => {
    const preHandover = l.season < handoverSeason;
    const owners = new Map(
      h.rosters
        .filter((r) => !!r.ownerId)
        .map((r) => [
          r.rosterId,
          r.rosterId === rosterId && preHandover
            ? departedOwnerId
            : (r.ownerId as string),
        ]),
    );
    const users = preHandover
      ? new Map([...currentUsers, [departedOwnerId, departedUser]])
      : currentUsers;
    return { season: l.season, owners, users };
  });
  return buildPrincipals(seasonsAsc, h.rosters as Roster[], currentUsers);
}

describe("trade graph", () => {
  const h = buildFixtureHistory();
  const principals = principalsFor(h);
  const graph = buildTradeGraph(h, principals);

  it("has one node per principal, positioned on the ring", () => {
    // Nothing has changed hands in the plain fixture, so one principal per roster.
    expect(graph.nodes.length).toBe(h.rosters.length);
    for (const n of graph.nodes) {
      const d = Math.hypot(n.x - RING.cx, n.y - RING.cy);
      expect(d).toBeCloseTo(RING.r, 1);
    }
    // Node ids are the roster ids, exactly once each, since every principal here is
    // the sole, current occupant of their seat.
    const ids = graph.nodes.map((n) => n.rosterId).sort((a, b) => a - b);
    expect(ids).toEqual(h.rosters.map((r) => r.rosterId).sort((a, b) => a - b));
    const ownerIds = new Set(graph.nodes.map((n) => n.ownerId));
    expect(ownerIds.size).toBe(graph.nodes.length);
    for (const n of graph.nodes) expect(n.isFormer).toBe(false);
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
    expect(me[0].ownerId).toBe(h.me.userId);
  });

  it("builds one undirected edge per trading pair, no self loops", () => {
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeLessThanOrEqual(graph.possiblePairs);
    const keys = new Set<string>();
    for (const e of graph.edges) {
      expect(e.a < e.b).toBe(true);
      expect(e.key).toBe(`${e.a}-${e.b}`);
      expect(keys.has(e.key)).toBe(false);
      keys.add(e.key);
      expect(e.count).toBeGreaterThan(0);
      expect(e.tradeIds.length).toBe(e.count);
    }
  });

  it("agrees with the dossier derivation on edge weights", () => {
    expect(graph.weightsAgree).toBe(true);
    const rosterOf = new Map(graph.nodes.map((n) => [n.ownerId, n.rosterId]));
    for (const e of graph.edges) {
      const p = deriveManagerProfile(h, rosterOf.get(e.a)!);
      const found = p.tradePartners.find((t) => t.rosterId === rosterOf.get(e.b));
      expect(found?.count).toBe(e.count);
    }
  });

  it("counts every trade exactly once", () => {
    const trades = h.transactions.filter((t) => t.type === "trade");
    expect(graph.totalTrades).toBe(trades.length);
    expect(graph.trades.length).toBe(trades.length);
  });

  it("is deterministic across two calls", () => {
    const fresh = buildFixtureHistory();
    const again = buildTradeGraph(fresh, principalsFor(fresh));
    expect(JSON.stringify(again)).toBe(JSON.stringify(graph));
    // And the layout specifically, since that is the part with a search in it.
    expect(again.nodes.map((n) => [n.ownerId, n.x, n.y])).toEqual(
      graph.nodes.map((n) => [n.ownerId, n.x, n.y]),
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
  const principals = principalsFor(base);
  // A real one exists in the live league (rosters 6, 7 and 11 in 2023), rebuilt by
  // lib/derive/coalesce into a single transaction with three parties.
  const threeWay = trade(
    "fx-3team",
    [6, 7, 11],
    { p6: 6, p7: 7, p11: 11 },
    { p6: 7, p7: 11, p11: 6 },
  );
  const h = withTransactions(base, [threeWay]);
  const graph = buildTradeGraph(h, principals);

  it("reads all three parties", () => {
    expect(tradeParties(threeWay)).toEqual([6, 7, 11]);
    const rec = graph.trades.find((t) => t.id === "fx-3team")!;
    expect(rec.parties).toEqual([6, 7, 11]);
    expect(rec.ownerParties.length).toBe(3);
    expect(rec.multiTeam).toBe(true);
    expect(rec.sides.length).toBe(3);
    expect(graph.multiTeamCount).toBe(1);
  });

  it("produces one edge per participating pair", () => {
    const ownerOf = (rid: number) => h.rostersById.get(rid)!.ownerId!;
    const pairs: [string, string][] = [
      [ownerOf(6), ownerOf(7)],
      [ownerOf(6), ownerOf(11)],
      [ownerOf(7), ownerOf(11)],
    ];
    for (const [x, y] of pairs) {
      const key = x < y ? `${x}-${y}` : `${y}-${x}`;
      const e = graph.edges.find((edge) => edge.key === key);
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
  const principals = principalsFor(h);
  const moves = buildAssetMoves(h, principals);
  const holdings = buildHoldings(h);
  const graph = buildTradeGraph(h, principals);
  const names: Record<number, string> = {};
  const ownerNames: Record<string, string> = {};
  for (const n of graph.nodes) {
    names[n.rosterId] = n.name;
    ownerNames[n.ownerId] = n.name;
  }
  const ctx = { moves, holdings, names, ownerNames };

  it("records a move for every asset that changed hands in a trade", () => {
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      expect(m.from).not.toBe(m.to);
      expect(m.assetKey.startsWith("p:") || m.assetKey.startsWith("k:")).toBe(true);
      expect(m.label.length).toBeGreaterThan(0);
      // A stable, no-handover fixture resolves an owner for every hop.
      expect(m.fromOwnerId).not.toBeNull();
      expect(m.toOwnerId).not.toBeNull();
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
    expect(tree.fromOwnerId).toBe(top.ownerId);
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

describe("pairEdgeKey", () => {
  it("gives a pair one key however the two sides are named", () => {
    expect(pairEdgeKey("111", "222")).toBe("111-222");
    expect(pairEdgeKey("222", "111")).toBe("111-222");
  });

  it("sorts lexicographically, not numerically - the keys real ids produce", () => {
    // Platform owner ids are 18-digit strings and are compared as strings everywhere
    // in this module. Pinned because a "helpful" numeric sort here would silently stop
    // matching the keys already sitting in shared URLs.
    expect(pairEdgeKey("882785740399087616", "882695796544577536")).toBe(
      "882695796544577536-882785740399087616",
    );
  });

  it("agrees with the keys buildTradeGraph actually emits", () => {
    const h = buildFixtureHistory();
    const graph = buildTradeGraph(h, principalsFor(h));
    expect(graph.edges.length).toBeGreaterThan(0);
    for (const e of graph.edges) {
      expect(pairEdgeKey(e.a, e.b)).toBe(e.key);
      expect(pairEdgeKey(e.b, e.a)).toBe(e.key);
    }
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

/**
 * THE LOAD-BEARING SCENARIO. Roster 11 in the live league was run by one manager
 * through 2024 and a different one from 2025 on (see lib/principals.ts) - the trade
 * web has to split that seat's history across the two of them instead of crediting
 * every trade it was ever part of to whoever holds it today. This is the exact trap
 * this session has already hit twice: a scoping change that looks right for the
 * handover case but silently changes behaviour for the thirteen rosters that never
 * changed hands.
 */
describe("principal-scoped attribution across a roster handover", () => {
  const ROSTER = 11;
  const HANDOVER_SEASON = "2025";
  const DEPARTED_ID = "dep11";
  const DEPARTED_NAME = "Departed Eleven";
  const COUNTERPART_ROSTER = 3;

  const base = buildFixtureHistory();
  const CURRENT_ID = base.rostersById.get(ROSTER)!.ownerId!;
  const CURRENT_NAME = base.usersById.get(CURRENT_ID)!.displayName;
  const COUNTERPART_ID = base.rostersById.get(COUNTERPART_ROSTER)!.ownerId!;

  // One trade before the handover, one after, both between the same two seats - so
  // the only thing that can explain two different edges is the handover itself.
  const preTrade = trade(
    "fx-pre-handover",
    [COUNTERPART_ROSTER, ROSTER],
    { pA: ROSTER, pQ: COUNTERPART_ROSTER },
    { pA: COUNTERPART_ROSTER, pQ: ROSTER },
    1_650_000_000_000,
    "2023",
  );
  // The SAME asset (pQ) comes back the other way after the handover - one chain
  // spanning the boundary, which is what the tree test below walks.
  const postTrade = trade(
    "fx-post-handover",
    [COUNTERPART_ROSTER, ROSTER],
    { pQ: ROSTER, pR: COUNTERPART_ROSTER },
    { pQ: COUNTERPART_ROSTER, pR: ROSTER },
    1_750_000_000_000,
    "2025",
  );
  const h = withTransactions(base, [preTrade, postTrade]);
  const principals = principalsWithHandover(
    h,
    ROSTER,
    HANDOVER_SEASON,
    DEPARTED_ID,
    DEPARTED_NAME,
  );
  const graph = buildTradeGraph(h, principals);

  it("produces one extra node for the departed principal", () => {
    const noHandoverGraph = buildTradeGraph(h, principalsFor(h));
    expect(graph.nodes.length).toBe(noHandoverGraph.nodes.length + 1);

    const departed = graph.nodes.find((n) => n.ownerId === DEPARTED_ID);
    expect(departed).toBeDefined();
    expect(departed!.isFormer).toBe(true);
    expect(departed!.rosterId).toBe(ROSTER);
    expect(departed!.tenureLabel).toBe("2022-2024");

    const current = graph.nodes.find((n) => n.ownerId === CURRENT_ID);
    expect(current).toBeDefined();
    expect(current!.isFormer).toBe(false);
    expect(current!.rosterId).toBe(ROSTER);
    expect(current!.tenureLabel).toBeUndefined();
  });

  it("attributes the pre-handover trade to the departed principal and the post-handover trade to the successor, without blending them into one edge", () => {
    const edgeOf = (ownerId: string) =>
      graph.edges.find(
        (e) =>
          (e.a === ownerId && e.b === COUNTERPART_ID) ||
          (e.b === ownerId && e.a === COUNTERPART_ID),
      );
    const toDeparted = edgeOf(DEPARTED_ID)!;
    const toCurrent = edgeOf(CURRENT_ID)!;

    expect(toDeparted).toBeDefined();
    expect(toCurrent).toBeDefined();
    expect(toDeparted.key).not.toBe(toCurrent.key);

    expect(toDeparted.tradeIds).toContain("fx-pre-handover");
    expect(toDeparted.tradeIds).not.toContain("fx-post-handover");
    expect(toCurrent.tradeIds).toContain("fx-post-handover");
    expect(toCurrent.tradeIds).not.toContain("fx-pre-handover");

    // Every season on the departed manager's edge predates the handover, and every
    // season on the successor's edge is at or after it.
    for (const s of toDeparted.seasons) expect(s < HANDOVER_SEASON).toBe(true);
    for (const s of toCurrent.seasons) expect(s >= HANDOVER_SEASON).toBe(true);
  });

  it("gives each principal only their own tenure's trade count, not the roster's blended total", () => {
    const departed = graph.nodes.find((n) => n.ownerId === DEPARTED_ID)!;
    const current = graph.nodes.find((n) => n.ownerId === CURRENT_ID)!;
    // The unscoped derivation blends every trade this seat was ever part of under
    // whoever holds it today - the exact number a roster-keyed graph would have
    // shown both of them.
    const blended = deriveManagerProfile(h, ROSTER);

    expect(departed.trades).toBeGreaterThan(0);
    expect(current.trades).toBeGreaterThan(0);
    expect(departed.trades + current.trades).toBe(blended.trades);
    expect(departed.trades).toBeLessThan(blended.trades);
    expect(current.trades).toBeLessThan(blended.trades);
  });

  it("names the correct manager at each hop of a tree that spans the handover", () => {
    const moves = buildAssetMoves(h, principals);
    const holdings = buildHoldings(h);
    const names: Record<number, string> = {};
    const ownerNames: Record<string, string> = {};
    for (const pr of principals.principals) {
      ownerNames[pr.ownerId] = pr.displayName;
      if (!pr.isFormer) names[pr.currentRosterId!] = pr.displayName;
    }
    const ctx = { moves, holdings, names, ownerNames };

    const root = moves.find(
      (m) => m.tradeId === "fx-pre-handover" && m.assetKey === playerKey("pA"),
    )!;
    const tree = buildTradeTree(ctx, root.id)!;

    // The root hop (2023, pre-handover): sent TO roster 11, which the departed
    // manager held at the time.
    expect(tree.toOwnerId).toBe(DEPARTED_ID);
    expect(tree.outcome).toContain(DEPARTED_NAME);
    expect(tree.outcome).not.toContain(CURRENT_NAME);

    // pQ came back to the counterpart in the same (2023) trade, then was sent back
    // OUT to roster 11 again in the 2025 trade - now held by the successor.
    const pQReturn = tree.children.find((c) => c.assetKey === playerKey("pQ"))!;
    expect(pQReturn).toBeDefined();
    expect(pQReturn.outcome).toContain("2025");
    expect(pQReturn.outcome).toContain(CURRENT_NAME);
    expect(pQReturn.outcome).not.toContain(DEPARTED_NAME);

    // And the grandchild hop itself is stamped with the successor's owner id, not
    // whoever held the seat when the asset first left.
    const pQFlip = pQReturn.children[0];
    expect(pQFlip).toBeDefined();
    expect(pQFlip.fromOwnerId).toBe(CURRENT_ID);
  });

  it("stays byte-identical to the roster-keyed shape when nothing has changed hands", () => {
    const stable = principalsFor(h);
    const a = buildTradeGraph(h, stable);
    const b = buildTradeGraph(h, stable);
    expect(a.nodes.length).toBe(h.rosters.length);
    expect(a.weightsAgree).toBe(true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Nobody is former, nobody carries a tenure label, and every node's rosterId is
    // still a straightforward, unique roster id.
    for (const n of a.nodes) {
      expect(n.isFormer).toBe(false);
      expect(n.tenureLabel).toBeUndefined();
    }
  });
});
