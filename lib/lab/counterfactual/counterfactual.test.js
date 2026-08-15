import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../../testing/fixtureHistory";
import { buildDraftIndex, invalidateDraftIndex } from "../../lineage";
import { pickCapital } from "../../picks";
import {
  buildCounterfactual,
  corpusTracksNbaTeams,
  counterfactualOverlaps,
  describeCounterfactual,
} from "./index";
async function fixture() {
  invalidateDraftIndex();
  const h = buildFixtureHistory();
  return { h, index: await buildDraftIndex(h) };
}
/** A minimal non-trade transaction, shaped like the ones ingest produces. */
function move(season, created, adds, drops, type = "waiver") {
  return {
    transactionId: `t${created}`,
    type,
    status: "complete",
    season,
    week: 1,
    created,
    statusUpdated: created,
    creator: null,
    rosterIds: [...new Set([...Object.values(adds), ...Object.values(drops)])],
    consenterIds: [],
    adds,
    drops,
    draftPicks: [],
  };
}
describe("the counterfactual roster", () => {
  it("keeps a waiver add and honours the drop that undid it", async () => {
    const { h, index } = await fixture();
    const [kept, dropped] = [...h.players.keys()].slice(120, 122);
    const withMoves = {
      ...h,
      transactions: [
        ...h.transactions,
        move("2024", 1, { [kept]: 3, [dropped]: 3 }, {}),
        move("2025", 2, {}, { [dropped]: 3 }),
      ].sort((a, b) => a.created - b.created),
    };
    const c = buildCounterfactual(withMoves, 3, index);
    const ids = new Set(c.players.map((p) => p.playerId));
    expect(ids.has(kept)).toBe(true);
    expect(ids.has(dropped)).toBe(false);
  });
  it("never lets a trade put a player into the counterfactual", async () => {
    const { h, index } = await fixture();
    // Every asset in a trade-free roster must be explained by a draft slot this
    // roster was born with, or by a non-trade add. Nothing else is a source.
    const drafted = new Set();
    for (const sd of index.bySeason.values()) {
      for (const p of sd.picks) {
        if (p.playerId && sd.draft.slotToRosterId[p.draftSlot] === 4)
          drafted.add(p.playerId);
      }
    }
    const added = new Set();
    for (const t of h.transactions) {
      if (t.type === "trade") continue;
      for (const [pid, to] of Object.entries(t.adds))
        if (to === 4) added.add(pid);
    }
    for (const p of buildCounterfactual(h, 4, index).players) {
      expect(drafted.has(p.playerId) || added.has(p.playerId)).toBe(true);
    }
  });
  it("keeps a player this roster drafted and later traded away", async () => {
    const { h, index } = await fixture();
    // Find a pick some roster was born with whose player is NOT on that roster now
    // and was never DROPPED by it - i.e. he can only have left in a trade.
    const droppedBy = new Set();
    for (const t of h.transactions) {
      if (t.type === "trade") continue;
      for (const [pid, from] of Object.entries(t.drops))
        droppedBy.add(`${pid}|${from}`);
    }
    let owner = -1;
    let playerId = "";
    outer: for (const sd of index.bySeason.values()) {
      for (const p of sd.picks) {
        if (!p.playerId) continue;
        const original = sd.draft.slotToRosterId[p.draftSlot];
        if (original == null) continue;
        if (droppedBy.has(`${p.playerId}|${original}`)) continue;
        const roster = h.rostersById.get(original);
        if (roster && !roster.players.includes(p.playerId)) {
          owner = original;
          playerId = p.playerId;
          break outer;
        }
      }
    }
    expect(owner).toBeGreaterThan(0);
    const c = buildCounterfactual(h, owner, index);
    const row = c.players.find((p) => p.playerId === playerId);
    expect(row).toBeDefined();
    expect(row.stillHeld).toBe(false);
  });
  it("holds every pick it was born with, and never one it acquired", async () => {
    const { h, index } = await fixture();
    for (const r of h.rosters) {
      const c = buildCounterfactual(h, r.rosterId, index);
      for (const p of c.counterfactual.picks) {
        expect(p.originalRoster).toBe(r.rosterId);
        expect(p.acquired).toBe(false);
      }
      // One pick per round per tracked season, no more and no fewer.
      const seasons = new Set(c.counterfactual.picks.map((p) => p.season));
      const rounds = h.currentLeague.settings.draft_rounds || 3;
      expect(c.counterfactual.picks.length).toBe(seasons.size * rounds);
    }
  });
  it("trims to the roster size actually held, and reports what it left behind", async () => {
    const { h, index } = await fixture();
    for (const r of h.rosters) {
      const c = buildCounterfactual(h, r.rosterId, index);
      expect(c.counterfactual.playerCount).toBeLessThanOrEqual(c.rosterSlots);
      const keptRows = c.players.filter((p) => p.kept);
      expect(keptRows.length).toBe(c.counterfactual.playerCount);
      // The trim takes the most valuable, so no discarded priced player may outrank
      // a kept one.
      const worstKept = Math.min(...keptRows.map((p) => p.value), Infinity);
      for (const p of c.players) {
        if (p.kept || !p.priced || p.value === 0) continue;
        expect(p.value).toBeLessThanOrEqual(worstKept);
      }
      expect(c.overflow).toBe(
        c.players.filter((p) => p.priced && p.value > 0).length -
          keptRows.length,
      );
    }
  });
  it("excludes players with no NBA team from the totals rather than scoring them 0", async () => {
    const { h, index } = await fixture();
    // The fixture models no NBA teams at all, so the check must NOT fire there.
    expect(corpusTracksNbaTeams(h)).toBe(false);
    expect(buildCounterfactual(h, 1, index).teamCheckAvailable).toBe(false);
    expect(buildCounterfactual(h, 1, index).unpriced).toHaveLength(0);
    // Give the corpus team data and strand one player without a team.
    const players = new Map(h.players);
    const ids = [...players.keys()];
    for (const id of ids) players.set(id, { ...players.get(id), team: "BOS" });
    const stranded = ids[0];
    players.set(stranded, { ...players.get(stranded), team: null });
    const withTeams = {
      ...h,
      players,
      transactions: [
        ...h.transactions,
        move("2024", 1, { [stranded]: 2 }, {}),
      ].sort((a, b) => a.created - b.created),
    };
    const c = buildCounterfactual(withTeams, 2, index);
    expect(c.teamCheckAvailable).toBe(true);
    const row = c.players.find((p) => p.playerId === stranded);
    expect(row.priced).toBe(false);
    expect(row.value).toBe(0);
    expect(c.unpriced.map((p) => p.playerId)).toContain(stranded);
    expect(
      c.players.filter((p) => p.kept).map((p) => p.playerId),
    ).not.toContain(stranded);
  });
  it("reports overlaps rather than resolving them", async () => {
    const { h, index } = await fixture();
    const shared = [...h.players.keys()][130];
    const withMoves = {
      ...h,
      transactions: [
        ...h.transactions,
        move("2023", 1, { [shared]: 5 }, {}),
        move("2024", 2, {}, { [shared]: 5 }),
        move("2024", 3, { [shared]: 9 }, {}),
      ].sort((a, b) => a.created - b.created),
    };
    // Roster 5 dropped him, so only roster 9 claims him from these two moves.
    expect(
      counterfactualOverlaps(withMoves, index).get(shared),
    ).toBeUndefined();
    const bothKeep = {
      ...h,
      transactions: [
        ...h.transactions,
        move("2023", 1, { [shared]: 5 }, {}),
        move("2024", 3, { [shared]: 9 }, {}),
      ].sort((a, b) => a.created - b.created),
    };
    expect(counterfactualOverlaps(bothKeep, index).get(shared)).toEqual([5, 9]);
  });
  it("degrades to an empty counterfactual with no draft data", async () => {
    const { h } = await fixture();
    const empty = { supported: false, bySeason: new Map() };
    const c = buildCounterfactual(h, 1, empty);
    expect(c.draftless).toBe(true);
    // Waiver history still counts; picks still price. Nothing throws.
    expect(c.counterfactual.pickValue).toBeGreaterThan(0);
  });
  it("names the corpus boundary rather than reaching past it", async () => {
    const { h, index } = await fixture();
    const c = buildCounterfactual(h, 1, index);
    expect(c.boundarySeason).toBe(h.chain[0].season);
  });
});
describe("describeCounterfactual", () => {
  it("states the delta without grading it, for every roster in the league", async () => {
    const { h, index } = await fixture();
    // D6: no grades, ever. These are the words a verdict would arrive in, and none
    // of them may appear in copy generated from a value difference.
    const banned =
      /\b(won|win|lost|lose|loser|winner|mistake|blunder|fleeced|robbed|better|worse|should have|good|bad|great|terrible)\b/i;
    for (const r of h.rosters) {
      const lines = describeCounterfactual(
        buildCounterfactual(h, r.rosterId, index),
      );
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line, line).not.toMatch(banned);
        // No em dashes in user-facing copy, in any encoding.
        expect(line).not.toContain("—");
      }
    }
  });
  it("says level rather than inventing a direction for a difference of nothing", async () => {
    const { h, index } = await fixture();
    const c = buildCounterfactual(h, 1, index);
    const flat = { ...c, delta: 0 };
    expect(describeCounterfactual(flat)[0]).toContain("level with");
  });
});
describe("pickCapital's ownership lens", () => {
  it("is byte-identical to the default when asked for held picks", async () => {
    const { h } = await fixture();
    for (const r of h.rosters) {
      expect(pickCapital(h, r.rosterId, { ownership: "held" })).toEqual(
        pickCapital(h, r.rosterId),
      );
    }
  });
  it("partitions every tracked pick across the league exactly once, both ways", async () => {
    const { h } = await fixture();
    for (const ownership of ["held", "original"]) {
      const seen = new Set();
      for (const r of h.rosters) {
        for (const p of pickCapital(h, r.rosterId, { ownership }).picks) {
          const key = `${p.season}|${p.round}|${p.originalRoster}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
      const seasons = pickCapital(h, 1, { ownership }).seasons.length;
      const rounds = h.currentLeague.settings.draft_rounds || 3;
      expect(seen.size).toBe(seasons * rounds * h.rosters.length);
    }
  });
});
