import { describe, expect, it } from "vitest";
import { buildPrincipals, tenureSeasons, type SeasonOwnership } from "./principals";
import type { LeagueUser, Roster } from "./providers/types";

function user(id: string, name: string, team?: string): LeagueUser {
  return {
    userId: id,
    displayName: name,
    avatar: null,
    teamName: team ?? null,
    teamLogoUrl: null,
    isOwner: false,
    isBot: false,
  };
}

function roster(rosterId: number, ownerId: string | null): Roster {
  return {
    rosterId,
    ownerId,
    coOwners: [],
    players: [],
    starters: [],
    reserve: [],
    taxi: [],
    settings: {
      wins: 0,
      losses: 0,
      ties: 0,
      fpts: 0,
      fptsAgainst: 0,
      ppts: 0,
      waiverBudgetUsed: 0,
      waiverPosition: 1,
      totalMoves: 0,
    },
  };
}

/**
 * Two rosters over three seasons. Roster 1 is stable. Roster 2 changes hands after
 * 2023, and the departing manager exists ONLY in the older seasons' user lists -
 * which mirrors the real API, where the current league has no record of them.
 */
function withSuccession(): SeasonOwnership[] {
  const old = new Map([
    ["a", user("a", "stable", "Stable FC")],
    ["b", user("b", "departed", "Old Name")],
  ]);
  const now = new Map([
    ["a", user("a", "stable", "Stable FC")],
    ["c", user("c", "successor", "New Name")],
  ]);
  return [
    { season: "2022", owners: new Map([[1, "a"], [2, "b"]]), users: old },
    { season: "2023", owners: new Map([[1, "a"], [2, "b"]]), users: old },
    { season: "2024", owners: new Map([[1, "a"], [2, "c"]]), users: now },
  ];
}

const CURRENT_ROSTERS = [roster(1, "a"), roster(2, "c")];
const CURRENT_USERS = new Map([
  ["a", user("a", "stable", "Stable FC")],
  ["c", user("c", "successor", "New Name")],
]);

describe("succession detection", () => {
  const idx = buildPrincipals(withSuccession(), CURRENT_ROSTERS, CURRENT_USERS);

  it("finds more managers than there are teams", () => {
    expect(CURRENT_ROSTERS).toHaveLength(2);
    expect(idx.principals).toHaveLength(3);
    expect(idx.hasSuccessions).toBe(true);
  });

  it("records the handover with both names and the season it happened", () => {
    expect(idx.successions).toHaveLength(1);
    const s = idx.successions[0];
    expect(s.rosterId).toBe(2);
    expect(s.season).toBe("2024");
    expect(s.fromOwnerId).toBe("b");
    expect(s.toOwnerId).toBe("c");
  });

  it("recovers the departed manager's name from the seasons that still know it", () => {
    const b = idx.byOwnerId.get("b")!;
    expect(b.displayName).toBe("departed");
    expect(b.teamName).toBe("Old Name");
  });

  it("marks the departed manager former, with no current roster but a last one", () => {
    const b = idx.byOwnerId.get("b")!;
    expect(b.isFormer).toBe(true);
    expect(b.currentRosterId).toBeNull();
    expect(b.lastRosterId).toBe(2);
    expect(b.seasons).toEqual(["2022", "2023"]);
  });

  it("links the two managers to each other in both directions", () => {
    expect(idx.byOwnerId.get("b")!.succeededBy).toMatchObject({
      ownerId: "c",
      season: "2024",
    });
    expect(idx.byOwnerId.get("c")!.succeeded).toMatchObject({
      ownerId: "b",
      season: "2024",
    });
    // The stable manager has neither.
    expect(idx.byOwnerId.get("a")!.succeededBy).toBeNull();
    expect(idx.byOwnerId.get("a")!.succeeded).toBeNull();
  });

  /**
   * The load-bearing behaviour. Every historical fact carries (season, rosterId), and
   * this is the only correct way to turn that into a person. A roster-keyed version
   * would answer "c" for all three seasons and silently credit one manager's work to
   * another.
   */
  it("attributes each season of a shared roster to the right person", () => {
    expect(idx.ownerAt("2022", 2)).toBe("b");
    expect(idx.ownerAt("2023", 2)).toBe("b");
    expect(idx.ownerAt("2024", 2)).toBe("c");
    expect(idx.ownerAt("2022", 1)).toBe("a");
  });

  it("falls back to the current owner for a season it does not know", () => {
    expect(idx.ownerAt("1999", 2)).toBe("c");
    expect(idx.ownerAt("1999", 99)).toBeNull();
  });

  it("lists current managers before former ones, deterministically", () => {
    const again = buildPrincipals(withSuccession(), CURRENT_ROSTERS, CURRENT_USERS);
    expect(idx.principals.map((p) => p.ownerId)).toEqual(
      again.principals.map((p) => p.ownerId),
    );
    const formerAt = idx.principals.findIndex((p) => p.isFormer);
    expect(formerAt).toBe(idx.principals.length - 1);
  });

  it("scopes tenure seasons to one roster", () => {
    expect([...tenureSeasons(idx.byOwnerId.get("b")!)]).toEqual(["2022", "2023"]);
    expect([...tenureSeasons(idx.byOwnerId.get("c")!, 2)]).toEqual(["2024"]);
    expect([...tenureSeasons(idx.byOwnerId.get("c")!, 1)]).toEqual([]);
  });
});

