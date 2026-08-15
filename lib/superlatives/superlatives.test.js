import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import { MANAGERS } from "../providers/fixture/data";
import { deriveManagerProfile } from "../derive/manager";
import { draftCaptureProfiles } from "../metrics/skill";
import { getPrincipals, tenureSeasons } from "../principals";
import { AWARD_GROUPS, awardsSummary, computeAwards } from "./index";
const rosterFor = (archetype) =>
  MANAGERS.findIndex((m) => m.archetype === archetype) + 1;
const byId = (awards, id) => awards.find((a) => a.id === id);
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
        expect(
          r.rosterId === a.winner.rosterId && r.stat === a.winner.stat,
        ).toBe(false);
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
    const a = byId(awards, "most-trades");
    expect(a).toBeDefined();
    expect(MANAGERS[a.winner.rosterId - 1].archetype).toBe("churner");
    expect(a.statLine).toMatch(/trades ·/);
  });
  it("gives the ghost award to a ghost, breaking the tie to the lower rosterId", () => {
    const a = byId(awards, "fewest-trades");
    expect(MANAGERS[a.winner.rosterId - 1].archetype).toBe("ghost");
    expect(a.winner.rosterId).toBe(rosterFor("ghost"));
    expect(a.winner.value).toBe(0); // -0 trades
  });
  it("gives pick hoarder to a hoarder with a positive net", () => {
    const a = byId(awards, "pick-hoarder");
    expect(MANAGERS[a.winner.rosterId - 1].archetype).toBe("hoarder");
    expect(a.winner.value).toBeGreaterThan(0);
  });
  it("gives the mortgage broker to someone actually net-negative on picks", () => {
    const a = byId(awards, "pick-spender");
    expect(a.winner.value).toBeGreaterThan(0); // score is the negated net
    expect(a.statLine).toMatch(/^-\d+ net picks/);
  });
  it("gives panic button to a panic archetype trading after losses", () => {
    const a = byId(awards, "panic-button");
    expect(MANAGERS[a.winner.rosterId - 1].archetype).toBe("panic");
    expect(a.winner.value).toBeGreaterThan(0.5);
    expect(a.statLine).toMatch(/% post-loss/);
  });
  it("gives waiver churn to the streamer", () => {
    const a = byId(awards, "waiver-churn");
    expect(MANAGERS[a.winner.rosterId - 1].archetype).toBe("streamer");
  });
  it("hands out both a longest and a shortest holding award to different managers", () => {
    const slow = byId(awards, "longest-hold");
    const fast = byId(awards, "shortest-hold");
    expect(slow.winner.rosterId).not.toBe(fast.winner.rosterId);
    expect(slow.winner.value).toBeGreaterThan(-fast.winner.value);
  });
  it("hands out a youngest and an oldest acquirer award", () => {
    const young = byId(awards, "youth-acquirer");
    const old = byId(awards, "veteran-acquirer");
    expect(young.winner.rosterId).not.toBe(old.winner.rosterId);
    // young's score is the negated average age, old's is the raw average age.
    expect(-young.winner.value).toBeLessThan(old.winner.value);
  });
  it("awards a two-team pairing with a partner link", () => {
    const a = byId(awards, "trade-pairing");
    expect(a.winner.partnerRosterId).toBeGreaterThan(0);
    expect(a.winner.partnerRosterId).not.toBe(a.winner.rosterId);
    expect(a.winner.rosterId).toBeLessThan(a.winner.partnerRosterId);
    expect(a.winner.label).toContain("+");
    expect(a.winner.value).toBeGreaterThanOrEqual(2);
  });
  it("awards a FAAB spender with a real average bid", () => {
    const a = byId(awards, "faab-spender");
    expect(a.winner.value).toBeGreaterThan(0);
  });
  it("names an initiator and a responder, and they are not the same manager", () => {
    const init = byId(awards, "initiator");
    const resp = byId(awards, "responder");
    // KEYED BY OWNER, NOT ROSTER: the fixture's roster 9 succession means a departed
    // principal and their successor share a rosterId (the departed manager's
    // `lastRosterId` is the same seat as the successor's `currentRosterId`), so
    // comparing `rosterId` alone can no longer tell two different managers apart.
    // Comparing `ownerId` is the only identity check D22 sanctions.
    expect(init.winner.ownerId).not.toBe(resp.winner.ownerId);
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
/**
 * REGRESSION: /awards crowned a partnership with ZERO real deals in it, and a
 * separate "busiest pairing" headline blended two different people's trade counts
 * into one number. Both trace to the same seat-keyed lookup this session's D22 fixed:
 * `TradePartner` used to be counted by roster id, so every deal a departed manager
 * ever made was folded into whoever holds that seat NOW.
 *
 * Roster 9 is the fixture's real succession: "BigTrades" (u9, 2022-2024) traded with
 * "yagevlevi" (u2) 5 times and with "WaiverWade" (u7) once; "kdewitt4" (u15,
 * 2025-2026, the successor) traded with yagevlevi 3 times and has NEVER dealt with
 * WaiverWade at all. A seat-keyed read of "roster 9's trade partners" cannot tell
 * these apart - it would report roster 9 as having 8 deals with yagevlevi (5+3,
 * blended) and at least one with WaiverWade attributed to whoever is asking, even
 * though kdewitt4 personally has zero.
 */
describe("trade partners are keyed by principal, not by seat, across a real succession", () => {
  const h = buildFixtureHistory();
  it("the successor's own trade partners never include a manager who only ever dealt with their predecessor", async () => {
    const principals = await getPrincipals(h);
    const successor = principals.principals.find((p) => p.ownerId === "u15");
    const scoped = deriveManagerProfile(
      h,
      9,
      {
        ownerId: successor.ownerId,
        displayName: successor.displayName,
        teamName: successor.teamName,
        seasons: tenureSeasons(successor, 9),
      },
      principals,
    );
    // WaiverWade (u7) has zero real deals with kdewitt4 - all of that relationship is
    // the predecessor's. A principal-scoped read must not manufacture one.
    expect(scoped.tradePartners.some((p) => p.ownerId === "u7")).toBe(false);
    // yagevlevi is a real, distinct 3-deal relationship - not the blended 8.
    const yagevlevi = scoped.tradePartners.find((p) => p.ownerId === "u2");
    expect(yagevlevi?.count).toBe(3);
  });
  it("an unscoped read of the same seat DOES blend both eras - proving the fixture can reproduce the bug", async () => {
    const principals = await getPrincipals(h);
    // No scope at all: the exact seat-keyed shape every reader used before D22.
    const unscoped = deriveManagerProfile(h, 9, undefined, principals);
    expect(unscoped.trades).toBe(33); // 18 (BigTrades) + 15 (kdewitt4), blended
    const yagevlevi = unscoped.tradePartners.find((p) => p.ownerId === "u2");
    expect(yagevlevi?.count).toBe(8); // 5 + 3 - the exact "zero deals"-adjacent bug
    // WaiverWade DOES show up once the two eras are blended - this is what
    // manufactures a relationship kdewitt4 never actually had.
    expect(unscoped.tradePartners.some((p) => p.ownerId === "u7")).toBe(true);
  });
  it("the departed predecessor keeps their own 5-deal yagevlevi relationship, untouched by the handover", async () => {
    const principals = await getPrincipals(h);
    const predecessor = principals.principals.find((p) => p.ownerId === "u9");
    const scoped = deriveManagerProfile(
      h,
      9,
      {
        ownerId: predecessor.ownerId,
        displayName: predecessor.displayName,
        teamName: predecessor.teamName,
        seasons: tenureSeasons(predecessor, 9),
      },
      principals,
    );
    expect(scoped.tradePartners.find((p) => p.ownerId === "u2")?.count).toBe(5);
    expect(scoped.tradePartners.some((p) => p.ownerId === "u7")).toBe(true);
  });
  it("the league-wide 'Best Friends Forever' pairing never reports roster 9's blended total", async () => {
    // Whatever pairing wins or places, none of it may credit a 9-vs-someone
    // relationship with 8 trades (5+3 blended) - only the real, era-scoped counts.
    const awards = await computeAwards(h);
    const pairing = byId(awards, "trade-pairing");
    expect(pairing).toBeDefined();
    const entries = [pairing.winner, ...pairing.runnersUp];
    const roster9Pairs = entries.filter(
      (e) => e.rosterId === 9 || e.partnerRosterId === 9,
    );
    for (const e of roster9Pairs) {
      expect(e.value).not.toBe(8);
    }
  });
});
/**
 * REGRESSION: draft picks credited to the successor. `draftCaptureProfiles` resolves
 * each made pick to `ownerAt(season, rosterId)`, not to whoever holds the seat today
 * - roster 9's 2023-2024 rookie picks belong to "BigTrades" (u9), and its 2025 pick
 * belongs to "kdewitt4" (u15), even though both eras drafted from the same slot.
 */
describe("draft capture is credited to whoever actually made the pick, across a real succession", () => {
  const h = buildFixtureHistory();
  it("splits roster 9's draft picks across the two principals by season, not by seat", async () => {
    const principals = await getPrincipals(h);
    const capture = await draftCaptureProfiles(h, principals);
    const predecessor = capture.get("u9");
    expect(predecessor).toBeDefined();
    expect(predecessor.seasons).toEqual(["2023", "2024"]);
    expect(predecessor.picks).toBe(6); // 3 rounds x 2 draft seasons
    const successor = capture.get("u15");
    expect(successor).toBeDefined();
    expect(successor.seasons).toEqual(["2025"]);
    expect(successor.picks).toBe(3); // 3 rounds x 1 draft season (2026 is pre_draft)
    // Neither principal's graded picks leak into the other's season list - the
    // seat-keyed bug would put all nine of roster 9's rookie-draft picks on whoever
    // holds the seat today (kdewitt4), rather than splitting 6/3 by who actually made
    // each one.
    expect(predecessor.picks + successor.picks).toBe(9);
    expect(successor.picks).not.toBe(9);
  });
});
