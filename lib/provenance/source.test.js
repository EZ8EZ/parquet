import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory.js";
import { invalidateDraftIndex, madePicks, buildDraftIndex } from "../lineage/index.js";
import { pickKey } from "../tradegraph/index.js";
import { buildProvenance } from "./index.js";
import {
  chainGapScenes,
  holdDurationsByRoster,
  loadProvenanceSource,
} from "./source.js";
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
 * HOLDER-SCOPED GAP SCENES - what the league-wide version could not say.
 *
 * The old `chainGapActivity` reported LEAGUE activity in the chain's single longest
 * gap. For a never-traded player that gap is origin-to-today, so every never-traded
 * player sharing a startup draft got the same window and therefore identical numbers.
 * These tests pin the property that fixed it: a scene is about the HOLDER.
 */
describe("chainGapScenes", () => {
  afterEach(() => invalidateDraftIndex());
  const DAY = 86_400_000;
  /**
   * A hand-built context whose origin is DATED, which matters here more than anywhere
   * else in these tests: a player with no signing and no draft gets a `pre-record`
   * origin stamped `dated: false`, and `chainGapScenes` correctly refuses to measure a
   * window with an undated end. So the player is signed off waivers at t=0 by roster 1,
   * giving every gap below two real timestamps. The undated path gets its own test with
   * a pick, which is where it actually occurs on real data.
   */
  const bareCtx = (over = {}) => ({
    moves: [],
    holdings: {},
    draftedFrom: {},
    playerOfPick: {},
    signings: {
      p9: [
        {
          playerId: "p9",
          rosterId: 1,
          at: 0,
          type: "waiver",
          transactionId: "sign-1",
        },
      ],
    },
    names: { 1: "Alpha", 2: "Bravo", 3: "Charlie" },
    ownerNames: {},
    playerNames: { p9: "Nine" },
    recordStart: 0,
    pendingPickText: "x",
    ...over,
  });
  const hopMove = (over = {}) => ({
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
    ...over,
  });
  it("returns one aligned entry per node, with nothing above the first", async () => {
    const h = buildFixtureHistory();
    const { ctx } = await loadProvenanceSource(h);
    const chain = buildProvenance(ctx, pickKey("2024", 1, 8));
    const scenes = chainGapScenes(h, chain, ctx);
    expect(scenes).toHaveLength(chain.events.length + 1);
    // Index i describes the gap ABOVE node i, so index 0 can never carry a scene.
    expect(scenes[0]).toBeNull();
    for (const sc of scenes.filter(Boolean)) {
      expect(["active", "idle", "undated"]).toContain(sc.state);
    }
  });
  it("counts only the moves of the seat that was HOLDING it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(200 * DAY + DAY);
    try {
      const ctx = bareCtx({ moves: [hopMove()], holdings: { p9: 2 } });
      const chain = buildProvenance(ctx, "p:p9");
      // Roster 1 holds it across the origin -> hop gap. Inside that window: one trade
      // of roster 1's (counts), one waiver of roster 1's (counts), and one trade
      // between two OTHER rosters (does not count, but is in the league total).
      const h = {
        transactions: [
          { transactionId: "OWN", type: "trade", created: 200 * DAY, rosterIds: [1, 2], adds: {}, drops: {}, draftPicks: [] },
          { transactionId: "mine", type: "trade", created: 50 * DAY, rosterIds: [1, 3], adds: {}, drops: {}, draftPicks: [] },
          { transactionId: "w1", type: "waiver", created: 60 * DAY, adds: { x: 1 }, drops: {} },
          { transactionId: "theirs", type: "trade", created: 70 * DAY, rosterIds: [2, 3], adds: {}, drops: {}, draftPicks: [] },
        ],
      };
      const scenes = chainGapScenes(h, chain, ctx);
      const gap = scenes[1];
      expect(gap.state).toBe("active");
      expect(gap.holderRosterId).toBe(1);
      expect(gap.holderName).toBe("Alpha");
      expect(gap.trades).toBe(1);
      expect(gap.waivers).toBe(1);
      expect(gap.total).toBe(2);
      // The other rosters' trade is real and is counted for scale, not attributed.
      expect(gap.leagueTotal).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
  it("never counts the asset's OWN bounding hop as activity elsewhere", () => {
    vi.useFakeTimers();
    vi.setSystemTime(200 * DAY + DAY);
    try {
      const ctx = bareCtx({ moves: [hopMove()], holdings: { p9: 2 } });
      const chain = buildProvenance(ctx, "p:p9");
      const h = {
        transactions: [
          { transactionId: "OWN", type: "trade", created: 100 * DAY, rosterIds: [1, 2], adds: {}, drops: {}, draftPicks: [] },
        ],
      };
      const gap = chainGapScenes(h, chain, ctx)[1];
      expect(gap.state).toBe("idle");
      expect(gap.total).toBe(0);
      expect(gap.leagueTotal).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("reports IDLE as a real state, not as a missing one (D40)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(200 * DAY + DAY);
    try {
      const ctx = bareCtx({ moves: [hopMove()], holdings: { p9: 2 } });
      const chain = buildProvenance(ctx, "p:p9");
      // The holder did nothing; the league did four things. Both numbers are real and
      // the sentence needs both, so a zero here must still produce a scene object.
      const h = {
        transactions: [
          { transactionId: "OWN", type: "trade", created: 200 * DAY, rosterIds: [1, 2], adds: {}, drops: {}, draftPicks: [] },
          { transactionId: "a", type: "waiver", created: 10 * DAY, adds: { x: 2 }, drops: {} },
          { transactionId: "b", type: "waiver", created: 20 * DAY, adds: { x: 3 }, drops: {} },
          { transactionId: "c", type: "free_agent", created: 30 * DAY, adds: { x: 2 }, drops: {} },
          { transactionId: "d", type: "trade", created: 40 * DAY, rosterIds: [2, 3], adds: {}, drops: {}, draftPicks: [] },
        ],
      };
      const gap = chainGapScenes(h, chain, ctx)[1];
      expect(gap.state).toBe("idle");
      expect(gap.total).toBe(0);
      expect(gap.leagueTotal).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });
  it("refuses an UNDATED boundary with SOURCE_GAP rather than reporting a zero", () => {
    // A pick that has run out of hops gets a `pick-original` origin stamped at
    // `recordStart` with `dated: false`. There is no window, so there is nothing to
    // have counted - which is not the same statement as "nothing happened".
    const ctx = bareCtx();
    const chain = buildProvenance(ctx, "k:2025-1-1");
    const scenes = chainGapScenes({ transactions: [] }, chain, ctx);
    const undated = scenes.filter((sc) => sc && sc.state === "undated");
    expect(undated.length).toBeGreaterThan(0);
    expect(undated[0].refusal.code).toBe("SOURCE_GAP");
    // The refusal carries its own proof, per D95 - never a bare code.
    expect(undated[0].refusal.because.length).toBeGreaterThan(20);
    expect(undated[0].total).toBeUndefined();
  });
  it("marks the terminal gap as OPEN, because it has not ended", () => {
    vi.useFakeTimers();
    vi.setSystemTime(400 * DAY);
    try {
      const ctx = bareCtx({ moves: [hopMove()], holdings: { p9: 2 } });
      const chain = buildProvenance(ctx, "p:p9");
      const scenes = chainGapScenes({ transactions: [] }, chain, ctx);
      const last = scenes[scenes.length - 1];
      expect(last.open).toBe(true);
      expect(scenes[1].open).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it("says nothing at all about a gap too short to have contained anything", () => {
    vi.useFakeTimers();
    vi.setSystemTime(11 * DAY);
    try {
      const ctx = bareCtx({
        moves: [hopMove({ created: 10 * DAY })],
        holdings: { p9: 2 },
      });
      const chain = buildProvenance(ctx, "p:p9");
      const scenes = chainGapScenes({ transactions: [] }, chain, ctx);
      // Ten days, then one more. Neither gap is a scene, and a fabricated scene is
      // worse than none.
      expect(scenes.filter(Boolean)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
/**
 * THE HOLD POPULATION a single hold is read against.
 */
describe("holdDurationsByRoster", () => {
  const DAY = 86_400_000;
  const mv = (assetKey, to, created) => ({
    assetKey,
    to,
    created,
    id: `${assetKey}|${created}`,
  });
  it("measures each completed hold from the trade in to the trade out", () => {
    const out = holdDurationsByRoster([
      mv("p:a", 2, 0),
      mv("p:a", 3, 10 * DAY),
      mv("p:a", 4, 40 * DAY),
    ]);
    // Roster 2 held it 10 days, roster 3 held it 30. Roster 4's hold has not ended.
    expect(out.get(2)).toEqual([10]);
    expect(out.get(3)).toEqual([30]);
    expect(out.has(4)).toBe(false);
  });
  it("EXCLUDES the open final hold, which is elapsed time and not a duration", () => {
    // Including it would drag the median toward "how long ago the last trade was",
    // which is a fact about today's date rather than about anybody's behaviour.
    const out = holdDurationsByRoster([mv("p:a", 2, 0)]);
    expect(out.size).toBe(0);
  });
  it("pools one seat's holds across every asset it has held", () => {
    const out = holdDurationsByRoster([
      mv("p:a", 2, 0),
      mv("p:a", 3, 5 * DAY),
      mv("p:b", 2, 0),
      mv("p:b", 3, 50 * DAY),
    ]);
    expect(out.get(2)).toEqual([5, 50]);
  });
  it("returns each seat's holds sorted, so a median is a lookup", () => {
    const out = holdDurationsByRoster([
      mv("p:a", 2, 0),
      mv("p:a", 3, 90 * DAY),
      mv("p:b", 2, 0),
      mv("p:b", 3, 4 * DAY),
      mv("p:c", 2, 0),
      mv("p:c", 3, 30 * DAY),
    ]);
    expect(out.get(2)).toEqual([4, 30, 90]);
  });
});
