import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import { MANAGERS } from "../providers/fixture/data";
import { AWARD_GROUPS, awardsSummary, computeAwards, type Award } from "./index";

const rosterFor = (archetype: string) =>
  MANAGERS.findIndex((m) => m.archetype === archetype) + 1;

const byId = (awards: Award[], id: string) => awards.find((a) => a.id === id);

const h = buildFixtureHistory();
const awards = await computeAwards(h);

describe("league awards", () => {

  it("produces a healthy slate of well-formed awards", () => {
    expect(awards.length).toBeGreaterThanOrEqual(10);
    for (const a of awards) {
      expect(a.id).toBeTruthy();
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.subtitle.length).toBeGreaterThan(0);
      expect(a.statLine.length).toBeGreaterThan(0);
      expect(a.winner.rosterId).toBeGreaterThan(0);
      expect(a.winner.displayName.length).toBeGreaterThan(0);
      expect(a.winner.label.length).toBeGreaterThan(0);
      expect(a.runnersUp.length).toBeGreaterThan(0);
      expect(a.runnersUp.length).toBeLessThanOrEqual(3);
      expect(AWARD_GROUPS.map((g) => g.id)).toContain(a.group);
    }
  });

  it("has unique award ids and never repeats the winner as a runner-up", () => {
    expect(new Set(awards.map((a) => a.id)).size).toBe(awards.length);
    for (const a of awards) {
      for (const r of a.runnersUp) {
        expect(r.rosterId === a.winner.rosterId && r.stat === a.winner.stat).toBe(
          false,
        );
      }
    }
  });

  it("only names managers that exist in the league", () => {
    const ids = new Set(h.rosters.map((r) => r.rosterId));
    for (const a of awards) {
      expect(ids.has(a.winner.rosterId)).toBe(true);
      if (a.winner.partnerRosterId != null) {
        expect(ids.has(a.winner.partnerRosterId)).toBe(true);
      }
      for (const r of a.runnersUp) expect(ids.has(r.rosterId)).toBe(true);
    }
  });

  it("is deterministic across repeated calls", async () => {
    const again = await computeAwards(buildFixtureHistory());
    expect(JSON.stringify(await computeAwards(h))).toBe(JSON.stringify(awards));
    expect(JSON.stringify(again)).toBe(JSON.stringify(awards));
  });

  it("ranks runners-up no better than the winner", () => {
    for (const a of awards) {
      for (const r of a.runnersUp) {
        expect(r.value).toBeLessThanOrEqual(a.winner.value);
      }
    }
  });

  // ---- archetype expectations ----

  it("gives the wheeler-dealer to a churner", () => {
    const a = byId(awards, "most-trades")!;
    expect(a).toBeDefined();
    expect(MANAGERS[a.winner.rosterId - 1].archetype).toBe("churner");
    expect(a.statLine).toMatch(/trades ·/);
  });

  it("gives the ghost award to a ghost, breaking the tie to the lower rosterId", () => {
    const a = byId(awards, "fewest-trades")!;
    expect(MANAGERS[a.winner.rosterId - 1].archetype).toBe("ghost");
    expect(a.winner.rosterId).toBe(rosterFor("ghost"));
    expect(a.winner.value).toBe(0); // -0 trades
  });

  it("gives pick hoarder to a hoarder with a positive net", () => {
    const a = byId(awards, "pick-hoarder")!;
    expect(MANAGERS[a.winner.rosterId - 1].archetype).toBe("hoarder");
    expect(a.winner.value).toBeGreaterThan(0);
  });

  it("gives the mortgage broker to someone actually net-negative on picks", () => {
    const a = byId(awards, "pick-spender")!;
    expect(a.winner.value).toBeGreaterThan(0); // score is the negated net
    expect(a.statLine).toMatch(/^-\d+ net picks/);
  });

  it("gives panic button to a panic archetype trading after losses", () => {
    const a = byId(awards, "panic-button")!;
    expect(MANAGERS[a.winner.rosterId - 1].archetype).toBe("panic");
    expect(a.winner.value).toBeGreaterThan(0.5);
    expect(a.statLine).toMatch(/% post-loss/);
  });

  it("gives waiver churn to the streamer", () => {
    const a = byId(awards, "waiver-churn")!;
    expect(MANAGERS[a.winner.rosterId - 1].archetype).toBe("streamer");
  });

  it("hands out both a longest and a shortest holding award to different managers", () => {
    const slow = byId(awards, "longest-hold")!;
    const fast = byId(awards, "shortest-hold")!;
    expect(slow.winner.rosterId).not.toBe(fast.winner.rosterId);
    expect(slow.winner.value).toBeGreaterThan(-fast.winner.value);
  });

  it("hands out a youngest and an oldest acquirer award", () => {
    const young = byId(awards, "youth-acquirer")!;
    const old = byId(awards, "veteran-acquirer")!;
    expect(young.winner.rosterId).not.toBe(old.winner.rosterId);
    // young's score is the negated average age, old's is the raw average age.
    expect(-young.winner.value).toBeLessThan(old.winner.value);
  });

  it("awards a two-team pairing with a partner link", () => {
    const a = byId(awards, "trade-pairing")!;
    expect(a.winner.partnerRosterId).toBeGreaterThan(0);
    expect(a.winner.partnerRosterId).not.toBe(a.winner.rosterId);
    expect(a.winner.rosterId).toBeLessThan(a.winner.partnerRosterId!);
    expect(a.winner.label).toContain("+");
    expect(a.winner.value).toBeGreaterThanOrEqual(2);
  });

  it("awards a FAAB spender with a real average bid", () => {
    const a = byId(awards, "faab-spender")!;
    expect(a.winner.value).toBeGreaterThan(0);
  });

  it("names an initiator and a responder, and they are not the same manager", () => {
    const init = byId(awards, "initiator")!;
    const resp = byId(awards, "responder")!;
    expect(init.winner.rosterId).not.toBe(resp.winner.rosterId);
    expect(init.winner.value).toBeGreaterThan(0.5);
    expect(resp.winner.value).toBeGreaterThan(0.5);
  });

  it("omits awards with no signal behind them", () => {
    // No fixture trade lands in a deadline week with picks moving out, so the
    // deadline award must be omitted rather than crowning a zero.
    expect(byId(awards, "deadline-buyer")).toBeUndefined();
  });

  it("summarises the corpus", () => {
    const s = awardsSummary(h);
    expect(s.seasons).toBe(h.chain.length);
    expect(s.managers).toBe(h.rosters.length);
    expect(s.trades).toBeGreaterThan(0);
    expect(s.moves).toBe(h.transactions.length);
  });
});

describe("league awards on an empty corpus", () => {
  it("never crashes and never crowns a fake winner", async () => {
    const h = buildFixtureHistory();
    const empty = { ...h, transactions: [], matchups: [] };
    const awards = await computeAwards(empty);
    for (const a of awards) {
      expect(a.winner.rosterId).toBeGreaterThan(0);
      expect(a.statLine.length).toBeGreaterThan(0);
    }
    // With zero transactions, volume-based awards have nothing to award.
    expect(byId(awards, "most-trades")).toBeUndefined();
    expect(byId(awards, "waiver-churn")).toBeUndefined();
    expect(byId(awards, "trade-pairing")).toBeUndefined();
    expect(awardsSummary(empty).trades).toBe(0);
  });

  it("handles a league with no rosters at all", async () => {
    const h = buildFixtureHistory();
    const bare = { ...h, rosters: [], rostersById: new Map() };
    expect(await computeAwards(bare)).toEqual([]);
  });
});
