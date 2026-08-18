import { describe, expect, it } from "vitest";
import { annotation, buildFixtureHistory } from "../testing/fixtureHistory.js";
import { annotationKey } from "../history.js";
import { getPrincipals } from "../principals.js";
import { getStrategyReport } from "./index.js";
describe("revealed-vs-stated strategy engine", () => {
  it("detects the rebuild -> win-now contradiction from the fixture arc", () => {
    // Seed the SAME annotation the demo seed uses: 2022 rebuild statement.
    const ann = annotation(
      "fx-2022-rebuildA",
      "Full rebuild. Getting younger and stockpiling first-round picks. Not chasing wins for 2-3 years.",
      "rebuild",
    );
    const h = buildFixtureHistory(ann);
    const report = getStrategyReport(h);
    expect(report.contradictions.length).toBeGreaterThanOrEqual(1);
    const c = report.contradictions[0];
    expect(c.severity).toBe("high");
    expect(c.statedTransactionId).toBe("fx-2022-rebuildA");
    expect(c.revealedTransactionId).toBe("fx-2025-pivot");
    // The narrative should name the contradiction explicitly.
    expect(c.narrative.toLowerCase()).toContain("disagree");
    expect(report.headline).toMatch(/rebuild/i);
  });
  it("produces derived findings and a profile even without annotations", () => {
    const h = buildFixtureHistory();
    const report = getStrategyReport(h);
    expect(report.hasEnoughData).toBe(true);
    expect(report.profile.trades).toBeGreaterThan(0);
    expect(report.findings.length).toBeGreaterThan(0);
    // No stated postures -> no contradictions, but still a headline.
    expect(report.contradictions).toHaveLength(0);
    expect(report.headline.length).toBeGreaterThan(0);
  });
  it("tracks pick flow: you are a net first-round accumulator then spender", () => {
    const h = buildFixtureHistory();
    const report = getStrategyReport(h);
    // Rebuild acquired 2 firsts; pivot spent 2 firsts.
    expect(report.profile.picks.firstsAcquired).toBeGreaterThanOrEqual(2);
    expect(report.profile.picks.firstsSpent).toBeGreaterThanOrEqual(2);
  });
  it("computes an acquisition age trend across seasons", () => {
    const h = buildFixtureHistory();
    const report = getStrategyReport(h);
    expect(report.profile.acquisitions.ageBySeason.length).toBeGreaterThan(0);
    expect(report.profile.acquisitions.avgAge).not.toBeNull();
  });
});
/**
 * THE EXACT SHAPE OF THE BUG: a trade has two sides that share one transactionId.
 * Roster 1 (owner "u1") and roster 2 (owner "u2") are BOTH participants in the same
 * trade, and BOTH annotated it with their own reasoning. Before the fix, the
 * annotations map was keyed by transactionId alone, so whichever author's row
 * happened to be in the map got attributed to whoever the viewer currently was -
 * concretely, the owner's own captured reasoning rendered as if a different
 * manager had said it the moment "viewing as" switched teams.
 */
