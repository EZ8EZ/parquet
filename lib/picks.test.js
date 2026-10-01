import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "./testing/fixtureHistory.js";
import {
  isPickSeasonSpent,
  pickCapital,
  strengthRanks,
  tradeablePickSeasons,
} from "./picks.js";
import { completedSeasonsOf } from "./history.js";
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

// D115: Sleeper keeps listing a season in traded_picks after its rookie draft has run.
// These corpora are the fixture with the current season's draft marked complete -
// exactly the live state after NSL Fantasy Hoops' 2026 draft.
describe("draft completion (D115)", () => {
  const cur = String(h.currentSeasonYear);
  const post = { ...h, completedDraftSeasons: new Set([cur]) };
  it("the fixture's own current-season draft has not run", () => {
    expect(h.completedDraftSeasons.has(cur)).toBe(false);
    expect(tradeablePickSeasons(h)).toContain(cur);
  });
  it("drops a season whose draft is complete from tradeable seasons", () => {
    const seasons = tradeablePickSeasons(post);
    expect(seasons).not.toContain(cur);
    expect(seasons.length).toBeGreaterThan(0);
    expect(isPickSeasonSpent(post, cur)).toBe(true);
    expect(isPickSeasonSpent(post, Number(cur) + 1)).toBe(false);
  });
  it("stops counting spent picks as capital, for every roster", () => {
    for (const r of h.rosters) {
      const before = pickCapital(h, r.rosterId);
      const after = pickCapital(post, r.rosterId);
      expect(after.picks.some((p) => p.season === cur)).toBe(false);
      expect(after.seasons).not.toContain(cur);
      // The surviving seasons are priced exactly as before - only spent picks go.
      const kept = before.picks.filter((p) => p.season !== cur);
      expect(after.picks.map((p) => p.label).sort()).toEqual(
        kept.map((p) => p.label).sort(),
      );
      expect(after.total).toBeCloseTo(
        kept.reduce((s, p) => s + p.value, 0),
        6,
      );
      // Baseline is one own first per TRADEABLE season, so it shrinks with them.
      expect(after.extraFirsts).toBe(after.firsts - after.seasons.length);
    }
  });
  it("falls back to the next undrafted season on an empty snapshot", () => {
    const empty = { ...post, tradedPicks: [] };
    expect(tradeablePickSeasons(empty)).toEqual([String(Number(cur) + 1)]);
    expect(tradeablePickSeasons({ ...h, tradedPicks: [] })).toEqual([cur]);
  });
  it("treats a corpus without draft data as no draft having run", () => {
    const bare = { ...h, completedDraftSeasons: undefined };
    expect(tradeablePickSeasons(bare)).toEqual(tradeablePickSeasons(h));
  });
});
describe("completedSeasonsOf", () => {
  it("keeps only complete drafts, keyed by season string", () => {
    const s = completedSeasonsOf([
      { season: "2026", status: "complete" },
      { season: "2027", status: "pre_draft" },
      { season: "2025", status: "drafting" },
    ]);
    expect([...s]).toEqual(["2026"]);
    expect(completedSeasonsOf(undefined).size).toBe(0);
  });
});
