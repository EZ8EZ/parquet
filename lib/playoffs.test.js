import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "./testing/fixtureHistory.js";
import { getPrincipals } from "./principals.js";
import {
  championFrom,
  playoffPlaces,
  placementsFrom,
  seasonResult,
  seasonResults,
  titlesByOwner,
} from "./playoffs.js";
import { strengthRanks } from "./picks.js";
const g = (over) => ({
  matchId: 1,
  round: 1,
  placement: null,
  team1: null,
  team2: null,
  winner: null,
  loser: null,
  ...over,
});
describe("placementsFrom", () => {
  it("gives the winner its place and the loser the next one", () => {
    const games = [
      g({
        matchId: 9,
        round: 3,
        placement: 1,
        team1: 5,
        team2: 1,
        winner: 1,
        loser: 5,
      }),
      g({
        matchId: 10,
        round: 3,
        placement: 3,
        team1: 2,
        team2: 4,
        winner: 2,
        loser: 4,
      }),
    ];
    expect(placementsFrom(games)).toEqual(
      new Map([
        [1, 1],
        [5, 2],
        [2, 3],
        [4, 4],
      ]),
    );
  });
  it("ignores advancement games entirely", () => {
    // "Lost in round 2" is not a finishing place, and inferring one would mean
    // assuming a bracket shape this function cannot see.
    const games = [g({ matchId: 5, round: 2, winner: 5, loser: 2 })];
    expect(placementsFrom(games).size).toBe(0);
  });
  it("contributes nothing for a placement game still undecided", () => {
    const games = [
      g({ placement: 1, team1: 3, team2: 7, winner: null, loser: null }),
    ];
    expect(placementsFrom(games).size).toBe(0);
    expect(championFrom(games)).toBeNull();
  });
});
describe("seasonResult", () => {
  it("names the champion and the runner-up off the p=1 game", () => {
    const r = seasonResult("2025", [
      g({ round: 3, placement: 1, team1: 5, team2: 1, winner: 1, loser: 5 }),
      g({ round: 3, placement: 7, team1: 11, team2: 9, winner: 11, loser: 9 }),
    ]);
    expect(r.championRosterId).toBe(1);
    expect(r.runnerUpRosterId).toBe(5);
    expect(r.placesDecided).toBe(4);
  });
  it("has no champion when the bracket decided nothing", () => {
    const r = seasonResult("2026", []);
    expect(r.championRosterId).toBeNull();
    expect(r.runnerUpRosterId).toBeNull();
  });
});
describe("against the fixture corpus", () => {
  const h = buildFixtureHistory();
  it("finds a decided champion for every completed season", () => {
    const results = seasonResults(h);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.championRosterId).not.toBeNull();
      // The current season is still being played and must never be crowned.
      expect(r.season).not.toBe(h.currentLeague.season);
    }
  });
  it("credits titles to a principal, never to a bare roster id", async () => {
    const principals = await getPrincipals(h);
    const byOwner = titlesByOwner(h, principals);
    const total = [...byOwner.values()].reduce((n, s) => n + s.length, 0);
    expect(total).toBe(seasonResults(h).length);
  });
  it("returns only the teams the bracket actually placed", () => {
    const places = playoffPlaces(h);
    const latest = seasonResults(h).at(-1);
    expect(places).toEqual(latest.placeByRoster);
    // Not a full league order - the teams that missed are not this module's business.
    expect(places.size).toBeLessThan(h.rosters.length);
  });
  it("makes strengthRanks rank the champion 1, so pickValue drafts them last", () => {
    // The whole of candidate 44 in one assertion.
    const ranks = strengthRanks(h);
    const latest = seasonResults(h).at(-1);
    expect(ranks.get(latest.championRosterId)).toBe(1);
    for (const [rosterId, place] of latest.placeByRoster) {
      expect(ranks.get(rosterId)).toBe(place);
    }
  });
  it("still ranks every roster exactly once, playoff teams ahead of the rest", () => {
    const ranks = strengthRanks(h);
    expect(ranks.size).toBe(h.rosters.length);
    expect([...ranks.values()].sort((a, b) => a - b)).toEqual(
      h.rosters.map((_, i) => i + 1),
    );
    const latest = seasonResults(h).at(-1);
    const worstPlaced = Math.max(
      ...[...latest.placeByRoster.keys()].map((r) => ranks.get(r)),
    );
    const bestUnplaced = Math.min(
      ...h.rosters
        .filter((r) => !latest.placeByRoster.has(r.rosterId))
        .map((r) => ranks.get(r.rosterId)),
    );
    expect(worstPlaced).toBeLessThan(bestUnplaced);
  });
  it("falls back cleanly when no bracket exists at all", () => {
    const bare = { ...h, brackets: new Map() };
    expect(playoffPlaces(bare)).toBeNull();
    // strengthRanks must still rank everyone - the old record/talent path.
    expect(strengthRanks(bare).size).toBe(h.rosters.length);
  });
});
