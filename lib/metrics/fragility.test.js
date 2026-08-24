import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory.js";
import { cachedValuePlayers } from "../valuation/index.js";
import {
  assetsFromIds,
  availabilityExposure,
  concentration,
  concentrationBenchmark,
  depthBeyondStarters,
  EXPOSURE_REF,
  fragilityPercentile,
  getFragilityProfile,
  LIVE_WORST_EXPOSURE,
  leagueFragility,
  lineupSlots,
  LOO_TOP_K,
  looDamage,
  MIN_ASSETS_FOR_FRAGILITY,
  replacementLevel,
  scoreFragility,
  slotEligible,
  solveLineup,
  startableValue,
  starterWeights,
  W_CONCENTRATION,
  W_EXPOSURE,
  W_LOO,
} from "./fragility.js";
const h = buildFixtureHistory();
/** Seven-slot lock-in lineup, the shape this league actually runs. */
const SLOTS = ["PG", "SG", "SF", "PF", "C", "UTIL", "UTIL"];
/** Terse asset builder so the property tests read as the property, not as plumbing. */
function asset(id, value, positions, age = 25, injuryStatus = null) {
  return { playerId: id, name: `P-${id}`, value, positions, age, injuryStatus };
}
/** A legal, positionally complete roster of `n` players at the given values. */
function roster(values) {
  const cycle = ["PG", "SG", "SF", "PF", "C"];
  return values.map((v, i) => asset(`a${i}`, v, [cycle[i % cycle.length]]));
}
describe("slotEligible", () => {
  it("lets anyone fill a wildcard slot", () => {
    expect(slotEligible("UTIL", ["C"])).toBe(true);
    expect(slotEligible("FLEX", ["PG"])).toBe(true);
    expect(slotEligible("SUPER_FLEX", [])).toBe(true);
  });
  it("requires an exact match for a named position slot", () => {
    expect(slotEligible("C", ["C", "PF"])).toBe(true);
    expect(slotEligible("PG", ["SG"])).toBe(false);
    expect(slotEligible("C", [])).toBe(false);
  });
  it("resolves grouped guard and forward slots", () => {
    expect(slotEligible("G", ["SG", "SF"])).toBe(true);
    expect(slotEligible("G", ["PF"])).toBe(false);
    expect(slotEligible("F", ["PF"])).toBe(true);
    expect(slotEligible("F", ["PG"])).toBe(false);
  });
});
describe("solveLineup (exact assignment)", () => {
  it("is 0 with no slots or no assets", () => {
    expect(startableValue(roster([1000, 900]), [])).toBe(0);
    expect(startableValue([], SLOTS)).toBe(0);
  });
  /**
   * The reason this is an exact solver and not a greedy one. Taking the most valuable
   * player first and giving him the first slot he fits strands the specialists behind
   * him. If this test fails the whole metric is wrong, because every damage number is a
   * difference between two of these solves.
   */
  it("beats greedy: does not strand a specialist behind a flexible star", () => {
    const assets = [
      asset("flex", 100, ["C", "PF"]),
      asset("conly", 90, ["C"]),
      asset("ponly", 50, ["PF"]),
    ];
    // Greedy by value would put `flex` in C and leave `conly` unusable: 100 + 50 = 150.
    expect(startableValue(assets, ["C", "PF"])).toBe(190);
  });
  it("only counts as many players as there are slots", () => {
    const assets = roster([1000, 900, 800, 700, 600, 500, 400, 300, 200]);
    const total = assets.reduce((s, a) => s + a.value, 0);
    const solved = solveLineup(assets, SLOTS);
    expect(solved.starterIds.size).toBe(SLOTS.length);
    expect(solved.value).toBeLessThan(total);
  });
  it("uses every body when the roster is shorter than the lineup", () => {
    const assets = roster([1000, 900, 500]);
    expect(startableValue(assets, SLOTS)).toBe(2400);
    expect(solveLineup(assets, SLOTS).starterIds.size).toBe(3);
  });
  it("never decreases when an asset is added", () => {
    const base = roster([1000, 900, 800, 700, 600, 500, 400]);
    for (const extra of [10, 450, 5000]) {
      const with1 = [...base, asset("x", extra, ["C"])];
      expect(startableValue(with1, SLOTS)).toBeGreaterThanOrEqual(
        startableValue(base, SLOTS),
      );
    }
  });
  it("cannot exceed the sum of the best `slots` values", () => {
    const assets = roster([1000, 900, 800, 700, 600, 500, 400, 300]);
    const ceiling = [...assets]
      .sort((a, b) => b.value - a.value)
      .slice(0, SLOTS.length)
      .reduce((s, a) => s + a.value, 0);
    expect(startableValue(assets, SLOTS)).toBeLessThanOrEqual(ceiling);
  });
  it("respects positional scarcity: a five-centre roster cannot fill five slots", () => {
    const fives = [1, 2, 3, 4, 5].map((i) => asset(`c${i}`, 1000, ["C"]));
    // C plus two UTIL is all a centre-only roster can legally fill.
    expect(startableValue(fives, SLOTS)).toBe(3000);
  });
  it("is deterministic across repeated solves", () => {
    const assets = roster([1000, 1000, 1000, 900, 900, 800, 800, 700]);
    const a = solveLineup(assets, SLOTS);
    const b = solveLineup(assets, SLOTS);
    expect(a.value).toBe(b.value);
    expect([...a.starterIds].sort()).toEqual([...b.starterIds].sort());
  });
});
describe("looDamage", () => {
  const deep = roster([1000, 900, 800, 700, 600, 500, 400, 350, 300, 250]);
  it("bounds every damage by the player's own value", () => {
    for (const d of looDamage(deep, SLOTS)) {
      expect(d.damage).toBeGreaterThanOrEqual(0);
      expect(d.damage).toBeLessThanOrEqual(d.value);
    }
  });
  /**
   * Deleting a bench player cannot lower the optimal lineup, because that lineup is
   * still legal without him. Exactly 0, not approximately.
   */
  it("assigns exactly zero damage to non-starters", () => {
    for (const d of looDamage(deep, SLOTS)) {
      if (!d.starter) expect(d.damage).toBe(0);
    }
  });
  it("keeps damage shares inside 0..1 and summing to at most 1", () => {
    const ds = looDamage(deep, SLOTS);
    let sum = 0;
    for (const d of ds) {
      expect(d.damageShare).toBeGreaterThanOrEqual(0);
      expect(d.damageShare).toBeLessThanOrEqual(1);
      sum += d.damageShare;
    }
    expect(sum).toBeLessThanOrEqual(1.0000001);
  });
  it("charges a positionally unique starter his whole value", () => {
    const assets = [asset("c", 1000, ["C"]), asset("g", 900, ["PG"])];
    const ds = looDamage(assets, ["C"]);
    const c = ds.find((d) => d.playerId === "c");
    expect(c.damage).toBe(1000);
    expect(c.damageShare).toBe(1);
  });
  it("nets off the best internal replacement when one exists", () => {
    const assets = [asset("c1", 1000, ["C"]), asset("c2", 800, ["C"])];
    const ds = looDamage(assets, ["C"]);
    expect(ds.find((d) => d.playerId === "c1").damage).toBe(200);
    expect(ds.find((d) => d.playerId === "c2").damage).toBe(0);
  });
  /** The whole point of leave-one-out over "share of value": depth is priced. */
  it("charges the same star more when his backup is worse", () => {
    const withGoodBackup = [asset("c1", 1000, ["C"]), asset("c2", 900, ["C"])];
    const withBadBackup = [asset("c1", 1000, ["C"]), asset("c2", 100, ["C"])];
    const d = (as) =>
      looDamage(as, ["C"]).find((x) => x.playerId === "c1").damage;
    expect(d(withBadBackup)).toBeGreaterThan(d(withGoodBackup));
  });
  it("returns every asset, sorted by damage descending, deterministically", () => {
    const a = looDamage(deep, SLOTS);
    const b = looDamage(deep, SLOTS);
    expect(a).toHaveLength(deep.length);
    expect(a.map((d) => d.playerId)).toEqual(b.map((d) => d.playerId));
    for (let i = 1; i < a.length; i++) {
      expect(a[i].damage).toBeLessThanOrEqual(a[i - 1].damage);
    }
  });
});
describe("concentration (normalized HHI)", () => {
  it("is 0 for a perfectly even set, at any size", () => {
    expect(concentration([100, 100])).toBeCloseTo(0, 10);
    expect(concentration([100, 100, 100, 100])).toBeCloseTo(0, 10);
    expect(concentration(Array.from({ length: 20 }, () => 7))).toBeCloseTo(
      0,
      10,
    );
  });
  it("is 1 for a single asset, and for nothing at all", () => {
    expect(concentration([100])).toBe(1);
    expect(concentration([])).toBe(1);
    expect(concentration([0, 0])).toBe(1);
  });
  it("scores a concentrated set above an even one at identical total", () => {
    const even = [250, 250, 250, 250];
    const conc = [700, 100, 100, 100];
    expect(even.reduce((s, v) => s + v, 0)).toBe(
      conc.reduce((s, v) => s + v, 0),
    );
    expect(concentration(conc)).toBeGreaterThan(concentration(even));
  });
  it("rises monotonically as value moves from the small asset to the large one", () => {
    let last = -1;
    for (const shift of [0, 50, 100, 150, 200, 240]) {
      const c = concentration([250 + shift, 250 - shift, 250, 250]);
      expect(c).toBeGreaterThan(last);
      last = c;
    }
  });
  it("stays inside 0..1 across a wide sweep of shapes", () => {
    const shapes = [
      [1],
      [1, 1],
      [1e6, 1],
      [1e6, 1e6, 1],
      [5, 4, 3, 2, 1],
      Array.from({ length: 30 }, (_, i) => i + 1),
      Array.from({ length: 19 }, (_, i) => 10000 / (i + 1)),
    ];
    for (const s of shapes) {
      const c = concentration(s);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
  it("ignores zero-value assets rather than counting them as diversification", () => {
    expect(concentration([100, 100, 0, 0, 0])).toBeCloseTo(
      concentration([100, 100]),
      10,
    );
    expect(concentration([100, 100, 0, 0, 0], 14)).toBeCloseTo(
      concentration([100, 100], 14),
      10,
    );
  });
  it("derives the even-distribution benchmark from the lineup", () => {
    expect(concentrationBenchmark(SLOTS)).toBe(14);
    expect(concentrationBenchmark(["PG", "SG", "SF", "PF", "C"])).toBe(10);
  });
  /**
   * The reason `minMembers` exists. Against a fixed benchmark, adding backups lowers
   * concentration. Against a floating n it RAISES it, because backups are below the mean
   * and normalized HHI reads that as inequality. The second assertion pins the wrong
   * answer in place so nobody quietly removes the floor.
   */
  it("needs a fixed benchmark for adding depth to lower concentration", () => {
    const bench = concentrationBenchmark(SLOTS);
    const thin = [3000, 2800, 2600, 2400, 2200];
    const deep = [...thin, 750, 750, 750, 750, 750];
    expect(concentration(deep, bench)).toBeLessThan(concentration(thin, bench));
    expect(concentration(deep)).toBeGreaterThan(concentration(thin));
  });
  it("still maps an evenly filled benchmark roster to 0", () => {
    const even = Array.from({ length: 14 }, () => 500);
    expect(concentration(even, concentrationBenchmark(SLOTS))).toBeCloseTo(
      0,
      10,
    );
  });
});
describe("starterWeights", () => {
  it("discounts bench assets and leaves starters whole", () => {
    const assets = roster([1000, 900, 800, 700, 600, 500, 400, 300]);
    const ws = starterWeights(assets, SLOTS);
    const starters = solveLineup(assets, SLOTS).starterIds;
    assets.forEach((a, i) => {
      expect(ws[i]).toBe(starters.has(a.playerId) ? a.value : a.value * 0.5);
    });
  });
  it("makes two stars plus scrubs read as more concentrated than raw value does", () => {
    const assets = [
      asset("s1", 5000, ["PG"]),
      asset("s2", 5000, ["C"]),
      ...Array.from({ length: 10 }, (_, i) => asset(`b${i}`, 400, ["SF"])),
    ];
    const raw = concentration(assets.map((a) => a.value));
    const weighted = concentration(starterWeights(assets, SLOTS));
    expect(weighted).toBeGreaterThan(raw);
  });
});
describe("availabilityExposure", () => {
  const values = [4000, 3000, 2000, 1000];
  it("is 0 for a healthy prime-age roster", () => {
    const healthy = values.map((v, i) => asset(`h${i}`, v, ["PG"], 26, null));
    expect(availabilityExposure(healthy)).toBe(0);
  });
  /** The required property: same value, worse bodies, more exposure. */
  it("scores the same values higher when the bodies are injured or old", () => {
    const healthy = values.map((v, i) => asset(`h${i}`, v, ["PG"], 26, null));
    const injured = values.map((v, i) => asset(`i${i}`, v, ["PG"], 26, "IR"));
    const old = values.map((v, i) => asset(`o${i}`, v, ["PG"], 37, null));
    const both = values.map((v, i) => asset(`b${i}`, v, ["PG"], 37, "IR"));
    const e = availabilityExposure;
    expect(e(injured)).toBeGreaterThan(e(healthy));
    expect(e(old)).toBeGreaterThan(e(healthy));
    expect(e(both)).toBeGreaterThan(e(old));
    expect(e(both)).toBeGreaterThan(e(injured));
  });
  it("rises monotonically with age past the taper", () => {
    let last = -1;
    for (const age of [30, 33, 35, 37, 39, 41]) {
      const e = availabilityExposure([asset("x", 1000, ["PG"], age)]);
      expect(e).toBeGreaterThanOrEqual(last);
      last = e;
    }
    expect(last).toBe(1);
  });
  it("weights by value, not by headcount", () => {
    const bigOld = [asset("a", 9000, ["PG"], 38), asset("b", 100, ["C"], 24)];
    const smallOld = [asset("a", 100, ["PG"], 38), asset("b", 9000, ["C"], 24)];
    expect(availabilityExposure(bigOld)).toBeGreaterThan(
      availabilityExposure(smallOld),
    );
  });
  it("stays inside 0..1 and handles empty and unknown-age inputs", () => {
    expect(availabilityExposure([])).toBe(0);
    const unknown = availabilityExposure([asset("u", 1000, ["PG"], null)]);
    expect(unknown).toBeGreaterThanOrEqual(0);
    expect(unknown).toBeLessThanOrEqual(1);
    const worst = availabilityExposure([asset("w", 1000, ["PG"], 45, "IR")]);
    expect(worst).toBeLessThanOrEqual(1);
  });
});
describe("depth", () => {
  it("counts startable-quality bodies against the number of slots", () => {
    const assets = roster([2000, 1800, 1600, 1400, 1200, 1000, 800, 200, 100]);
    expect(depthBeyondStarters(assets, SLOTS, 1000)).toBe(-1);
    expect(depthBeyondStarters(assets, SLOTS, 100)).toBe(2);
  });
  it("derives replacement level from the league's own pool", () => {
    const pool = Array.from({ length: 100 }, (_, i) => 10000 - i * 50);
    expect(replacementLevel(pool, 1)).toBe(10000);
    expect(replacementLevel(pool, 98)).toBe(10000 - 97 * 50);
    // Asking for more bodies than exist falls back to the last real value.
    expect(replacementLevel(pool, 500)).toBe(10000 - 99 * 50);
    expect(replacementLevel([], 98)).toBe(0);
  });
});
describe("the index", () => {
  const total = 14000;
  /** The headline property: same total value, concentrated is more fragile. */
  it("scores a concentrated roster above an even one at identical total value", () => {
    const cycle = ["PG", "SG", "SF", "PF", "C", "PG", "SG"];
    const even = cycle.map((p, i) => asset(`e${i}`, total / 7, [p]));
    const conc = [
      asset("c0", 6000, ["PG"]),
      asset("c1", 5000, ["SG"]),
      asset("c2", 1400, ["SF"]),
      asset("c3", 400, ["PF"]),
      asset("c4", 400, ["C"]),
      asset("c5", 400, ["PG"]),
      asset("c6", 400, ["SG"]),
    ];
    expect(conc.reduce((s, a) => s + a.value, 0)).toBe(total);
    const e = scoreFragility(even, SLOTS);
    const c = scoreFragility(conc, SLOTS);
    expect(c.raw).toBeGreaterThan(e.raw);
    expect(c.concentrationScore).toBeGreaterThan(e.concentrationScore);
    expect(c.looScore).toBeGreaterThan(e.looScore);
  });
  /**
   * The second required property: taking depth away makes a roster more fragile.
   *
   * Run on a five-slot, one-player-per-position lineup on purpose, because that is the
   * shape where every removal genuinely removes coverage. Strip the bench one man at a
   * time and fragility has to climb at every single step.
   */
  it("becomes more fragile as load-bearing depth is stripped away", () => {
    const five = ["PG", "SG", "SF", "PF", "C"];
    const starters = five.map((p, i) => asset(`s${i}`, 3000 - i * 200, [p]));
    const bench = five.map((p, i) => asset(`b${i}`, 1500, [p]));
    let last = -1;
    for (let keep = bench.length; keep >= 0; keep--) {
      const raw = scoreFragility(
        [...starters, ...bench.slice(0, keep)],
        five,
      ).raw;
      expect(raw).toBeGreaterThan(last);
      last = raw;
    }
    // And the fully stripped roster is dramatically worse than the deep one, not
    // marginally: with no bench, every starter is worth his whole value in damage.
    const stripped = scoreFragility(starters, five);
    const deep = scoreFragility([...starters, ...bench], five);
    expect(stripped.looScore - deep.looScore).toBeGreaterThan(20);
  });
  /**
   * The flip side, and the reason the test above uses a five-slot lineup: LOO prices
   * COVERAGE, not bodies. A third identical guard behind two identical guards adds no
   * coverage, because no single injury ever reaches him, and the damage table says so.
   * A metric that charged for him would be counting roster spots, not fragility.
   */
  it("charges nothing for depth that was already redundant", () => {
    const starters = [
      asset("s0", 3000, ["PG"]),
      asset("s1", 2800, ["SG"]),
      asset("s2", 2600, ["SF"]),
      asset("s3", 2400, ["PF"]),
      asset("s4", 2200, ["C"]),
      asset("s5", 2000, ["PG"]),
      asset("s6", 1800, ["SG"]),
    ];
    const two = [
      ...starters,
      asset("b0", 1500, ["PG"]),
      asset("b1", 1500, ["PG"]),
    ];
    const three = [...two, asset("b2", 1500, ["PG"])];
    expect(scoreFragility(three, SLOTS).looScore).toBeCloseTo(
      scoreFragility(two, SLOTS).looScore,
      9,
    );
  });
  it("scores healthy prime bodies as less exposed than the same values in old ones", () => {
    const vals = [3000, 2800, 2600, 2400, 2200, 2000, 1800];
    const cycle = ["PG", "SG", "SF", "PF", "C", "PG", "SG"];
    const young = vals.map((v, i) => asset(`y${i}`, v, [cycle[i]], 25, null));
    const aged = vals.map((v, i) => asset(`o${i}`, v, [cycle[i]], 38, "IR"));
    const y = scoreFragility(young, SLOTS);
    const o = scoreFragility(aged, SLOTS);
    expect(o.exposureScore).toBeGreaterThan(y.exposureScore);
    expect(o.raw).toBeGreaterThan(y.raw);
    // The other two components are untouched by health, which is what keeps the
    // components independent rather than three views of the same number.
    expect(o.looScore).toBeCloseTo(y.looScore, 9);
    expect(o.concentrationScore).toBeCloseTo(y.concentrationScore, 9);
  });
  it("is the declared weighted combination of its components", () => {
    const s = scoreFragility(
      roster([4000, 3000, 2000, 1500, 1000, 800, 600, 400]),
      SLOTS,
    );
    const expected =
      W_LOO * s.looScore +
      W_CONCENTRATION * s.concentrationScore +
      W_EXPOSURE * s.exposureScore;
    expect(s.raw).toBeCloseTo(expected, 9);
  });
  it("uses weights that sum to 1", () => {
    expect(W_LOO + W_CONCENTRATION + W_EXPOSURE).toBeCloseTo(1, 10);
  });
  it("stays inside 0..100 across degenerate and extreme rosters", () => {
    const cases = [
      [],
      [asset("solo", 9999, ["C"], 41, "IR")],
      roster([1]),
      roster(Array.from({ length: 25 }, () => 1000)),
      roster([10000, 1, 1, 1, 1, 1, 1, 1]),
      Array.from({ length: 8 }, (_, i) =>
        asset(`c${i}`, 5000, ["C"], 40, "IR"),
      ),
    ];
    for (const c of cases) {
      const s = scoreFragility(c, SLOTS);
      expect(s.raw).toBeGreaterThanOrEqual(0);
      expect(s.raw).toBeLessThanOrEqual(100);
      for (const comp of [s.looScore, s.concentrationScore, s.exposureScore]) {
        expect(comp).toBeGreaterThanOrEqual(0);
        expect(comp).toBeLessThanOrEqual(100);
      }
    }
  });
});
describe("fragilityPercentile", () => {
  const raws = [10, 20, 30, 40, 50];
  it("puts the most fragile roster at 1 and the least at 0", () => {
    expect(fragilityPercentile(50, raws)).toBe(1);
    expect(fragilityPercentile(10, raws)).toBe(0);
  });
  it("is monotone and bounded", () => {
    let last = -1;
    for (const r of raws) {
      const p = fragilityPercentile(r, raws);
      expect(p).toBeGreaterThan(last);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      last = p;
    }
  });
  it("falls back to the median with no league to compare against", () => {
    expect(fragilityPercentile(42, [])).toBe(0.5);
    expect(fragilityPercentile(42, [42])).toBe(0.5);
  });
});
describe("Roster Fragility Index over the league", () => {
  it("reads this league's lineup slots rather than assuming them", () => {
    expect(lineupSlots(h)).toEqual(SLOTS);
  });
  it("produces a bounded, complete profile for every roster", () => {
    for (const r of h.rosters) {
      const p = getFragilityProfile(h, r.rosterId);
      expect(p.fragility).toBeGreaterThanOrEqual(0);
      expect(p.fragility).toBeLessThanOrEqual(100);
      expect(p.percentile).toBeGreaterThanOrEqual(0);
      expect(p.percentile).toBeLessThanOrEqual(1);
      for (const c of [p.looScore, p.concentrationScore, p.exposureScore]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(100);
      }
      expect(["resilient", "balanced", "brittle"]).toContain(p.band);
      expect(p.read.length).toBeGreaterThan(0);
      expect(p.startableValue).toBeGreaterThan(0);
      expect(p.singlePointOfFailure).not.toBeNull();
      expect(p.singlePointOfFailure.name.length).toBeGreaterThan(0);
      expect(p.singlePointOfFailure.damageShare).toBeGreaterThan(0);
      expect(p.singlePointOfFailure.damageShare).toBeLessThanOrEqual(1);
    }
  });
  it("names the single point of failure as the top of the damage table", () => {
    const p = getFragilityProfile(h, h.me.rosterId);
    expect(p.singlePointOfFailure.playerId).toBe(p.damages[0].playerId);
    expect(p.spofDamageShare).toBeCloseTo(p.damages[0].damageShare, 3);
    // He must be a real player on the roster, not a synthesised label.
    expect(h.rostersById.get(p.rosterId).players).toContain(
      p.singlePointOfFailure.playerId,
    );
  });
  it("counts players only: pick capital is not depth", () => {
    const p = getFragilityProfile(h, h.me.rosterId);
    const fromDamages = p.damages.reduce((s, d) => s + d.value, 0);
    expect(p.playerValue).toBe(fromDamages);
    expect(p.startableValue).toBeLessThanOrEqual(p.playerValue);
  });
  it("ranks the whole league, most fragile first", () => {
    const all = leagueFragility(h);
    expect(all).toHaveLength(h.rosters.length);
    for (let i = 1; i < all.length; i++) {
      expect(all[i].fragility).toBeLessThanOrEqual(all[i - 1].fragility);
    }
    // THE TOP PERCENTILE IS THE LEAGUE MAXIMUM, NOT NECESSARILY 1.0, and that is the
    // metric's design rather than a tolerance. `fragilityPercentile` ranks against the
    // ROUNDED ladder precisely so that two rosters displaying the same number share one
    // percentile and one band - so whenever the two most fragile rosters round to the
    // same index, the maximum reachable percentile is 12/13, and asserting exactly 1
    // asserts "no tie at the top", which is a property of the fixture data and not of
    // the metric. It stopped holding when EXPOSURE_REF moved to 0.18 and two fixture
    // rosters tied; nothing about the ranking broke.
    const percentiles = all.map((p) => p.percentile);
    expect(all[0].percentile).toBe(Math.max(...percentiles));
    expect(all[all.length - 1].percentile).toBe(Math.min(...percentiles));
    expect(all[all.length - 1].percentile).toBe(0);
    expect(all[0].band).toBe("brittle");
    expect(all[all.length - 1].band).toBe("resilient");
  });
  /**
   * Calibration guard. A metric that puts fourteen teams inside a five-point band has
   * measured nothing, which is exactly how the first cut of TCI failed (SIGMA_REF = 4
   * compressed the league into 62-80). If a future retune flattens the distribution,
   * this fails rather than quietly shipping a useless number.
   */
  it("discriminates across the league instead of clustering", () => {
    const scores = leagueFragility(h).map((p) => p.fragility);
    const spread = Math.max(...scores) - Math.min(...scores);
    expect(spread).toBeGreaterThan(20);
    // TOLERANCE WIDENED 2 -> 4, and the cause is a FIXTURE change rather than a
    // retune of this metric. The fixture provider now carries real depth-chart data
    // (lib/providers/fixture/generate.js), so `roleMultiplier` in lib/valuation - it
    // reads `depthChartOrder`, and every fixture player used to have none, meaning it
    // returned `unknown` for all 288 - fires in a fixture run for the first time.
    // Fourteen integer scores pulled slightly closer together tie by pigeonhole:
    // three rosters land on 51 now, two each on 55 and 31. What this guard exists to
    // protect has not moved and is still asserted on the line above: the spread is
    // 34, not the five-point band that killed the first cut of TCI.
    expect(new Set(scores).size).toBeGreaterThanOrEqual(scores.length - 4);
    // And no component may sit pinned at either rail for the whole league.
    for (const key of ["looScore", "concentrationScore", "exposureScore"]) {
      const vals = leagueFragility(h).map((p) => p[key]);
      expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(15);
      expect(vals.filter((v) => v >= 100).length).toBeLessThan(3);
    }
  });
  /**
   * THE READER'S INVARIANT: two identical numbers may never carry two different bands.
   *
   * This was broken for as long as the metric has existed, and `/league`'s quadrant is
   * what made it visible - it is the first surface that renders the score and the band
   * adjacent in one sorted list, and on the live league it read:
   *
   *     nathang21     63 / 46   resilient
   *     5-Year Plan   65 / 50   balanced
   *     zachgoldy     71 / 46   balanced
   *     6-Month Plan  71 / 43   resilient
   *
   * 46 resilient above 46 balanced, with 43 resilient below both. The cause was that
   * `fragility` was rounded for display while `band` came off the UNROUNDED index's
   * percentile, so two rosters less than 0.5 apart could land on opposite sides of the
   * 25th-percentile line while showing the same number. Both are now read off the same
   * rounded ladder, which makes the invariant hold by construction rather than by
   * formatting, and these three tests are what stop it drifting back.
   */
  describe("the number and the band cannot contradict each other", () => {
    it("gives equal displayed scores an equal band and an equal percentile", () => {
      const all = leagueFragility(h);
      const byScore = new Map();
      for (const p of all) {
        byScore.set(p.fragility, [...(byScore.get(p.fragility) ?? []), p]);
      }
      // Non-vacuous: the fixture league genuinely ties two rosters on one number, so
      // there is at least one group where the invariant has something to say.
      expect(byScore.size).toBeLessThan(all.length);
      for (const [score, group] of byScore) {
        expect(
          `${score} -> ${[...new Set(group.map((p) => p.band))].join(" AND ")}`,
        ).toBe(`${score} -> ${group[0].band}`);
        expect(new Set(group.map((p) => p.percentile)).size).toBe(1);
      }
    });
    it("never shows a lower score a MORE brittle band than a higher one", () => {
      // The general form of the live contradiction: read top to bottom, brittleness may
      // only ever weaken. `leagueFragility` is already sorted most fragile first.
      const rank = { resilient: 0, balanced: 1, brittle: 2 };
      const all = leagueFragility(h);
      for (let i = 1; i < all.length; i++) {
        expect(rank[all[i].band]).toBeLessThanOrEqual(rank[all[i - 1].band]);
        // And the ordering the bands ride on is the DISPLAYED number, not a hidden one.
        expect(all[i].fragility).toBeLessThanOrEqual(all[i - 1].fragility);
      }
    });
    it("classifies off the displayed number, not off a finer one behind it", () => {
      // Every profile's percentile has to be reproducible from the numbers a reader can
      // see. If the band were still derived from an unrounded index this fails, because
      // no ladder of displayed scores can reproduce a percentile computed off raws.
      const all = leagueFragility(h);
      const ladder = all.map((p) => p.fragility);
      for (const p of all) {
        expect(p.percentile).toBeCloseTo(
          Math.round(fragilityPercentile(p.fragility, ladder) * 100) / 100,
          5,
        );
      }
    });
  });
  it("agrees between the single-roster getter and the league pass", () => {
    const all = leagueFragility(h);
    for (const p of all) {
      const one = getFragilityProfile(h, p.rosterId);
      expect(one.fragility).toBe(p.fragility);
      expect(one.percentile).toBe(p.percentile);
      expect(one.singlePointOfFailure.playerId).toBe(
        p.singlePointOfFailure.playerId,
      );
    }
  });
  it("refuses rather than fabricates for a roster that is not in the league", () => {
    // This used to assert `fragility: 0` - the exact D102-mirror bug: an unknown
    // roster read as the sturdiest roster in the league rather than as unread. There
    // is no record for roster 9999 at all, so this is NO_RECORD, not a floor of 0.
    const p = getFragilityProfile(h, 9999);
    expect(p.fragility).toBeNull();
    expect(p.band).toBeNull();
    expect(p.refusal.code).toBe("NO_RECORD");
    expect(p.singlePointOfFailure).toBeNull();
    expect(p.damages).toEqual([]);
    expect(p.read.length).toBeGreaterThan(0);
  });
  it("is deterministic: same corpus in, identical numbers out", () => {
    const a = leagueFragility(h);
    const b = leagueFragility(buildFixtureHistory());
    expect(a.map((p) => p.rosterId)).toEqual(b.map((p) => p.rosterId));
    expect(a.map((p) => p.fragility)).toEqual(b.map((p) => p.fragility));
    expect(a.map((p) => p.looScore)).toEqual(b.map((p) => p.looScore));
    expect(a.map((p) => p.concentrationScore)).toEqual(
      b.map((p) => p.concentrationScore),
    );
    expect(a.map((p) => p.exposureScore)).toEqual(
      b.map((p) => p.exposureScore),
    );
    expect(a.map((p) => p.singlePointOfFailure?.damage)).toEqual(
      b.map((p) => p.singlePointOfFailure?.damage),
    );
    expect(a.map((p) => p.read)).toEqual(b.map((p) => p.read));
  });
  it("measures fragility, not quality: the read says so for a robust roster", () => {
    const all = leagueFragility(h);
    const least = all[all.length - 1];
    expect(least.read).toMatch(/depth/i);
    expect(all[0].read).toMatch(/fragile/i);
  });
  it("uses one league-wide replacement line for every roster", () => {
    const all = leagueFragility(h);
    const lines = new Set(all.map((p) => p.replacementValue));
    expect(lines.size).toBe(1);
    expect([...lines][0]).toBeGreaterThan(0);
    // Depth has to net to roughly zero across the league by construction: the line is
    // set at teams * slots, so the league as a whole owns about that many startable
    // bodies and the surpluses and deficits offset.
    const netDepth = all.reduce((s, p) => s + p.depthBeyondStarters, 0);
    expect(Math.abs(netDepth)).toBeLessThanOrEqual(h.rosters.length);
  });
  it("excludes taxi-squad players from startable depth", () => {
    // Create a history where one roster has a valuable player on taxi
    const h1 = buildFixtureHistory();
    const targetRoster = h1.rosters[0];
    if (!targetRoster || targetRoster.players.length === 0) {
      throw new Error("Test fixture has no rosters with players");
    }
    // Move a player from active to taxi: this player should not count as startable depth
    const playerToTaxi = targetRoster.players[0];
    const beforeWithTaxi = {
      ...h1,
      rosters: h1.rosters.map((r) =>
        r.rosterId === targetRoster.rosterId
          ? { ...r, taxi: [playerToTaxi, ...r.taxi] }
          : r,
      ),
      rostersById: new Map(
        h1.rosters.map((r) =>
          r.rosterId === targetRoster.rosterId
            ? [r.rosterId, { ...r, taxi: [playerToTaxi, ...r.taxi] }]
            : [r.rosterId, r],
        ),
      ),
    };
    // Calculate fragility before and after moving to taxi
    const fragBefore = leagueFragility(h1);
    const fragAfter = leagueFragility(beforeWithTaxi);
    const profileBefore = fragBefore.find(
      (p) => p.rosterId === targetRoster.rosterId,
    );
    const profileAfter = fragAfter.find(
      (p) => p.rosterId === targetRoster.rosterId,
    );
    if (!profileBefore || !profileAfter) {
      throw new Error("Could not find roster profiles");
    }
    // After moving a player to taxi, depth should decrease (fewer startable bodies)
    expect(profileAfter.depthBeyondStarters).toBeLessThan(
      profileBefore.depthBeyondStarters,
    );
  });
});
/**
 * THE TWO BUGS THIS DESCRIBE BLOCK CLOSES, BOTH CONFIRMED BY MEASUREMENT AGAINST THIS
 * FIXTURE LEAGUE BEFORE EITHER FIX WAS WRITTEN.
 *
 * 1. A zero-asset roster used to read `fragility: 0, band: "resilient"` - the sturdiest
 *    roster in the league, fabricated for a roster this file cannot read at all. The
 *    exact mirror of the bug D102 fixed in TCI's `getTimelineProfile`.
 * 2. `looScore` and `concentrationScore` both saturate at 100 for a roster holding
 *    `LOO_TOP_K` (3) or fewer valued assets, REGARDLESS OF COMPOSITION: every one of
 *    this fixture league's fourteen real rosters, stripped to its own top 1, 2 or 3
 *    assets by value, reads an identical raw 80.0. A number with zero variance across
 *    fourteen different rosters is reading the count, not the roster.
 */
describe("the closed refusal register catches what the score used to fabricate", () => {
  /**
   * `buildFixtureHistory` hands back roster objects drawn from `corpus()`'s own
   * module-level singleton (lib/providers/fixture/index.js), NOT a fresh clone per
   * call - the same singleton the "excludes taxi-squad players" test above already
   * had to work around by copying rather than mutating. Mutating a roster in place
   * therefore leaks into every OTHER `buildFixtureHistory()` call made anywhere later
   * in this same test file/worker. This helper replaces the roster with a fresh
   * object instead, in both `rosters` and `rostersById`, so the singleton is never
   * touched.
   */
  function withRosterPlayers(h1, rosterId, players) {
    return {
      ...h1,
      rosters: h1.rosters.map((r) =>
        r.rosterId === rosterId ? { ...r, players } : r,
      ),
      rostersById: new Map(
        h1.rosters.map((r) => [
          r.rosterId,
          r.rosterId === rosterId ? { ...r, players } : r,
        ]),
      ),
    };
  }
  /**
   * A roster holding nothing priced, built by stripping a real fixture roster rather
   * than hand-rolling one - the same technique `historyWithAnEmptyRoster` in
   * axes.test.js uses for TCI's mirror-image case. Unlike TCI, fragility's asset list
   * never includes draft picks (`assetsOf` reads only `roster.players`), so emptying
   * `players` alone is enough to reach the branch under test.
   */
  function historyWithAnEmptyRoster() {
    const base = buildFixtureHistory();
    const victim = base.rosters[0].rosterId;
    return { h: withRosterPlayers(base, victim, []), victim };
  }
  /** A roster stripped to its own top `n` assets by value, real composition intact. */
  function historyWithNAssets(n) {
    const base = buildFixtureHistory();
    const victimId = base.rosters[0].rosterId;
    const values = cachedValuePlayers(base);
    const valueOf = (pid) => values.get(pid)?.value ?? 0;
    const roster1 = base.rostersById.get(victimId);
    const topN = assetsFromIds(roster1.players, base, valueOf)
      .sort((a, b) => b.value - a.value)
      .slice(0, n)
      .map((a) => a.playerId);
    return { h: withRosterPlayers(base, victimId, topN), victim: victimId };
  }
  it("emits NO_RECORD, not fragility 0/resilient, for a roster with no priced asset", () => {
    const { h: h1, victim } = historyWithAnEmptyRoster();
    const p = getFragilityProfile(h1, victim);
    expect(p.assetCount).toBe(0);
    expect(p.fragility).toBeNull();
    expect(p.band).toBeNull();
    expect(p.singlePointOfFailure).toBeNull();
    expect(p.refusal.code).toBe("NO_RECORD");
    // The word it used to be, named so a regression reads as a regression.
    expect(p.band).not.toBe("resilient");
  });
  it("still states real, non-statistical facts about an unread roster", () => {
    // Zero assets is a real zero, not a refused reading - it just isn't a fragility
    // score. Nulling every field would be its own dishonesty in the other direction.
    const { h: h1, victim } = historyWithAnEmptyRoster();
    const p = getFragilityProfile(h1, victim);
    expect(p.startableValue).toBe(0);
    expect(p.playerValue).toBe(0);
    expect(p.depthBeyondStarters).toBeLessThan(0);
  });
  it.each([1, 2, 3])(
    "emits INSUFFICIENT_SAMPLE, citing the real n, for a roster with %i valued asset(s)",
    (n) => {
      const { h: h1, victim } = historyWithNAssets(n);
      const p = getFragilityProfile(h1, victim);
      expect(p.assetCount).toBe(n);
      expect(p.fragility).toBeNull();
      expect(p.band).toBeNull();
      expect(p.refusal.code).toBe("INSUFFICIENT_SAMPLE");
      expect(p.refusal.because).toContain(String(n));
    },
  );
  it("reads a real, non-degenerate score once past the floor", () => {
    const { h: h1, victim } = historyWithNAssets(MIN_ASSETS_FOR_FRAGILITY);
    const p = getFragilityProfile(h1, victim);
    expect(p.assetCount).toBe(MIN_ASSETS_FOR_FRAGILITY);
    expect(p.fragility).not.toBeNull();
    expect(p.band).not.toBeNull();
    expect(p.refusal).toBeNull();
  });
  it("the mechanical saturation this floor exists for, measured directly", () => {
    // Every fixture roster, stripped to its own top LOO_TOP_K assets, pins its LOO and
    // concentration components (0.8 of the index's weight) to their ceiling regardless
    // of which three assets they are - proof those two components are reading the
    // count, not the roster. `raw` itself is not pinned identically everywhere: the
    // remaining 0.2 (exposure) is real signal and does move on a roster whose top
    // three happen to carry age/injury risk, so `raw` is bounded BELOW by a mechanical
    // 80 at this sample size rather than flat at exactly 80 in every case.
    const values = cachedValuePlayers(h);
    const valueOf = (pid) => values.get(pid)?.value ?? 0;
    const slots = lineupSlots(h);
    const scores = h.rosters.map((r) => {
      const taxi = new Set(r.taxi ?? []);
      const assets = assetsFromIds(
        r.players.filter((pid) => !taxi.has(pid)),
        h,
        valueOf,
      )
        .sort((a, b) => b.value - a.value)
        .slice(0, LOO_TOP_K);
      return scoreFragility(assets, slots);
    });
    for (const s of scores) {
      expect(s.topKDamageShare).toBe(1);
      expect(s.looScore).toBe(100);
      expect(s.concentrationScore).toBe(100);
      expect(s.raw).toBeGreaterThanOrEqual(80);
    }
    // At least one real roster's raw score is the mechanical floor exactly, and this
    // fixture league also has at least one whose exposure component pushes it above
    // that floor - so the test is checking a real mix, not a coincidence of the data.
    expect(scores.some((s) => s.raw === 80)).toBe(true);
    expect(scores.some((s) => s.raw > 80)).toBe(true);
  });
  it("does not let a refused roster's score corrupt everyone else's percentile", () => {
    // The ladder that determines every OTHER roster's band must exclude a refused
    // roster's own mechanically-inflated number. Measured, not asserted: with a
    // 3-asset victim spliced in, the other thirteen rosters' bands must be byte-
    // identical to the fourteen-roster league before the splice.
    const before = leagueFragility(h);
    const { h: h1, victim } = historyWithNAssets(LOO_TOP_K);
    const after = leagueFragility(h1);
    for (const p of before) {
      if (p.rosterId === victim) continue;
      const q = after.find((x) => x.rosterId === p.rosterId);
      expect(q.band).toBe(p.band);
      expect(q.fragility).toBe(p.fragility);
    }
  });
  it("sorts refused rosters after every readable one, never implying a rank", () => {
    const { h: h1 } = historyWithAnEmptyRoster();
    const all = leagueFragility(h1);
    const firstRefusedIndex = all.findIndex((p) => p.fragility == null);
    expect(firstRefusedIndex).toBeGreaterThan(-1);
    // Nothing readable appears after the first refused entry.
    for (let i = firstRefusedIndex; i < all.length; i++)
      expect(all[i].fragility).toBeNull();
  });
});

/**
 * THE GUARD THE EXPOSURE REFERENCE HAS NEEDED TWICE AND NEVER HAD.
 *
 * `EXPOSURE_REF` has now been raised twice for the same reason - a recalibration moved
 * value between older and younger players, the worst roster's raw exposure climbed past
 * the reference, `clamp01` pinned the component at exactly 100, and NOTHING FAILED. The
 * component simply stopped being able to tell the worst roster from a worse one. The
 * second time, the fixture league turned out to have been over the line since the first
 * fix, unnoticed, because nobody had measured the league the tests actually run on.
 *
 * These two assertions are cheap and they close both holes. They are deliberately about
 * the DISTRIBUTION rather than about any one number: neither pins a fragility score, so
 * they survive every legitimate change to the value model and fail only on the one thing
 * that must not happen silently.
 */
describe("EXPOSURE_REF stays above the distributions it normalizes (D55)", () => {
  it("leaves every fixture-league roster strictly inside the reference", () => {
    const slots = lineupSlots(h);
    const values = cachedValuePlayers(h);
    const valueOf = (/** @type {string} */ id) => values.get(id)?.value ?? 0;
    const worst = Math.max(
      ...h.rosters.map((r) => {
        const assets = assetsFromIds(r.players, h, valueOf);
        return scoreFragility(assets, slots).rawExposure;
      }),
    );
    expect(worst).toBeLessThan(EXPOSURE_REF);
    // And the component is genuinely still discriminating, not merely un-clipped: the
    // top of the scale has to be reachable-but-unreached, which is the whole stated
    // relationship. A worst roster below half the reference would mean the opposite
    // failure - every team reported as robust.
    expect(worst).toBeGreaterThan(EXPOSURE_REF / 2);
  });
  it("clears the live league's measured worst exposure too", () => {
    // The live league cannot be reached from a test, so its worst is pinned as a
    // constant beside the reference and asserted here. If a recalibration pushes the
    // live worst past the reference, that constant is updated and THIS fails until the
    // reference moves with it.
    expect(LIVE_WORST_EXPOSURE).toBeLessThan(EXPOSURE_REF);
  });
});
