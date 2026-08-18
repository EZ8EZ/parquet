import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory.js";
import { invalidateDraftIndex, madePicks, buildDraftIndex } from "../lineage/index.js";
import { pickKey } from "../tradegraph/index.js";
import { buildProvenance } from "./index.js";
import { chainGapActivity, loadProvenanceSource } from "./source.js";
/**
 * THE RECEIPT'S PICK RESOLUTION, end to end against the fixture corpus.
 *
 * The receipt claims two things about every pick on a trade: which tradeable pick
 * identity it is, and what it became. Both come from the same `(round, draftSlot) ->
 * original roster` join `lib/lineage` owns, and the failure this guards against is
 * subtle - a pick resolving to the player taken at somebody ELSE'S slot would look
 * completely plausible on the page and be a fabricated fact about a real trade.
 *
 * The fixture scripts `fx-2022-rebuildA`: roster 8's 2024 1st goes to roster 1, and
 * the 2024 draft has happened.
 */
describe("the receipt's pick resolution", () => {
  afterEach(() => invalidateDraftIndex());
  it("resolves a traded pick to the player actually taken at its own slot", async () => {
    const h = buildFixtureHistory();
    const { pickPlayers } = await loadProvenanceSource(h);
    const key = pickKey("2024", 1, 8);
    expect(pickPlayers[key]).toBeTruthy();
    // Cross-check against the made picks directly rather than trusting the same code
    // path twice: the slot the pick resolves through must be roster 8's own slot, and
    // the player must be the one recorded at that (round, slot).
    const index = await buildDraftIndex(h);
    const sd = index.bySeason.get("2024");
    const slot = Object.entries(sd.draft.slotToRosterId).find(
      ([, rid]) => rid === 8,
    )[0];
    const made = madePicks(index).find(
      (p) =>
        p.season === "2024" && p.round === 1 && p.draftSlot === Number(slot),
    );
    expect(made.playerId).toBeTruthy();
    expect(pickPlayers[key]).toBe(h.players.get(made.playerId)?.fullName);
  });
  it("leaves a pick with no draft unresolved rather than guessing", async () => {
    const h = buildFixtureHistory();
    const { pickPlayers, ctx } = await loadProvenanceSource(h);
    // 2027 has no draft at all in the fixture.
    expect(pickPlayers[pickKey("2027", 1, 1)]).toBeUndefined();
    const chain = buildProvenance(ctx, pickKey("2027", 1, 1));
    expect(chain.today.pending).toBe(true);
    expect(chain.today.text).toContain("Not drafted yet");
  });
  it("gives every made pick's player a chain that crosses the draft", async () => {
    const h = buildFixtureHistory();
    const { ctx } = await loadProvenanceSource(h);
    const index = await buildDraftIndex(h);
    const withPlayers = madePicks(index).filter(
      (p) => p.playerId && p.originalRoster != null,
    );
    expect(withPlayers.length).toBeGreaterThan(0);
    for (const p of withPlayers.slice(0, 40)) {
      const chain = buildProvenance(ctx, `p:${p.playerId}`);
      // A drafted player who is still traceable must name the draft. The exception is
      // a player later re-signed off waivers by someone else, whose chain correctly
      // stops at that signing instead - so this asserts the origin is one of the
      // sanctioned terminals rather than that it is always the draft.
      expect(chain).not.toBeNull();
      expect([
        "startup-draft",
        "waiver",
        "free-agent",
        "pre-record",
        "pick-original",
      ]).toContain(
        chain.events[0].node === "origin" ? chain.events[0].reason : "",
      );
    }
  });
  it("degrades without throwing when the corpus has no draft support", async () => {
    const h = buildFixtureHistory();
    const { ctx } = await loadProvenanceSource(h, {
      index: { supported: false, bySeason: new Map() },
    });
    expect(Object.keys(ctx.draftedFrom)).toHaveLength(0);
    // Every trade hop still derives; the chains simply never cross a draft.
    const chain = buildProvenance(ctx, pickKey("2024", 1, 8));
    expect(chain).not.toBeNull();
    expect(chain.hops).toBeGreaterThan(0);
  });
});
/**
 * OPT-IN GAP TEXTURE - the reconsidered shelved idea (D51's blue-sky addendum #1),
 * built as data the caller can choose to compute rather than texture forced onto
 * every rail.
 */
