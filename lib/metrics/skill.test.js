import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import { buildPrincipals } from "../principals";
import {
  foldDraftCapture,
  foldStartRate,
  gradeDraft,
  startupSeasons,
  tradeValueProfiles,
} from "./skill";
// ------------------------------------------------------------------ start rate
const season = (s, fpts, ppts) => ({
  season: s,
  fpts,
  ppts,
  startRate: fpts / ppts,
});
describe("start rate (lock-in management)", () => {
  it("is the ratio of points started to points available", () => {
    const p = foldStartRate("u1", 1, [season("2024", 950, 1000)]);
    expect(p.startRate).toBeCloseTo(0.95, 6);
    expect(p.leftOnBench).toBe(50);
  });
  /**
   * Summing numerator and denominator, rather than averaging per-season ratios, is the
   * whole design. A 20-week season must outweigh a 4-week one; averaging the ratios
   * would treat them as equals and let one short bad season dominate a career.
   */
  it("weights a long season above a short one", () => {
    const p = foldStartRate("u1", 1, [
      season("2023", 4000, 4000), // long and perfect
      season("2024", 50, 100), // short and terrible
    ]);
    const naiveAverage = (1.0 + 0.5) / 2;
    expect(p.startRate).toBeGreaterThan(naiveAverage);
    expect(p.startRate).toBeCloseTo(4050 / 4100, 6);
  });
  it("keeps leftOnBench consistent with the headline rate", () => {
    const p = foldStartRate("u1", 1, [
      season("2023", 3000, 3400),
      season("2024", 2000, 2100),
    ]);
    expect(p.leftOnBench).toBe(p.ppts - p.fpts);
    expect(p.startRate).toBeCloseTo(p.fpts / p.ppts, 4);
  });
  it("drops unplayed and unreported seasons rather than scoring them as zero", () => {
    const p = foldStartRate("u1", 1, [
      season("2024", 3000, 3200),
      { season: "2026", fpts: 0, ppts: 0, startRate: 0 }, // preseason
    ]);
    expect(p.seasons).toHaveLength(1);
    expect(p.startRate).toBeCloseTo(3000 / 3200, 6);
  });
  it("never divides by zero", () => {
    const p = foldStartRate("u1", 1, []);
    expect(p.startRate).toBe(0);
    expect(p.leftOnBench).toBe(0);
    expect(p.best).toBeNull();
  });
  it("reports the best and worst seasons, oldest-first in the list", () => {
    const p = foldStartRate("u1", 1, [
      season("2023", 800, 1000),
      season("2024", 990, 1000),
      season("2022", 900, 1000),
    ]);
    expect(p.seasons.map((s) => s.season)).toEqual(["2022", "2023", "2024"]);
    expect(p.best.season).toBe("2024");
    expect(p.worst.season).toBe("2023");
  });
});
// --------------------------------------------------------------- draft capture
function pick(pickNo, rosterId, playerId) {
  return {
    pickNo,
    rosterId,
    playerId,
    playerName: playerId,
    round: 1,
    isKeeper: false,
  };
}
/** Four players worth 100, 80, 60, 40 taken in that order by rosters 1..4. */
const VALUES = { best: 100, good: 80, ok: 60, bad: 40 };
const valueOf = (id) => VALUES[id] ?? 0;
const nameOf = (id) => id;
const ownerOf = (_s, rosterId) => `owner${rosterId}`;
describe("gradeDraft", () => {
  it("scores 1 for taking the best asset left and 0 for taking the worst", () => {
    // Pick 1 takes the best of {100,80,60,40}; pick 2 takes the worst of {40,80,60}.
    const g = gradeDraft(
      "2024",
      [
        pick(1, 1, "best"),
        pick(2, 2, "bad"),
        pick(3, 3, "good"),
        pick(4, 4, "ok"),
      ],
      valueOf,
      nameOf,
      ownerOf,
    );
    expect(g[0].capture).toBeCloseTo(1, 6);
    expect(g[0].regret).toBe(0);
    expect(g[1].capture).toBeCloseTo(0, 6);
    expect(g[1].regret).toBe(-40); // 40 taken, 80 was there
  });
  it("names the asset that was actually left on the board", () => {
    const g = gradeDraft(
      "2024",
      [pick(1, 1, "ok"), pick(2, 2, "best"), pick(3, 3, "bad")],
      valueOf,
      nameOf,
      ownerOf,
    );
    expect(g[0].bestAvailableName).toBe("best");
    expect(g[0].regret).toBe(-40);
  });
  /**
   * The final pick has a pool of one, so there was no decision to grade. Scoring it as
   * a perfect 1.0 would hand a free win to whoever happened to pick last.
   */
  it("does not grade the last pick of a draft", () => {
    const g = gradeDraft(
      "2024",
      [pick(1, 1, "best"), pick(2, 2, "good"), pick(3, 3, "ok")],
      valueOf,
      nameOf,
      ownerOf,
    );
    expect(g).toHaveLength(2);
    expect(g.map((x) => x.pickNo)).toEqual([1, 2]);
  });
  it("ignores keepers, which were not decisions made on the clock", () => {
    const picks = [pick(1, 1, "best"), pick(2, 2, "good"), pick(3, 3, "ok")];
    picks[0].isKeeper = true;
    const g = gradeDraft("2024", picks, valueOf, nameOf, ownerOf);
    expect(g.map((x) => x.pickNo)).toEqual([2]);
  });
  it("orders by the authoritative pick number, not input order", () => {
    const g = gradeDraft(
      "2024",
      [pick(3, 3, "ok"), pick(1, 1, "best"), pick(2, 2, "good")],
      valueOf,
      nameOf,
      ownerOf,
    );
    expect(g.map((x) => x.pickNo)).toEqual([1, 2]);
  });
  it("regret is never positive: you cannot beat the best available", () => {
    const g = gradeDraft(
      "2024",
      [
        pick(1, 1, "ok"),
        pick(2, 2, "best"),
        pick(3, 3, "good"),
        pick(4, 4, "bad"),
      ],
      valueOf,
      nameOf,
      ownerOf,
    );
    for (const x of g) {
      expect(x.regret).toBeLessThanOrEqual(0);
      expect(x.capture).toBeGreaterThanOrEqual(0);
      expect(x.capture).toBeLessThanOrEqual(1);
    }
  });
  it("credits the manager who was on the clock, not the roster", () => {
    const g = gradeDraft(
      "2024",
      [pick(1, 7, "best"), pick(2, 8, "good"), pick(3, 9, "ok")],
      valueOf,
      nameOf,
      (_s, rid) => (rid === 7 ? "predecessor" : `owner${rid}`),
    );
    expect(g[0].ownerId).toBe("predecessor");
    expect(g[0].rosterId).toBe(7);
  });
  it("drops a pick it cannot attribute to a person", () => {
    const g = gradeDraft(
      "2024",
      [pick(1, 1, "best"), pick(2, 2, "good"), pick(3, 3, "ok")],
      valueOf,
      nameOf,
      (_s, rid) => (rid === 1 ? null : `owner${rid}`),
    );
    expect(g.map((x) => x.pickNo)).toEqual([2]);
  });
  /**
   * Slot surplus and capture answer different questions, and the first pick of a draft
   * is where they diverge hardest: taking the consensus best player at 1.01 is a
   * perfect capture and a zero steal. Anything that conflates the two will crown the
   * top pick as the league's biggest bargain.
   */
  it("gives the first pick a perfect capture but no slot surplus", () => {
    const g = gradeDraft(
      "2024",
      [
        pick(1, 1, "best"),
        pick(2, 2, "good"),
        pick(3, 3, "ok"),
        pick(4, 4, "bad"),
      ],
      valueOf,
      nameOf,
      ownerOf,
    );
    expect(g[0].capture).toBeCloseTo(1, 6);
    expect(g[0].valueRank).toBe(1);
    expect(g[0].slotSurplus).toBe(0);
  });
  it("rewards a late pick on a player the class left behind", () => {
    // "best" goes 4th but is the most valuable player to come out of the draft.
    const g = gradeDraft(
      "2024",
      [
        pick(1, 1, "bad"),
        pick(2, 2, "ok"),
        pick(3, 3, "good"),
        pick(4, 4, "best"),
      ],
      valueOf,
      nameOf,
      ownerOf,
    );
    // Pick 4 is the draft's last and therefore ungraded, so grade a 5-pick draft.
    const g5 = gradeDraft(
      "2024",
      [
        pick(1, 1, "bad"),
        pick(2, 2, "ok"),
        pick(3, 3, "good"),
        pick(4, 4, "best"),
        pick(5, 5, "tail"),
      ],
      (id) => (id === "tail" ? 5 : valueOf(id)),
      nameOf,
      ownerOf,
    );
    expect(g).toHaveLength(3);
    const steal = g5.find((x) => x.pickNo === 4);
    expect(steal.valueRank).toBe(1);
    expect(steal.slotSurplus).toBe(3);
    // And the pick that went first on the worst player is the reach.
    const reach = g5.find((x) => x.pickNo === 1);
    expect(reach.slotSurplus).toBeLessThan(0);
  });
  it("value ranks are a permutation, so ties cannot double-count", () => {
    const flatish = (id) => (id === "best" ? 100 : 50);
    const g = gradeDraft(
      "2024",
      [pick(1, 1, "a"), pick(2, 2, "best"), pick(3, 3, "b"), pick(4, 4, "c")],
      flatish,
      nameOf,
      ownerOf,
    );
    const ranks = g.map((x) => x.valueRank).sort((a, b) => a - b);
    expect(new Set(ranks).size).toBe(ranks.length);
  });
  it("returns nothing when every asset is worth the same", () => {
    const flat = (id) => (id ? 50 : 50);
    const g = gradeDraft(
      "2024",
      [pick(1, 1, "a"), pick(2, 2, "b"), pick(3, 3, "c")],
      flat,
      nameOf,
      ownerOf,
    );
    expect(g).toEqual([]);
  });
  it("degrades on tiny inputs", () => {
    expect(gradeDraft("2024", [], valueOf, nameOf, ownerOf)).toEqual([]);
    expect(
      gradeDraft("2024", [pick(1, 1, "best")], valueOf, nameOf, ownerOf),
    ).toEqual([]);
  });
});
describe("startupSeasons", () => {
  it("flags the one deep draft among annual shallow ones", () => {
    // The real shape of this league: a 17-round startup then 3-round rookie drafts.
    const s = startupSeasons([
      { season: "2022", rounds: 17 },
      { season: "2023", rounds: 3 },
      { season: "2024", rounds: 3 },
      { season: "2025", rounds: 3 },
    ]);
    expect([...s]).toEqual(["2022"]);
  });
  it("flags nothing when every draft is the same shape", () => {
    expect(
      startupSeasons([
        { season: "2023", rounds: 3 },
        { season: "2024", rounds: 3 },
        { season: "2025", rounds: 4 },
      ]).size,
    ).toBe(0);
  });
  it("flags nothing with a single draft, where the kind is unknowable", () => {
    expect(startupSeasons([{ season: "2022", rounds: 17 }]).size).toBe(0);
    expect(startupSeasons([]).size).toBe(0);
  });
  it("survives missing round counts without flagging everything", () => {
    expect(
      startupSeasons([
        { season: "2023", rounds: 0 },
        { season: "2024", rounds: 0 },
      ]).size,
    ).toBe(0);
  });
});
describe("foldDraftCapture", () => {
  const graded = gradeDraft(
    "2024",
    [
      pick(1, 1, "best"), // roster 1 nails it
      pick(2, 2, "bad"), // roster 2 blows it
      pick(3, 1, "good"),
      pick(4, 2, "ok"),
    ],
    valueOf,
    nameOf,
    ownerOf,
  );
  const folded = foldDraftCapture(graded);
  it("keys by manager, not roster", () => {
    expect([...folded.keys()].sort()).toEqual(["owner1", "owner2"]);
    expect(folded.get("owner1").rosterId).toBe(1);
  });
  it("ranks the manager who took the best available above the one who did not", () => {
    expect(folded.get("owner1").captureRate).toBeGreaterThan(
      folded.get("owner2").captureRate,
    );
  });
  it("bounds the rate to 0..1 and keeps captured within capturable", () => {
    for (const p of folded.values()) {
      expect(p.captureRate).toBeGreaterThanOrEqual(0);
      expect(p.captureRate).toBeLessThanOrEqual(1);
      expect(p.captured).toBeLessThanOrEqual(p.capturable);
      expect(p.regret).toBeLessThanOrEqual(0);
    }
  });
  /**
   * Value weighting is the point: a manager who captures everything on a high-stakes
   * pick and nothing on a trivial one must beat the reverse, even though both went
   * one-for-two on raw capture.
   */
  it("weights a big opportunity above a small one", () => {
    const bigThenSmall = foldDraftCapture([
      {
        ...graded[0],
        ownerId: "x",
        value: 100,
        bestAvailable: 100,
        worstAvailable: 0,
        capture: 1,
        regret: 0,
      },
      {
        ...graded[0],
        ownerId: "x",
        value: 0,
        bestAvailable: 10,
        worstAvailable: 0,
        capture: 0,
        regret: -10,
      },
    ]);
    const smallThenBig = foldDraftCapture([
      {
        ...graded[0],
        ownerId: "y",
        value: 10,
        bestAvailable: 10,
        worstAvailable: 0,
        capture: 1,
        regret: 0,
      },
      {
        ...graded[0],
        ownerId: "y",
        value: 0,
        bestAvailable: 100,
        worstAvailable: 0,
        capture: 0,
        regret: -100,
      },
    ]);
    expect(bigThenSmall.get("x").captureRate).toBeGreaterThan(
      smallThenBig.get("y").captureRate,
    );
  });
  /**
   * A league holds exactly one startup draft ever, so an award ranked on it is frozen
   * on that season for the life of the league. The steal and the reach therefore have
   * to come from the annual rookie drafts, even though the startup contains far larger
   * raw surpluses simply by being deeper.
   */
  it("takes the steal and the reach from rookie drafts, not the startup", () => {
    const startup = gradeDraft(
      "2022",
      Array.from({ length: 30 }, (_, i) => pick(i + 1, 1, `s${i}`)),
      // Reversed values: the last pick is the best player, a huge raw surplus.
      (id) => 30 - Number(id.slice(1)),
      nameOf,
      () => "owner1",
      true,
    );
    const rookie = gradeDraft(
      "2024",
      [
        pick(1, 1, "bad"),
        pick(2, 1, "ok"),
        pick(3, 1, "best"),
        pick(4, 1, "good"),
      ],
      valueOf,
      nameOf,
      () => "owner1",
      false,
    );
    const folded = foldDraftCapture([...startup, ...rookie]);
    const p = folded.get("owner1");
    expect(p.startupPicks).toBe(startup.length);
    expect(p.rookiePicks).toBe(rookie.length);
    expect(p.steal.season).toBe("2024");
    expect(p.steal.isStartup).toBe(false);
    expect(p.bust.season).toBe("2024");
    // The startup picks still count toward the capture rate: those decisions were real.
    expect(p.picks).toBe(startup.length + rookie.length);
  });
  it("falls back to the startup when a league has held nothing else", () => {
    const startup = gradeDraft(
      "2022",
      [pick(1, 1, "bad"), pick(2, 1, "best"), pick(3, 1, "ok")],
      valueOf,
      nameOf,
      () => "owner1",
      true,
    );
    const p = foldDraftCapture(startup).get("owner1");
    expect(p.rookiePicks).toBe(0);
    expect(p.steal).not.toBeNull();
    expect(p.steal.isStartup).toBe(true);
  });
  it("normalises surplus by depth so a shallow draft can win", () => {
    // +5 in a 10-pick draft must beat +8 in a 40-pick draft.
    const shallow = {
      ...graded[0],
      ownerId: "shallow",
      slotSurplus: 5,
      slotSurplusRate: 5 / 10,
      draftSize: 10,
      isStartup: false,
    };
    const deep = {
      ...graded[0],
      ownerId: "deep",
      slotSurplus: 8,
      slotSurplusRate: 8 / 40,
      draftSize: 40,
      isStartup: false,
    };
    const f = foldDraftCapture([
      shallow,
      { ...shallow, slotSurplusRate: 0, slotSurplus: 0 },
      deep,
      { ...deep, slotSurplusRate: 0, slotSurplus: 0 },
    ]);
    expect(f.get("shallow").steal.slotSurplusRate).toBeGreaterThan(
      f.get("deep").steal.slotSurplusRate,
    );
  });
  it("separates the pool-relative extremes from the slot-relative ones", () => {
    const p = folded.get("owner1");
    expect(p.steal).not.toBeNull();
    expect(p.steal.slotSurplus).toBeGreaterThanOrEqual(
      p.bust?.slotSurplus ?? -Infinity,
    );
  });
  it("reports the best and worst picks and is deterministic", () => {
    expect(folded.get("owner1").best.playerName).toBe("best");
    expect(folded.get("owner1").worst.playerName).toBe("good");
    // owner2's second pick was the draft's last and therefore ungraded, so they have a
    // single graded pick and no distinct worst.
    expect(folded.get("owner2").picks).toBe(1);
    expect(folded.get("owner2").worst).toBeNull();
    expect(JSON.stringify([...foldDraftCapture(graded)])).toBe(
      JSON.stringify([...folded]),
    );
  });
  it("returns nothing for nothing", () => {
    expect(foldDraftCapture([])).toEqual(new Map());
  });
});
// ------------------------------------------------------------ trade value added
function principalsFor(h) {
  const users = new Map(h.usersById);
  return buildPrincipals(
    h.chain.map((l) => ({
      season: l.season,
      owners: new Map(
        h.rosters
          .filter((r) => !!r.ownerId)
          .map((r) => [r.rosterId, r.ownerId]),
      ),
      users,
    })),
    h.rosters,
    users,
  );
}
describe("trade value added", () => {
  const h = buildFixtureHistory();
  const idx = principalsFor(h);
  const profiles = tradeValueProfiles(h, idx);
  it("prices both sides of every trade it can see", () => {
    expect(profiles.size).toBeGreaterThan(0);
    for (const p of profiles.values()) {
      expect(p.trades).toBeGreaterThan(0);
      expect(p.net).toBe(p.valueIn - p.valueOut);
    }
  });
  /**
   * A two-team trade moves value from one side to the other, so summing the league's
   * net must come out at zero. A non-zero total would mean value was being invented or
   * destroyed, which is the clearest signal that the in/out accounting has drifted.
   */
  it("is zero-sum across the league", () => {
    const total = [...profiles.values()].reduce((s, p) => s + p.net, 0);
    // Rounding each line to whole points leaves at most a point per side.
    expect(Math.abs(total)).toBeLessThanOrEqual(profiles.size);
  });
  it("keys by manager and is deterministic", () => {
    for (const [ownerId, p] of profiles) expect(p.ownerId).toBe(ownerId);
    expect(JSON.stringify([...tradeValueProfiles(h, idx)])).toBe(
      JSON.stringify([...profiles]),
    );
  });
  it("names the best and worst deal for anyone who made more than one", () => {
    const multi = [...profiles.values()].filter((p) => p.trades > 1);
    expect(multi.length).toBeGreaterThan(0);
    for (const p of multi) {
      expect(p.best).not.toBeNull();
      expect(p.worst).not.toBeNull();
      expect(p.best.net).toBeGreaterThanOrEqual(p.worst.net);
    }
  });
  it("produces nothing from a league with no transactions", () => {
    expect(tradeValueProfiles({ ...h, transactions: [] }, idx).size).toBe(0);
  });
});