describe("annotation authorship — one trade, two authors, shared transactionId", () => {
  const SHARED_TX_ID = "t-shared-both-sides";
  function buildSharedTradeHistory() {
    const base = buildFixtureHistory();
    const trade = {
      transactionId: SHARED_TX_ID,
      type: "trade",
      status: "complete",
      season: base.currentLeague.season,
      week: 3,
      created: Date.now(),
      statusUpdated: Date.now(),
      creator: "u1",
      rosterIds: [1, 2],
      consenterIds: [1, 2],
      adds: { px: 1, py: 2 },
      drops: { px: 2, py: 1 },
      draftPicks: [],
    };
    const annotations = new Map([
      [
        annotationKey(SHARED_TX_ID, "u1"),
        {
          transactionId: SHARED_TX_ID,
          ownerId: "u1",
          reasoning:
            "OWNER-U1-ONLY: rebuilding, stockpiling picks for the future.",
          posture: "rebuild",
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
      ],
      [
        annotationKey(SHARED_TX_ID, "u2"),
        {
          transactionId: SHARED_TX_ID,
          ownerId: "u2",
          reasoning:
            "OWNER-U2-ONLY: also rebuilding, my own separate reasoning.",
          posture: "rebuild",
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
      ],
    ]);
    return {
      ...base,
      transactions: [...base.transactions, trade],
      annotations,
    };
  }
  it("viewing as roster 1 (owner u1) sees only u1's own annotation on the shared trade", () => {
    const h = buildSharedTradeHistory(); // default me: userId "u1", rosterId 1
    const report = getStrategyReport(h);
    const mine = report.statedPostures.filter(
      (sp) => sp.transactionId === SHARED_TX_ID,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].excerpt).toContain("OWNER-U1-ONLY");
    // The other participant's own reasoning must never surface as "my" stated posture.
    expect(
      report.statedPostures.some((sp) => sp.excerpt.includes("OWNER-U2-ONLY")),
    ).toBe(false);
  });
  it("viewing as roster 2 (owner u2) sees only u2's own annotation on the SAME shared trade", () => {
    const base = buildSharedTradeHistory();
    const h = {
      ...base,
      me: { userId: "u2", rosterId: 2, displayName: "u2", teamName: null },
    };
    const report = getStrategyReport(h);
    const theirs = report.statedPostures.filter(
      (sp) => sp.transactionId === SHARED_TX_ID,
    );
    expect(theirs).toHaveLength(1);
    expect(theirs[0].excerpt).toContain("OWNER-U2-ONLY");
    // The first participant's reasoning must never leak into the second's view,
    // even though it is the exact same transactionId.
    expect(
      report.statedPostures.some((sp) => sp.excerpt.includes("OWNER-U1-ONLY")),
    ).toBe(false);
  });
  it("a leaguemate's annotation on a trade the viewer had NO part in never surfaces at all", () => {
    // Defect 2, standalone: statedPostures must be built from the viewer's own
    // trades, not every transaction in the league corpus.
    const base = buildFixtureHistory();
    const othersTrade = {
      transactionId: "t-not-mine",
      type: "trade",
      status: "complete",
      season: base.currentLeague.season,
      week: 4,
      created: Date.now(),
      statusUpdated: Date.now(),
      creator: "u3",
      rosterIds: [3, 4],
      consenterIds: [3, 4],
      adds: { pa: 3, pb: 4 },
      drops: { pa: 4, pb: 3 },
      draftPicks: [],
    };
    const annotations = new Map([
      [
        annotationKey("t-not-mine", "u3"),
        {
          transactionId: "t-not-mine",
          ownerId: "u3",
          reasoning: "OWNER-U3-ONLY: rebuild statement on a trade I made.",
          posture: "rebuild",
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
      ],
    ]);
    const h = {
      ...base,
      transactions: [...base.transactions, othersTrade],
      annotations,
    };
    const report = getStrategyReport(h); // viewing as roster 1 (u1) by default
    expect(
      report.statedPostures.some((sp) => sp.transactionId === "t-not-mine"),
    ).toBe(false);
  });
});
/**
 * REGRESSION: the home page's "Revealed strategy" led with "TRADES MADE 22" for a
 * manager who made 4, and "PICK CAPITAL 0" against a real -9 - both from
 * `deriveManagerProfile` reading the WHOLE seat's history instead of the viewer's own
 * tenure. Roster 9 is the fixture's one succeeded seat: "BigTrades" (u9) made 18
 * trades across 2022-2024, "kdewitt4" (u15) has made 15 since 2025 - a seat-keyed read
 * of roster 9 today blends both into 33, which belongs to neither person.
 */
describe("getStrategyReport — the viewer's own tenure only, across a succession", () => {
  const h = buildFixtureHistory();
  const asSuccessor = () => ({
    ...h,
    me: {
      userId: "u15",
      rosterId: 9,
      displayName: "kdewitt4",
      teamName: "Second Wave",
    },
  });
  it("without a principals index, roster 9's report is still the old seat-keyed blend (reproducible)", () => {
    const report = getStrategyReport(asSuccessor());
    // The predecessor's own 18 trades are baked into this figure - not kdewitt4's.
    expect(report.profile.trades).toBeGreaterThan(15);
  });
  it("with the principals index, the successor's own report counts only their own trades", async () => {
    const principals = await getPrincipals(h);
    const report = getStrategyReport(asSuccessor(), principals);
    expect(report.profile.trades).toBe(15);
    // Strictly less than the blended, seat-keyed figure - proves scoping did
    // something rather than passing by coincidence.
    const unscoped = getStrategyReport(asSuccessor());
    expect(report.profile.trades).toBeLessThan(unscoped.profile.trades);
  });
  it("the departed predecessor's own report is confined to 2022-2024 the same way", async () => {
    const principals = await getPrincipals(h);
    const asPredecessor = {
      ...h,
      me: {
        userId: "u9",
        rosterId: 9,
        displayName: "BigTrades",
        teamName: "Blockbuster",
      },
    };
    const report = getStrategyReport(asPredecessor, principals);
    expect(report.profile.trades).toBe(18);
  });
});
