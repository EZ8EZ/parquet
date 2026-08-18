import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory.js";
import { getPrincipals } from "../principals.js";
import {
  buildAssetMoves,
  buildTradeLedger,
  dealPieces,
  pairEdgeKey,
  pairMatrix,
} from "./index.js";
/**
 * The deal INDEX's contract, which is a different contract from the receipt's.
 *
 * The index used to print every trade as full two-sided prose and was 17,499px tall
 * at 390px; it now prints one row per deal and the prose lives only on
 * `/deals/[transactionId]`. The thing that must not quietly change when a list gets
 * shorter is how MANY things are in it - a row that renders nothing looks exactly
 * like a row that was never built. So: every trade in the ledger is still a record,
 * and every record can still say how big it was.
 */
const h = buildFixtureHistory();
describe("dealPieces", () => {
  it("names both kinds, and pluralises each independently", async () => {
    expect(dealPieces({ players: 3, picks: 2 })).toBe("3 players, 2 picks");
    expect(dealPieces({ players: 1, picks: 1 })).toBe("1 player, 1 pick");
  });
  it("omits a kind that did not move rather than printing a zero", () => {
    expect(dealPieces({ players: 2, picks: 0 })).toBe("2 players");
    expect(dealPieces({ players: 0, picks: 4 })).toBe("4 picks");
  });
  it("says so out loud when the record is empty, instead of rendering blank", () => {
    expect(dealPieces({ players: 0, picks: 0 })).toBe("nothing on record");
  });
});
describe("buildAssetMoves: party count", () => {
  it("carries the trade's own party count onto every asset it moved, players and picks alike", async () => {
    const principals = await getPrincipals(h);
    // The fixture's `recordTrade` only ever builds two-team trades (see
    // lib/providers/fixture/generate.ts), so this pins the fixture's own baseline -
    // every move it produces is a 2-party trade - and a hand-built three-team
    // transaction, since that shape is verified on the real league (two 3-team
    // deals) but the fixture cannot produce one for an integration-level check.
    const moves = buildAssetMoves(h, principals);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.parties === 2)).toBe(true);
    const threeTeam = {
      transactionId: "t3",
      type: "trade",
      season: "2024",
      week: 1,
      created: 1,
      adds: { p1: 2, p2: 3 },
      drops: { p1: 1, p2: 2 },
      draftPicks: [
        { season: "2025", round: 1, rosterId: 3, previousOwnerId: 3, ownerId: 1 },
      ],
      rosterIds: [1, 2, 3],
    };
    const hRaw = {
      ...h,
      transactions: [threeTeam],
      players: new Map(),
    };
    const m3 = buildAssetMoves(hRaw, principals);
    expect(m3.length).toBe(3);
    expect(m3.every((m) => m.parties === 3)).toBe(true);
  });
});
describe("pairMatrix", () => {
  const managers = [
    { ownerId: "u1", name: "Charlie", isMe: false },
    { ownerId: "u2", name: "Alpha", isMe: true },
    { ownerId: "u3", name: "Bravo", isMe: false },
  ];
  it("covers every possible pair exactly once, C(n,2)", () => {
    const matrix = pairMatrix(managers, []);
    expect(matrix.cells).toHaveLength(3); // C(3,2)
    expect(matrix.possible).toBe(3);
    expect(matrix.traded).toBe(0);
    expect(matrix.never).toBe(3);
  });
  it("orders alphabetically by name, never by trade count or anything ranked", () => {
    const matrix = pairMatrix(managers, []);
    expect(matrix.order.map((m) => m.name)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });
  it("marks a pair traded from `pairings` and reports no magnitude beyond that fact", () => {
    const key = pairEdgeKey("u1", "u3"); // Charlie <-> Bravo
    const matrix = pairMatrix(managers, [
      { key, dealCount: 7 },
    ]);
    const cell = matrix.cells.find(
      (c) =>
        (c.a.ownerId === "u1" && c.b.ownerId === "u3") ||
        (c.a.ownerId === "u3" && c.b.ownerId === "u1"),
    );
    expect(cell.traded).toBe(true);
    expect(matrix.traded).toBe(1);
    expect(matrix.never).toBe(2);
  });
});
describe("the deal index", () => {
  it("still carries one record per trade in the corpus", async () => {
    const principals = await getPrincipals(h);
    const ledger = buildTradeLedger(h, principals);
    const trades = h.transactions.filter((t) => t.type === "trade");
    expect(trades.length).toBeGreaterThan(0);
    // `totalTrades` is the figure the page prints as "Deals on record", and the rows
    // are `ledger.trades`. The bug this guards is the two disagreeing.
    expect(ledger.totalTrades).toBe(trades.length);
    expect(ledger.trades).toHaveLength(trades.length);
    expect(new Set(ledger.trades.map((t) => t.id)).size).toBe(trades.length);
  });
  it("counts what moved in each deal from the transaction itself", async () => {
    const principals = await getPrincipals(h);
    const ledger = buildTradeLedger(h, principals);
    for (const rec of ledger.trades) {
      const tx = h.transactions.find((t) => t.transactionId === rec.id);
      expect(rec.assets.players).toBe(Object.keys(tx.adds).length);
      expect(rec.assets.picks).toBe(tx.draftPicks.length);
    }
    // A fixture trade is never empty, so no row falls back to "nothing on record".
    expect(
      ledger.trades.every((t) => t.assets.players + t.assets.picks > 0),
    ).toBe(true);
  });
  it("keeps every row addressable, newest first", async () => {
    const principals = await getPrincipals(h);
    const ledger = buildTradeLedger(h, principals);
    const created = ledger.trades.map((t) => t.created);
    expect([...created].sort((a, b) => b - a)).toEqual(created);
    // The row is a link to the receipt and nothing else now carries the prose, so an
    // id that cannot round-trip is a deal the reader can no longer read at all.
    for (const t of ledger.trades) {
      expect(t.id).toBeTruthy();
      expect(t.sides.length).toBeGreaterThan(1);
    }
  });
});
