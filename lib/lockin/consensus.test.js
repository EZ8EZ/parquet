import { beforeEach, describe, expect, it } from "vitest";
import { weekConsensus, resetConsensus } from "./consensus.js";
import { managerHistory } from "./history.js";
import { historyView } from "./matchupView.js";
import { buildWeekDesk } from "./index.js";
import { FIXTURE_LEAGUE_ID, FIXTURE_NOW, fixtureFetchJson } from "./fixture.js";

// QA, 2026-11-24: Sleeper returned roster 6 week 3 as 196.5, 208 and 165.5 within five minutes.
const version = (pts) => [{ roster_id: 6, starters: ["a"], starters_points: [pts], points: pts }];

describe("finished weeks read through a consensus", () => {
  beforeEach(() => resetConsensus());

  it("keeps the most-seen version and flags the week as unstable", () => {
    weekConsensus("L|3", version(196.5));
    weekConsensus("L|3", version(208));
    weekConsensus("L|3", version(196.5));
    const c = weekConsensus("L|3", version(165.5));
    expect(c.data[0].starters_points[0]).toBe(196.5);
    expect(c).toMatchObject({ versions: 3, reads: 4, unstable: true });
  });

  it("a single consistent version is stable; ties go to the most recent read", () => {
    expect(weekConsensus("L|2", version(150)).unstable).toBe(false);
    expect(weekConsensus("L|2", version(150))).toMatchObject({ versions: 1, unstable: false });
    weekConsensus("L|4", version(100));
    expect(weekConsensus("L|4", version(120)).data[0].starters_points[0]).toBe(120);
  });

  it("history reports the unstable weeks it used", () => {
    const log = new Map([["a", [{ season: "2026", week: 3, date: "2026-11-03", sp: 1800, fp: 210, complete: true }]]]);
    const h = managerHistory({ pastMatchups: [{ week: 3, matchups: version(196.5), unstable: true }], rosterId: 6, logs: log, season: "2026" });
    expect(h.unstableWeeks).toEqual([3]);
  });
});

describe("QA round 3: lock history over consistent weeks only", () => {
  // M1 (QA: roster 6 read 15.9 or 40.7 per week across processes; Sleeper returns week 5 as
  // 108.5 or 212.5). A cold process now reads each past week twice, and a week seen in more
  // than one version is left out of the figure, with the count carried and shown.
  beforeEach(() => resetConsensus());
  const row = (week, date, fp) => ({ season: "2026", week, date, sp: 1800, fp, complete: true });
  const log = new Map([["a", [row(1, "2026-10-21", 30), row(1, "2026-10-23", 40), row(2, "2026-10-28", 20), row(3, "2026-11-04", 10), row(3, "2026-11-06", 25)]]]);
  const wk = (pts) => [{ roster_id: 6, starters: ["a"], starters_points: [pts], points: pts }];
  it("leaves unstable weeks out of the figure and says how many", () => {
    const h = managerHistory({ pastMatchups: [{ week: 1, matchups: wk(30) }, { week: 2, matchups: wk(20), unstable: true }, { week: 3, matchups: wk(10), unstable: true }], rosterId: 6, logs: log, season: "2026" });
    expect(h).toMatchObject({ n: 1, leftOnTablePerWeek: 10, unstableWeeks: [2, 3], excludedWeeks: 2 });
    expect(h.byWeek.map((w) => w.week)).toEqual([1]);
    expect(historyView({ ...h, n: 3, weeks: 3 }).nText).toBe("n=3 weeks; 2 weeks left out because Sleeper reports them inconsistently");
    expect(historyView(h).nText).toBe("n=1 week; 2 weeks left out because Sleeper reports them inconsistently");
  });
  it("gives no figure when every week is unstable", () => {
    const h = managerHistory({ pastMatchups: [{ week: 1, matchups: wk(30), unstable: true }], rosterId: 6, logs: log, season: "2026" });
    expect(h).toMatchObject({ n: 0, leftOnTablePerWeek: null, excludedWeeks: 1 });
    expect(historyView(h)).toEqual({ ok: false, missing: "Not enough consistent weeks: 1 week left out because Sleeper reports it inconsistently.", excluded: 1 });
  });
  it("a cold load reads each past week twice and flags a week that came back different", async () => {
    const calls = new Map();
    const flaky = async (url, opts) => {
      const d = await fixtureFetchJson(url, opts);
      const k = (calls.get(url) ?? 0) + 1;
      calls.set(url, k);
      if (/\/matchups\/2$/.test(url) && k === 2) return d.map((m) => (m.roster_id === 1 ? { ...m, starters_points: m.starters_points.map((x) => x + 5) } : m));
      return d;
    };
    const d = await buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, fetchJson: flaky, now: FIXTURE_NOW });
    expect([1, 2, 3].every((w) => calls.get(`https://api.sleeper.app/v1/league/${FIXTURE_LEAGUE_ID}/matchups/${w}`) === 2)).toBe(true);
    expect(d.history.unstableWeeks).toEqual([2]);
    expect(d.history.excludedWeeks).toBe(1);
    expect(d.history.byWeek.map((w) => w.week)).not.toContain(2);
    // warm: the store already holds two reads, so no extra read
    calls.clear();
    await buildWeekDesk({ rosterId: 1, leagueId: FIXTURE_LEAGUE_ID, fetchJson: flaky, now: FIXTURE_NOW });
    expect(calls.get(`https://api.sleeper.app/v1/league/${FIXTURE_LEAGUE_ID}/matchups/1`)).toBe(1);
  });
});
