import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import { getPrincipals } from "../principals";
import { annotationKey } from "../history";
import { buildCorpus } from "./index";
/**
 * The analyst corpus is fed straight into an LLM prompt (or the deterministic
 * fallback) as ground truth about "your own recorded reasoning". Leaking a trade
 * partner's own captured reasoning into that corpus is not just a wrong
 * attribution - it hands that partner's private words to the viewer, unscoped, on
 * every single question they ask. This pins the exact case D-defect-2 broke: one
 * trade, two participants, two independent annotations, one shared transactionId.
 */
describe("buildCorpus — annotation privacy", () => {
  const SHARED_TX_ID = "t-shared-analyst";
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
          reasoning: "OWNER-U1-SECRET-REASONING about this exact trade.",
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
          reasoning:
            "OWNER-U2-SECRET-REASONING that belongs to a different manager.",
          posture: "value",
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
  it("includes the viewer's own annotation but never a trade partner's, on the same transactionId", async () => {
    const h = buildSharedTradeHistory(); // default me: userId "u1"
    const principals = await getPrincipals(h);
    const corpus = buildCorpus(h, principals);
    expect(corpus).toContain("OWNER-U1-SECRET-REASONING");
    expect(corpus).not.toContain("OWNER-U2-SECRET-REASONING");
  });
  it("flips correctly when viewing as the other side of the exact same trade", async () => {
    const base = buildSharedTradeHistory();
    const h = {
      ...base,
      me: { userId: "u2", rosterId: 2, displayName: "u2", teamName: null },
    };
    const principals = await getPrincipals(h);
    const corpus = buildCorpus(h, principals);
    expect(corpus).toContain("OWNER-U2-SECRET-REASONING");
    expect(corpus).not.toContain("OWNER-U1-SECRET-REASONING");
  });
});
