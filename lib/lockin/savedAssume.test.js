import { describe, expect, it } from "vitest";
import { decodeSaved, encodeSaved, keptMarks, weekEndMs } from "./savedAssume.js";

const NOW = Date.UTC(2026, 10, 25, 19, 0); // Wed 2026-11-25 19:00 UTC

describe("kept what-if marks (D141)", () => {
  it("expire before the next lock-in week: next Monday 16:00 UTC", () => {
    expect(new Date(weekEndMs(NOW)).toISOString()).toBe("2026-11-30T16:00:00.000Z");
    // on a Monday before 16:00 it is that same day; after, the Monday after
    expect(new Date(weekEndMs(Date.UTC(2026, 10, 30, 10))).toISOString()).toBe("2026-11-30T16:00:00.000Z");
    expect(new Date(weekEndMs(Date.UTC(2026, 10, 30, 17))).toISOString()).toBe("2026-12-07T16:00:00.000Z");
  });
  it("keep locks and play-on marks, never typed scores", () => {
    const list = [
      { side: "theirs", slot: 2, state: "locked" },
      { side: "mine", slot: 4, state: "locked", score: 30.5 },
      { side: "mine", slot: 1, state: "open" },
    ];
    expect(keptMarks(list).map((a) => `${a.side}${a.slot}${a.state}`)).toEqual(["theirs2locked", "mine1open"]);
    const v = encodeSaved(6, list, NOW);
    expect(decodeSaved(v, 6, NOW)).toBe("t2L,m1O");
    expect(encodeSaved(6, [{ side: "mine", slot: 4, state: "locked", score: 30.5 }], NOW)).toBeNull();
  });
  it("apply only to the same team, before they expire, and refuse junk", () => {
    const v = encodeSaved(6, [{ side: "theirs", slot: 2, state: "locked" }], NOW);
    expect(decodeSaved(v, 7, NOW)).toBeNull();
    expect(decodeSaved(v, 6, weekEndMs(NOW) + 1)).toBeNull();
    expect(decodeSaved(encodeURIComponent(v), 6, NOW)).toBe("t2L");
    for (const junk of [undefined, "", "6~x~t2L", "6~1~t2L", "6~99999999999~<script>"]) expect(decodeSaved(junk, 6, NOW)).toBeNull();
  });
});
