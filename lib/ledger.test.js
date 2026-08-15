import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "./testing/fixtureHistory";
import {
  buildIsNotable,
  getLedgerEntries,
  getLedgerSummary,
  isFaabLeague,
  newestToCapture,
  notableWaiverLabel,
} from "./ledger";
import { annotationKey } from "./history";
import { getPrincipals } from "./principals";
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
/** A league running rolling-priority waivers (Sleeper waiver_type 0), like the
 *  real live league this bug was found on - waiver_bid is null on every waiver
 *  transaction, forever, because there is no bid to record. */
function rollingLeague(transactions) {
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
    const rh = {
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
    const trade = tx({
      transactionId: "trade1",
      type: "trade",
      rosterIds: [1, 2],
    });
    const rh = rollingLeague([trade]);
    expect(buildIsNotable(rh)(trade)).toBe(true);
  });
});
describe("notableWaiverLabel", () => {
  it("names FAAB for a FAAB league and contested claims for a rolling-priority one", () => {
    expect(notableWaiverLabel(h)).toBe("big-FAAB waiver claims");
    expect(notableWaiverLabel(rollingLeague([]))).toBe(
      "contested waiver claims",
    );
  });
});
describe("getLedgerEntries — a trade partner's annotation must never appear as MY reasoning", () => {
  const SHARED_TX_ID = "t-shared-ledger";
  function sharedTrade() {
    return tx({
      transactionId: SHARED_TX_ID,
      type: "trade",
      rosterIds: [1, 2],
      adds: { px: 1, py: 2 },
      drops: { px: 2, py: 1 },
    });
  }
  function bothSidesAnnotated() {
    return new Map([
      [
        annotationKey(SHARED_TX_ID, "u1"),
        {
          transactionId: SHARED_TX_ID,
          ownerId: "u1",
          reasoning: "OWNER-U1-ONLY reasoning.",
          posture: "value",
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
      ],
      [
        annotationKey(SHARED_TX_ID, "u2"),
        {
          transactionId: SHARED_TX_ID,
          ownerId: "u2",
          reasoning: "OWNER-U2-ONLY reasoning.",
          posture: "value",
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
      ],
    ]);
  }
  it("shows the viewer's OWN annotation on a shared trade, not the partner's", () => {
    const h = {
      ...buildFixtureHistory(bothSidesAnnotated()),
      transactions: [sharedTrade()],
      me: { userId: "u1", rosterId: 1, displayName: "u1", teamName: null },
    };
    const entries = getLedgerEntries(h);
    const entry = entries.find((e) => e.transactionId === SHARED_TX_ID);
    expect(entry?.annotation?.reasoning).toBe("OWNER-U1-ONLY reasoning.");
  });
  it("switching the viewer to the OTHER side of the exact same transaction flips which annotation shows", () => {
    const h = {
      ...buildFixtureHistory(bothSidesAnnotated()),
      transactions: [sharedTrade()],
      me: { userId: "u2", rosterId: 2, displayName: "u2", teamName: null },
    };
    const entries = getLedgerEntries(h);
    const entry = entries.find((e) => e.transactionId === SHARED_TX_ID);
    expect(entry?.annotation?.reasoning).toBe("OWNER-U2-ONLY reasoning.");
  });
});
/**
 * REGRESSION: /ledger showed one manager 25 entries, 19 of them a predecessor's, each
 * captioned "You acquired ...". Roster 9 is the fixture's one succeeded seat (see
 * `SUCCESSION` in lib/providers/fixture/generate.ts): "BigTrades" (u9) ran it
 * 2022-2024, "kdewitt4" (u15) has run it since 2025. Every entry here is captioned in
 * the second person, addressed to whoever is viewing - so a seat-keyed ledger hands
 * the successor 51 of the predecessor's own transactions, worded as their own
 * decisions, the moment they load the page. `getLedgerEntries`/`getLedgerSummary`
 * take an optional `principals` index specifically to confine the read to the
 * viewer's own tenure - this pins that confinement against the fixture's real
 * succession rather than a hand-built one.
 */
describe("getLedgerEntries — confined to the viewer's own tenure across a succession", () => {
  const h = buildFixtureHistory();
  function asRoster9(userId, displayName) {
    return { ...h, me: { userId, rosterId: 9, displayName, teamName: null } };
  }
  it("without a principals index, a succeeded seat's ledger is still the OLD seat-keyed shape (the bug, reproducible)", () => {
    // No principals argument at all - the exact call shape every ledger reader made
    // before D22. Proves the fixture can still reproduce the bug when the fix is
    // skipped, so a revert of the `principals` plumbing would be caught here.
    const successor = asRoster9("u15", "kdewitt4");
    const entries = getLedgerEntries(successor);
    const seasons = new Set(entries.map((e) => e.season));
    // The predecessor's 2022-2024 transactions are still on roster 9's seat, so an
    // unscoped read of "roster 9's history" surfaces them regardless of who is
    // asking - that IS the bug this fixture exists to make visible.
    expect(seasons.has("2022")).toBe(true);
    expect(seasons.has("2023")).toBe(true);
  });
  it("with the principals index, the successor sees only their own 2025-2026 decisions", async () => {
    const principals = await getPrincipals(h);
    const successor = asRoster9("u15", "kdewitt4");
    const entries = getLedgerEntries(successor, principals);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(["2025", "2026"]).toContain(e.season);
    }
    // Scoped total must be strictly smaller than the seat's full, blended history -
    // otherwise the scoping had no effect and this test would pass by accident.
    const unscoped = getLedgerEntries(successor);
    expect(entries.length).toBeLessThan(unscoped.length);
  });
  it("the departed predecessor's own view is confined the same way, symmetrically", async () => {
    const principals = await getPrincipals(h);
    const predecessor = asRoster9("u9", "BigTrades");
    const entries = getLedgerEntries(predecessor, principals);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(["2022", "2023", "2024"]).toContain(e.season);
    }
  });
  it("getLedgerSummary's counts move with the same scoping, not just the entry list", async () => {
    const principals = await getPrincipals(h);
    const successor = asRoster9("u15", "kdewitt4");
    const scoped = getLedgerSummary(successor, principals);
    const unscoped = getLedgerSummary(successor);
    expect(scoped.total).toBeLessThan(unscoped.total);
  });
});
/**
 * THE DESK'S STATUS LINE USED TO BE A COUNTER THAT COULD ONLY GO UP.
 *
 * "29 to capture · 0/29 annotated", on the bottom of every screen, in the accent
 * colour, on every visit - because it counted every notable decision the seat had
 * ever made. A dynasty seat accumulates those forever and a two-season-old waiver
 * claim has no reasoning left to capture, so the figure never settled and the
 * chrome read as a standing accusation rather than a status. `recentUnannotated`
 * is the fix: the same set, windowed to the period a reader can still honestly
 * answer "why did I do that?" about. See lib/desk.ts rule 1b.
 */
