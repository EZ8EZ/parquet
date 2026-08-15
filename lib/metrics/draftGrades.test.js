import { describe, expect, it } from "vitest";
import { gradeDraft } from "./skill";
import { foldSeasonDraftGrade } from "./draftGrades";
function pick(pickNo, rosterId, playerId) {
  return {
    pickNo,
    rosterId,
    playerId,
    playerName: playerId,
    round: 1,
    isKeeper: false,
  };
}
/** Four players worth 100, 80, 60, 40 - same fixture shape as skill.test.ts. */
const VALUES = { best: 100, good: 80, ok: 60, bad: 40 };
const valueOf = (id) => VALUES[id] ?? 0;
const nameOf = (id) => id;
const ownerOf = (_s, rosterId) => `owner${rosterId}`;
const meta = (over = {}) => ({
  draftId: "d1",
  rounds: 1,
  teams: 4,
  totalPicks: 4,
  isStartup: false,
  ...over,
});
describe("foldSeasonDraftGrade", () => {
  it("reports the season's own capture rate, not a cumulative one", () => {
    const graded = gradeDraft(
      "2024",
      [
        pick(1, 1, "best"),
        pick(2, 2, "bad"),
        pick(3, 3, "good"),
        pick(4, 4, "ok"),
      ],
      valueOf,
      nameOf,
      ownerOf,
    );
    const g = foldSeasonDraftGrade("2024", meta({ totalPicks: 4 }), graded);
    expect(g.season).toBe("2024");
    expect(g.gradedPicks).toBe(graded.length);
    expect(g.captureRate).toBeGreaterThan(0);
    expect(g.captureRate).toBeLessThanOrEqual(1);
    expect(g.captured).toBeLessThanOrEqual(g.capturable);
  });
  it("picks the best and worst pick by pool capture, tie-broken by opportunity size", () => {
    const graded = gradeDraft(
      "2024",
      [
        pick(1, 1, "best"),
        pick(2, 2, "bad"),
        pick(3, 3, "good"),
        pick(4, 4, "ok"),
      ],
      valueOf,
      nameOf,
      ownerOf,
    );
    const g = foldSeasonDraftGrade("2024", meta(), graded);
    // Pick 1 takes the best of {100,80,60,40}: a perfect pick, capture = 1.
    expect(g.best.pickNo).toBe(1);
    expect(g.best.capture).toBeCloseTo(1, 6);
    // Pick 2 takes the worst of {80,60,40}: capture = 0, the headline miss.
    expect(g.worst.pickNo).toBe(2);
    expect(g.worst.capture).toBeCloseTo(0, 6);
  });
  it("never divides by zero and returns nulls on an empty draft", () => {
    const g = foldSeasonDraftGrade("2024", meta({ totalPicks: 0 }), []);
    expect(g.captureRate).toBe(0);
    expect(g.captured).toBe(0);
    expect(g.best).toBeNull();
    expect(g.worst).toBeNull();
    expect(g.steal).toBeNull();
    expect(g.bust).toBeNull();
  });
  /**
   * DECISIONS D27: slot surplus is not a fair comparison for the startup draft (it is
   * seventeen rounds over the whole pool, not three over one class), so a startup
   * season's card must not carry a "steal"/"bust" headline at all - not even one
   * computed only against itself.
   */
  it("suppresses steal and bust on a startup season, even though pool capture still works", () => {
    const graded = gradeDraft(
      "2022",
      [
        pick(1, 1, "bad"),
        pick(2, 1, "best"),
        pick(3, 1, "ok"),
        pick(4, 1, "good"),
      ],
      valueOf,
      nameOf,
      ownerOf,
      true,
    );
    const g = foldSeasonDraftGrade("2022", meta({ isStartup: true }), graded);
    expect(g.isStartup).toBe(true);
    expect(g.steal).toBeNull();
    expect(g.bust).toBeNull();
    // Pool capture is still "the right lens" per D27 - best/worst must still resolve.
    expect(g.best).not.toBeNull();
    expect(g.worst).not.toBeNull();
  });
  it("carries steal and bust on an ordinary rookie season", () => {
    const graded = gradeDraft(
      "2024",
      [
        pick(1, 1, "bad"),
        pick(2, 1, "ok"),
        pick(3, 1, "best"),
        pick(4, 1, "good"),
      ],
      valueOf,
      nameOf,
      ownerOf,
      false,
    );
    const g = foldSeasonDraftGrade("2024", meta(), graded);
    expect(g.steal).not.toBeNull();
    expect(g.bust).not.toBeNull();
    expect(g.steal.isStartup).toBe(false);
  });
  it("keeps regret non-positive, matching the underlying metric's own invariant", () => {
    const graded = gradeDraft(
      "2024",
      [
        pick(1, 1, "best"),
        pick(2, 2, "bad"),
        pick(3, 3, "good"),
        pick(4, 4, "ok"),
      ],
      valueOf,
      nameOf,
      ownerOf,
    );
    const g = foldSeasonDraftGrade("2024", meta(), graded);
    expect(g.regret).toBeLessThanOrEqual(0);
  });
});
