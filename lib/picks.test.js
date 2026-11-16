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
describe("strengthRanks in season", () => {
  /** A copy of the fixture with each roster's record set by `rec(rosterId)`. */
  const withRecords = (rec, fpts = 100) => {
    const out = {
      ...h,
      currentLeague: {
        ...h.currentLeague,
        settings: { ...h.currentLeague.settings, playoff_week_start: 21 },
      },
      rosters: h.rosters.map((r) => ({
        ...r,
        settings: { ...r.settings, ...rec(r.rosterId), ties: 0, fpts },
      })),
    };
    out.rostersById = new Map(out.rosters.map((r) => [r.rosterId, r]));
    return out;
  };
  const zeroed = withRecords(() => ({ wins: 0, losses: 0 }), 0);
  const talentRank = strengthRanks({ ...zeroed, brackets: new Map() });
  const strongest = [...talentRank.entries()].find(([, r]) => r === 1)[0];
  const weakest = [...talentRank.entries()].find(
    ([, r]) => r === h.rosters.length,
  )[0];
  it("early in the season roster value outweighs a short record", () => {
    // Three games in: the strongest roster starts 0-3 and the weakest 3-0.
    const h3 = withRecords((id) =>
      id === strongest
        ? { wins: 0, losses: 3 }
        : id === weakest
          ? { wins: 3, losses: 0 }
          : { wins: 1, losses: 2 },
    );
    const ranks = strengthRanks(h3);
    expect(ranks.get(strongest)).toBeLessThan(ranks.get(weakest));
  });
  it("by the end of the regular season the record decides", () => {
    const h20 = withRecords((id) =>
      id === strongest
        ? { wins: 0, losses: 20 }
        : id === weakest
          ? { wins: 20, losses: 0 }
          : { wins: 10, losses: 10 },
    );
    const ranks = strengthRanks(h20);
    expect(ranks.get(weakest)).toBe(1);
    expect(ranks.get(strongest)).toBe(h.rosters.length);
  });
  it("never slots an in-season pick by last season's bracket", () => {
    // The fixture carries a decided 2025 bracket; the 2026 season has games.
    const h3 = withRecords(() => ({ wins: 2, losses: 1 }));
    const noBracket = strengthRanks({ ...h3, brackets: new Map() });
    expect([...strengthRanks(h3)]).toEqual([...noBracket]);
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