describe("getLedgerSummary — recentUnannotated, the figure chrome is allowed to print", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 7, 10);
  function ledgerOf(transactions) {
    return getLedgerSummary({ ...h, transactions }, undefined, now);
  }
  it("counts only the uncaptured decisions inside the window", () => {
    const s = ledgerOf([
      tx({
        transactionId: "new",
        type: "trade",
        rosterIds: [1, 2],
        created: now - 2 * DAY,
      }),
      tx({
        transactionId: "old",
        type: "trade",
        rosterIds: [1, 2],
        created: now - 400 * DAY,
      }),
    ]);
    expect(s.unannotatedNotable).toBe(2);
    expect(s.recentUnannotated).toBe(1);
  });
  it("settles to zero once nothing recent is outstanding, while the backlog stands", () => {
    // The whole point. A seat with a long unwritten history and a quiet month is
    // CAUGHT UP as far as the every-screen chrome is concerned, and lib/desk.ts
    // falls through to the record line - the zero state being the goal state.
    const s = ledgerOf([
      tx({
        transactionId: "a",
        type: "trade",
        rosterIds: [1, 2],
        created: now - 90 * DAY,
      }),
      tx({
        transactionId: "b",
        type: "trade",
        rosterIds: [1, 2],
        created: now - 91 * DAY,
      }),
    ]);
    expect(s.unannotatedNotable).toBe(2);
    expect(s.recentUnannotated).toBe(0);
  });
  it("never exceeds the full backlog it is a subset of", () => {
    // Pinned as an invariant rather than a value: the two figures render together
    // (Home's badge and the Desk's line), and a window wider than the population
    // would put a bigger number in the smaller claim.
    const s = getLedgerSummary(h, undefined, now);
    expect(s.recentUnannotated).toBeLessThanOrEqual(s.unannotatedNotable);
  });
  it("drops a decision out of the window as soon as it is captured", () => {
    const recent = tx({
      transactionId: "recent-trade",
      type: "trade",
      rosterIds: [1, 2],
      created: now - DAY,
    });
    const annotation = {
      transactionId: recent.transactionId,
      ownerId: h.me.userId,
      reasoning: "Because the window is 2031 and he is 31.",
      posture: null,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
    const before = ledgerOf([recent]);
    expect(before.recentUnannotated).toBe(1);
    const after = getLedgerSummary(
      {
        ...h,
        transactions: [recent],
        annotations: new Map([
          [annotationKey(recent.transactionId, h.me.userId), annotation],
        ]),
      },
      undefined,
      now,
    );
    expect(after.recentUnannotated).toBe(0);
  });
});
/**
 * THE PINNED CARD. `/ledger` opens exactly one editor now - the newest notable
 * decision with no reasoning on it - and everything else is a shut summary row. Which
 * one gets pinned is therefore the page's whole first impression, and it is the one
 * piece of that redesign that can be wrong without looking wrong.
 */
