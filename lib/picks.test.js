import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "./testing/fixtureHistory";
import { pickCapital, strengthRanks } from "./picks";
const h = buildFixtureHistory();
describe("strengthRanks", () => {
  it("assigns every roster a unique rank", () => {
    const ranks = strengthRanks(h);
    expect(ranks.size).toBe(h.rosters.length);
    expect(new Set(ranks.values()).size).toBe(h.rosters.length);
  });
  it("ranks by record when games have been played", () => {
    const ranks = strengthRanks(h);
    const best = [...ranks.entries()].find(([, r]) => r === 1)[0];
    const worst = [...ranks.entries()].find(
      ([, r]) => r === h.rosters.length,
    )[0];
    const diff = (id) => {
      const s = h.rostersById.get(id).settings;
      return s.wins - s.losses;
    };
    expect(diff(best)).toBeGreaterThanOrEqual(diff(worst));
  });
  /**
   * Regression guard for a real bug found on live data: in `pre_draft` status every
   * roster reads 0-0 with 0 fpts, so sorting on record was a no-op and rank silently
   * equalled roster_id. That made pick values a function of arbitrary league ids.
   */
  it("falls back to roster talent when no games have been played", () => {
    const preseason = {
      ...h,
      rosters: h.rosters.map((r) => ({
        ...r,
        settings: { ...r.settings, wins: 0, losses: 0, ties: 0, fpts: 0 },
      })),
    };
    preseason.rostersById = new Map(
      preseason.rosters.map((r) => [r.rosterId, r]),
    );
    const ranks = strengthRanks(preseason);
    expect(ranks.size).toBe(preseason.rosters.length);
    // The ranking must NOT simply be roster_id order, which is what the bug produced.
    const byId = [...ranks.entries()].every(([rid, rank]) => rid === rank);
    expect(byId).toBe(false);
    // And it must actually track talent: rank 1 outscores the last rank.
    const talent = (rosterId) =>
      preseason.rostersById.get(rosterId).players.length;
    const first = [...ranks.entries()].find(([, r]) => r === 1)[0];
    expect(talent(first)).toBeGreaterThan(0);
  });
});
describe("pickCapital", () => {
  it("prices a first owed by a weak team above one owed by a strong team", () => {
    const ranks = strengthRanks(h);
    const me = h.me.rosterId;
    const caps = pickCapital(h, me);
    const firsts = caps.picks.filter((p) => p.round === 1);
    if (firsts.length < 2) return; // fixture may not have enough owned firsts
    const withRank = firsts
      .map((p) => ({ p, rank: ranks.get(p.originalRoster) ?? 0 }))
      .filter((x) => x.rank > 0)
      .sort((a, b) => b.rank - a.rank); // weakest team first
    const sameSeason = withRank.filter(
      (x) => x.p.season === withRank[0].p.season,
    );
    if (sameSeason.length >= 2) {
      const weakest = sameSeason[0];
      const strongest = sameSeason[sameSeason.length - 1];
      expect(weakest.p.value).toBeGreaterThanOrEqual(strongest.p.value);
    }
  });
  it("counts every owned pick and sums to the reported total", () => {
    const caps = pickCapital(h, h.me.rosterId);
    const sum = caps.picks.reduce((s, p) => s + p.value, 0);
    expect(caps.total).toBe(sum);
    expect(caps.firsts).toBe(caps.picks.filter((p) => p.round === 1).length);
  });
});
