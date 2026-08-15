import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import {
  buildDossier,
  buildFormerDossier,
  dossiersByOwner,
  getAllDossiers,
} from "./index";
import { MANAGERS } from "../providers/fixture/data";
import { getPrincipals, buildPrincipals } from "../principals";
const rosterFor = (archetype) =>
  MANAGERS.findIndex((m) => m.archetype === archetype) + 1;
describe("manager dossiers", () => {
  const h = buildFixtureHistory();
  it("produces a dossier for every non-user manager", async () => {
    const principals = await getPrincipals(h);
    const all = getAllDossiers(h, principals);
    // One per CURRENT roster (minus you) plus one per departed principal - NOT
    // `h.rosters.length - 1`. The fixture's roster 9 succession means there are more
    // managers than seats: the departed predecessor gets their own dossier alongside
    // the successor who now holds roster 9's seat, so this count is one bigger than
    // the roster count would suggest. A test pinned to `h.rosters.length - 1` here
    // would have quietly gone back to counting seats instead of people.
    const formerCount = principals.principals.filter(
      (pr) => pr.isFormer && pr.ownerId !== h.me.userId,
    ).length;
    expect(formerCount).toBeGreaterThan(0);
    expect(all.length).toBe(h.rosters.length - 1 + formerCount);
    for (const d of all) {
      expect(d.read.length).toBeGreaterThan(0);
      expect(d.approachTips.length).toBeGreaterThan(0);
    }
  });
  it("flags the pick hoarder", async () => {
    const principals = await getPrincipals(h);
    const d = buildDossier(h, rosterFor("hoarder"), principals);
    expect(d.profile.picks.net).toBeGreaterThan(0);
    expect(d.tags.join(" ")).toMatch(/hoarder|Pick/i);
  });
  it("flags the ghost as inactive", async () => {
    const principals = await getPrincipals(h);
    const d = buildDossier(h, rosterFor("ghost"), principals);
    expect(d.profile.totalTransactions).toBeLessThanOrEqual(3);
    expect(d.tags.join(" ")).toMatch(/Ghost|Never trades|Rarely/i);
  });
  it("flags the churner as high-volume", async () => {
    const principals = await getPrincipals(h);
    const d = buildDossier(h, rosterFor("churner"), principals);
    expect(d.profile.trades).toBeGreaterThanOrEqual(8);
    expect(d.tags.join(" ")).toMatch(/High-volume|Initiator/i);
  });
  it("flags the name chaser as paying up for veterans", async () => {
    const principals = await getPrincipals(h);
    const d = buildDossier(h, rosterFor("name-chaser"), principals);
    expect(d.tags.join(" ")).toMatch(/Name chaser|Deadline/i);
  });
  it("distinguishes initiators from responders", async () => {
    const principals = await getPrincipals(h);
    const churner = buildDossier(h, rosterFor("churner"), principals);
    // A churner initiates most of their own trades.
    expect(churner.profile.tradesInitiated).toBeGreaterThan(0);
  });
  it("tags every current dossier with its own roster id", async () => {
    const principals = await getPrincipals(h);
    const d = buildDossier(h, rosterFor("hoarder"), principals);
    expect(d.identity).toEqual({
      kind: "current",
      rosterId: rosterFor("hoarder"),
    });
  });
});
/**
 * THE TRAP THIS SESSION IS WARNED ABOUT: a scoping change that looks right in
 * isolation but silently changes the numbers for every roster that never changed
 * hands. The fixture league now HAS a succession (roster 9, see
 * lib/providers/fixture/generate.ts's `SUCCESSION`) so `hasSuccessions` is true
 * league-wide - but roster 2 (the churner used throughout this file) never changed
 * hands, and `buildDossier` must still take that roster's unscoped-equivalent branch
 * and produce EXACTLY what the pre-scoping code produced: the same profile numbers,
 * tags and read for the same roster, every call.
 */
