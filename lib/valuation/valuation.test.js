import { describe, expect, it } from "vitest";
import { corpus, FIXTURE_LEAGUE_ID } from "../providers/fixture";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import {
  STAR_AGE_ADJUSTMENT,
  STAR_SEARCH_RANK_CUTOFF,
  VALUATION_CONFIG,
  ageMultiplier,
  cachedValuePlayers,
  classMultiplier,
  estimateOverallPick,
  invalidateValuesCache,
  isStarTier,
  maxInjuryMultiplier,
  pickValue,
  slotDistribution,
  positionMultipliers,
  starAgeAdjustment,
  theoreticalMaxMultiplier,
  valuePlayer,
  valuePlayers,
} from "./index";
const SCORING = {
  pts: 0.5,
  reb: 1,
  ast: 1,
  stl: 2,
  blk: 2,
  to: -1,
  tpm: 0.5,
};
function player(overrides) {
  return {
    playerId: "x",
    fullName: "Test Player",
    firstName: "Test",
    lastName: "Player",
    team: "BOS",
    position: "SF",
    fantasyPositions: ["SF"],
    age: 25,
    yearsExp: 4,
    birthDate: null,
    injuryStatus: null,
    injuryBodyPart: null,
    injuryNotes: null,
    depthChartOrder: 1,
    status: "ACT",
    number: 0,
    searchRank: 50,
    espnId: null,
    ...overrides,
  };
}
describe("ageMultiplier", () => {
  it("rewards youth and penalizes age", () => {
    expect(ageMultiplier(20)).toBeGreaterThan(ageMultiplier(27));
    expect(ageMultiplier(27)).toBeGreaterThan(ageMultiplier(33));
    expect(ageMultiplier(33)).toBeGreaterThan(ageMultiplier(37));
  });
  it("interpolates between anchors", () => {
    const m = ageMultiplier(24);
    expect(m).toBeLessThan(ageMultiplier(23));
    expect(m).toBeGreaterThan(ageMultiplier(25));
  });
  it("returns neutral for unknown age", () => {
    expect(ageMultiplier(null)).toBe(1);
  });
});
/**
 * D74: the owner's real-world challenge (Luka Doncic, 27, Sleeper consensus #3,
 * pricing narrowly BELOW Alperen Sengun, 24, consensus #10) traced to the age curve
 * being a population average that does not condition on talent tier. Measured
 * against a star-cohort-conditional re-derivation of the same historical corpus (see
 * `lib/valuation/ageCurve.ts`'s own header for the numbers), it does not: top-decile
 * players measurably keep more of their production past 27 than an average
 * qualifying player of the same age. These tests pin the resulting adjustment, its
 * search-rank proxy, and the invariants that keep it from disturbing anyone else.
 */