describe("newestToCapture", () => {
  const base = buildFixtureHistory();
  const entry = (over) => ({
    transactionId: "x",
    season: "2025",
    week: 1,
    created: 1_000,
    type: "trade",
    notable: true,
    description: "You did a thing",
    annotation: null,
    ...over,
  });
  const note = (reasoning) => ({
    transactionId: "x",
    ownerId: "u1",
    reasoning,
    posture: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });
  it("picks the most recent notable entry with nothing captured on it", () => {
    const picked = newestToCapture([
      entry({ transactionId: "old", created: 100 }),
      entry({ transactionId: "new", created: 900 }),
      entry({ transactionId: "middle", created: 500 }),
    ]);
    expect(picked?.transactionId).toBe("new");
  });
  it("skips an entry that already has reasoning, however recent it is", () => {
    const picked = newestToCapture([
      entry({
        transactionId: "newest",
        created: 900,
        annotation: note("said already"),
      }),
      entry({ transactionId: "next", created: 800 }),
    ]);
    expect(picked?.transactionId).toBe("next");
  });
  it("skips an unremarkable move - the ledger only ever asks about notable ones", () => {
    const picked = newestToCapture([
      entry({ transactionId: "routine", created: 900, notable: false }),
      entry({ transactionId: "trade", created: 800 }),
    ]);
    expect(picked?.transactionId).toBe("trade");
  });
  it("returns null when there is nothing left to ask for", () => {
    expect(newestToCapture([])).toBeNull();
    expect(
      newestToCapture([entry({ created: 900, annotation: note("done") })]),
    ).toBeNull();
    expect(
      newestToCapture([entry({ created: 900, notable: false })]),
    ).toBeNull();
  });
  it("does not depend on the array arriving sorted", () => {
    const picked = newestToCapture([
      entry({ transactionId: "a", created: 10 }),
      entry({ transactionId: "z", created: 999 }),
      entry({ transactionId: "m", created: 400 }),
    ]);
    expect(picked?.transactionId).toBe("z");
  });
  it("agrees with the page's own count: pinning one leaves the summary's total minus one", () => {
    const entries = getLedgerEntries(base);
    const summary = getLedgerSummary(base);
    const picked = newestToCapture(entries);
    expect(picked).not.toBeNull();
    expect(picked.notable).toBe(true);
    expect(picked.annotation).toBeNull();
    // Every other entry the ledger would print as "to capture" is a row below it.
    const rest = entries.filter(
      (e) =>
        e.notable && !e.annotation && e.transactionId !== picked.transactionId,
    );
    expect(rest.length).toBe(summary.unannotatedNotable - 1);
    // And it really is the newest of them, against real corpus timestamps.
    for (const e of rest) expect(e.created).toBeLessThanOrEqual(picked.created);
  });
});
