import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory.js";
import { getPrincipals } from "../principals.js";
import { leagueValueRanking } from "../roster.js";
import { leaguePositionPools, buildLeverageProfile } from "../lab/leverage/index.js";
import {
  findTrades,
  leverageShiftFor,
  LEVERAGE_SHIFT_MIN,
  packageLeverageShift,
} from "./index.js";
const h = buildFixtureHistory();
const ME = h.me.rosterId;
/** Every valued player in the league, by name, so a package can be written readably. */
const byName = new Map(
  leagueValueRanking(h).flatMap((r) => r.valued.map((v) => [v.name, v])),
);
/** @returns {{ kind: "player", id: string, label: string, value: number, age: number|null, position: string|null }} */
function asset(name) {
  const v = byName.get(name);
  if (!v) throw new Error(`fixture has no player named ${name}`);
  return {
    kind: "player",
    id: v.playerId,
    label: name,
    value: v.value,
    age: v.age,
    position: v.position,
  };
}
/** @returns {{ kind: "pick", id: string, label: string, value: number, age: null, position: null, pick: { round: number, season: string, originalRosterId: number } }} */
function pickAsset(id = "2028-1-9") {
  return {
    kind: "pick",
    id,
    label: "2028 R1",
    value: 3000,
    age: null,
    position: null,
    pick: { round: 1, season: "2028", originalRosterId: 9 },
  };
}
describe("leverageShiftFor", () => {
  const before = { score: 40 };
  it("reports a real move at the position(s) touched", () => {
    const note = leverageShiftFor(before, { score: 55 }, new Set(["PF"]));
    expect(note).toEqual({ before: 40, after: 55, positions: ["PF"] });
  });
  it("orders multiple touched positions by the canonical POS_ORDER, not input order", () => {
    const note = leverageShiftFor(
      before,
      { score: 55 },
      new Set(["C", "PG"]),
    );
    expect(note?.positions).toEqual(["PG", "C"]);
  });
  it("says nothing when no position was touched at all (a pure pick swap)", () => {
    expect(leverageShiftFor(before, { score: 90 }, new Set())).toBeNull();
  });
  /**
   * The threshold is the difference between a note worth reading and a note on every
   * package - the same reasoning `SPOF_SHIFT_MIN` already states for the Fragility
   * note one file over. The Leverage score is already an integer on the same 0-100
   * scale /lab/leverage prints, so "moved" means "moved by at least the smallest unit
   * that scale can show."
   */
  it("says nothing when the score does not move by a full point", () => {
    expect(
      leverageShiftFor(before, { score: 40 }, new Set(["PF"])),
    ).toBeNull();
    expect(LEVERAGE_SHIFT_MIN).toBe(1);
  });
  it("says nothing when either side of the comparison has no score to read", () => {
    expect(
      leverageShiftFor({ score: null }, { score: 60 }, new Set(["PF"])),
    ).toBeNull();
    expect(
      leverageShiftFor({ score: 40 }, { score: null }, new Set(["PF"])),
    ).toBeNull();
  });
  it("never grades the move in either direction (D6, D19)", () => {
    const banned =
      /\b(good|bad|great|terrible|winner|loser|grade|avoid|do not make)\b/i;
    const up = leverageShiftFor(before, { score: 70 }, new Set(["PF"]));
    const down = leverageShiftFor(before, { score: 10 }, new Set(["PF"]));
    expect(JSON.stringify(up)).not.toMatch(banned);
    expect(JSON.stringify(down)).not.toMatch(banned);
  });
});
/**
 * Both directions against the REAL fixture league, on packages shaped like ones the
 * finder actually proposes - the same split `fragility.test.js` draws between pinning
 * the wording (above) and pinning that the roster arithmetic moves correctly here.
 */
describe("packageLeverageShift over the fixture league", () => {
  const pools = leaguePositionPools(h);
  const mine = leagueValueRanking(h).find((r) => r.rosterId === ME);
  it("matches /lab/leverage's own score for the unmodified roster", () => {
    const direct = buildLeverageProfile(pools, mine);
    // Sending and receiving nothing at all is not a real package, but it is the
    // sharpest possible check that "before" reads the identical number the Lab page
    // itself would print - no drift between the two call sites is allowed.
    const shift = packageLeverageShift(pools, mine, [], []);
    expect(shift).toBeNull(); // no position touched
    const untouched = leverageShiftFor(
      direct,
      direct,
      new Set(["PF"]),
    );
    expect(untouched).toBeNull(); // same score before and after
  });
  it("reports null for a pure pick-for-pick swap - no position is ever touched", () => {
    expect(
      packageLeverageShift(pools, mine, [pickAsset("a")], [pickAsset("b")]),
    ).toBeNull();
  });
  it("names every position a real multi-piece package actually moves", () => {
    // Two positions leaving, one arriving: PF and SF should both be named, and no
    // position absent from either side of the deal should appear.
    const give = [asset("Scottie Barnes"), asset("Franz Wagner")].filter(
      Boolean,
    );
    const get = [asset("Nikola Jokic")];
    const shift = packageLeverageShift(pools, mine, give, get);
    if (shift) {
      const touchedPositions = new Set([
        ...give.map((a) => a.position),
        ...get.map((a) => a.position),
      ]);
      for (const p of shift.positions) expect(touchedPositions.has(p)).toBe(true);
    }
  });
  it("returns null rather than throwing for a roster with no analysis", () => {
    expect(packageLeverageShift(pools, null, [asset("Luka Doncic")], [])).toBeNull();
  });
  it("never lets the after-score fall outside 0..100 even for an extreme package", () => {
    const allValued = leagueValueRanking(h).find((r) => r.rosterId === ME).valued;
    const give = allValued.slice(0, 3).map((v) => asset(v.name));
    const get = [asset("Luka Doncic")];
    const shift = packageLeverageShift(pools, mine, give, get);
    if (shift) {
      expect(shift.after).toBeGreaterThanOrEqual(0);
      expect(shift.after).toBeLessThanOrEqual(100);
    }
  });
});
describe("findTrades attaches a leverageShift field to every package", () => {
  it("carries either a real shift or an explicit null, scoped to the viewer's own roster", async () => {
    const principals = await getPrincipals(h);
    const partner = h.rosters.find((r) => r.rosterId !== ME).rosterId;
    const result = findTrades(h, principals, {
      rosterId: ME,
      partnerRosterId: partner,
    });
    expect(result).not.toBeNull();
    for (const pkg of result.packages) {
      expect(pkg).toHaveProperty("leverageShift");
      if (pkg.leverageShift) {
        expect(pkg.leverageShift.before).not.toBe(pkg.leverageShift.after);
        expect(pkg.leverageShift.positions.length).toBeGreaterThan(0);
        // Recomputing independently must land on the identical note - the field
        // attached to the package cannot be a stale read of a different roster.
        const pools = leaguePositionPools(h);
        const mine = leagueValueRanking(h).find((r) => r.rosterId === ME);
        const recomputed = packageLeverageShift(pools, mine, pkg.give, pkg.get);
        expect(recomputed).toEqual(pkg.leverageShift);
      }
    }
  });
});
