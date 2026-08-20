import { describe, expect, it } from "vitest";
import { refusalSentence } from "../refusal.js";
import {
  DERIVED_PRODUCTION,
  effectiveRanks,
  MIN_BLEND_POOL,
  PRODUCTION_BY_PLAYER,
  PRODUCTION_PROVENANCE,
  PRODUCTION_WEIGHT,
  productionBackingRefusal,
  productionOf,
  BELOW_FLOOR_WEEKS,
  PRODUCTION_EVIDENCE,
  PRODUCTION_R2,
  partialSe,
  productionRowRefusal,
  rosteredWeeksBelowFloor,
} from "./production.js";
import {
  VALUATION_CONFIG,
  cachedNoProductionValuePlayers,
  invalidateValuesCache,
  valuePlayer,
  valuePlayers,
} from "./index.js";
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

describe("BELOW_FLOOR_WEEKS", () => {
  it("holds only players UNDER the floor, and never one the table already prices", () => {
    // The two lists answer different questions and a player in both would mean the
    // derivation counted him twice.
    for (const [id, weeks] of BELOW_FLOOR_WEEKS) {
      expect(PRODUCTION_BY_PLAYER.has(id)).toBe(false);
      expect(weeks).toBeGreaterThan(0);
    }
  });
  it("never records a zero, because zero weeks is an absence and not a count", () => {
    expect(BELOW_FLOOR_WEEKS.every(([, w]) => w > 0)).toBe(true);
  });
  it("reads back null for a player this league has never rostered", () => {
    expect(rosteredWeeksBelowFloor("no-such-player")).toBeNull();
  });
  it("reads back the measured count for one it has", () => {
    const [id, weeks] = BELOW_FLOOR_WEEKS[0];
    expect(rosteredWeeksBelowFloor(id)).toBe(weeks);
  });
});
describe("productionRowRefusal", () => {
  it("is NO_RECORD, like its aggregate sibling", () => {
    expect(productionRowRefusal("Kris Dunn", 4).code).toBe("NO_RECORD");
  });
  it("names the player and prints his weeks against the floor", () => {
    const r = productionRowRefusal("Kris Dunn", 4);
    expect(r.because).toContain("Kris Dunn");
    expect(r.because).toContain("4 weeks");
    expect(r.because).toContain(`never ${PRODUCTION_PROVENANCE.minWeeks} in one season`);
  });
  it("withholds NOTHING, because the week count is evidence and not the declined figure", () => {
    // `refusalSentence` renders `withheld` as "<label> would read <value>, and is not
    // published". The week count is published - it is the proof - so putting it there
    // made the sentence contradict its own next clause. The figure actually declined is
    // the production index, which has no value to quote because it does not exist.
    for (const weeks of [4, 1, null]) {
      const r = productionRowRefusal("Somebody", weeks);
      expect(r.withheld).toBeNull();
      expect(refusalSentence(r)).not.toContain("is not published");
    }
  });
  it("says the price IS published - it refuses the provenance, not the number", () => {
    const r = productionRowRefusal("Kris Dunn", 4);
    expect(r.because).toContain("consensus ordinal alone");
    expect(r.because).toMatch(/price is published/i);
  });
  it("never invents a zero for a player the league never rostered", () => {
    const r = productionRowRefusal("Nobody", null);
    expect(r.withheld).toBeNull();
    expect(r.because).not.toContain("0 ");
    expect(r.because).toContain("not rostered him at all");
  });
  it("says week, singular, for one week", () => {
    expect(productionRowRefusal("One Week", 1).because).toContain("1 week ");
  });
});
describe("PRODUCTION_EVIDENCE", () => {
  it("carries both targets, and they are not the same measurement", () => {
    expect(PRODUCTION_EVIDENCE).toHaveLength(2);
    const [redraft, dynasty] = PRODUCTION_EVIDENCE;
    expect(redraft.n).not.toBe(dynasty.n);
    expect(redraft.target).not.toBe(dynasty.target);
  });
  it("reproduces the reported z figures from n alone", () => {
    // The whole point of deriving SE rather than storing it: if these drift, the
    // whisker on /methodology is drawing an interval nobody measured.
    const [redraft, dynasty] = PRODUCTION_EVIDENCE;
    expect(redraft.partial / partialSe(redraft.n)).toBeCloseTo(-0.73, 1);
    expect(dynasty.partial / partialSe(dynasty.n)).toBeCloseTo(6.4, 1);
  });
  it("keeps the one-season partial null: its 2-SE interval contains zero", () => {
    const r = PRODUCTION_EVIDENCE[0];
    const se = partialSe(r.n);
    expect(r.partial - 2 * se).toBeLessThan(0);
    expect(r.partial + 2 * se).toBeGreaterThan(0);
  });
  it("keeps the three-season partial clear of zero", () => {
    const d = PRODUCTION_EVIDENCE[1];
    const se = partialSe(d.n);
    expect(d.partial - 2 * se).toBeGreaterThan(0);
  });
  it("holds the R-squared pair as text-only numbers, close enough to be undrawable", () => {
    // Documents WHY it is not a chart: the gap is under 4 points.
    expect(PRODUCTION_R2.withProduction - PRODUCTION_R2.ordinal).toBeLessThan(0.04);
  });
});