describe("a roster that never changed hands stays unscoped", () => {
  const h = buildFixtureHistory();
  it("the league has a succession, but not on the roster under test here", async () => {
    const principals = await getPrincipals(h);
    expect(principals.hasSuccessions).toBe(true);
    const churnerRosterId = rosterFor("churner");
    const pr = principals.principals.find(
      (p) => p.currentRosterId === churnerRosterId,
    );
    expect(pr?.tenures.length).toBe(1);
  });
  it("produces byte-identical dossiers across repeated derivations", async () => {
    const principals = await getPrincipals(h);
    const rosterId = rosterFor("churner");
    const once = buildDossier(h, rosterId, principals);
    const twice = buildDossier(h, rosterId, principals);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
  it("scopes trades-per-season against the whole league history, as before", async () => {
    const principals = await getPrincipals(h);
    const rosterId = rosterFor("churner");
    const d = buildDossier(h, rosterId, principals);
    const seasons = h.chain.length || 1;
    const expected = Math.round((d.profile.trades / seasons) * 10) / 10;
    expect(d.tradesPerSeason).toBe(expected);
  });
});
/**
 * REGRESSION: per-season rates divided by the LEAGUE's seasons rather than the
 * manager's own. Roster 9 - the fixture's real succession - is exactly this: the
 * departed "BigTrades" (u9) made 18 trades across three seasons (2022-2024) and
 * "kdewitt4" (u15) has made 15 across two (2025-2026), against a five-season league.
 * A dossier that divided by `h.chain.length` (5) instead of the principal's own
 * tenure would print 3.6/season for BigTrades and 3.0/season for kdewitt4 - both
 * wrong, and wrong in the SAME direction, because both tenures are shorter than the
 * league itself. Dividing by the manager's own tenure is the only version where
 * these two numbers can both be right at once.
 */
describe("per-season rate uses the manager's own tenure, not the league's, across a real succession", () => {
  const h = buildFixtureHistory();
  it("the departed predecessor's rate is trades over their 3 seasons, not the league's 5", async () => {
    const principals = await getPrincipals(h);
    const predecessor = principals.principals.find((p) => p.ownerId === "u9");
    expect(predecessor.isFormer).toBe(true);
    expect(predecessor.seasons).toEqual(["2022", "2023", "2024"]);
    const d = buildFormerDossier(h, "u9", principals);
    expect(d.profile.trades).toBe(18);
    expect(d.tradesPerSeason).toBe(6); // 18 / 3, their own tenure
    expect(d.tradesPerSeason).not.toBe(
      Math.round((d.profile.trades / (h.chain.length || 1)) * 10) / 10,
    );
  });
  it("the current successor's rate is trades over their 2 seasons, not the league's 5", async () => {
    const principals = await getPrincipals(h);
    const successor = principals.principals.find((p) => p.ownerId === "u15");
    expect(successor.isFormer).toBe(false);
    expect(successor.seasons).toEqual(["2025", "2026"]);
    const d = buildDossier(h, 9, principals);
    expect(d.profile.trades).toBe(15);
    expect(d.tradesPerSeason).toBe(7.5); // 15 / 2, their own tenure
    expect(d.tradesPerSeason).not.toBe(
      Math.round((d.profile.trades / (h.chain.length || 1)) * 10) / 10,
    );
  });
});
// ---------------------------------------------------------------- handover fixture
function user(id, name) {
  return {
    userId: id,
    displayName: name,
    avatar: null,
    teamName: `${name} FC`,
    teamLogoUrl: null,
    isOwner: false,
    isBot: false,
  };
}
function roster(rosterId, ownerId) {
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
function trade(id, season, creator, swap) {
  // A two-sided swap between roster 1 and roster 2: player addA moves to roster 1,
  // player addB moves to roster 2. One trade, recorded once, involving both rosters.
  return {
    transactionId: id,
    type: "trade",
    status: "complete",
    season,
    week: 5,
    created: Date.parse(`${season}-06-01`),
    statusUpdated: Date.parse(`${season}-06-01`),
    creator,
    rosterIds: [1, 2],
    consenterIds: [1, 2],
    adds: { [swap.addA]: 1, [swap.addB]: 2 },
    drops: { [swap.addA]: 2, [swap.addB]: 1 },
    draftPicks: [],
  };
}
/**
 * Roster 2 changes hands between 2023 and 2024, exactly like this league's real
 * roster 11 (NSLKB -> kdewitt4). "departed" only appears in the older season's user
 * list, mirroring the live API, and holds one self-initiated trade in 2023;
 * "successor" holds a different self-initiated trade in 2024. Roster 1 is stable and
 * doubles as the viewer's own seat ("me"), so it is excluded from getAllDossiers.
 */
function buildHandoverHistory() {
  const stableUser = user("stable", "stable");
  const departedUser = user("departed", "departed");
  const successorUser = user("successor", "successor");
  const oldUsers = new Map([
    ["stable", stableUser],
    ["departed", departedUser],
  ]);
  const nowUsers = new Map([
    ["stable", stableUser],
    ["successor", successorUser],
  ]);
  const seasonsAsc = [
    {
      season: "2023",
      owners: new Map([
        [1, "stable"],
        [2, "departed"],
      ]),
      users: oldUsers,
    },
    {
      season: "2024",
      owners: new Map([
        [1, "stable"],
        [2, "successor"],
      ]),
      users: nowUsers,
    },
  ];
  const currentRosters = [roster(1, "stable"), roster(2, "successor")];
  const principals = buildPrincipals(seasonsAsc, currentRosters, nowUsers);
  const transactions = [
    trade("t-2023", "2023", "departed", { addA: "px", addB: "py" }),
    trade("t-2024", "2024", "successor", { addA: "pz", addB: "pw" }),
  ];
  const league2023 = {
    leagueId: "league-2023",
    name: "Test League",
    season: "2023",
    sport: "nba",
    status: "complete",
    totalRosters: 2,
    rosterPositions: [],
    scoringSettings: {},
    settings: {},
  };
  const league2024 = { ...league2023, leagueId: "league-2024", season: "2024" };
  const h = {
    provider: "fixture",
    currentLeague: league2024,
    chain: [league2023, league2024],
    users: [stableUser, successorUser],
    usersById: nowUsers,
    rostersById: new Map(currentRosters.map((r) => [r.rosterId, r])),
    rosters: currentRosters,
    players: new Map(),
    transactions,
    tradedPicks: [],
    tradedPicksHistory: [],
    matchups: [],
    brackets: new Map(),
    annotations: new Map(),
    me: {
      userId: "stable",
      rosterId: 1,
      displayName: "stable",
      teamName: "stable FC",
    },
    currentSeasonYear: 2024,
  };
  return { h, principals };
}
describe("a handover splits into two independently-scoped dossiers", () => {
  const { h, principals } = buildHandoverHistory();
  it("confirms the fixture actually has a succession to scope against", () => {
    expect(principals.hasSuccessions).toBe(true);
  });
  it("scopes the current occupant's dossier to their own tenure only", () => {
    const d = buildDossier(h, 2, principals);
    expect(d.identity).toEqual({ kind: "current", rosterId: 2 });
    expect(d.profile.displayName).toBe("successor");
    // Only the 2024 trade is theirs - the departed manager's 2023 trade must not
    // bleed into this profile.
    expect(d.profile.trades).toBe(1);
    expect(d.profile.tradesBySeason).toEqual([{ season: "2024", count: 1 }]);
  });
  it("builds a former dossier for the departed manager, scoped to their own seasons", () => {
    const successor = principals.byOwnerId.get("successor");
    const departed = principals.byOwnerId.get("departed");
    expect(departed.isFormer).toBe(true);
    expect(successor.isFormer).toBe(false);
    const d = buildFormerDossier(h, "departed", principals);
    expect(d).not.toBeNull();
    expect(d.identity).toEqual({
      kind: "former",
      ownerId: "departed",
      lastRosterId: 2,
      tenureLabel: "2023",
    });
    expect(d.profile.displayName).toBe("departed");
    // Only the 2023 trade is theirs - the successor's 2024 trade must not bleed in,
    // even though both trades live on the same roster id.
    expect(d.profile.trades).toBe(1);
    expect(d.profile.tradesBySeason).toEqual([{ season: "2023", count: 1 }]);
  });
  it("returns null for a current principal or an unknown owner id", () => {
    expect(buildFormerDossier(h, "successor", principals)).toBeNull();
    expect(buildFormerDossier(h, "nobody", principals)).toBeNull();
  });
  it("keys every principal by owner id, THE VIEWER INCLUDED", () => {
    // The whole reason this exists next to getAllDossiers: comparing yourself against
    // a leaguemate is the point of Manager Compare, and getAllDossiers deliberately
    // leaves you out.
    const byOwner = dossiersByOwner(h, principals);
    expect(byOwner.has(h.me.userId)).toBe(true);
    expect(
      getAllDossiers(h, principals).some(
        (d) => d.profile.userId === h.me.userId,
      ),
    ).toBe(false);
    // A departed principal is keyed by their own owner id, not the seat they left.
    expect(byOwner.get("departed")?.identity.kind).toBe("former");
    expect(byOwner.get("successor")?.identity).toEqual({
      kind: "current",
      rosterId: 2,
    });
  });
  it("reads identically to each manager's own dossier", () => {
    // Two surfaces describing one manager must not be able to disagree.
    const byOwner = dossiersByOwner(h, principals);
    expect(JSON.stringify(byOwner.get("successor"))).toBe(
      JSON.stringify(buildDossier(h, 2, principals)),
    );
    expect(JSON.stringify(byOwner.get("departed"))).toBe(
      JSON.stringify(buildFormerDossier(h, "departed", principals)),
    );
  });
  it("lists current managers before former ones, viewer excluded", () => {
    const all = getAllDossiers(h, principals);
    // Roster 1 is "me" (excluded). Roster 2's current occupant (successor) is the
    // one current entry; the departed principal is the one former entry, listed
    // after every current one.
    expect(all.length).toBe(2);
    expect(all[0].identity).toEqual({ kind: "current", rosterId: 2 });
    expect(all[1].identity.kind).toBe("former");
    if (all[1].identity.kind === "former") {
      expect(all[1].identity.ownerId).toBe("departed");
    }
  });
});
