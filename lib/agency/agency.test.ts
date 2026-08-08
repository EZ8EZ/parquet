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

  it("says so plainly when the order does not follow standings, and claims no odds", () => {
    const rosters = [1, 2, 3, 4].map((id) => rosterWith(id, 20 - id * 4));
    const f = draftOrderFidelity(
      h,
      new Map([["2030", { slotToRosterId: { 1: 1, 2: 3, 3: 2, 4: 4 }, rounds: 3 }]]),
      new Map([["2029", rosters]]),
    );
    expect(f.followsReverseStandings).toBe(false);
    expect(f.note).toMatch(/do not model/i);
    expect(f.note).not.toMatch(/lottery/i);
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