describe("the drawn counterfactual is the model, not the algebra", () => {
  const corpusOf = (n) =>
    IDS.slice(0, n).map((id, i) =>
      player({ playerId: id, searchRank: ((i * 7) % 401) + 1 }),
    );
  /** A corpus wrapper shaped like the one `cachedNoProductionValuePlayers` takes. */
  const historyOf = (players) => ({
    players: new Map(players.map((p) => [p.playerId, p])),
    currentLeague: { scoringSettings: SCORING },
  });
  it("equals a direct weight-0 run", () => {
    invalidateValuesCache();
    const players = corpusOf(150);
    const h = historyOf(players);
    const cached = cachedNoProductionValuePlayers(h);
    const direct = valuePlayers(players, SCORING, {
      ...VALUATION_CONFIG,
      productionWeight: 0,
    });
    for (const p of players)
      expect(cached.get(p.playerId).value).toBe(direct.get(p.playerId).value);
  });
  it("prices every player on his RAW search rank, and backs none of them", () => {
    invalidateValuesCache();
    const players = corpusOf(150);
    const off = cachedNoProductionValuePlayers(historyOf(players));
    for (const p of players) {
      expect(off.get(p.playerId).rank).toBe(p.searchRank);
      expect(off.get(p.playerId).productionBacked).toBe(false);
    }
  });
  it("memoizes on corpus identity, like its sibling", () => {
    invalidateValuesCache();
    const h = historyOf(corpusOf(150));
    expect(cachedNoProductionValuePlayers(h)).toBe(
      cachedNoProductionValuePlayers(h),
    );
  });
  it("differs from the one-exponential shortcut ONLY by rounding", () => {
    // The reason the page stopped using the shortcut. The algebra is right - the two
    // values differ by exactly the ratio of their bases - but `value` is rounded
    // before the exponential multiplies it and the product is rounded again, so the
    // shortcut lands within a point or two rather than ON the model's own output.
    // Fine in a sentence, not fine as the end of a drawn mark.
    invalidateValuesCache();
    const players = corpusOf(150);
    const on = valuePlayers(players, SCORING);
    const off = cachedNoProductionValuePlayers(historyOf(players));
    let worst = 0;
    for (const p of players) {
      const v = on.get(p.playerId);
      const analytic = Math.round(
        v.value *
          Math.exp(
            -VALUATION_CONFIG.rankDecay * ((v.searchRank ?? 0) - v.rank),
          ),
      );
      worst = Math.max(worst, Math.abs(analytic - off.get(p.playerId).value));
    }
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(3);
  });
  it("leaves the multiset of BASE values untouched on the real table's ids", () => {
    invalidateValuesCache();
    const players = corpusOf(200);
    const on = valuePlayers(players, SCORING);
    const off = cachedNoProductionValuePlayers(historyOf(players));
    const bases = (m) => [...m.values()].map((v) => v.base).sort((a, b) => a - b);
    expect(bases(on)).toEqual(bases(off));
  });
  it("preserves the final VALUE multiset too when every multiplier is equal", () => {
    // Not a widening of the guarantee - a demonstration of exactly how narrow it is.
    // With one age, one position, no injuries and one depth slot, every multiplier is
    // the same number, so permuting `base` permutes `value` identically. This is the
    // ONLY condition under which the displayed distribution is also preserved, and it
    // is a condition no real corpus satisfies.
    invalidateValuesCache();
    const players = corpusOf(200);
    const on = valuePlayers(players, SCORING);
    const off = cachedNoProductionValuePlayers(historyOf(players));
    const vals = (m) => [...m.values()].map((v) => v.value).sort((a, b) => a - b);
    expect(vals(on)).toEqual(vals(off));
  });
  it("does NOT preserve it once ages vary, because multipliers travel with the player", () => {
    // THE NARROWER HALF OF THE D94 GUARANTEE, pinned so nobody restates it as
    // "production cannot change the distribution of values". `base` is a permutation;
    // `value` is `base` times that player's own multipliers, and reordering who holds
    // which base therefore pairs bases with different multipliers. The multiset of
    // BASES survives bit-for-bit. The multiset of displayed VALUES does not.
    invalidateValuesCache();
    const players = IDS.slice(0, 200).map((id, i) => ({
      ...player({ playerId: id, searchRank: ((i * 7) % 401) + 1 }),
      // A real spread of ages, so `ageMultiplier` differs per player.
      age: 19 + (i % 18),
    }));
    const on = valuePlayers(players, SCORING);
    const off = cachedNoProductionValuePlayers(historyOf(players));
    const bases = (m) => [...m.values()].map((v) => v.base).sort((a, b) => a - b);
    const vals = (m) => [...m.values()].map((v) => v.value).sort((a, b) => a - b);
    expect(bases(on)).toEqual(bases(off));
    expect(vals(on)).not.toEqual(vals(off));
  });
});
