import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory.js";
import { humanDays, liveStreaks } from "./index.js";
const DAY = 86_400_000;
const base = buildFixtureHistory();
function tx(over) {
  return {
    transactionId: "t1",
    type: "trade",
    status: "complete",
    season: "2024",
    week: 1,
    created: 0,
    statusUpdated: 0,
    creator: null,
    rosterIds: [1, 2],
    consenterIds: [],
    adds: {},
    drops: {},
    draftPicks: [],
    waiverBid: null,
    ...over,
  };
}
/** A one-roster league with exactly the transactions and roster a test needs. */
function world(transactions, players) {
  const roster = { ...base.rosters[0], rosterId: 1, players };
  return {
    ...base,
    rosters: [roster],
    rostersById: new Map([[1, roster]]),
    transactions: [...transactions].sort((a, b) => a.created - b.created),
  };
}
const NOW = 10_000 * DAY;
const find = (h, id, now = NOW) =>
  liveStreaks(h, 1, { now }).streaks.find((s) => s.id === id);
describe("humanDays", () => {
  it("reads like a person wrote it", () => {
    expect(humanDays(0)).toBe("0d");
    expect(humanDays(30)).toBe("30d");
    expect(humanDays(365)).toBe("11mo");
    expect(humanDays(730)).toBe("1y 11mo");
    expect(humanDays(1096)).toBe("3y");
  });
});
describe("liveStreaks is a function of the instant, not of the clock", () => {
  const h = world(
    [tx({ transactionId: "a", created: NOW - 100 * DAY, adds: { p1: 1 } })],
    ["p1"],
  );
  it("the same history at a later instant produces a longer streak", () => {
    const early = find(h, "longest-hold", NOW);
    const later = find(h, "longest-hold", NOW + 50 * DAY);
    // THE WHOLE POINT: nothing about the league changed between these two calls. A
    // settled award would be identical; a live streak must not be.
    expect(later.value).toBe(early.value + 50);
    expect(early.state).toBe("growing");
  });
  it("reports the instant it counted to", () => {
    expect(liveStreaks(h, 1, { now: NOW }).countedAt).toBe(NOW);
  });
  it("returns nothing for a roster that does not exist", () => {
    expect(liveStreaks(h, 99, { now: NOW }).streaks).toEqual([]);
  });
});
describe("hold streaks", () => {
  it("measures from the acquisition, and climbs named rungs", () => {
    const h = world(
      [tx({ transactionId: "a", created: NOW - 400 * DAY, adds: { p1: 1 } })],
      ["p1"],
    );
    const s = find(h, "longest-hold");
    expect(s.value).toBe(400);
    expect(s.atLeast).toBe(false);
    // 400 days is past one year, so the next rung is two.
    expect(s.next?.at).toBe(730);
    expect(s.next?.remaining).toContain("330 days");
  });
  it("does not restart the clock when a held player is re-added", () => {
    // Same rule `avgHoldingDays` uses, because both come off one walk: while a hold is
    // open the first add wins, so a stray duplicate add cannot make a long hold look new.
    const h = world(
      [
        tx({ transactionId: "a", created: NOW - 400 * DAY, adds: { p1: 1 } }),
        tx({ transactionId: "b", created: NOW - 10 * DAY, adds: { p1: 1 } }),
      ],
      ["p1"],
    );
    expect(find(h, "longest-hold").value).toBe(400);
  });
  it("restarts the clock after a real drop and re-acquire", () => {
    const h = world(
      [
        tx({ transactionId: "a", created: NOW - 400 * DAY, adds: { p1: 1 } }),
        tx({ transactionId: "b", created: NOW - 200 * DAY, drops: { p1: 1 } }),
        tx({ transactionId: "c", created: NOW - 30 * DAY, adds: { p1: 1 } }),
      ],
      ["p1"],
    );
    expect(find(h, "longest-hold").value).toBe(30);
  });
  it("flags a hold older than the record rather than understating it", () => {
    // p2 is on the roster but was never acquired inside the record, so the true start
    // is unknown. The figure has to be a floor, said out loud, not a quiet guess.
    const h = world(
      [tx({ transactionId: "a", created: NOW - 100 * DAY, adds: { p1: 1 } })],
      ["p1", "p2"],
    );
    const s = find(h, "longest-hold");
    // p2's floor ties p1's exact 100 days, and the unknown start has to win that tie:
    // its true start is at or before the record's first day, so it is the older hold.
    expect(s.atLeast).toBe(true);
    expect(s.display).toContain("+");
    expect(s.detail).toContain("before the record");
    // No rung: claiming progress towards a milestone off an unknown start would be
    // inventing precision.
    expect(s.next).toBeNull();
  });
  it("names who crosses two years next, and when", () => {
    const h = world(
      [
        tx({ transactionId: "a", created: NOW - 800 * DAY, adds: { p1: 1 } }),
        tx({ transactionId: "b", created: NOW - 700 * DAY, adds: { p2: 1 } }),
      ],
      ["p1", "p2"],
    );
    const s = find(h, "two-year-club");
    expect(s.value).toBe(1);
    expect(s.state).toBe("growing");
    // p2 is 30 days short of 730, and that count changes on its own on that day.
    expect(s.next?.remaining).toContain("30 days");
    // Every start here is known, so the count is exact.
    expect(s.atLeast).toBe(false);
  });
  it("only calls the two-year count a floor when an unknown start could miss it", () => {
    const withPlayers = (recordAgeDays) =>
      world(
        [
          tx({
            transactionId: "a",
            created: NOW - recordAgeDays * DAY,
            adds: { p1: 1 },
          }),
        ],
        ["p1", "p2"],
      );
    // Record older than two years: p2's unknown start has certainly crossed, so the
    // count is exact and must not wear a hedge.
    expect(find(withPlayers(900), "two-year-club").atLeast).toBe(false);
    // Record younger than two years: p2 might or might not belong, so it is a floor.
    expect(find(withPlayers(300), "two-year-club").atLeast).toBe(true);
  });
});
describe("trade cadence streaks", () => {
  it("counts the quiet stretch against the manager's own longest gap", () => {
    const h = world(
      [
        tx({ transactionId: "a", created: NOW - 500 * DAY }),
        tx({ transactionId: "b", created: NOW - 300 * DAY }),
        tx({ transactionId: "c", created: NOW - 60 * DAY }),
      ],
      [],
    );
    const s = find(h, "quiet-stretch");
    expect(s.value).toBe(60);
    // The gaps are 200 and 240 days, so the record to chase is 240 - and 60 days in,
    // there are 180 still to go.
    expect(s.detail).toContain("7mo");
    expect(s.next?.remaining).toContain("180 days");
  });
  it("says so when the current quiet stretch IS the record", () => {
    const h = world(
      [
        tx({ transactionId: "a", created: NOW - 500 * DAY }),
        tx({ transactionId: "b", created: NOW - 400 * DAY }),
      ],
      [],
    );
    const s = find(h, "quiet-stretch");
    expect(s.detail).toContain("still going");
    expect(s.next).toBeNull();
  });
  it("holds a season run at risk while the current season is still open", () => {
    const seasons = base.chain.map((l) => l.season);
    const current = seasons[seasons.length - 1];
    const previous = seasons[seasons.length - 2];
    const h = world(
      [tx({ transactionId: "a", created: NOW - 400 * DAY, season: previous })],
      [],
    );
    const s = find(h, "season-run");
    // The run through the previous season survives - an open season with no trade yet
    // is not a miss, but it is not growth either.
    expect(s.value).toBe(1);
    expect(s.state).toBe("at-risk");
    expect(s.next?.remaining).toContain(current);
  });
  it("marks the season run live once the current season has a trade", () => {
    const seasons = base.chain.map((l) => l.season);
    const current = seasons[seasons.length - 1];
    const h = world(
      [tx({ transactionId: "a", created: NOW - 5 * DAY, season: current })],
      [],
    );
    const s = find(h, "season-run");
    expect(s.state).toBe("growing");
    expect(s.detail).toContain(current);
  });
  it("drops trades out of the rolling window as they age", () => {
    const h = world(
      [
        tx({ transactionId: "old", created: NOW - 120 * DAY }),
        tx({ transactionId: "new", created: NOW - 10 * DAY }),
      ],
      [],
    );
    expect(find(h, "rolling-90").value).toBe(1);
    // Wind the instant back and the older trade is inside the window again - the
    // window moves, the history does not.
    expect(find(h, "rolling-90", NOW - 40 * DAY).value).toBe(2);
  });
});
describe("nothing here restates a Superlative", () => {
  it("every streak is present-tense and carries a live state", () => {
    const h = world(
      [tx({ transactionId: "a", created: NOW - 400 * DAY, adds: { p1: 1 } })],
      ["p1"],
    );
    const { streaks } = liveStreaks(h, 1, { now: NOW });
    expect(streaks.length).toBeGreaterThan(0);
    for (const s of streaks) {
      expect(["growing", "at-risk", "idle"]).toContain(s.state);
      // No award language. A settled superlative reads "most X ever"; these must not.
      expect(s.label.toLowerCase()).not.toMatch(
        /\b(most|fewest|best|worst|ever)\b/,
      );
    }
  });
});
