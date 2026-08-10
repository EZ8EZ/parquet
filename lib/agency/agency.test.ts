import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import type { LeagueHistory } from "../history";
import type { DraftPickRef, Roster, TradedPick, Transaction } from "../providers/types";
import { pickCapital, type OwnedPick } from "../picks";
import { leagueTimelines } from "../metrics/duration";
import {
  compareOrder,
  determiningSeason,
  draftOrderFidelity,
  groupAgency,
  leagueBuybacks,
  pickAgency,
  pickBuybacks,
  posturesByRoster,
  readPickAgency,
  summarizeAgency,
  type Posture,
} from "./index";

const h = buildFixtureHistory();
const ME = h.me.rosterId!;

function ownedPick(over: Partial<OwnedPick> = {}): OwnedPick {
  return {
    season: String(h.currentSeasonYear + 1),
    round: 1,
    originalRoster: ME,
    acquired: false,
    fromName: null,
    value: 1000,
    label: "pick",
    ...over,
  };
}

function postures(entries: [number, Posture][]) {
  return new Map(entries.map(([id, posture]) => [id, { posture, tci: 70 }]));
}

// A user-facing string may never contain an em dash, in any encoding (house rule).
const EM_DASH = /[—–]/;

describe("determiningSeason", () => {
  it("is the season before the draft, which is what orders it", () => {
    expect(determiningSeason("2027")).toBe("2026");
    expect(determiningSeason("2026")).toBe("2025");
  });
});

