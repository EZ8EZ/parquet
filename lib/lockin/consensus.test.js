import { beforeEach, describe, expect, it } from "vitest";
import { weekConsensus, resetConsensus } from "./consensus.js";
import { managerHistory } from "./history.js";

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
