import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import {
  describeTradeForRoster,
  describeTransaction,
  pickLabel,
  rosterName,
} from "./describe";
import type { DraftPickRef, Transaction } from "../providers/types";

const h = buildFixtureHistory();

function tx(over: Partial<Transaction>): Transaction {
  return {
    transactionId: "t-describe",
    type: "trade",
    status: "complete",
    season: h.currentLeague.season,
    week: 1,
    created: Date.now(),
    statusUpdated: Date.now(),
    creator: null,
    rosterIds: [1, 2],
    consenterIds: [1, 2],
    adds: {},
    drops: {},
    draftPicks: [],
    waiverBid: null,
    ...over,
  };
}

const pick = (over: Partial<DraftPickRef>): DraftPickRef => ({
  round: 3,
  season: "2027",
  rosterId: 1,
  ownerId: 1,
  previousOwnerId: 2,
  ...over,
});

describe("pickLabel", () => {
  it("renders season, ordinal round, and an origin when given one", () => {
    expect(pickLabel(pick({}))).toBe("2027 3rd");
    expect(pickLabel(pick({}), "Team X")).toBe("2027 3rd (via Team X)");
  });

  it("keeps the inferred flag after the origin", () => {
    expect(pickLabel(pick({ inferred: true }), "Team X")).toBe(
      "2027 3rd (via Team X) (inferred)",
    );
  });
});

describe("pick disambiguation in trade summaries", () => {
  // THE BUG: a trade moving two different picks that share a season and round
  // used to read "acquired the 2027 3rd for the 2027 3rd" - indistinguishable
  // from a no-op. Each side's foreign pick must be named by its origin.
  const t = tx({
    draftPicks: [
      // Roster 2's own natural 2027 3rd, sent to roster 1.
      pick({ rosterId: 2, previousOwnerId: 2, ownerId: 1 }),
      // Roster 1's own natural 2027 3rd, sent to roster 2.
      pick({ rosterId: 1, previousOwnerId: 1, ownerId: 2 }),
    ],
  });

  it("never describes a two-pick swap as the same asset both ways", () => {
    const s = describeTradeForRoster(h, t, 1);
    expect(s).toBe(
      `acquired the 2027 3rd (via ${rosterName(h, 2)}) for the 2027 3rd`,
    );
  });

  it("qualifies from each side's own perspective symmetrically", () => {
    const s = describeTradeForRoster(h, t, 2);
    expect(s).toBe(
      `acquired the 2027 3rd (via ${rosterName(h, 1)}) for the 2027 3rd`,
    );
  });

  it("keeps a side's own natural pick unqualified in the neutral summary", () => {
    // Each side sends its OWN pick, so neither needs an origin - the sender's
    // name in the sentence already is the origin.
    const s = describeTransaction(h, t);
    expect(s).toBe(
      `Trade - ${rosterName(h, 1)} sent the 2027 3rd; ${rosterName(h, 2)} sent the 2027 3rd`,
    );
  });

  it("names the origin when a side re-trades a pick it acquired", () => {
    // Roster 1 ships roster 5's natural pick onward to roster 2: both the giver
    // and the receiver see it as a foreign pick, so both label its origin.
    const onward = tx({
      draftPicks: [pick({ rosterId: 5, previousOwnerId: 1, ownerId: 2 })],
    });
    expect(describeTradeForRoster(h, onward, 2)).toBe(
      `acquired the 2027 3rd (via ${rosterName(h, 5)}) for nothing`,
    );
    expect(describeTradeForRoster(h, onward, 1)).toBe(
      `acquired nothing for the 2027 3rd (via ${rosterName(h, 5)})`,
    );
  });
});
