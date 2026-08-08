import { describe, expect, it } from "vitest";
import { coalesceCommissionerTrades } from "./coalesce";
import type { Transaction } from "../providers/types";

/**
 * These tests pin BOTH halves of D19: commissioner rows are stitched back into the
 * multi-team deal they really were, and the resulting deal is left without a pick
 * component rather than given a guessed one.
 */
function tx(over: Partial<Transaction> & Pick<Transaction, "transactionId">): Transaction {
  return {
    type: "commissioner",
    status: "complete",
    season: "2023",
    week: 1,
    created: 0,
    statusUpdated: 0,
    adds: {},
    drops: {},
    draftPicks: [],
    rosterIds: [],
    consenterIds: [],
    waiverBid: null,
    ...over,
  } as Transaction;
}

const HOUR = 60 * 60 * 1000;

/**
 * The real deal this module was written for (NSL Fantasy Hoops, 2023-07-03): four
 * commissioner rows that are one three-team trade between rosters 6, 7 and 11.
 */
const threeTeamRows = [
  tx({ transactionId: "a", created: 0, adds: { "1648": 6 }, drops: { "1648": 11 }, rosterIds: [6, 11] }),
  tx({ transactionId: "b", created: 60_000, adds: { "1974": 11 }, drops: { "1974": 6 }, rosterIds: [6, 11] }),
  tx({ transactionId: "c", created: 120_000, adds: { "1081": 7 }, drops: { "1081": 11 }, rosterIds: [7, 11] }),
  tx({ transactionId: "d", created: 180_000, adds: { "2012": 11 }, drops: { "2012": 7 }, rosterIds: [7, 11] }),
];

describe("coalesceCommissionerTrades", () => {
  it("stitches commissioner rows into one multi-team trade", () => {
    const { transactions, reconstructed } = coalesceCommissionerTrades(threeTeamRows);
    expect(reconstructed).toBe(1);
    expect(transactions).toHaveLength(1);
    const t = transactions[0];
    expect(t.type).toBe("trade");
    expect(t.rosterIds).toEqual([6, 7, 11]);
    expect(t.transactionId).toBe("coalesced-a+b+c+d");
    expect(Object.keys(t.adds).sort()).toEqual(["1081", "1648", "1974", "2012"]);
  });

  it("leaves one-way admin corrections alone", () => {
    // Two rows, but everything lands on roster 6: nothing came back, so this is a
    // roster fix and not a trade.
    const rows = [
      tx({ transactionId: "a", created: 0, adds: { "1": 6 }, drops: { "1": 11 }, rosterIds: [6, 11] }),
      tx({ transactionId: "b", created: 60_000, adds: { "2": 6 }, drops: { "2": 11 }, rosterIds: [6, 11] }),
    ];
    const { transactions, reconstructed } = coalesceCommissionerTrades(rows);
    expect(reconstructed).toBe(0);
    expect(transactions.map((t) => t.type)).toEqual(["commissioner", "commissioner"]);
  });

  it("does not join rows that are days apart", () => {
    const rows = [
      threeTeamRows[0],
      tx({ ...threeTeamRows[1], created: 48 * HOUR, statusUpdated: 48 * HOUR }),
    ];
    const { reconstructed } = coalesceCommissionerTrades(rows);
    expect(reconstructed).toBe(0);
  });

  it("does not join rows from different seasons", () => {
    const rows = [
      threeTeamRows[0],
      tx({ ...threeTeamRows[1], season: "2024" }),
    ];
    const { reconstructed } = coalesceCommissionerTrades(rows);
    expect(reconstructed).toBe(0);
  });

  /**
   * D19, the load-bearing half. A coalesced deal's pick component is UNRECOVERABLE,
   * and this module must not invent one. An `attachInferredPicks` that matched orphan
   * hops in the traded-picks snapshot to coalesced trades used to live here; measured
   * against the real league it hung six first-round picks across three draft classes
   * on the deal above, so it was deleted. Any future attempt fails this test.
   */
  it("gives the reconstructed trade NO picks - the pick record is gone, not guessed", () => {
    const { transactions } = coalesceCommissionerTrades(threeTeamRows);
    expect(transactions[0].draftPicks).toEqual([]);
  });

  it("keeps whatever picks the source rows really carried, and adds none", () => {
    const dp = {
      round: 1,
      season: "2024",
      rosterId: 6,
      ownerId: 11,
      previousOwnerId: 6,
    };
    const rows = [
      { ...threeTeamRows[0], draftPicks: [dp] },
      threeTeamRows[1],
      threeTeamRows[2],
      threeTeamRows[3],
    ];
    const { transactions } = coalesceCommissionerTrades(rows);
    expect(transactions[0].draftPicks).toEqual([dp]);
  });
});
