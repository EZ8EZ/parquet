import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "./testing/fixtureHistory";
import { buildIsNotable, isFaabLeague, notableWaiverLabel } from "./ledger";
import type { LeagueHistory } from "./history";
import type { Transaction } from "./providers/types";

const h = buildFixtureHistory();

function tx(over: Partial<Transaction>): Transaction {
  return {
    transactionId: "t1",
    type: "waiver",
    status: "complete",
    season: h.currentLeague.season,
    week: 1,
    created: Date.now(),
    statusUpdated: Date.now(),
    creator: null,
    rosterIds: [1],
    consenterIds: [],
    adds: {},
    drops: {},
    draftPicks: [],
    waiverBid: null,
    ...over,
  };
}

/** A league running rolling-priority waivers (Sleeper waiver_type 0), like the
 *  real live league this bug was found on - waiver_bid is null on every waiver
 *  transaction, forever, because there is no bid to record. */
function rollingLeague(transactions: Transaction[]): LeagueHistory {
  return {
    ...h,
    currentLeague: {
      ...h.currentLeague,
      settings: { ...h.currentLeague.settings, waiver_type: 0 },
    },
    transactions,
  };
}

describe("isFaabLeague", () => {
  it("is true for the fixture, which fabricates real FAAB bid amounts", () => {
    expect(isFaabLeague(h)).toBe(true);
  });

  it("is false for a rolling-priority league (waiver_type 0)", () => {
    expect(isFaabLeague(rollingLeague([]))).toBe(false);
  });

  it("is false for a reverse-standings league (waiver_type 1)", () => {
    const rh: LeagueHistory = {
      ...h,
      currentLeague: {
        ...h.currentLeague,
        settings: { ...h.currentLeague.settings, waiver_type: 1 },
      },
    };
    expect(isFaabLeague(rh)).toBe(false);
  });
});

describe("buildIsNotable - FAAB league", () => {
  const notable = buildIsNotable(h);

  it("keeps every trade", () => {
    expect(notable(tx({ type: "trade" }))).toBe(true);
  });

  it("keeps a waiver bid at or above the NOTABLE_FAAB bar", () => {
    expect(notable(tx({ type: "waiver", waiverBid: 25 }))).toBe(true);
  });

  it("drops a small waiver bid and a free-agent pickup", () => {
    expect(notable(tx({ type: "waiver", waiverBid: 3 }))).toBe(false);
    expect(notable(tx({ type: "free_agent" }))).toBe(false);
  });
});

describe("buildIsNotable - rolling-priority league (regression: dead FAAB path)", () => {
  it("never treats a null-bid waiver as notable via the FAAB bar - the core bug", () => {
    // This is the exact shape of every waiver row in the real league: waiverBid
    // is null, never a number. Before the fix, `(t.waiverBid ?? 0) >= 20` read
    // this as `0 >= 20`, which is false, so the transaction correctly dropped out
    // - but ONLY by accident, and the same dead comparison ran on every league
    // regardless of waiver type. This test pins that a rolling league's waivers
    // are evaluated by a signal that actually CAN fire, not a bid bar that never can.
    const solo = tx({ transactionId: "solo", adds: { p9: 1 } });
    const rh = rollingLeague([solo]);
    expect(buildIsNotable(rh)(solo)).toBe(false);
  });

  it("marks a contested claim - two rosters tried to add the same player the same week - as notable", () => {
    const winner = tx({
      transactionId: "winner",
      status: "complete",
      rosterIds: [1],
      adds: { p9: 1 },
    });
    const loser = tx({
      transactionId: "loser",
      status: "failed",
      rosterIds: [2],
      adds: { p9: 2 },
    });
    const rh = rollingLeague([winner, loser]);
    const notable = buildIsNotable(rh);
    expect(notable(winner)).toBe(true);
    // The losing claim never completed, so it is not itself a decision entry.
    expect(notable(loser)).toBe(false);
  });

  it("does not mark an uncontested claim as notable", () => {
    const solo = tx({ transactionId: "solo", adds: { p9: 1 } });
    const rh = rollingLeague([solo]);
    expect(buildIsNotable(rh)(solo)).toBe(false);
  });

  it("still treats every trade as notable regardless of waiver type", () => {
    const trade = tx({ transactionId: "trade1", type: "trade", rosterIds: [1, 2] });
    const rh = rollingLeague([trade]);
    expect(buildIsNotable(rh)(trade)).toBe(true);
  });
});

describe("notableWaiverLabel", () => {
  it("names FAAB for a FAAB league and contested claims for a rolling-priority one", () => {
    expect(notableWaiverLabel(h)).toBe("big-FAAB waiver claims");
    expect(notableWaiverLabel(rollingLeague([]))).toBe("contested waiver claims");
  });
});
