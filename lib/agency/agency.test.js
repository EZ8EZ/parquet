import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory.js";
import { pickCapital } from "../picks.js";
import { leagueTimelines } from "../metrics/duration.js";
import {
  awayPicks,
  compareOrder,
  determiningSeason,
  draftOrderFidelity,
  groupAgency,
  leagueBuybacks,
  pickAgency,
  pickBuybacks,
  pickDepartures,
  posturesByRoster,
  readPickAgency,
  summarizeAgency,
} from "./index.js";
const h = buildFixtureHistory();
const ME = h.me.rosterId;
function ownedPick(over = {}) {
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
function postures(entries) {
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
  const other = h.rosters.find((r) => r.rosterId !== ME).rosterId;
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
    const r = readPickAgency(
      h,
      ME,
      ownedPick({ originalRoster: other, acquired: true }),
      {
        postures: postures([[other, "contending"]]),
      },
    );
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
    const all = ["rebuilding", "contending", "ascending", "straddling"];
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
    const past = readPickAgency(
      h,
      ME,
      ownedPick({ season: String(h.currentSeasonYear) }),
    );
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
  it("reads the reciprocal set: own picks somebody else holds", () => {
    const away = awayPicks(h, ME);
    const heldIds = new Set(
      pickCapital(h, ME).picks.map(
        (p) => `${p.season}|${p.round}|${p.originalRoster}`,
      ),
    );
    for (const a of away) {
      // Originally this roster's, and NOT in the held set. Both halves matter: the
      // first is what makes it "yours to set", the second what makes it "theirs to
      // hold".
      expect(a.pick.originalRoster).toBe(ME);
      expect(
        heldIds.has(
          `${a.pick.season}|${a.pick.round}|${a.pick.originalRoster}`,
        ),
      ).toBe(false);
    }
  });
  it("summarizes into three buckets whose counts are the two real sums", () => {
    const reads = pickAgency(h, ME, inputs);
    const away = awayPicks(h, ME);
    const s = summarizeAgency(reads, away);
    const live = reads.filter((r) => !r.settled);
    const at = (key) => s.buckets.find((b) => b.key === key)?.picks ?? 0;
    // A + C = what you hold (live), A + B = what your own seasons decide (live).
    expect(at("setAndHold") + at("holdNotSet")).toBe(live.length);
    expect(at("setAndHold") + at("setNotHold")).toBe(s.yoursToSet);
    expect(at("setAndHold") + at("holdNotSet")).toBe(s.youHold);
    expect(s.both).toBe(at("setAndHold"));
    expect(s.ridingOn.reduce((n, b) => n + b.picks, 0)).toBe(at("holdNotSet"));
    expect(s.settled).toBe(reads.length - live.length);
  });
  /** The bar it replaced had a headline stating the same broken ratio in prose. */
  it("no longer carries a headline, a controlled count or a passenger count", () => {
    const s = summarizeAgency(pickAgency(h, ME, inputs), awayPicks(h, ME));
    expect(s.headline).toBeUndefined();
    expect(s.controlled).toBeUndefined();
    expect(s.passenger).toBeUndefined();
    expect(s.controlledValue).toBeUndefined();
  });
});
// -------------------------------------------------------------- the ledger
describe("summarizeAgency as a three-part ledger", () => {
  const other = h.rosters.find((r) => r.rosterId !== ME).rosterId;
  const FUTURE = String(h.currentSeasonYear + 2);
  function held(specs) {
    return specs.map((s) =>
      readPickAgency(
        h,
        ME,
        ownedPick({
          season: s.season ?? FUTURE,
          round: s.round ?? 1,
          originalRoster: s.from,
          acquired: s.from !== ME,
        }),
        { postures: postures([[s.from, s.posture ?? "rebuilding"]]) },
      ),
    );
  }
  function away(specs) {
    return specs.map((s) => ({
      pick: ownedPick({ season: s.season ?? FUTURE, round: s.round ?? 1 }),
      key: `away-${s.season ?? FUTURE}-${s.round ?? 1}-${ME}`,
      settled: s.settled ?? false,
    }));
  }
  it("labels the three buckets as the rhyming triplet, in order", () => {
    const s = summarizeAgency(
      held([{ from: ME }, { from: other }]),
      away([{ round: 2 }]),
    );
    expect(s.buckets.map((b) => [b.setter, b.holder])).toEqual([
      ["yours", "yours"],
      ["yours", "theirs"],
      ["theirs", "yours"],
    ]);
  });
  it("counts firsts separately from picks in every bucket", () => {
    const s = summarizeAgency(
      held([{ from: ME }, { from: ME, round: 3 }, { from: other, round: 2 }]),
      away([{ round: 1 }, { round: 2 }]),
    );
    const at = (key) => s.buckets.find((b) => b.key === key);
    expect(at("setAndHold")).toMatchObject({ picks: 2, firsts: 1 });
    expect(at("setNotHold")).toMatchObject({ picks: 2, firsts: 1 });
    expect(at("holdNotSet")).toMatchObject({ picks: 1, firsts: 0 });
  });
  it("states the overlap as a fact rather than a percentage", () => {
    const s = summarizeAgency(
      held([{ from: ME }, { from: ME, round: 2 }, { from: other, round: 3 }]),
      away([{ round: 1 }]),
    );
    expect(s.denominator).toBe(
      "3 picks ride on your seasons; you hold 3. The 2 in the first row are both.",
    );
    expect(s.denominator).not.toMatch(/%/);
    expect(s.denominator).not.toMatch(EM_DASH);
  });
  it("says so when the two sets do not overlap at all", () => {
    const s = summarizeAgency(held([{ from: other }]), away([{ round: 2 }]));
    expect(s.both).toBe(0);
    expect(s.denominator).toMatch(/No pick is in both sets\./);
  });
  it("prints one pick in the singular", () => {
    const s = summarizeAgency(held([{ from: ME }]), away([]));
    expect(s.absence).toBeTruthy();
    const t = summarizeAgency(held([{ from: other }]), away([{ round: 2 }]));
    expect(t.denominator).toMatch(/^1 pick rides/);
  });
  /**
   * NEVER A ZERO-COUNT ROW. This is the case the shelved split bar failed at: a manager
   * who has sent nothing away and holds nothing of anybody else's got a full accent
   * segment and the reading "total control", which is a share computed over a set of
   * one thing. Here it is one row and a sentence naming both absences.
   */
  it("gives a manager with no away picks and nothing of anyone else's ONE row and a sentence", () => {
    const s = summarizeAgency(
      held([{ from: ME }, { from: ME, round: 2 }, { from: ME, round: 3 }]),
      [],
    );
    expect(s.buckets).toHaveLength(1);
    expect(s.buckets[0].key).toBe("setAndHold");
    expect(s.buckets[0]).toMatchObject({ picks: 3, firsts: 1 });
    expect(s.denominator).toBeNull();
    expect(s.absence).toBe(
      "Every pick still in play is one your own seasons set and you still hold. " +
        "None of your own undecided picks is anywhere else, and you hold none of " +
        "anybody else's.",
    );
    expect(s.absence).not.toMatch(EM_DASH);
    expect(s.absence).not.toMatch(/%/);
    for (const b of s.buckets) expect(b.picks).toBeGreaterThan(0);
  });
  /**
   * THE CLAIM THE SENTENCE MAY NOT MAKE. Live roster 14 reaches the one-row branch while
   * one of its own picks really is on another roster - settled, so it sits in the group
   * below rather than in row two. "Never sent one elsewhere" would be false on that
   * roster, and false two inches above the evidence (D19).
   */
  it("never claims a manager has sent nothing away when a settled pick says otherwise", () => {
    const s = summarizeAgency(
      held([{ from: ME }, { from: ME, round: 2 }]),
      away([{ round: 3, settled: true }]),
    );
    expect(s.buckets).toHaveLength(1);
    expect(s.absence).not.toMatch(/never/i);
    expect(s.absence).toMatch(/still in play/);
    expect(s.absence).toMatch(/undecided/);
  });
  it("drops an empty bucket rather than printing a zero row, in either direction", () => {
    const noAway = summarizeAgency(held([{ from: ME }, { from: other }]), []);
    expect(noAway.buckets.map((b) => b.key)).toEqual([
      "setAndHold",
      "holdNotSet",
    ]);
    const nothingOfTheirs = summarizeAgency(held([{ from: ME }]), away([{}]));
    expect(nothingOfTheirs.buckets.map((b) => b.key)).toEqual([
      "setAndHold",
      "setNotHold",
    ]);
  });
  /** The ledger is a present-tense claim, so a decided season is not in it. */
  it("counts only live picks, leaving settled ones to their own group", () => {
    const s = summarizeAgency(
      held([
        { from: ME },
        { from: ME, season: String(h.currentSeasonYear), round: 2 },
      ]),
      away([{ round: 3, settled: true }]),
    );
    expect(s.buckets).toHaveLength(1);
    expect(s.buckets[0].picks).toBe(1);
    expect(s.settled).toBe(1);
  });
  it("says every pick is settled rather than printing an empty ledger", () => {
    const s = summarizeAgency(
      held([{ from: ME, season: String(h.currentSeasonYear) }]),
      [],
    );
    expect(s.buckets).toEqual([]);
    expect(s.absence).toMatch(/already over/);
  });
  /**
   * BUCKET B'S SENTENCE. It lives on the bucket because that row has no group beneath
   * it to carry a note, and it is the one claim in this module about a pick the reader
   * does not hold.
   */
  it("gives the middle bucket a note the other two do not have", () => {
    const s = summarizeAgency(
      held([{ from: ME }, { from: other, round: 2 }]),
      away([{ round: 3 }]),
    );
    const at = (key) => s.buckets.find((b) => b.key === key);
    expect(at("setAndHold").note).toBeNull();
    expect(at("holdNotSet").note).toBeNull();
    const note = at("setNotHold").note;
    expect(note).toMatch(/somebody else holds/i);
    expect(note).toMatch(/They hold the asset; you hold the outcome\./);
    // D6 and D19 both survive the one genuinely new sentence.
    expect(note).not.toMatch(/\b(bad|mistake|wrong|should|worst)\b/i);
    expect(note).not.toMatch(/tank/i);
    expect(note).not.toMatch(EM_DASH);
  });
  it("says the middle bucket's one pick in the singular", () => {
    const s = summarizeAgency(held([{ from: other }]), away([{ round: 2 }]));
    const note = s.buckets.find((b) => b.key === "setNotHold").note;
    expect(note).toMatch(/season sets this one/);
    expect(note).not.toMatch(/these picks/);
  });
});
// ------------------------------------------------------------ grouped agency
describe("groupAgency", () => {
  const other = h.rosters.find((r) => r.rosterId !== ME).rosterId;
  const third = h.rosters.find(
    (r) => r.rosterId !== ME && r.rosterId !== other,
  ).rosterId;
  function readsFor(specs) {
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
    expect(
      groups
        .flatMap((g) => g.picks)
        .map((p) => p.key)
        .sort(),
    ).toEqual(reads.map((r) => r.key).sort());
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
    expect(g.managers.map((m) => m.rosterId).sort()).toEqual(
      [other, third].sort(),
    );
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
    expect(groups.map((g) => g.kind)).toEqual([
      "controlled",
      "passenger",
      "passenger",
    ]);
    expect(groups.slice(1).map((g) => g.posture)).toEqual([
      "rebuilding",
      "contending",
    ]);
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
    const all = ["rebuilding", "contending", "ascending", "straddling", null];
    for (const posture of all) {
      for (const from of [ME, other]) {
        for (const g of groupAgency(
          readsFor([
            { from, posture },
            { from, posture, round: 2 },
          ]),
        )) {
          expect(g.note).not.toMatch(/tank/i);
          expect(g.note).not.toMatch(/\b(bad|mistake|wrong|should|worst)\b/i);
          expect(g.note).not.toMatch(EM_DASH);
          expect(g.title).not.toMatch(EM_DASH);
        }
      }
    }
  });
  it("groups a real roster's picks into fewer rows than it has picks", () => {
    const reads = pickAgency(h, ME, {
      postures: posturesByRoster(leagueTimelines(h)),
    });
    const groups = groupAgency(reads);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.length).toBeLessThanOrEqual(reads.length);
    // Seven is the ceiling by construction: three controlled tensions plus five
    // postures can never all be live for one holder, plus the one settled group. The
    // panel must not be able to grow back into a per-pick list without this failing.
    expect(groups.length).toBeLessThanOrEqual(7);
  });
  it("returns nothing for no picks rather than an empty group", () => {
    expect(groupAgency([])).toEqual([]);
  });
});
// ------------------------------------------------- settled picks, now a group
describe("settled picks as the fourth group", () => {
  const other = h.rosters.find((r) => r.rosterId !== ME).rosterId;
  const OVER = String(h.currentSeasonYear); // ordered by a season already finished
  const LIVE = String(h.currentSeasonYear + 2);
  const slots = new Map([
    [`${OVER}|${ME}`, { slot: 9, teams: 14 }],
    [`${OVER}|${other}`, { slot: 2, teams: 14 }],
  ]);
  function read(over, inputs = { slots }) {
    return readPickAgency(
      h,
      ME,
      ownedPick({
        season: OVER,
        originalRoster: ME,
        acquired: false,
        ...over,
      }),
      inputs,
    );
  }
  it("resolves the published slot and the overall pick number", () => {
    const r = read({ round: 1 });
    expect(r.settled).toBe(true);
    expect(r).toMatchObject({ slot: 9, slotOf: 14, overall: 9 });
    // Round 2 slot 9 is the 23rd pick of a 14-team draft, which is the arithmetic the
    // panel prints and the only place it is done.
    expect(read({ round: 2 }).overall).toBe(23);
    expect(read({ round: 3 }).overall).toBe(37);
  });
  it("leaves the slot null rather than inventing one when no order is published", () => {
    const r = read({ round: 1 }, {});
    expect(r.settled).toBe(true);
    expect(r.slot).toBeNull();
    expect(r.slotOf).toBeNull();
    expect(r.overall).toBeNull();
  });
  it("never gives a live pick a slot, however complete the slot map is", () => {
    const r = readPickAgency(h, ME, ownedPick({ season: LIVE }), { slots });
    expect(r.settled).toBe(false);
    expect(r.slot).toBeNull();
    expect(r.overall).toBeNull();
  });
  it("makes them a visible group instead of dropping them", () => {
    const groups = groupAgency([
      read({ round: 1 }),
      readPickAgency(h, ME, ownedPick({ season: LIVE }), { slots }),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["controlled", "settled"]);
    const g = groups[1];
    expect(g.count).toBe(1);
    expect(g.note).toBe(
      "These slots are published. The season that ordered them is over, so " +
        "nobody's posture moves them anymore.",
    );
    expect(g.note).not.toMatch(EM_DASH);
    expect(g.posture).toBeNull();
    expect(g.managers).toEqual([]);
  });
  /**
   * SORTED BY THE BOARD, NOT BY POSTURE. Posture is a reading of a season that can still
   * move; for a settled pick it cannot, so ordering these rows by it would sort them on
   * a fact that no longer applies to them.
   */
  it("sorts by overall pick number ascending", () => {
    const [g] = groupAgency([
      read({ round: 3 }),
      read({ round: 1, originalRoster: other, acquired: true }),
      read({ round: 1 }),
      read({ round: 2, originalRoster: other, acquired: true }),
    ]);
    expect(g.picks.map((p) => p.overall)).toEqual([2, 9, 16, 37]);
  });
  it("sorts slotless picks after the ones with a published slot", () => {
    const withSlot = read({ round: 2 });
    const withNone = read({ round: 1 }, {});
    const [g] = groupAgency([withNone, withSlot]);
    expect(g.picks.map((p) => p.overall)).toEqual([23, null]);
  });
  it("keeps the counts summing to the ungrouped list once settled picks are in it", () => {
    const reads = [
      read({ round: 1 }),
      read({ round: 2 }),
      readPickAgency(h, ME, ownedPick({ season: LIVE }), { slots }),
      readPickAgency(
        h,
        ME,
        ownedPick({ season: LIVE, round: 2, originalRoster: other, acquired: true }),
        { slots, postures: postures([[other, "contending"]]) },
      ),
    ];
    const groups = groupAgency(reads);
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(reads.length);
    expect(groups.reduce((n, g) => n + g.firsts, 0)).toBe(
      reads.filter((r) => r.pick.round === 1).length,
    );
    expect(Math.round(groups.reduce((n, g) => n + g.value, 0))).toBe(
      Math.round(reads.reduce((n, r) => n + r.pick.value, 0)),
    );
  });
  it("puts settled last, after every live group", () => {
    const groups = groupAgency([
      read({ round: 1 }),
      readPickAgency(h, ME, ownedPick({ season: LIVE }), {
        postures: postures([[ME, "rebuilding"]]),
      }),
      readPickAgency(
        h,
        ME,
        ownedPick({ season: LIVE, originalRoster: other, acquired: true }),
        { postures: postures([[other, "contending"]]) },
      ),
    ]);
    expect(groups[groups.length - 1].kind).toBe("settled");
  });
});
// ---------------------------------------------------------------- buybacks
function pickRef(over) {
  return { round: 1, season: "2030", rosterId: 1, ...over };
}
function trade(id, created, picks) {
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
function withHistory(over) {
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
          trade("t1", 1000 * DAY, [
            pickRef({ previousOwnerId: 1, ownerId: 2 }),
          ]),
          trade("t2", 1030 * DAY, [
            pickRef({ previousOwnerId: 2, ownerId: 1 }),
          ]),
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
          trade("t2", 20 * DAY, [
            pickRef({ rosterId: 1, previousOwnerId: 2, ownerId: 1 }),
          ]),
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
        tradedPicks: [
          {
            season: "2030",
            round: 1,
            rosterId: 3,
            ownerId: 3,
            previousOwnerId: 9,
          },
        ],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      recorded: false,
      at: null,
      awayDays: null,
      fromRoster: 9,
    });
  });
  it("does not double-report a round trip the transaction log already explains", () => {
    const out = pickBuybacks(
      withHistory({
        transactions: [
          trade("t1", 10 * DAY, [pickRef({ previousOwnerId: 1, ownerId: 2 })]),
          trade("t2", 20 * DAY, [pickRef({ previousOwnerId: 2, ownerId: 1 })]),
        ],
        tradedPicks: [
          {
            season: "2030",
            round: 1,
            rosterId: 1,
            ownerId: 1,
            previousOwnerId: 2,
          },
        ],
        tradedPicksHistory: [
          {
            season: "2030",
            round: 1,
            rosterId: 1,
            ownerId: 1,
            previousOwnerId: 2,
          },
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
          trade("t1", 10 * DAY, [
            pickRef({ rosterId: 1, previousOwnerId: 1, ownerId: 2 }),
          ]),
          trade("t2", 20 * DAY, [
            pickRef({ rosterId: 1, previousOwnerId: 2, ownerId: 1 }),
          ]),
          trade("t3", 30 * DAY, [
            pickRef({
              rosterId: 1,
              season: "2031",
              previousOwnerId: 1,
              ownerId: 2,
            }),
          ]),
          trade("t4", 40 * DAY, [
            pickRef({
              rosterId: 1,
              season: "2031",
              previousOwnerId: 2,
              ownerId: 1,
            }),
          ]),
          trade("t5", 50 * DAY, [
            pickRef({ rosterId: 5, previousOwnerId: 5, ownerId: 2 }),
          ]),
          trade("t6", 60 * DAY, [
            pickRef({ rosterId: 5, previousOwnerId: 2, ownerId: 5 }),
          ]),
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
          trade("a1", 10 * DAY, [
            pickRef({ rosterId: 1, previousOwnerId: 1, ownerId: 2 }),
          ]),
          trade("a2", 20 * DAY, [
            pickRef({ rosterId: 1, previousOwnerId: 2, ownerId: 1 }),
          ]),
          // Out, on once more, then home: three recorded hops.
          trade("b1", 100 * DAY, [
            pickRef({ rosterId: 5, previousOwnerId: 5, ownerId: 2 }),
          ]),
          trade("b2", 140 * DAY, [
            pickRef({ rosterId: 5, previousOwnerId: 2, ownerId: 3 }),
          ]),
          trade("b3", 172 * DAY, [
            pickRef({ rosterId: 5, previousOwnerId: 3, ownerId: 5 }),
          ]),
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
          trade("t1", 10 * DAY, [
            pickRef({ rosterId: 1, previousOwnerId: 1, ownerId: 2 }),
          ]),
          trade("t2", 15 * DAY, [
            pickRef({ rosterId: 1, previousOwnerId: 2, ownerId: 1 }),
          ]),
        ],
        tradedPicks: [
          {
            season: "2030",
            round: 2,
            rosterId: 3,
            ownerId: 3,
            previousOwnerId: 9,
          },
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
          trade("c1", 10 * DAY, [
            pickRef({ rosterId: 1, previousOwnerId: 1, ownerId: 2 }),
          ]),
          trade("c2", 40 * DAY, [
            pickRef({ rosterId: 1, previousOwnerId: 2, ownerId: 1 }),
          ]),
          // The same pick goes again, and comes home again. (buyback 2)
          trade("c3", 60 * DAY, [
            pickRef({ rosterId: 1, previousOwnerId: 1, ownerId: 4 }),
          ]),
          trade("c4", 70 * DAY, [
            pickRef({ rosterId: 1, previousOwnerId: 4, ownerId: 1 }),
          ]),
          // Roster 5's 2031 1st: out, on to a third party, then home. (buyback 3)
          trade("c5", 5 * DAY, [
            pickRef({
              rosterId: 5,
              season: "2031",
              previousOwnerId: 5,
              ownerId: 2,
            }),
          ]),
          trade("c6", 50 * DAY, [
            pickRef({
              rosterId: 5,
              season: "2031",
              previousOwnerId: 2,
              ownerId: 3,
            }),
          ]),
          trade("c7", 205 * DAY, [
            pickRef({
              rosterId: 5,
              season: "2031",
              previousOwnerId: 3,
              ownerId: 5,
            }),
          ]),
          // Roster 4's 2032 2nd leaves and never returns. Not a round trip.
          trade("c8", 80 * DAY, [
            pickRef({
              rosterId: 4,
              season: "2032",
              round: 2,
              previousOwnerId: 4,
              ownerId: 1,
            }),
          ]),
        ],
        // Roster 3 holds its own 2033 1st having got it from roster 9, with no
        // transaction explaining it. (buyback 4, undated)
        tradedPicksHistory: [
          {
            season: "2033",
            round: 1,
            rosterId: 3,
            ownerId: 3,
            previousOwnerId: 9,
          },
        ],
      }),
    );
    expect(v.total).toBe(4);
    expect(v.recorded).toBe(3);
    expect(v.unrecorded).toBe(1);
    // Busiest first; the two ties below break on name, not on roster id.
    expect(v.byManager[0]).toMatchObject({
      rosterId: 1,
      count: 2,
      recorded: 2,
    });
    expect(v.byManager.map((m) => m.rosterId).sort()).toEqual([1, 3, 5]);
    expect(v.byManager.slice(1).map((m) => m.rosterName)).toEqual(
      [...v.byManager.slice(1)]
        .sort((a, b) => a.rosterName.localeCompare(b.rosterName))
        .map((m) => m.rosterName),
    );
    expect(v.byManager.find((m) => m.rosterId === 3)).toMatchObject({
      count: 1,
      recorded: 0,
    });
    expect(v.byManager.find((m) => m.rosterId === 5)).toMatchObject({
      count: 1,
      recorded: 1,
    });
    expect(v.all.map((b) => b.awayDays)).toEqual([30, 10, 200, null]);
    // Only the three-hop one, and it is not the one with the most elapsed calendar.
    expect(v.multiHop.map((b) => b.rosterId)).toEqual([5]);
    expect(v.multiHop[0].recordedHops).toBe(3);
    expect(v.longestAway).toMatchObject({ rosterId: 5, awayDays: 200 });
    expect(v.rostersWithNone).toBe(h.rosters.length - 3);
  });
  it("reports an empty league honestly rather than with a null-shaped hole", () => {
    const v = leagueBuybacks(withHistory({}));
    expect(v).toMatchObject({
      total: 0,
      recorded: 0,
      unrecorded: 0,
      longestAway: null,
    });
    expect(v.byManager).toEqual([]);
    expect(v.multiHop).toEqual([]);
    expect(v.rostersWithNone).toBe(h.rosters.length);
  });
});
// ------------------------------------------------------- draft order fidelity
function rosterWith(rosterId, wins) {
  const base = h.rosters[0];
  return {
    ...base,
    rosterId,
    settings: {
      ...base.settings,
      wins,
      losses: 20 - wins,
      ties: 0,
      fpts: wins * 100,
    },
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
      new Map([
        ["2030", { slotToRosterId: { 1: 1, 2: 3, 3: 2, 4: 4 }, rounds: 3 }],
      ]),
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
      new Map([
        ["2030", { slotToRosterId: { 1: 4, 2: 3, 3: 2, 4: 1 }, rounds: 3 }],
      ]),
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
      new Map([
        ["2030", { slotToRosterId: { 1: 4, 2: 3, 3: 2, 4: 1 }, rounds: 3 }],
      ]),
      new Map([["2029", unplayed]]),
    );
    expect(f.seasons).toHaveLength(0);
    expect(f.followsReverseStandings).toBe(false);
    expect(f.note).toMatch(/nothing here assumes one/);
  });
  /**
   * THE PANEL LINE. The long note moved to /methodology beside the pricing model it
   * qualifies; one line stays on /roster, and it must say which of the two things is
   * actually true of this league rather than hedging across both.
   */
  it("phrases the panel line for a league whose order is loose", () => {
    const rosters = [1, 2, 3, 4].map((id) => rosterWith(id, 20 - id * 4));
    const f = draftOrderFidelity(
      h,
      new Map([
        ["2030", { slotToRosterId: { 1: 1, 2: 3, 3: 2, 4: 4 }, rounds: 3 }],
      ]),
      new Map([["2029", rosters]]),
    );
    expect(f.panelLine).toMatch(/follows reverse standings loosely, not exactly/);
    expect(f.panelLine).toMatch(/differed in 1 of 1 drafts on record/);
    expect(f.panelLine).not.toMatch(/matched reverse standings exactly/);
    expect(f.panelLine).not.toMatch(EM_DASH);
  });
  it("phrases the panel line for a league whose order is exact", () => {
    const rosters = [1, 2, 3, 4].map((id) => rosterWith(id, 20 - id * 4));
    const f = draftOrderFidelity(
      h,
      new Map([
        ["2030", { slotToRosterId: { 1: 4, 2: 3, 3: 2, 4: 1 }, rounds: 3 }],
      ]),
      new Map([["2029", rosters]]),
    );
    expect(f.panelLine).toMatch(
      /matched reverse standings exactly in all 1 drafts on record/,
    );
    expect(f.panelLine).not.toMatch(/loosely/);
    expect(f.panelLine).not.toMatch(EM_DASH);
  });
  /** No source-file path may travel back into user-facing prose. */
  it("keeps a source-file reference out of both strings", () => {
    const rosters = [1, 2, 3, 4].map((id) => rosterWith(id, 20 - id * 4));
    const f = draftOrderFidelity(
      h,
      new Map([
        ["2030", { slotToRosterId: { 1: 1, 2: 3, 3: 2, 4: 4 }, rounds: 3 }],
      ]),
      new Map([["2029", rosters]]),
    );
    for (const s of [f.note, f.panelLine]) {
      expect(s).not.toMatch(/lib\//);
      expect(s).not.toMatch(/slotDistribution/);
      expect(s).not.toMatch(/\.js\b/);
    }
  });
});
// -------------------------------------------- the buyback rate's denominator
describe("pickDepartures", () => {
  it("counts a pick that left home from the transaction log", () => {
    const d = pickDepartures(
      withHistory({
        transactions: [
          trade("t1", 10 * DAY, [pickRef({ previousOwnerId: 1, ownerId: 2 })]),
        ],
      }),
    );
    expect(d.size).toBe(1);
    expect([...d.values()]).toEqual([1]);
  });
  /** A hop between two other rosters is not a departure from home. */
  it("does not count a hop that did not start at the original roster", () => {
    const d = pickDepartures(
      withHistory({
        transactions: [
          trade("t1", 10 * DAY, [pickRef({ previousOwnerId: 2, ownerId: 3 })]),
        ],
      }),
    );
    expect(d.size).toBe(0);
  });
  it("counts one departure per pick however many times it moved", () => {
    const d = pickDepartures(
      withHistory({
        transactions: [
          trade("t1", 10 * DAY, [pickRef({ previousOwnerId: 1, ownerId: 2 })]),
          trade("t2", 20 * DAY, [pickRef({ previousOwnerId: 2, ownerId: 1 })]),
          trade("t3", 30 * DAY, [pickRef({ previousOwnerId: 1, ownerId: 4 })]),
        ],
      }),
    );
    expect(d.size).toBe(1);
  });
  /**
   * THE CORRECTNESS CONSTRAINT. `pickBuybacks` counts snapshot-only round trips, so a
   * denominator that counted only recorded departures would miss the same class of move
   * on the bottom of the fraction while keeping it on the top. That is not noise: it
   * biases the rate up, every time.
   */
  it("counts a snapshot-only departure, matching the numerator's scope", () => {
    const snapshotOnly = {
      season: "2030",
      round: 1,
      rosterId: 7,
      ownerId: 9,
      previousOwnerId: 7,
    };
    const d = pickDepartures(withHistory({ tradedPicks: [snapshotOnly] }));
    expect(d.size).toBe(1);
    expect([...d.values()]).toEqual([7]);
  });
  it("counts a snapshot round trip's departure even though no trade recorded it", () => {
    // Home now, and it was somewhere else: the departure is a fact even undated.
    const d = pickDepartures(
      withHistory({
        tradedPicks: [
          {
            season: "2030",
            round: 1,
            rosterId: 3,
            ownerId: 3,
            previousOwnerId: 9,
          },
        ],
      }),
    );
    expect(d.size).toBe(1);
  });
  it("never counts a pick twice across the two snapshots and the log", () => {
    const row = {
      season: "2030",
      round: 1,
      rosterId: 1,
      ownerId: 1,
      previousOwnerId: 2,
    };
    const d = pickDepartures(
      withHistory({
        transactions: [
          trade("t1", 10 * DAY, [pickRef({ previousOwnerId: 1, ownerId: 2 })]),
          trade("t2", 20 * DAY, [pickRef({ previousOwnerId: 2, ownerId: 1 })]),
        ],
        tradedPicks: [row],
        tradedPicksHistory: [row],
      }),
    );
    expect(d.size).toBe(1);
  });
  it("runs over the whole fixture corpus and never counts fewer departures than returns", () => {
    const d = pickDepartures(h);
    const returned = new Set(
      pickBuybacks(h).map((b) => `${b.season}|${b.round}|${b.rosterId}`),
    );
    expect(d.size).toBeGreaterThanOrEqual(returned.size);
    // Every pick that came home must have left, or the rate is over the wrong set.
    for (const key of returned) expect(d.has(key)).toBe(true);
  });
});
describe("leagueBuybacks with a denominator", () => {
  it("reports the rate over distinct picks, not over round trips", () => {
    // The same pick home twice: two round trips, one pick, one departure counted for
    // the rate. Without this the rate could read 2 of 1.
    const v = leagueBuybacks(
      withHistory({
        transactions: [
          trade("t1", 10 * DAY, [pickRef({ previousOwnerId: 1, ownerId: 2 })]),
          trade("t2", 20 * DAY, [pickRef({ previousOwnerId: 2, ownerId: 1 })]),
          trade("t3", 30 * DAY, [pickRef({ previousOwnerId: 1, ownerId: 4 })]),
          trade("t4", 55 * DAY, [pickRef({ previousOwnerId: 4, ownerId: 1 })]),
        ],
      }),
    );
    expect(v.total).toBe(2);
    expect(v.returnedPicks).toBe(1);
    expect(v.departedPicks).toBe(1);
    expect(v.returnedPicks).toBeLessThanOrEqual(v.departedPicks);
  });
  it("gives each manager their own numerator and denominator", () => {
    const v = leagueBuybacks(
      withHistory({
        transactions: [
          // Roster 1: two of its own out, one back.
          trade("t1", 10 * DAY, [pickRef({ previousOwnerId: 1, ownerId: 2 })]),
          trade("t2", 20 * DAY, [pickRef({ previousOwnerId: 2, ownerId: 1 })]),
          trade("t3", 30 * DAY, [
            pickRef({ season: "2031", previousOwnerId: 1, ownerId: 2 }),
          ]),
          // Roster 5: one out, one back.
          trade("t4", 40 * DAY, [
            pickRef({ rosterId: 5, previousOwnerId: 5, ownerId: 2 }),
          ]),
          trade("t5", 50 * DAY, [
            pickRef({ rosterId: 5, previousOwnerId: 2, ownerId: 5 }),
          ]),
        ],
      }),
    );
    const one = v.byManager.find((m) => m.rosterId === 1);
    const five = v.byManager.find((m) => m.rosterId === 5);
    expect(one).toMatchObject({ returned: 1, departed: 2 });
    expect(five).toMatchObject({ returned: 1, departed: 1 });
  });
  it("keeps the league denominator at least as large as the numerator on the corpus", () => {
    const v = leagueBuybacks(h);
    expect(v.departedPicks).toBeGreaterThanOrEqual(v.returnedPicks);
    expect(v.returnedPicks).toBeGreaterThan(0);
    for (const m of v.byManager) {
      expect(m.departed).toBeGreaterThanOrEqual(m.returned);
      expect(m.returned).toBeGreaterThan(0);
    }
  });
});
