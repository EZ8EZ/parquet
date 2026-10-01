import { describe, expect, it } from "vitest";
import { leagueCrunch, rosterCrunch, rosterLimits, taxiEligible } from "./index.js";

// 5 active slots, 3 of them startable (non-BN).
const POSITIONS = ["PG", "C", "UTIL", "BN", "BN"];

function player(playerId, extra = {}) {
  return { playerId, fullName: `P ${playerId}`, position: "G", age: 25, yearsExp: 4, injuryStatus: null, team: "BOS", ...extra };
}

function makeH(overrides = {}) {
  const ps = [
    player("a1"), player("a2"), player("a3"),
    player("a4", { yearsExp: 0 }),
    player("a5", { yearsExp: 1 }),
    player("a6", { yearsExp: 5 }),
    player("a7", { yearsExp: 3, injuryStatus: "Out", team: null }),
    player("t1", { yearsExp: 0 }), player("r1", { injuryStatus: "Out" }),
    player("b1"), player("b2"), player("b3"), player("b4"),
    ...["c1", "c2", "c3", "c4", "c5", "c6", "c7"].map((id) => player(id)),
    player("t2", { yearsExp: 0 }), player("t3", { yearsExp: 0 }),
  ];
  return {
    currentLeague: {
      rosterPositions: POSITIONS,
      settings: { taxi_slots: 2, taxi_years: 2, reserve_slots: 1 },
      ...overrides.currentLeague,
    },
    rosters: [
      { rosterId: 1, ownerId: "u1", players: ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "t1", "r1"], starters: [], reserve: ["r1"], taxi: ["t1"] },
      { rosterId: 2, ownerId: "u2", players: ["b1", "b2", "b3", "b4"], starters: [], reserve: [], taxi: [] },
      { rosterId: 3, ownerId: "u3", players: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "t2", "t3"], starters: [], reserve: [], taxi: ["t2", "t3"] },
    ],
    players: new Map(ps.map((p) => [p.playerId, p])),
  };
}

const VALUES = { a1: 100, a2: 90, a3: 80, a4: 50, a5: 40, a6: 10, a7: 5, b1: 60, c1: 70, c2: 60, c3: 50, c4: 40, c5: 30, c6: 20, c7: 15 };
const valueOf = (id) => VALUES[id];

describe("rosterLimits", () => {
  it("reads slot counts and settings", () => {
    expect(rosterLimits(makeH())).toEqual({ active: 5, taxi: 2, reserve: 1, taxiYears: 2 });
  });

  it("excludes IR/TAXI codes and defaults missing settings", () => {
    const h = { currentLeague: { rosterPositions: ["PG", "BN", "IR", "TAXI"] } };
    expect(rosterLimits(h)).toEqual({ active: 2, taxi: 0, reserve: 0, taxiYears: null });
  });
});

describe("taxiEligible", () => {
  it("uses yearsExp < taxiYears", () => {
    const limits = { active: 5, taxi: 2, reserve: 0, taxiYears: 2 };
    expect(taxiEligible({ yearsExp: 0 }, limits)).toBe(true);
    expect(taxiEligible({ yearsExp: 1 }, limits)).toBe(true);
    expect(taxiEligible({ yearsExp: 2 }, limits)).toBe(false);
  });

  it("falls back to rookies only without taxi_years, and rejects unknown exp", () => {
    const limits = { active: 5, taxi: 2, reserve: 0, taxiYears: null };
    expect(taxiEligible({ yearsExp: 0 }, limits)).toBe(true);
    expect(taxiEligible({ yearsExp: 1 }, limits)).toBe(false);
    expect(taxiEligible({ yearsExp: null }, limits)).toBe(false);
    expect(taxiEligible(undefined, limits)).toBe(false);
  });
});

describe("rosterCrunch", () => {
  it("counts active as players minus taxi and reserve", () => {
    const c = rosterCrunch(makeH(), 1, valueOf);
    expect(c.counts).toEqual({ active: 7, taxi: 1, reserve: 1, total: 9 });
    expect(c.overBy).toBe(2);
    expect(c.openSpots).toBe(0);
    expect(c.taxiOpen).toBe(1);
  });

  it("suggests taxi stashes outside the top-N startable, value DESC", () => {
    const c = rosterCrunch(makeH(), 1, valueOf);
    // a1..a3 are the top 3 by value; a4 (exp 0) and a5 (exp 1) are eligible.
    expect(c.taxiSuggestions.map((p) => p.playerId)).toEqual(["a4", "a5"]);
  });

  it("never suggests a top-N player for taxi even if eligible", () => {
    const h = makeH();
    h.players.get("a1").yearsExp = 0;
    const c = rosterCrunch(h, 1, valueOf);
    expect(c.taxiSuggestions.map((p) => p.playerId)).not.toContain("a1");
  });

  it("reduces mustCut by the taxi moves that fit", () => {
    const c = rosterCrunch(makeH(), 1, valueOf);
    expect(c.taxiMoves).toBe(1);
    expect(c.mustCut).toBe(1);
    const stashed = c.cutCandidates.find((p) => p.playerId === "a4");
    expect(stashed.reasonFlags).toContain("taxiStash");
  });

  it("sorts cut candidates ASC with flags and protects rookies at the end", () => {
    const c = rosterCrunch(makeH(), 1, valueOf, { rookieIds: new Set(["a5"]) });
    expect(c.cutCandidates.map((p) => p.playerId)).toEqual(["a7", "a6", "a4", "a3", "a2", "a1", "a5"]);
    expect(c.cutCandidates[0].reasonFlags).toEqual(["injured", "noTeam"]);
    const last = c.cutCandidates.at(-1);
    expect(last.protected).toBe(true);
    expect(last.reasonFlags).toContain("rookie");
    // taxi and reserve players are never cut candidates
    expect(c.cutCandidates.map((p) => p.playerId)).not.toContain("t1");
    expect(c.cutCandidates.map((p) => p.playerId)).not.toContain("r1");
  });

  it("reports open spots for an under-limit roster and treats missing values as 0", () => {
    const c = rosterCrunch(makeH(), 2, valueOf);
    expect(c.overBy).toBe(0);
    expect(c.openSpots).toBe(1);
    expect(c.mustCut).toBe(0);
    expect(c.cutCandidates[0].value).toBe(0);
  });

  it("throws on an unknown roster", () => {
    expect(() => rosterCrunch(makeH(), 99, valueOf)).toThrow(/unknown rosterId/);
  });
});

describe("leagueCrunch", () => {
  it("returns a crunch per roster and likely releases sorted by value DESC", () => {
    const { rosters, likelyReleases } = leagueCrunch(makeH(), valueOf, { rookieIds: new Set(["a5"]) });
    expect(rosters.map((r) => r.rosterId)).toEqual([1, 2, 3]);
    // Roster 3: full taxi, over by 2 -> c7, c6. Roster 1: mustCut 1 -> a7.
    expect(likelyReleases.map((p) => [p.playerId, p.rosterId])).toEqual([
      ["c6", 3],
      ["c7", 3],
      ["a7", 1],
    ]);
  });

  it("never lists protected rookies or taxi stashes as releases", () => {
    const h = makeH();
    const rookieIds = new Set(["c6", "c7"]);
    const { likelyReleases } = leagueCrunch(h, valueOf, { rookieIds });
    const ids = likelyReleases.map((p) => p.playerId);
    expect(ids).not.toContain("c6");
    expect(ids).not.toContain("c7");
    expect(ids).not.toContain("a4");
    expect(ids).toEqual(expect.arrayContaining(["c5", "c4", "a7"]));
  });
});