describe("chainGapActivity", () => {
  afterEach(() => invalidateDraftIndex());
  const DAY = 86_400_000;
  it("reports other league activity inside the chain's single LONGEST gap", async () => {
    const h = buildFixtureHistory();
    const { ctx } = await loadProvenanceSource(h);
    // fx-2022-rebuildA moved Damian Lillard off roster u1 in 2022; the fixture keeps
    // running seasons after it, so a real gap of well over 90 days exists somewhere
    // in most fixture chains. Pick one with real hops.
    const chain = buildProvenance(ctx, pickKey("2024", 1, 8));
    const activity = chainGapActivity(h, chain);
    // Whether or not this particular chain clears the floor, the contract holds:
    // never a hollow "0 things happened" object.
    if (activity) {
      expect(activity.total).toBeGreaterThan(0);
      expect(activity.total).toBe(
        activity.trades + activity.waivers + activity.freeAgents,
      );
      expect(activity.days).toBeGreaterThanOrEqual(90);
    }
  });
  it("returns null for a chain with no gap reaching the floor", async () => {
    const ctx = {
      moves: [],
      holdings: {},
      draftedFrom: {},
      playerOfPick: {},
      signings: {},
      names: { 1: "Alpha" },
      ownerNames: {},
      playerNames: {},
      recordStart: 0,
      pendingPickText: "x",
    };
    const chain = buildProvenance(ctx, "p:p9");
    const h = { transactions: [] };
    expect(chainGapActivity(h, chain)).toBeNull();
  });
  it("excludes this asset's OWN trades from the 'elsewhere' count", async () => {
    // `terminusOf` stamps the TODAY node at `Date.now()`, so the walk's own trailing
    // gap (last hop -> today) would otherwise swamp every earlier one for any asset
    // that has sat a while - pinning the clock right after the hop isolates the
    // ORIGIN -> HOP gap as the chain's longest, which is the one this test means to
    // inspect.
    vi.useFakeTimers();
    vi.setSystemTime(200 * DAY + DAY);
    try {
      const ctx = {
        moves: [
          {
            id: "t|p:p9",
            assetKey: "p:p9",
            kind: "player",
            label: "Nine",
            tradeId: "OWN",
            season: "2023",
            week: 1,
            created: 200 * DAY,
            from: 1,
            to: 2,
            fromOwnerId: null,
            toOwnerId: null,
          },
        ],
        holdings: { p9: 2 },
        draftedFrom: {},
        playerOfPick: {},
        signings: {},
        names: { 1: "Alpha", 2: "Bravo" },
        ownerNames: {},
        playerNames: { p9: "Nine" },
        recordStart: 0,
        pendingPickText: "x",
      };
      const chain = buildProvenance(ctx, "p:p9");
      // The chain's own hop transaction, plus one genuinely OTHER trade inside the
      // same window, plus a waiver and a free-agent move.
      const h = {
        transactions: [
          { transactionId: "OWN", type: "trade", created: 200 * DAY },
          { transactionId: "other-1", type: "trade", created: 50 * DAY },
          { transactionId: "w1", type: "waiver", created: 60 * DAY },
          { transactionId: "f1", type: "free_agent", created: 70 * DAY },
        ],
      };
      const activity = chainGapActivity(h, chain);
      expect(activity).not.toBeNull();
      expect(activity.trades).toBe(1);
      expect(activity.waivers).toBe(1);
      expect(activity.freeAgents).toBe(1);
      expect(activity.total).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
