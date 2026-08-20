import { describe, expect, it } from "vitest";
import {
  DERIVED_PRODUCTION,
  effectiveRanks,
  MIN_BLEND_POOL,
  PRODUCTION_BY_PLAYER,
  PRODUCTION_PROVENANCE,
  PRODUCTION_WEIGHT,
  productionBackingRefusal,
  productionOf,
} from "./production.js";
import { VALUATION_CONFIG, valuePlayer, valuePlayers } from "./index.js";
const SCORING = { pts: 0.5, reb: 1, ast: 1, stl: 2, blk: 2, to: -1, tpm: 0.5 };
/** The real table's ids, ordered best-production-first. */
const IDS = DERIVED_PRODUCTION.map(([id]) => id);
/**
 * A blendable pool built from REAL table ids, so `effectiveRanks` actually engages.
 * `searchRank` is assigned in the SAME order as production by default, which is the
 * degenerate case a blend must leave alone; individual tests scramble it.
 */
function pool(n = 120, rankOf = (i) => i + 1) {
  return IDS.slice(0, n).map((id, i) => ({ playerId: id, searchRank: rankOf(i) }));
}
function player(overrides) {
  return {
    playerId: "synthetic-x",
    fullName: "Test Player",
    firstName: "Test",
    lastName: "Player",
    team: "BOS",
    position: "SF",
    fantasyPositions: ["SF"],
    age: 25,
    yearsExp: 4,
    searchRank: 50,
    depthChartOrder: 1,
    injuryStatus: null,
    injuryBodyPart: null,
    injuryNotes: null,
    ...overrides,
  };
}
describe("the committed table", () => {
  it("is a well-formed measurement, not a hand-edited one", () => {
    expect(DERIVED_PRODUCTION.length).toBeGreaterThan(MIN_BLEND_POOL);
    expect(PRODUCTION_BY_PLAYER.size).toBe(DERIVED_PRODUCTION.length);
    for (const [id, index, weeks, seasons] of DERIVED_PRODUCTION) {
      expect(typeof id).toBe("string");
      expect(index).toBeGreaterThanOrEqual(0);
      // Era-normalized against the season mean, so 1.0 is average. Nothing real is a
      // 10x outlier; a value up there would mean the normalization broke.
      expect(index).toBeLessThan(5);
      expect(weeks).toBeGreaterThanOrEqual(PRODUCTION_PROVENANCE.minWeeks);
      expect(seasons).toBeGreaterThanOrEqual(1);
      expect(seasons).toBeLessThanOrEqual(PRODUCTION_PROVENANCE.seasons.length);
    }
  });
  it("is sorted best-first and free of duplicate players", () => {
    const indices = DERIVED_PRODUCTION.map(([, i]) => i);
    for (let i = 1; i < indices.length; i++)
      expect(indices[i]).toBeLessThanOrEqual(indices[i - 1]);
    expect(new Set(IDS).size).toBe(IDS.length);
  });
  it("is centred near 1.0, which is what era-normalization means", () => {
    const mean =
      DERIVED_PRODUCTION.reduce((s, [, i]) => s + i, 0) /
      DERIVED_PRODUCTION.length;
    // Not exactly 1: the table pools two seasons and includes players below the
    // per-season qualifying floor in one of them. Near 1 is the claim, and it is
    // checked rather than asserted in prose.
    expect(mean).toBeGreaterThan(0.7);
    expect(mean).toBeLessThan(1.3);
  });
  it("answers null - never 0, never 1.0 - for a player it has no record of (D19)", () => {
    expect(productionOf("no-such-player")).toBeNull();
    expect(productionOf(IDS[0])).not.toBeNull();
  });
});
describe("effectiveRanks is a PERMUTATION of the pool's own ranks", () => {
  /**
   * THE LOAD-BEARING PROPERTY, and the reason this change could not saturate the value
   * scale the way the age-curve recalibration did (D55). If the multiset of ranks going
   * in equals the multiset coming out, then the multiset of BASE VALUES is unchanged too,
   * because base is a pure function of rank. Every absolute literal sitting on the value
   * scale - STAR_VALUE, STAR_THRESHOLD, DEAD_THRESHOLD - therefore sees the same
   * distribution it was calibrated against. Break this and that guarantee is gone.
   */
  it("returns exactly the ranks it was given, reordered", () => {
    const p = pool(120, (i) => ((i * 7) % 401) + 1);
    const out = effectiveRanks(p);
    expect(out.size).toBe(p.length);
    const before = p.map((x) => x.searchRank).sort((a, b) => a - b);
    const after = [...out.values()].map((v) => v.rank).sort((a, b) => a - b);
    expect(after).toEqual(before);
  });
  it("holds even when production and rank disagree completely", () => {
    // Reverse: the best producer carries the worst search rank.
    const n = 120;
    const p = pool(n, (i) => n - i);
    const out = effectiveRanks(p);
    const before = p.map((x) => x.searchRank).sort((a, b) => a - b);
    const after = [...out.values()].map((v) => v.rank).sort((a, b) => a - b);
    expect(after).toEqual(before);
  });
  it("is the identity when production and rank already agree", () => {
    const p = pool(120, (i) => i + 1);
    for (const [id, v] of effectiveRanks(p))
      expect(v.rank).toBe(p.find((x) => x.playerId === id)?.searchRank);
  });
  it("moves a strong producer with a weak rank toward the front", () => {
    const n = 120;
    // Best producer in the table, parked at the very back of the rank order.
    const p = [
      ...IDS.slice(1, n).map((id, i) => ({ playerId: id, searchRank: i + 1 })),
      { playerId: IDS[0], searchRank: n },
    ];
    const out = effectiveRanks(p);
    const moved = out.get(IDS[0]);
    expect(moved).toBeDefined();
    expect(moved?.rank).toBeLessThan(n);
    // At weight 0.23 he is promoted, but nowhere near to the front: production earned a
    // nudge, not a veto. If this ever asserts a rank of 1, the weight has run away.
    expect(moved?.rank).toBeGreaterThan(1);
  });
  it("is deterministic, including when the input order changes", () => {
    const p = pool(120, (i) => ((i * 13) % 307) + 1);
    const a = effectiveRanks(p);
    const b = effectiveRanks([...p].reverse());
    expect([...a].sort()).toEqual([...b].sort());
  });
  it("carries the provenance a surface needs to explain itself", () => {
    const out = effectiveRanks(pool(120, (i) => ((i * 7) % 401) + 1));
    const one = out.get(IDS[0]);
    expect(one?.index).toBe(PRODUCTION_BY_PLAYER.get(IDS[0])?.index);
    expect(one?.searchRank).toBe(1);
    expect(one?.weeks).toBeGreaterThanOrEqual(PRODUCTION_PROVENANCE.minWeeks);
  });
});
describe("effectiveRanks refuses rather than guesses (D19)", () => {
  it("omits a player with no production record", () => {
    const p = [
      ...pool(120),
      { playerId: "rookie-nobody-has-rostered", searchRank: 30 },
    ];
    const out = effectiveRanks(p);
    expect(out.has("rookie-nobody-has-rostered")).toBe(false);
    expect(out.size).toBe(120);
  });
  it("omits a player with no search rank, having nothing to blend against", () => {
    const out = effectiveRanks([
      ...pool(120),
      { playerId: IDS[200], searchRank: null },
    ]);
    expect(out.has(IDS[200])).toBe(false);
  });
  it("declines entirely on a pool too small to permute responsibly", () => {
    expect(effectiveRanks(pool(MIN_BLEND_POOL - 1)).size).toBe(0);
    expect(effectiveRanks(pool(MIN_BLEND_POOL)).size).toBe(MIN_BLEND_POOL);
  });
  it("declines entirely at weight 0, which is how the old behaviour is pinned", () => {
    expect(effectiveRanks(pool(120), 0).size).toBe(0);
  });
});
describe("valuePlayer with and without a production term", () => {
  it("prices a player with no production term exactly as before it existed", () => {
    const p = player({ playerId: "synthetic-x", searchRank: 50 });
    expect(valuePlayer(p, SCORING).value).toBe(
      valuePlayer(p, SCORING, VALUATION_CONFIG, undefined, null).value,
    );
  });
  it("reports honestly which side of the fallback a price is on", () => {
    const unbacked = valuePlayer(player({ searchRank: 50 }), SCORING);
    expect(unbacked.productionBacked).toBe(false);
    expect(unbacked.productionIndex).toBeNull();
    expect(unbacked.rank).toBe(50);
    expect(unbacked.searchRank).toBe(50);
    const eff = { rank: 20, searchRank: 50, index: 1.8, weeks: 46, seasons: 2 };
    const backed = valuePlayer(
      player({ searchRank: 50 }),
      SCORING,
      VALUATION_CONFIG,
      undefined,
      eff,
    );
    expect(backed.productionBacked).toBe(true);
    expect(backed.productionIndex).toBe(1.8);
    // BOTH ranks survive, so a reader can see the disagreement and not just its result.
    expect(backed.rank).toBe(20);
    expect(backed.searchRank).toBe(50);
    expect(backed.value).toBeGreaterThan(unbacked.value);
  });
  it("prices off the blended rank but flags the star tier off the RAW one", () => {
    // Deliberate, and documented in index.js: D74's cohort is selected by the consensus
    // ordinal, and re-pointing it at the blend would change that cohort without
    // re-measuring the adjustment. A player promoted INTO the top decile by production
    // must therefore NOT pick up the star-tier age adjustment.
    const cutoff = VALUATION_CONFIG.starSearchRankCutoff;
    const eff = {
      rank: 2,
      searchRank: cutoff + 50,
      index: 2.5,
      weeks: 46,
      seasons: 2,
    };
    const v = valuePlayer(
      player({ age: 31, searchRank: cutoff + 50 }),
      SCORING,
      VALUATION_CONFIG,
      undefined,
      eff,
    );
    expect(v.starTier).toBe(false);
  });
});
describe("valuePlayers over a whole pool", () => {
  const corpusOf = (n) =>
    IDS.slice(0, n).map((id, i) =>
      player({ playerId: id, searchRank: ((i * 7) % 401) + 1 }),
    );
  it("leaves the multiset of BASE values untouched (the D55 guarantee)", () => {
    const players = corpusOf(150);
    const off = valuePlayers(players, SCORING, {
      ...VALUATION_CONFIG,
      productionWeight: 0,
    });
    const on = valuePlayers(players, SCORING);
    const bases = (m) => [...m.values()].map((v) => v.base).sort((a, b) => a - b);
    expect(bases(on)).toEqual(bases(off));
  });
  it("actually reorders somebody - the guarantee must not be vacuous", () => {
    const players = corpusOf(150);
    const off = valuePlayers(players, SCORING, {
      ...VALUATION_CONFIG,
      productionWeight: 0,
    });
    const on = valuePlayers(players, SCORING);
    const moved = players.filter(
      (p) => on.get(p.playerId)?.value !== off.get(p.playerId)?.value,
    );
    expect(moved.length).toBeGreaterThan(0);
    for (const p of players)
      expect(on.get(p.playerId)?.productionBacked).toBe(true);
  });
  it("keeps the weight a config value, so /methodology cannot print a stale one", () => {
    expect(VALUATION_CONFIG.productionWeight).toBe(PRODUCTION_WEIGHT);
    expect(PRODUCTION_WEIGHT).toBeGreaterThan(0);
    expect(PRODUCTION_WEIGHT).toBeLessThan(0.5);
  });
});
describe("productionBackingRefusal", () => {
  it("is null when every rostered price rests on a game played here", () => {
    expect(productionBackingRefusal(0, 246)).toBeNull();
  });
  it("is NO_RECORD, because eight weeks is a bar with nothing under it", () => {
    // Not INSUFFICIENT_SAMPLE: a player under the qualifying bar has no in-league
    // record at all rather than a thin one, and the code has to say which.
    const r = productionBackingRefusal(23, 246);
    expect(r.code).toBe("NO_RECORD");
    expect(r.because).toContain("23 rostered players have");
    expect(r.withheld).toEqual({
      label: "Prices resting on the ordinal alone",
      value: "23 of 246",
    });
  });
  it("says the fallback is stated rather than silent (D19)", () => {
    // The refusal is of the CLAIM, not of the price: these players are priced, and a
    // sentence implying otherwise would be a different and wronger statement.
    const r = productionBackingRefusal(1, 246);
    expect(r.because).toContain("priced on the consensus ordinal alone");
    expect(r.because).toContain("none is treated as zero");
    expect(r.because).toContain("One rostered player has");
    expect(r.because).toContain("he is");
  });
});
