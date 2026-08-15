import { afterEach, describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import { invalidateDraftIndex, madePicks, buildDraftIndex } from "../lineage";
import { pickKey } from "../tradegraph";
import { buildProvenance } from "./index";
import { loadProvenanceSource } from "./source";
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