describe("star-tier age adjustment (D74)", () => {
  it("isStarTier follows the derived cutoff, inclusive", () => {
    expect(isStarTier(1)).toBe(true);
    expect(isStarTier(STAR_SEARCH_RANK_CUTOFF)).toBe(true);
    expect(isStarTier(STAR_SEARCH_RANK_CUTOFF + 1)).toBe(false);
    expect(isStarTier(null)).toBe(false);
    expect(isStarTier(undefined)).toBe(false);
  });
  it("starAgeAdjustment is a no-op below its own applied floor", () => {
    const floor = STAR_AGE_ADJUSTMENT[0].age;
    expect(starAgeAdjustment(floor - 1)).toBe(1.0);
    expect(starAgeAdjustment(19)).toBe(1.0);
    expect(starAgeAdjustment(null)).toBe(1.0);
  });
  it("starAgeAdjustment holds flat past its last measured age", () => {
    const last = STAR_AGE_ADJUSTMENT[STAR_AGE_ADJUSTMENT.length - 1];
    expect(starAgeAdjustment(last.age)).toBe(last.ratio);
    expect(starAgeAdjustment(last.age + 10)).toBe(last.ratio);
  });
  it("starAgeAdjustment is monotonically non-decreasing across its measured range", () => {
    for (let i = 1; i < STAR_AGE_ADJUSTMENT.length; i++) {
      expect(STAR_AGE_ADJUSTMENT[i].ratio).toBeGreaterThanOrEqual(
        STAR_AGE_ADJUSTMENT[i - 1].ratio,
      );
    }
  });
  it("ageMultiplier only applies the adjustment when opts.star is true", () => {
    const age = STAR_AGE_ADJUSTMENT[0].age;
    expect(ageMultiplier(age, VALUATION_CONFIG, { star: true })).toBeGreaterThan(
      ageMultiplier(age),
    );
    expect(ageMultiplier(age, VALUATION_CONFIG, { star: false })).toBe(
      ageMultiplier(age),
    );
  });
  it("never lifts the combined multiplier above the population curve's own peak", () => {
    // The invariant `theoreticalMaxMultiplier`'s own header now asserts: the star
    // table only starts where the population curve has already fallen well off its
    // peak, so no age can combine to exceed it. Checked exhaustively, not assumed.
    const peak = Math.max(...VALUATION_CONFIG.ageAnchors.map(([, m]) => m));
    for (let age = 19; age <= 45; age++) {
      expect(ageMultiplier(age, VALUATION_CONFIG, { star: true })).toBeLessThanOrEqual(
        peak,
      );
    }
  });
  it("a top-decile veteran outvalues an identical-age, identical-rank non-star exactly nowhere - same rank means same star status, so this checks the AGE effect instead: a top-decile player retains more value than the plain curve would give the same age", () => {
    const age = 29;
    const starValue = valuePlayer(
      player({ age, searchRank: 10 }),
      SCORING,
    ).value;
    const plainAgeMult = ageMultiplier(age);
    const starAgeMult = ageMultiplier(age, VALUATION_CONFIG, { star: true });
    expect(starAgeMult).toBeGreaterThan(plainAgeMult);
    expect(starValue).toBeGreaterThan(0);
  });
  it("does not affect a non-star player of the same age at all", () => {
    const age = 29;
    const nonStar = valuePlayer(
      player({ age, searchRank: STAR_SEARCH_RANK_CUTOFF + 1 }),
      SCORING,
    );
    expect(nonStar.ageMultiplier).toBeCloseTo(ageMultiplier(age), 2);
    expect(nonStar.starTier).toBe(false);
  });
  it("a star player's reported ageMultiplier and starTier flag reflect the adjustment", () => {
    const age = 29;
    const star = valuePlayer(player({ age, searchRank: 10 }), SCORING);
    expect(star.starTier).toBe(true);
    expect(star.ageMultiplier).toBeGreaterThan(ageMultiplier(age));
  });
  /**
   * The real case that prompted this: reproduced with synthetic stand-ins at the
   * SAME age/rank shape as the live league (Luka: 27, rank 3; Sengun: 24, rank 10),
   * scored under this suite's own SCORING rather than the live league's, so this is
   * a shape check on the model's behavior, not a pin on the live number (which is
   * verified separately against the real corpus - see DECISIONS.md D74).
   */
  it("closes an age-27 elite player's age-multiplier gap to a younger elite player of similar rank", () => {
    const olderStarAgeMult = ageMultiplier(27, VALUATION_CONFIG, { star: true });
    const olderPlainAgeMult = ageMultiplier(27);
    const youngerAgeMult = ageMultiplier(24);
    // Before D74, the 27-year-old's age multiplier trailed the 24-year-old's.
    const gapBefore = youngerAgeMult - olderPlainAgeMult;
    const gapAfter = youngerAgeMult - olderStarAgeMult;
    expect(gapBefore).toBeGreaterThan(0);
    // The star adjustment shrinks the gap substantially - on this exact pair it
    // closes it entirely (the 27-year-old's star-adjusted multiplier actually
    // edges past the 24-year-old's plain one), which is precisely the real case
    // this entry exists to re-examine (see DECISIONS.md D74).
    expect(gapAfter).toBeLessThan(gapBefore * 0.1);
  });
});
describe("valuePlayer", () => {
  it("ranks better players higher (lower rank = more value)", () => {
    const a = valuePlayer(player({ searchRank: 1 }), SCORING);
    const b = valuePlayer(player({ searchRank: 100 }), SCORING);
    expect(a.value).toBeGreaterThan(b.value);
  });
  it("a young player beats an old one of equal rank", () => {
    const young = valuePlayer(player({ age: 21, searchRank: 30 }), SCORING);
    const old = valuePlayer(player({ age: 34, searchRank: 30 }), SCORING);
    expect(young.value).toBeGreaterThan(old.value);
  });
  it("injury status reduces value", () => {
    const healthy = valuePlayer(player({ injuryStatus: null }), SCORING);
    const hurt = valuePlayer(player({ injuryStatus: "Out" }), SCORING);
    expect(hurt.value).toBeLessThan(healthy.value);
  });
  /**
   * The rebuild's headline claim, at the value level rather than the multiplier level:
   * two players identical in rank, age, role and position, separated only by WHICH
   * body part is hurt. The old model could not tell these apart at all - both were one
   * "DTD" string and both got the same 0.97 fallback.
   */
  it("separates a ruptured Achilles from a jammed finger", () => {
    const achilles = valuePlayer(
      player({
        age: 30,
        injuryStatus: "DTD",
        injuryBodyPart: "Achilles",
        injuryNotes: "Surgery",
      }),
      SCORING,
    );
    const finger = valuePlayer(
      player({
        age: 30,
        injuryStatus: "DTD",
        injuryBodyPart: "Finger",
        injuryNotes: "Sprain",
      }),
      SCORING,
    );
    expect(achilles.value).toBeLessThan(finger.value * 0.8);
  });
  it("does not tax a rested rookie as though he were hurt", () => {
    // Eleven live players carry body part "Rest", every one of them 19 to 25. The old
    // model charged all eleven an injury penalty for being young and idle.
    const rested = valuePlayer(
      player({ age: 20, injuryStatus: "DTD", injuryBodyPart: "Rest" }),
      SCORING,
    );
    const healthy = valuePlayer(player({ age: 20 }), SCORING);
    expect(rested.value).toBe(healthy.value);
    expect(rested.injuryMultiplier).toBe(1);
  });
  it("exposes an explainable breakdown", () => {
    const b = valuePlayer(player({}), SCORING);
    expect(b).toHaveProperty("base");
    expect(b).toHaveProperty("ageMultiplier");
    expect(b).toHaveProperty("positionMultiplier");
    expect(b.value).toBeGreaterThan(0);
  });
});
describe("positionMultipliers (league-aware)", () => {
  it("boosts steals/blocks-heavy positions when those are weighted 2x", () => {
    const m = positionMultipliers(SCORING);
    // Centers (blk) and guards (stl/ast) should be lifted vs a flat baseline.
    expect(m.C).toBeGreaterThan(0.9);
    expect(m.PG).toBeGreaterThan(0.9);
    // multipliers hover around 1
    for (const v of Object.values(m)) {
      expect(v).toBeGreaterThan(0.7);
      expect(v).toBeLessThan(1.3);
    }
  });
  it("responds to scoring changes", () => {
    const blkHeavy = positionMultipliers({ ...SCORING, blk: 6 });
    const flat = positionMultipliers({ ...SCORING, blk: 2 });
    expect(blkHeavy.C).toBeGreaterThan(flat.C);
  });
});
describe("theoreticalMaxMultiplier", () => {
  it("is the product of each multiplier's own max, not a hand-typed constant", () => {
    const posMults = { PG: 1.05, C: 1.12, SF: 0.95 };
    const ageMax = Math.max(...VALUATION_CONFIG.ageAnchors.map(([, m]) => m));
    const injuryMax = maxInjuryMultiplier();
    const roleMax = Math.max(
      VALUATION_CONFIG.role.starter,
      VALUATION_CONFIG.role.secondary,
      VALUATION_CONFIG.role.bench,
      VALUATION_CONFIG.role.unknown,
    );
    expect(theoreticalMaxMultiplier(posMults)).toBeCloseTo(
      ageMax * injuryMax * roleMax * 1.12,
      6,
    );
  });
  it("tracks a config edit automatically instead of needing a matching magic number", () => {
    const posMults = { SF: 1 };
    const hotAge = {
      ...VALUATION_CONFIG,
      ageAnchors: [...VALUATION_CONFIG.ageAnchors, [17, 1.5]],
    };
    expect(theoreticalMaxMultiplier(posMults, hotAge)).toBeGreaterThan(
      theoreticalMaxMultiplier(posMults, VALUATION_CONFIG),
    );
  });
  it("confirms injury and role never exceed 1.0 in the current config", () => {
    // Injury's max is now DERIVED from the whole class/note/status/age lattice rather
    // than read off a flat table, so this assertion still means what it always meant:
    // neither term can lift the ceiling that every value in the app is rescaled
    // against. The injury rebuild deliberately kept it at exactly 1.0, which is why no
    // healthy player's value moved by a single point.
    expect(maxInjuryMultiplier()).toBeLessThanOrEqual(1);
    expect(maxInjuryMultiplier()).toBe(1);
    expect(
      Math.max(
        VALUATION_CONFIG.role.starter,
        VALUATION_CONFIG.role.secondary,
        VALUATION_CONFIG.role.bench,
        VALUATION_CONFIG.role.unknown,
      ),
    ).toBeLessThanOrEqual(1);
  });
});
describe("valuation ceiling (rescale, not clamp)", () => {
  it("prices the single most extreme hypothetical player at exactly maxValue, not above it", () => {
    // Youngest anchor age, perfectly healthy, a starter, at whichever position
    // this scoring rewards most - the combination no real player embodies, and
    // exactly the number the ceiling is derived from.
    const ageAnchorMax = VALUATION_CONFIG.ageAnchors.reduce((best, a) =>
      a[1] > best[1] ? a : best,
    );
    const posMults = positionMultipliers(SCORING);
    const bestPos = Object.entries(posMults).reduce((best, [k, v]) =>
      v > best[1] ? [k, v] : best,
    )[0];
    const synthetic = player({
      searchRank: 1,
      age: ageAnchorMax[0],
      injuryStatus: null,
      depthChartOrder: 1,
      position: bestPos,
      fantasyPositions: [bestPos],
    });
    const b = valuePlayer(synthetic, SCORING);
    expect(b.value).toBeLessThanOrEqual(VALUATION_CONFIG.maxValue);
    expect(Math.abs(b.value - VALUATION_CONFIG.maxValue)).toBeLessThanOrEqual(
      1,
    );
  });
  it("no player in the (offline, deterministic) fixture corpus exceeds maxValue", () => {
    const c = corpus();
    const scoring = c.leagues[FIXTURE_LEAGUE_ID].scoringSettings;
    const values = valuePlayers(c.players, scoring);
    for (const v of values.values()) {
      expect(v.value).toBeLessThanOrEqual(VALUATION_CONFIG.maxValue);
    }
  });
  it("preserves the ratio between any two players' values when maxValue changes", () => {
    // A rescale multiplies every value by the same constant. Doubling maxValue
    // must double every player's value and leave the ratio between any two of
    // them untouched - a clamp could not make this claim.
    const cfgDouble = {
      ...VALUATION_CONFIG,
      maxValue: VALUATION_CONFIG.maxValue * 2,
    };
    const p1 = player({ searchRank: 5, age: 24 });
    const p2 = player({
      searchRank: 80,
      age: 30,
      injuryStatus: "Questionable",
    });
    const a1 = valuePlayer(p1, SCORING).value;
    const a2 = valuePlayer(p2, SCORING).value;
    const b1 = valuePlayer(p1, SCORING, cfgDouble).value;
    const b2 = valuePlayer(p2, SCORING, cfgDouble).value;
    expect(b1 / a1).toBeCloseTo(2, 2);
    expect(b2 / a2).toBeCloseTo(2, 2);
    // Integer rounding on both sides means this is "near-bit-for-bit", not
    // literally bit-for-bit: a couple hundredths of a percent of slack absorbs
    // Math.round() quantization, not any distortion from the rescale itself.
    expect(a1 / a2).toBeCloseTo(b1 / b2, 2);
  });
});
describe("pickValue", () => {
  const T = { teams: 14 };
  it("discounts future picks", () => {
    expect(pickValue(1, 0, T)).toBeGreaterThan(pickValue(1, 2, T));
  });
  it("earlier rounds are worth more", () => {
    expect(pickValue(1, 0, T)).toBeGreaterThan(pickValue(2, 0, T));
    expect(pickValue(2, 0, T)).toBeGreaterThan(pickValue(3, 0, T));
  });
  it("stays backward compatible with the old (round, seasonsOut) signature", () => {
    expect(pickValue(1, 0)).toBeGreaterThan(0);
    expect(pickValue(1, 0)).toBeGreaterThan(pickValue(3, 0));
  });
  // The headline fix: a 1.01 and a 1.14 are wildly different assets and the old
  // round-only model priced them identically.
  it("prices the 1.01 far above the 1.14", () => {
    const first = pickValue(1, 0, { slot: 1, ...T });
    const last = pickValue(1, 0, { slot: 14, ...T });
    expect(first).toBeGreaterThan(last * 4);
  });
  it("decays monotonically across slots within a round", () => {
    const vals = [1, 2, 5, 9, 14].map((slot) =>
      pickValue(1, 0, { slot, ...T }),
    );
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeLessThan(vals[i - 1]);
    }
  });
  it("never drops below the configured floor", () => {
    expect(pickValue(3, 0, { slot: 14, ...T })).toBeGreaterThanOrEqual(
      VALUATION_CONFIG.pick.floor,
    );
  });
  // Pricing a future pick by who owes it: a weak team's first lands early.
  it("values a weak team's first above a strong team's first", () => {
    const fromWorst = pickValue(1, 0, { originalTeamRank: 14, ...T });
    const fromBest = pickValue(1, 0, { originalTeamRank: 1, ...T });
    expect(fromWorst).toBeGreaterThan(fromBest);
  });
  it("regresses slot estimates toward the middle as picks move further out", () => {
    // You can guess next season's draft order; you cannot guess 2030's. So the gap
    // between a good and bad team's pick must narrow with distance.
    const nearGap =
      pickValue(1, 0, { originalTeamRank: 14, ...T }) -
      pickValue(1, 0, { originalTeamRank: 1, ...T });
    const farGap =
      pickValue(1, 4, { originalTeamRank: 14, ...T }) -
      pickValue(1, 4, { originalTeamRank: 1, ...T });
    expect(farGap).toBeLessThan(nearGap);
  });
  it("falls back to mid-round when nothing is known about the order", () => {
    const unknown = pickValue(1, 0, T);
    expect(unknown).toBeLessThan(pickValue(1, 0, { slot: 1, ...T }));
    expect(unknown).toBeGreaterThan(pickValue(1, 0, { slot: 14, ...T }));
  });
});
describe("lottery-aware pick valuation", () => {
  // This league: 14 teams, 8 make the playoffs, so 6 lottery teams take picks 1-6
  // and the 8 playoff teams draft 7-14 in reverse standings, champion last.
  const L = { teams: 14, playoffTeams: 8 };
  it("spreads a non-playoff team's first across the whole lottery range", () => {
    const dist = slotDistribution(1, { ...L, originalTeamRank: 14 });
    expect(dist.length).toBe(6);
    expect(dist[0].slot).toBe(1);
    expect(dist[dist.length - 1].slot).toBe(6);
    const total = dist.reduce((s, d) => s + d.p, 0);
    expect(total).toBeCloseTo(1, 6);
  });
  it("gives a playoff team a single deterministic slot after the lottery", () => {
    const dist = slotDistribution(1, { ...L, originalTeamRank: 8 });
    expect(dist).toEqual([{ slot: 7, p: 1 }]);
  });
  it("makes the champion pick last", () => {
    const dist = slotDistribution(1, { ...L, originalTeamRank: 1 });
    expect(dist[0].slot).toBe(14);
  });
  it("still ranks a lottery pick above every playoff team's pick", () => {
    const lottery = pickValue(1, 0, { ...L, originalTeamRank: 12 });
    const bestPlayoff = pickValue(1, 0, { ...L, originalTeamRank: 8 });
    const champion = pickValue(1, 0, { ...L, originalTeamRank: 1 });
    expect(lottery).toBeGreaterThan(bestPlayoff);
    expect(bestPlayoff).toBeGreaterThan(champion);
  });
  /**
   * The value curve is convex, so averaging value over the lottery outcomes is worth
   * MORE than valuing the average slot. Collapsing the lottery to one slot would
   * systematically underprice every rebuilding team's first.
   */
  it("prices the lottery by expected value, not value at the expected slot", () => {
    const dist = slotDistribution(1, { ...L, originalTeamRank: 14 });
    const expectedSlot = Math.round(dist.reduce((s, d) => s + d.slot * d.p, 0));
    const expectedValue = pickValue(1, 0, { ...L, originalTeamRank: 14 });
    const valueAtExpectedSlot = pickValue(1, 0, { ...L, slot: expectedSlot });
    expect(expectedValue).toBeGreaterThan(valueAtExpectedSlot);
  });
  it("treats lottery teams alike under flat odds", () => {
    // With lotteryWeighting at 0 every lottery team has the same distribution, so
    // finishing 14th rather than 9th must not change the pick's value.
    expect(pickValue(1, 0, { ...L, originalTeamRank: 14 })).toBe(
      pickValue(1, 0, { ...L, originalTeamRank: 9 }),
    );
  });
  it("falls back to strict reverse standings when playoffTeams is unknown", () => {
    const dist = slotDistribution(1, { teams: 14, originalTeamRank: 14 });
    expect(dist).toEqual([{ slot: 1, p: 1 }]);
  });
});
describe("classMultiplier", () => {
  it("is neutral for an unconfigured season", () => {
    expect(classMultiplier(1, "2031")).toBe(1);
    expect(classMultiplier(30, undefined)).toBe(1);
  });
  it("applies a deep class to the tail more than the top", () => {
    const cfg = {
      ...VALUATION_CONFIG,
      classStrength: { 2099: { top: 1.0, depth: 1.2 } },
    };
    const atTop = classMultiplier(1, "2099", cfg);
    const atTail = classMultiplier(30, "2099", cfg);
    expect(atTop).toBeCloseTo(1, 2);
    expect(atTail).toBeGreaterThan(atTop);
  });
  it("applies a top-heavy class to the 1.01 more than the tail", () => {
    const cfg = {
      ...VALUATION_CONFIG,
      classStrength: { 2099: { top: 1.6, depth: 1.0 } },
    };
    expect(classMultiplier(1, "2099", cfg)).toBeGreaterThan(
      classMultiplier(30, "2099", cfg),
    );
  });
  it("flows through to pick value", () => {
    const cfg = {
      ...VALUATION_CONFIG,
      classStrength: { 2099: { top: 2.0, depth: 2.0 } },
    };
    const boosted = pickValue(
      1,
      0,
      { teams: 14, slot: 1, season: "2099" },
      cfg,
    );
    const neutral = pickValue(
      1,
      0,
      { teams: 14, slot: 1, season: "2098" },
      cfg,
    );
    expect(boosted).toBeGreaterThan(neutral * 1.5);
  });
});
describe("estimateOverallPick", () => {
  it("maps round and slot onto an overall pick number", () => {
    expect(estimateOverallPick(1, 0, { slot: 1, teams: 14 })).toBe(1);
    expect(estimateOverallPick(2, 0, { slot: 1, teams: 14 })).toBe(15);
    expect(estimateOverallPick(3, 0, { slot: 14, teams: 14 })).toBe(42);
  });
  it("inverts standings: the worst team picks first", () => {
    expect(estimateOverallPick(1, 0, { originalTeamRank: 14, teams: 14 })).toBe(
      1,
    );
    expect(estimateOverallPick(1, 0, { originalTeamRank: 1, teams: 14 })).toBe(
      14,
    );
  });
  it("clamps an out-of-range slot into the round", () => {
    expect(estimateOverallPick(1, 0, { slot: 99, teams: 14 })).toBe(14);
    expect(estimateOverallPick(1, 0, { slot: -5, teams: 14 })).toBe(1);
  });
});
describe("cachedValuePlayers", () => {
  it("returns a value-identical map to the uncached call", () => {
    const h = buildFixtureHistory();
    invalidateValuesCache();
    const direct = valuePlayers(
      [...h.players.values()],
      h.currentLeague.scoringSettings,
    );
    const cached = cachedValuePlayers(h);
    expect([...cached.entries()]).toEqual([...direct.entries()]);
  });
  it("hits the cache on a second call - the whole point of it existing", () => {
    const h = buildFixtureHistory();
    invalidateValuesCache();
    const first = cachedValuePlayers(h);
    const second = cachedValuePlayers(h);
    // Same Map INSTANCE, not just equal content - proof the second call never
    // touched valuePlayers again.
    expect(second).toBe(first);
  });
  it("bypasses the cache entirely for a non-default config", () => {
    const h = buildFixtureHistory();
    invalidateValuesCache();
    const customCfg = {
      ...VALUATION_CONFIG,
      maxValue: VALUATION_CONFIG.maxValue / 2,
    };
    const custom = cachedValuePlayers(h, customCfg);
    const defaultAfter = cachedValuePlayers(h);
    // The custom-config call must never have been written into the shared cache -
    // the very next default call still has to be the real, default-config values.
    expect(defaultAfter).not.toBe(custom);
    const direct = valuePlayers(
      [...h.players.values()],
      h.currentLeague.scoringSettings,
    );
    expect([...defaultAfter.entries()]).toEqual([...direct.entries()]);
  });
  it("recomputes after invalidation, and for a different corpus instance", () => {
    const h = buildFixtureHistory();
    invalidateValuesCache();
    const first = cachedValuePlayers(h);
    invalidateValuesCache();
    const second = cachedValuePlayers(h);
    expect(second).not.toBe(first);
    expect([...second.entries()]).toEqual([...first.entries()]);
    // A different corpus (new players Map instance, as every corpus refresh
    // produces) must never see the old corpus's values - identity is the key.
    const h2 = buildFixtureHistory();
    expect(cachedValuePlayers(h2)).not.toBe(second);
  });
});
