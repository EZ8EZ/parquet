import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "./testing/fixtureHistory.js";
import { dealHref } from "./tradegraph/url.js";
import {
  getAuditLog,
  getStaleRosters,
  STALE_DAYS_THRESHOLD,
} from "./commissioner.js";
const h = buildFixtureHistory();
function tx(over) {
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
describe("getAuditLog", () => {
  it("keeps trades and big-FAAB waivers, drops everything else - same bar as /ledger", () => {
    const withTxns = {
      ...h,
      transactions: [
        tx({ transactionId: "trade1", type: "trade", rosterIds: [1, 2] }),
        tx({ transactionId: "bigwaiver", type: "waiver", waiverBid: 25 }),
        tx({ transactionId: "smallwaiver", type: "waiver", waiverBid: 3 }),
        tx({ transactionId: "freeagent", type: "free_agent" }),
      ],
    };
    const log = getAuditLog(withTxns);
    expect(log.map((e) => e.transactionId).sort()).toEqual([
      "bigwaiver",
      "trade1",
    ]);
  });
  it("uses contested claims, not a dead FAAB bar, as the notability signal for a rolling-priority league", () => {
    // Regression for the round-6 finding: this league runs waiver_type 0
    // (rolling priority), so waiverBid is null on every real waiver row and the
    // old NOTABLE_FAAB >= 20 check could never fire. The audit log must fall
    // back to contested claims (two rosters adding the same player the same
    // week) instead of silently showing trades only.
    const rolling = {
      ...h,
      currentLeague: {
        ...h.currentLeague,
        settings: { ...h.currentLeague.settings, waiver_type: 0 },
      },
      transactions: [
        tx({ transactionId: "trade1", type: "trade", rosterIds: [1, 2] }),
        // Uncontested claim - real activity, but not notable.
        tx({
          transactionId: "solowaiver",
          type: "waiver",
          rosterIds: [3],
          adds: { p9: 3 },
        }),
        // Contested claim - two rosters wanted the same player the same week.
        tx({
          transactionId: "wonit",
          type: "waiver",
          status: "complete",
          rosterIds: [4],
          adds: { p10: 4 },
        }),
        tx({
          transactionId: "lostit",
          type: "waiver",
          status: "failed",
          rosterIds: [5],
          adds: { p10: 5 },
        }),
      ],
    };
    const log = getAuditLog(rolling);
    expect(log.map((e) => e.transactionId).sort()).toEqual(["trade1", "wonit"]);
  });
  it("gives trades a deep link to their own receipt and nothing else does", () => {
    const withTxns = {
      ...h,
      transactions: [
        tx({ transactionId: "trade1", type: "trade", rosterIds: [1, 2] }),
        tx({
          transactionId: "bigwaiver",
          type: "waiver",
          waiverBid: 25,
          rosterIds: [3],
        }),
      ],
    };
    const log = getAuditLog(withTxns);
    const trade = log.find((e) => e.transactionId === "trade1");
    const waiver = log.find((e) => e.transactionId === "bigwaiver");
    expect(trade.tradeHref).toBe(dealHref("trade1"));
    expect(trade.rosterId).toBeNull();
    expect(waiver.tradeHref).toBeNull();
    expect(waiver.rosterId).toBe(3);
    expect(waiver.rosterName).toBe(waiver.rosterName); // resolved, not null/blank
  });
  it("sorts newest first, tie-broken deterministically", () => {
    const withTxns = {
      ...h,
      transactions: [
        tx({
          transactionId: "old",
          type: "trade",
          rosterIds: [1, 2],
          created: 1000,
        }),
        tx({
          transactionId: "new",
          type: "trade",
          rosterIds: [1, 2],
          created: 2000,
        }),
      ],
    };
    const log = getAuditLog(withTxns);
    expect(log.map((e) => e.transactionId)).toEqual(["new", "old"]);
  });
});
function roster(over) {
  return {
    rosterId: 1,
    ownerId: "u1",
    coOwners: [],
    players: [],
    starters: [],
    reserve: [],
    taxi: [],
    settings: {
      wins: 0,
      losses: 0,
      ties: 0,
      fpts: 0,
      fptsAgainst: 0,
      ppts: 0,
      waiverBudgetUsed: 0,
      waiverPosition: 0,
      totalMoves: 0,
    },
    ...over,
  };
}
describe("getStaleRosters", () => {
  const slotCount = 7; // the fixture league's own lineup slots (see fragility.test.ts)
  const fullStarters = Array.from({ length: slotCount }, (_, i) => `p${i}`);
  it("flags a roster with unfilled starting slots by the real shortfall", () => {
    const withRosters = {
      ...h,
      rosters: [roster({ rosterId: 1, starters: fullStarters.slice(0, 5) })],
      transactions: [tx({ rosterIds: [1], created: Date.now() })],
    };
    const stale = getStaleRosters(withRosters);
    const r = stale.find((s) => s.rosterId === 1);
    expect(
      r.reasons.some(
        (x) => x.kind === "empty-lineup-slots" && x.detail.includes("2"),
      ),
    ).toBe(true);
  });
  it("does not flag a full lineup with a recent move", () => {
    const withRosters = {
      ...h,
      rosters: [roster({ rosterId: 1, starters: fullStarters })],
      transactions: [tx({ rosterIds: [1], created: Date.now() })],
    };
    const stale = getStaleRosters(withRosters);
    expect(stale.find((s) => s.rosterId === 1)).toBeUndefined();
  });
  it("flags a roster with no moves yet this season", () => {
    const withRosters = {
      ...h,
      rosters: [roster({ rosterId: 1, starters: fullStarters })],
      transactions: [],
    };
    const stale = getStaleRosters(withRosters);
    const r = stale.find((s) => s.rosterId === 1);
    expect(r.reasons).toEqual([
      { kind: "no-recent-moves", detail: "No moves yet this season" },
    ]);
  });
  it("flags a roster whose last move is past the threshold, and not one just under it", () => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const stalePast = {
      ...h,
      rosters: [roster({ rosterId: 1, starters: fullStarters })],
      transactions: [
        tx({
          rosterIds: [1],
          created: now - (STALE_DAYS_THRESHOLD + 1) * dayMs,
        }),
      ],
    };
    const recent = {
      ...h,
      rosters: [roster({ rosterId: 1, starters: fullStarters })],
      transactions: [
        tx({
          rosterIds: [1],
          created: now - (STALE_DAYS_THRESHOLD - 1) * dayMs,
        }),
      ],
    };
    expect(
      getStaleRosters(stalePast, { now }).find((s) => s.rosterId === 1),
    ).toBeDefined();
    expect(
      getStaleRosters(recent, { now }).find((s) => s.rosterId === 1),
    ).toBeUndefined();
  });
  it("ignores prior-season activity for the recency check", () => {
    const withRosters = {
      ...h,
      rosters: [roster({ rosterId: 1, starters: fullStarters })],
      transactions: [
        tx({ rosterIds: [1], created: Date.now(), season: "2019" }), // not this season
      ],
    };
    const stale = getStaleRosters(withRosters);
    const r = stale.find((s) => s.rosterId === 1);
    expect(r.reasons.some((x) => x.kind === "no-recent-moves")).toBe(true);
  });
  it("sorts rosters with more problems first", () => {
    const withRosters = {
      ...h,
      rosters: [
        roster({ rosterId: 1, starters: fullStarters.slice(0, 6) }), // one reason
        roster({ rosterId: 2, starters: [] }), // two reasons: empty slots + no moves
      ],
      // Roster 1 moved recently (so only the lineup gap counts against it); roster 2
      // never shows up here, so it also trips the "no moves yet" reason.
      transactions: [tx({ rosterIds: [1], created: Date.now() })],
    };
    const stale = getStaleRosters(withRosters);
    expect(stale[0].rosterId).toBe(2);
    expect(stale[0].reasons.length).toBeGreaterThan(stale[1].reasons.length);
  });
});