describe("a league where nothing has changed hands", () => {
  const seasons: SeasonOwnership[] = [
    { season: "2023", owners: new Map([[1, "a"], [2, "c"]]), users: CURRENT_USERS },
    { season: "2024", owners: new Map([[1, "a"], [2, "c"]]), users: CURRENT_USERS },
  ];
  const idx = buildPrincipals(seasons, CURRENT_ROSTERS, CURRENT_USERS);

  it("produces exactly one principal per roster and no successions", () => {
    expect(idx.principals).toHaveLength(2);
    expect(idx.successions).toEqual([]);
    expect(idx.hasSuccessions).toBe(false);
    for (const p of idx.principals) {
      expect(p.isFormer).toBe(false);
      expect(p.tenures).toHaveLength(1);
    }
  });
});

describe("degradation", () => {
  it("still produces principals when there is no per-season data at all", () => {
    const idx = buildPrincipals([], CURRENT_ROSTERS, CURRENT_USERS);
    expect(idx.principals).toHaveLength(2);
    expect(idx.hasSuccessions).toBe(false);
    // With no season data the fallback still resolves the current owner.
    expect(idx.ownerAt("2024", 1)).toBe("a");
  });

  it("handles an empty league without throwing", () => {
    const idx = buildPrincipals([], [], new Map());
    expect(idx.principals).toEqual([]);
    expect(idx.ownerAt("2024", 1)).toBeNull();
  });

  it("ignores rosters with no owner", () => {
    const idx = buildPrincipals(
      [{ season: "2024", owners: new Map(), users: new Map() }],
      [roster(1, null)],
      new Map(),
    );
    expect(idx.principals).toEqual([]);
  });

  /**
   * A manager who leaves and later returns to the same roster is two tenures, not one
   * continuous span, and the gap must not be papered over.
   */
  it("splits a re-acquired roster into separate tenures", () => {
    const users = new Map([
      ["a", user("a", "returner")],
      ["b", user("b", "interim")],
    ]);
    const idx = buildPrincipals(
      [
        { season: "2022", owners: new Map([[1, "a"]]), users },
        { season: "2023", owners: new Map([[1, "b"]]), users },
        { season: "2024", owners: new Map([[1, "a"]]), users },
      ],
      [roster(1, "a")],
      users,
    );
    const a = idx.byOwnerId.get("a")!;
    expect(a.tenures).toHaveLength(2);
    expect(a.tenures[0].seasons).toEqual(["2022"]);
    expect(a.tenures[1].seasons).toEqual(["2024"]);
    expect(a.isFormer).toBe(false);
    expect(idx.successions).toHaveLength(2);
    expect(idx.ownerAt("2023", 1)).toBe("b");
  });
});