describe("readPickAgency", () => {
  const other = h.rosters.find((r) => r.rosterId !== ME)!.rosterId;

  it("names the viewer as the one who sets their own pick", () => {
    const r = readPickAgency(h, ME, ownedPick(), {
      postures: postures([[ME, "rebuilding"]]),
    });
    expect(r.controlled).toBe(true);
    expect(r.determinedBy).toBe(ME);
    expect(r.tension).toBe("aligned");
    expect(r.note).toMatch(/your own/i);
  });

  it("calls the holder a passenger on someone else's pick, and says whose", () => {
    const r = readPickAgency(h, ME, ownedPick({ originalRoster: other, acquired: true }), {
      postures: postures([[other, "contending"]]),
    });
    expect(r.controlled).toBe(false);
    expect(r.tension).toBe("passenger");
    expect(r.determinedBy).toBe(other);
    expect(r.note).toContain(r.determinedByName);
    expect(r.note).toContain("contending");
    expect(r.note).toMatch(/they hold the outcome/i);
  });

  /**
   * The tension this whole module exists to name, and the one place D6 is easiest to
   * break: a contender holding its own first is a real pull, and stating the pull is
   * the product. Calling it bad would be a grade.
   */
  it("names the contending-and-holding-your-own-pick tension without grading it", () => {
    const r = readPickAgency(h, ME, ownedPick(), {
      postures: postures([[ME, "contending"]]),
    });
    expect(r.tension).toBe("opposed");
    expect(r.note).toMatch(/pull against each other/i);
    expect(r.note).not.toMatch(/\b(bad|mistake|wrong|should|worst)\b/i);
  });

  /** D19: posture is reported, intent never is. */
  it("never says anyone is tanking, in any posture", () => {
    const all: Posture[] = ["rebuilding", "contending", "ascending", "straddling"];
    for (const posture of all) {
      for (const holder of [ME, other]) {
        const r = readPickAgency(
          h,
          ME,
          ownedPick({ originalRoster: holder, acquired: holder !== ME }),
          { postures: postures([[holder, posture]]) },
        );
        expect(r.note).not.toMatch(/tank/i);
        expect(r.note).not.toMatch(EM_DASH);
      }
    }
  });

  it("marks a pick settled once the season that orders it is over", () => {
    const past = readPickAgency(h, ME, ownedPick({ season: String(h.currentSeasonYear) }));
    const future = readPickAgency(
      h,
      ME,
      ownedPick({ season: String(h.currentSeasonYear + 2) }),
    );
    expect(past.settled).toBe(true);
    expect(past.note).toMatch(/no longer anybody's to move/);
    expect(future.settled).toBe(false);
  });

  it("degrades to an open read when no posture is supplied", () => {
    const r = readPickAgency(h, ME, ownedPick());
    expect(r.tension).toBe("open");
    expect(r.posture).toBeNull();
  });
});

describe("pickAgency over a real roster", () => {
  const inputs = { postures: posturesByRoster(leagueTimelines(h)) };

  it("reads every pick the roster holds", () => {
    const reads = pickAgency(h, ME, inputs);
    expect(reads.length).toBe(pickCapital(h, ME).picks.length);
    expect(reads.length).toBeGreaterThan(0);
  });

  it("marks acquired picks as passenger and own picks as controlled", () => {
    for (const r of pickAgency(h, ME, inputs)) {
      expect(r.controlled).toBe(!r.pick.acquired);
    }
  });

  it("summarizes into a controlled/passenger split that adds up", () => {
    const reads = pickAgency(h, ME, inputs);
    const s = summarizeAgency(reads);
    expect(s.controlled + s.passenger).toBe(s.total);
    expect(s.ridingOn.reduce((n, b) => n + b.picks, 0)).toBe(s.passenger);
    expect(Math.round(s.controlledValue + s.passengerValue)).toBe(
      Math.round(reads.reduce((n, r) => n + r.pick.value, 0)),
    );
    expect(s.headline).not.toMatch(EM_DASH);
  });
});

// ------------------------------------------------------------ grouped agency

describe("groupAgency", () => {
  const other = h.rosters.find((r) => r.rosterId !== ME)!.rosterId;
  const third = h.rosters.find((r) => r.rosterId !== ME && r.rosterId !== other)!.rosterId;

  function readsFor(
    specs: { from: number; posture: Posture | null; round?: number; value?: number }[],
  ) {
    return specs.map((s, i) =>
      readPickAgency(
        h,
        ME,
        ownedPick({
          originalRoster: s.from,
          acquired: s.from !== ME,
          round: s.round ?? 1,
          value: s.value ?? 1000,
          season: String(h.currentSeasonYear + 1 + (i % 2)),
        }),
        { postures: s.posture ? postures([[s.from, s.posture]]) : new Map() },
      ),
    );
  }

  /** The whole point of the change: nothing may fall out of the list on the way. */
  it("partitions the reads with no pick lost, duplicated or revalued", () => {
    const reads = readsFor([
      { from: ME, posture: "rebuilding" },
      { from: ME, posture: "rebuilding", round: 2 },
      { from: other, posture: "contending", value: 900 },
      { from: third, posture: "contending", value: 800 },
      { from: third, posture: "contending", round: 3, value: 100 },
    ]);
    const groups = groupAgency(reads);
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(reads.length);
    expect(groups.flatMap((g) => g.picks).map((p) => p.key).sort()).toEqual(
      reads.map((r) => r.key).sort(),
    );
    expect(Math.round(groups.reduce((n, g) => n + g.value, 0))).toBe(
      Math.round(reads.reduce((n, r) => n + r.pick.value, 0)),
    );
    expect(groups.reduce((n, g) => n + g.firsts, 0)).toBe(
      reads.filter((r) => r.pick.round === 1).length,
    );
  });

  it("collapses every pick you control into one group, however many there are", () => {
    const groups = groupAgency(
      readsFor([
        { from: ME, posture: "contending" },
        { from: ME, posture: "contending", round: 2 },
        { from: ME, posture: "contending", round: 3 },
      ]),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe("controlled");
    expect(groups[0].count).toBe(3);
    expect(groups[0].managers).toEqual([]);
  });

  it("groups passenger picks by the posture of the roster that sets them, naming every manager once", () => {
    const groups = groupAgency(
      readsFor([
        { from: other, posture: "rebuilding" },
        { from: third, posture: "rebuilding", round: 2 },
        { from: third, posture: "rebuilding", round: 3 },
      ]),
    );
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.kind).toBe("passenger");
    expect(g.posture).toBe("rebuilding");
    expect(g.managers.map((m) => m.rosterId).sort()).toEqual([other, third].sort());
    for (const m of g.managers) expect(g.note).toContain(m.name);
  });

  it("keeps two postures apart rather than merging them under one sentence", () => {
    const groups = groupAgency(
      readsFor([
        { from: other, posture: "rebuilding" },
        { from: third, posture: "contending" },
      ]),
    );
    expect(groups.map((g) => g.posture)).toEqual(["rebuilding", "contending"]);
  });

  it("puts the picks you control first, then the postures in summary order", () => {
    const groups = groupAgency(
      readsFor([
        { from: third, posture: "contending" },
        { from: other, posture: "rebuilding" },
        { from: ME, posture: "ascending" },
      ]),
    );
    expect(groups.map((g) => g.kind)).toEqual(["controlled", "passenger", "passenger"]);
    expect(groups.slice(1).map((g) => g.posture)).toEqual(["rebuilding", "contending"]);
  });

  it("gives an unread roster its own group rather than guessing a posture", () => {
    const groups = groupAgency(readsFor([{ from: other, posture: null }]));
    expect(groups).toHaveLength(1);
    expect(groups[0].posture).toBeNull();
    expect(groups[0].note).toMatch(/no timeline is read/i);
  });

  it("says one pick in the singular", () => {
    const [g] = groupAgency(readsFor([{ from: other, posture: "ascending" }]));
    expect(g.note).toMatch(/season sets this pick's slot/);
    expect(g.note).not.toMatch(/these picks/);
  });

  /** D6 and D19 survive the regrouping, which is the only way it may ship. */
  it("never grades and never claims intent, in any posture", () => {
    const all: (Posture | null)[] = [
      "rebuilding",
      "contending",
      "ascending",
      "straddling",
      null,
    ];
    for (const posture of all) {
      for (const from of [ME, other]) {
        for (const g of groupAgency(readsFor([{ from, posture }, { from, posture, round: 2 }]))) {
          expect(g.note).not.toMatch(/tank/i);
          expect(g.note).not.toMatch(/\b(bad|mistake|wrong|should|worst)\b/i);
          expect(g.note).not.toMatch(EM_DASH);
          expect(g.title).not.toMatch(EM_DASH);
        }
      }
    }
  });

  it("groups a real roster's picks into fewer rows than it has picks", () => {
    const reads = pickAgency(h, ME, { postures: posturesByRoster(leagueTimelines(h)) });
    const groups = groupAgency(reads);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.length).toBeLessThanOrEqual(reads.length);
    // Six is the ceiling by construction: three controlled tensions plus five
    // postures can never all be live for one holder, and the panel must not be able
    // to grow back into a per-pick list without this failing.
    expect(groups.length).toBeLessThanOrEqual(6);
  });

  it("returns nothing for no picks rather than an empty group", () => {
    expect(groupAgency([])).toEqual([]);
  });
});

// ---------------------------------------------------------------- buybacks

function pickRef(over: Partial<DraftPickRef> & Pick<DraftPickRef, "previousOwnerId" | "ownerId">): DraftPickRef {
  return { round: 1, season: "2030", rosterId: 1, ...over };
}

function trade(id: string, created: number, picks: DraftPickRef[]): Transaction {
  return {
    transactionId: id,
    type: "trade",
    status: "complete",
    season: "2029",
    week: 1,
    created,
    statusUpdated: created,
    creator: null,
    rosterIds: [],
    consenterIds: [],
    adds: {},
    drops: {},
    draftPicks: picks,
  };
}

const DAY = 86_400_000;

function withHistory(over: {
  transactions?: Transaction[];
  tradedPicks?: TradedPick[];
  tradedPicksHistory?: TradedPick[];
}): LeagueHistory {
  return {
    ...h,
    transactions: over.transactions ?? [],
    tradedPicks: over.tradedPicks ?? [],
    tradedPicksHistory: over.tradedPicksHistory ?? [],
  };
}

describe("pickBuybacks", () => {
  it("finds a straight there-and-back and dates it", () => {
    const out = pickBuybacks(
      withHistory({
        transactions: [
          trade("t1", 1000 * DAY, [pickRef({ previousOwnerId: 1, ownerId: 2 })]),
          trade("t2", 1030 * DAY, [pickRef({ previousOwnerId: 2, ownerId: 1 })]),
        ],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      rosterId: 1,
      fromRoster: 2,
      recorded: true,
      transactionId: "t2",
      awayDays: 30,
      recordedHops: 2,
    });
  });

  /**
   * The case the brief singles out, and the one the live league actually contains:
   * the pick left, moved on ONCE MORE while it was away, and only then came home.
   * A detector that assumed the previous hop was the departure would mis-date this
   * and undercount its travels.
   */
  it("handles a pick that changed hands more than twice before coming home", () => {
    const out = pickBuybacks(
      withHistory({
        transactions: [
          trade("t1", 100 * DAY, [pickRef({ previousOwnerId: 1, ownerId: 2 })]),
          trade("t2", 140 * DAY, [pickRef({ previousOwnerId: 2, ownerId: 3 })]),
          trade("t3", 172 * DAY, [pickRef({ previousOwnerId: 3, ownerId: 1 })]),
        ],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].fromRoster).toBe(3);
    expect(out[0].awayDays).toBe(72);
    expect(out[0].recordedHops).toBe(3);
  });

  it("reports two round trips when the same pick comes home twice", () => {
    const out = pickBuybacks(
      withHistory({
        transactions: [
          trade("t1", 10 * DAY, [pickRef({ previousOwnerId: 1, ownerId: 2 })]),
          trade("t2", 20 * DAY, [pickRef({ previousOwnerId: 2, ownerId: 1 })]),
          trade("t3", 30 * DAY, [pickRef({ previousOwnerId: 1, ownerId: 4 })]),
          trade("t4", 55 * DAY, [pickRef({ previousOwnerId: 4, ownerId: 1 })]),
        ],
      }),
    );
    expect(out.map((b) => b.transactionId)).toEqual(["t2", "t4"]);
    expect(out.map((b) => b.awayDays)).toEqual([10, 25]);
  });

  it("does not fire on a pick that only ever leaves", () => {
    const out = pickBuybacks(
      withHistory({
        transactions: [
          trade("t1", 10 * DAY, [pickRef({ previousOwnerId: 1, ownerId: 2 })]),
          trade("t2", 20 * DAY, [pickRef({ previousOwnerId: 2, ownerId: 3 })]),
        ],
      }),
    );
    expect(out).toHaveLength(0);
  });

  it("keeps two different picks of the same season and round apart", () => {
    const out = pickBuybacks(
      withHistory({
        transactions: [
          trade("t1", 10 * DAY, [
            pickRef({ rosterId: 1, previousOwnerId: 1, ownerId: 2 }),
            pickRef({ rosterId: 5, previousOwnerId: 5, ownerId: 2 }),
          ]),
          trade("t2", 20 * DAY, [pickRef({ rosterId: 1, previousOwnerId: 2, ownerId: 1 })]),
        ],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].rosterId).toBe(1);
  });

  /**
   * D19's gap, surfaced rather than guessed: a commissioner-executed trade records
   * no picks at all, so the snapshot is the only evidence the round trip happened.
   * It must be reported, and it must NOT carry a date it does not have.
   */
  it("reports a snapshot-only round trip undated and flagged unrecorded", () => {
    const out = pickBuybacks(
      withHistory({
        tradedPicks: [{ season: "2030", round: 1, rosterId: 3, ownerId: 3, previousOwnerId: 9 }],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ recorded: false, at: null, awayDays: null, fromRoster: 9 });
  });

  it("does not double-report a round trip the transaction log already explains", () => {
    const out = pickBuybacks(
      withHistory({
        transactions: [
          trade("t1", 10 * DAY, [pickRef({ previousOwnerId: 1, ownerId: 2 })]),
          trade("t2", 20 * DAY, [pickRef({ previousOwnerId: 2, ownerId: 1 })]),
        ],
        tradedPicks: [{ season: "2030", round: 1, rosterId: 1, ownerId: 1, previousOwnerId: 2 }],
        tradedPicksHistory: [
          { season: "2030", round: 1, rosterId: 1, ownerId: 1, previousOwnerId: 2 },
        ],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].recorded).toBe(true);
  });

  it("runs clean over the whole fixture corpus", () => {
    expect(() => pickBuybacks(h)).not.toThrow();
    for (const b of pickBuybacks(h)) {
      expect(b.rosterId).not.toBe(b.fromRoster);
      expect(b.label).not.toMatch(EM_DASH);
    }
  });
});

describe("leagueBuybacks", () => {
  /**
   * The fixture carries a scripted round trip (three recorded hops - see
   * lib/providers/fixture/generate.ts) precisely so this file's corpus assertions
   * cannot pass by describing an empty list. If that trade ever disappears, this
   * fails here rather than quietly making six other expectations vacuous.
   */
  it("has a real round trip in the corpus to aggregate at all", () => {
    const v = leagueBuybacks(h);
    expect(v.total).toBeGreaterThan(0);
    expect(v.multiHop.length).toBeGreaterThan(0);
    expect(v.longestAway?.awayDays).toBeGreaterThan(0);
  });

  it("aggregates exactly what pickBuybacks found, with nothing added or dropped", () => {
    const v = leagueBuybacks(h);
    const raw = pickBuybacks(h);
    expect(v.total).toBe(raw.length);
    expect(v.all).toEqual(raw);
    expect(v.recorded + v.unrecorded).toBe(v.total);
    expect(v.byManager.reduce((n, m) => n + m.count, 0)).toBe(v.total);
    expect(v.byManager.reduce((n, m) => n + m.recorded, 0)).toBe(v.recorded);
    for (const b of v.all) expect(b.label).not.toMatch(EM_DASH);
  });

  it("counts the rosters that have never done it, so the total has a denominator", () => {
    const v = leagueBuybacks(h);
    expect(v.rosters).toBe(h.rosters.length);
    expect(v.rostersWithNone).toBe(v.rosters - v.byManager.length);
    expect(v.rostersWithNone).toBeGreaterThanOrEqual(0);
  });

  it("ranks managers busiest first", () => {
    const v = leagueBuybacks(
      withHistory({
        transactions: [
          trade("t1", 10 * DAY, [pickRef({ rosterId: 1, previousOwnerId: 1, ownerId: 2 })]),
          trade("t2", 20 * DAY, [pickRef({ rosterId: 1, previousOwnerId: 2, ownerId: 1 })]),
          trade("t3", 30 * DAY, [pickRef({ rosterId: 1, season: "2031", previousOwnerId: 1, ownerId: 2 })]),
          trade("t4", 40 * DAY, [pickRef({ rosterId: 1, season: "2031", previousOwnerId: 2, ownerId: 1 })]),
          trade("t5", 50 * DAY, [pickRef({ rosterId: 5, previousOwnerId: 5, ownerId: 2 })]),
          trade("t6", 60 * DAY, [pickRef({ rosterId: 5, previousOwnerId: 2, ownerId: 5 })]),
        ],
      }),
    );
    expect(v.byManager.map((m) => [m.rosterId, m.count])).toEqual([
      [1, 2],
      [5, 1],
    ]);
  });

  /**
   * The case the live corpus contains (EZ8's own 2024 first, three hops) and the one
   * a league-wide roll-up is most likely to flatten: it must survive aggregation as a
   * distinguishable row, not merge into the ordinary there-and-backs.
   */
  it("keeps the pick that changed hands more than twice separable from the rest", () => {
    const v = leagueBuybacks(
      withHistory({
        transactions: [
          // Straight there-and-back.
          trade("a1", 10 * DAY, [pickRef({ rosterId: 1, previousOwnerId: 1, ownerId: 2 })]),
          trade("a2", 20 * DAY, [pickRef({ rosterId: 1, previousOwnerId: 2, ownerId: 1 })]),
          // Out, on once more, then home: three recorded hops.
          trade("b1", 100 * DAY, [pickRef({ rosterId: 5, previousOwnerId: 5, ownerId: 2 })]),
          trade("b2", 140 * DAY, [pickRef({ rosterId: 5, previousOwnerId: 2, ownerId: 3 })]),
          trade("b3", 172 * DAY, [pickRef({ rosterId: 5, previousOwnerId: 3, ownerId: 5 })]),
        ],
      }),
    );
    expect(v.total).toBe(2);
    expect(v.multiHop).toHaveLength(1);
    expect(v.multiHop[0]).toMatchObject({
      rosterId: 5,
      fromRoster: 3,
      recordedHops: 3,
      awayDays: 72,
    });
    expect(v.longestAway?.rosterId).toBe(5);
    expect(v.longestAway?.awayDays).toBe(72);
  });

  /** An undated round trip has no length, so it may never win a longest-away claim. */
  it("never lets a snapshot-only round trip stand as the longest time away", () => {
    const v = leagueBuybacks(
      withHistory({
        transactions: [
          trade("t1", 10 * DAY, [pickRef({ rosterId: 1, previousOwnerId: 1, ownerId: 2 })]),
          trade("t2", 15 * DAY, [pickRef({ rosterId: 1, previousOwnerId: 2, ownerId: 1 })]),
        ],
        tradedPicks: [
          { season: "2030", round: 2, rosterId: 3, ownerId: 3, previousOwnerId: 9 },
        ],
      }),
    );
    expect(v.total).toBe(2);
    expect(v.unrecorded).toBe(1);
    expect(v.longestAway?.rosterId).toBe(1);
    expect(v.longestAway?.awayDays).toBe(5);
  });

  /**
   * A whole corpus rather than one shape at a time: four picks, five rosters, both
   * evidence sources, a straight there-and-back, a three-hop return, a pick that came
   * home twice, a pick that only ever left, and a snapshot-only round trip. Every
   * figure below is counted by hand from the trades above it, so the aggregation is
   * pinned against the record and not against its own output.
   */
  it("adds up across a whole corpus of round trips", () => {
    const v = leagueBuybacks(
      withHistory({
        transactions: [
          // Roster 1's 2030 1st: out, and home 30 days later. (buyback 1)
          trade("c1", 10 * DAY, [pickRef({ rosterId: 1, previousOwnerId: 1, ownerId: 2 })]),
          trade("c2", 40 * DAY, [pickRef({ rosterId: 1, previousOwnerId: 2, ownerId: 1 })]),
          // The same pick goes again, and comes home again. (buyback 2)
          trade("c3", 60 * DAY, [pickRef({ rosterId: 1, previousOwnerId: 1, ownerId: 4 })]),
          trade("c4", 70 * DAY, [pickRef({ rosterId: 1, previousOwnerId: 4, ownerId: 1 })]),
          // Roster 5's 2031 1st: out, on to a third party, then home. (buyback 3)
          trade("c5", 5 * DAY, [
            pickRef({ rosterId: 5, season: "2031", previousOwnerId: 5, ownerId: 2 }),
          ]),
          trade("c6", 50 * DAY, [
            pickRef({ rosterId: 5, season: "2031", previousOwnerId: 2, ownerId: 3 }),
          ]),
          trade("c7", 205 * DAY, [
            pickRef({ rosterId: 5, season: "2031", previousOwnerId: 3, ownerId: 5 }),
          ]),
          // Roster 4's 2032 2nd leaves and never returns. Not a round trip.
          trade("c8", 80 * DAY, [
            pickRef({ rosterId: 4, season: "2032", round: 2, previousOwnerId: 4, ownerId: 1 }),
          ]),
        ],
        // Roster 3 holds its own 2033 1st having got it from roster 9, with no
        // transaction explaining it. (buyback 4, undated)
        tradedPicksHistory: [
          { season: "2033", round: 1, rosterId: 3, ownerId: 3, previousOwnerId: 9 },
        ],
      }),
    );

    expect(v.total).toBe(4);
    expect(v.recorded).toBe(3);
    expect(v.unrecorded).toBe(1);
    // Busiest first; the two ties below break on name, not on roster id.
    expect(v.byManager[0]).toMatchObject({ rosterId: 1, count: 2, recorded: 2 });
    expect(v.byManager.map((m) => m.rosterId).sort()).toEqual([1, 3, 5]);
    expect(v.byManager.slice(1).map((m) => m.rosterName)).toEqual(
      [...v.byManager.slice(1)].sort((a, b) => a.rosterName.localeCompare(b.rosterName))
        .map((m) => m.rosterName),
    );
    expect(v.byManager.find((m) => m.rosterId === 3)).toMatchObject({ count: 1, recorded: 0 });
    expect(v.byManager.find((m) => m.rosterId === 5)).toMatchObject({ count: 1, recorded: 1 });
    expect(v.all.map((b) => b.awayDays)).toEqual([30, 10, 200, null]);
    // Only the three-hop one, and it is not the one with the most elapsed calendar.
    expect(v.multiHop.map((b) => b.rosterId)).toEqual([5]);
    expect(v.multiHop[0].recordedHops).toBe(3);
    expect(v.longestAway).toMatchObject({ rosterId: 5, awayDays: 200 });
    expect(v.rostersWithNone).toBe(h.rosters.length - 3);
  });

  it("reports an empty league honestly rather than with a null-shaped hole", () => {
    const v = leagueBuybacks(withHistory({}));
    expect(v).toMatchObject({ total: 0, recorded: 0, unrecorded: 0, longestAway: null });
    expect(v.byManager).toEqual([]);
    expect(v.multiHop).toEqual([]);
    expect(v.rostersWithNone).toBe(h.rosters.length);
  });
});

// ------------------------------------------------------- draft order fidelity

function rosterWith(rosterId: number, wins: number): Roster {
  const base = h.rosters[0];
  return {
    ...base,
    rosterId,
    settings: { ...base.settings, wins, losses: 20 - wins, ties: 0, fpts: wins * 100 },
  };
}

describe("draft order fidelity", () => {
  it("scores an exact reverse-standings order as zero deviations", () => {
    // standingsBest = best first; the reverse of that is the expected slot order.
    const slots = { 1: 4, 2: 3, 3: 2, 4: 1 };
    expect(compareOrder(slots, [1, 2, 3, 4])).toEqual({
      teams: 4,
      deviations: 0,
      maxShift: 0,
    });
  });

  it("counts how far each roster sits from its reverse-standings slot", () => {
    // Best-first standings [1,2,3,4] expect slot order [4,3,2,1]. Here the two
    // middle rosters sit where they should and the two ends are swapped.
    const slots = { 1: 1, 2: 3, 3: 2, 4: 4 };
    const cmp = compareOrder(slots, [1, 2, 3, 4]);
    expect(cmp.deviations).toBe(2);
    expect(cmp.maxShift).toBe(3);
  });

  it("says so plainly when the order does not follow standings, and owns the lottery", () => {
    // THIS TEST USED TO PIN THE DEFECT. It required the note to say "we do not model"
    // and to NOT contain the word "lottery" - while `slotDistribution()` in
    // lib/valuation builds a lottery over reverse standings and `pickValue()` takes the
    // expectation over it, on the same screen, in the list directly above this
    // sentence. The old copy ended "and no odds are computed anywhere", which was
    // false about the page printing it. What the note must do is decline to name a
    // SLOT while owning the odds the pricing does use.
    const rosters = [1, 2, 3, 4].map((id) => rosterWith(id, 20 - id * 4));
    const f = draftOrderFidelity(
      h,
      new Map([["2030", { slotToRosterId: { 1: 1, 2: 3, 3: 2, 4: 4 }, rounds: 3 }]]),
      new Map([["2029", rosters]]),
    );
    expect(f.followsReverseStandings).toBe(false);
    expect(f.note).toMatch(/nothing here names the slot/i);
    expect(f.note).toMatch(/lottery over reverse standings/i);
    expect(f.note).toMatch(/tendency, not a projection/i);
    // The claim that must never come back, in any of its phrasings.
    expect(f.note).not.toMatch(/no odds are computed/i);
    expect(f.note).not.toMatch(EM_DASH);
  });

  it("confirms a league whose order IS exact, so the check can say yes", () => {
    const rosters = [1, 2, 3, 4].map((id) => rosterWith(id, 20 - id * 4));
    const f = draftOrderFidelity(
      h,
      new Map([["2030", { slotToRosterId: { 1: 4, 2: 3, 3: 2, 4: 1 }, rounds: 3 }]]),
      new Map([["2029", rosters]]),
    );
    expect(f.followsReverseStandings).toBe(true);
    expect(f.seasons[0].exact).toBe(true);
  });

  it("skips a season with no played standings rather than inventing a comparison", () => {
    const unplayed = [1, 2, 3, 4].map((id) => ({
      ...rosterWith(id, 0),
      settings: { ...rosterWith(id, 0).settings, wins: 0, losses: 0, fpts: 0 },
    }));
    const f = draftOrderFidelity(
      h,
      new Map([["2030", { slotToRosterId: { 1: 4, 2: 3, 3: 2, 4: 1 }, rounds: 3 }]]),
      new Map([["2029", unplayed]]),
    );
    expect(f.seasons).toHaveLength(0);
    expect(f.followsReverseStandings).toBe(false);
    expect(f.note).toMatch(/nothing here assumes one/);
  });
});
