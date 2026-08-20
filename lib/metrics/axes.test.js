import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory.js";
import { getPrincipals } from "../principals.js";
import { leagueValueRanking } from "../roster.js";
import {
  cachedLeagueTimelines,
  leagueTimelines,
  postureCensus,
} from "./duration.js";
import { leagueFragility } from "./fragility.js";
import { buildQuadrantView } from "./quadrant.js";
import { diagnose } from "../gameplan/index.js";
import { POSTURE_ORDER } from "../agency/index.js";
import { POSTURE_GLYPH } from "../../components/PostureTag";
import {
  coreAgeBandOf,
  CORE_AGE_AXIS,
  PLAN_STANCES,
  POSTURE_UNREAD,
  ROSTER_AXES,
  STANCE_FROM_POSTURE,
  stanceOf,
  TIMELINE_AXIS,
} from "./axes.js";
/**
 * THE GUARD THIS FILE EXISTS FOR.
 *
 * Before it, two classifiers answered two different questions in the same words -
 * core-age band (`rebuilding` / `balanced` / `win-now`) and posture (`contending` /
 * `ascending` / `rebuilding` / `straddling`) - and /league printed both on the same
 * row. On the live 14-roster league the two labels were different strings on 11 of 14
 * rosters, and the census tiles at the top of that page said "3 REBUILDING" over a board
 * that printed "rebuilding" against four rosters. Nothing threw, and no test compared
 * them, which is exactly how `tierOf` shipped two names for one player (SHELVED S6).
 *
 * These tests fail if a word ever belongs to two vocabularies again, if a census stops
 * counting what its own board prints, or if a second stance implementation reappears.
 */
/** Words as comparable stems, so "rebuild" and "rebuilding" count as one word. */
function stems(phrase) {
  return phrase
    .split(/[\s-]+/)
    .map((t) => t.replace(/(ing|ed|s)$/, ""))
    .filter(Boolean);
}
describe("the classification vocabularies do not overlap", () => {
  it("shares no word between the two reading axes", () => {
    const [a, b] = ROSTER_AXES;
    const shared = a.words.filter((w) => b.words.includes(w));
    expect(shared).toEqual([]);
  });
  it("shares no word STEM between the two reading axes", () => {
    // The near-miss matters as much as the collision: "rebuild" beside "rebuilding" on
    // one row is the same bug with one fewer letter.
    const [a, b] = ROSTER_AXES;
    const aStems = new Set(a.words.flatMap(stems));
    const shared = b.words.flatMap(stems).filter((s) => aStems.has(s));
    expect(shared).toEqual([]);
  });
  it("declares each axis with the question it answers and the one function allowed to answer it", () => {
    for (const axis of ROSTER_AXES) {
      expect(axis.question.length).toBeGreaterThan(0);
      expect(axis.source).toMatch(/^lib\/.+\(\)$/);
      expect(new Set(axis.words).size).toBe(axis.words.length);
    }
  });
  it("keeps the plan's stances derived from the timeline axis rather than independent of it", () => {
    // The stances are prescriptions, not a third reading, so they are allowed to share
    // a stem with a posture - what they are NOT allowed to be is a vocabulary with no
    // declared relationship to one. Every posture maps to exactly one natural stance,
    // and every stance is reachable.
    expect(Object.keys(STANCE_FROM_POSTURE).sort()).toEqual(
      [...TIMELINE_AXIS.words].sort(),
    );
    for (const stance of Object.values(STANCE_FROM_POSTURE))
      expect(PLAN_STANCES).toContain(stance);
    expect(new Set(Object.values(STANCE_FROM_POSTURE)).size).toBe(
      PLAN_STANCES.length,
    );
    // And no stance may be spelled exactly like a reading, in either vocabulary.
    for (const stance of PLAN_STANCES)
      for (const axis of ROSTER_AXES) expect(axis.words).not.toContain(stance);
  });
  it("gives every word exactly one producer, on a real league", async () => {
    // The end-to-end version of the same claim: walk the league, collect every
    // classification word the app can print for a roster alongside WHICH axis produced
    // it, and require that no word ever arrives from two axes. This is the test that
    // fails if a future change points either classifier back at the other's words.
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const ranked = leagueValueRanking(h);
    const timelines = cachedLeagueTimelines(h);
    const byRoster = new Map(timelines.map((t) => [t.rosterId, t]));
    /** @type {Map<string, Set<string>>} */
    const producers = new Map();
    const record = (word, axis) => {
      const set = producers.get(word) ?? new Set();
      set.add(axis);
      producers.set(word, set);
    };
    for (const a of ranked) {
      record(a.coreAgeBand, CORE_AGE_AXIS.key);
      record(byRoster.get(a.rosterId).posture, TIMELINE_AXIS.key);
      record(diagnose(h, a.rosterId, principals).direction, "planStance");
    }
    expect(producers.size).toBeGreaterThan(3);
    for (const [word, axes] of producers)
      expect({ word, axes: [...axes] }).toEqual({ word, axes: [[...axes][0]] });
  });
  it("produces only declared words, whichever roster it is asked about", () => {
    const h = buildFixtureHistory();
    const ranked = leagueValueRanking(h);
    for (const a of ranked) {
      expect(CORE_AGE_AXIS.words).toContain(a.coreAgeBand);
      expect(CORE_AGE_AXIS.words).toContain(coreAgeBandOf(a.coreAge));
    }
    for (const t of cachedLeagueTimelines(h))
      expect(TIMELINE_AXIS.words).toContain(t.posture);
  });
  it("keeps every posture-keyed map in the app on the declared vocabulary", () => {
    // Two maps used to carry a fifth key, `balanced`, which posture has never been able
    // to return - it was there because the core-age band shared two of these words.
    expect(Object.keys(POSTURE_GLYPH).sort()).toEqual(
      [...TIMELINE_AXIS.words].sort(),
    );
    // The pick-agency grouping may REORDER the vocabulary (it reads longest-dated
    // first) but not extend or rename it; "unread" is the absence of a reading.
    expect([...POSTURE_ORDER].sort()).toEqual(
      [...TIMELINE_AXIS.words, POSTURE_UNREAD].sort(),
    );
  });
});
describe("the census and the board cannot disagree", () => {
  it("counts exactly what the board rows print, posture for posture", () => {
    const h = buildFixtureHistory();
    const timelines = cachedLeagueTimelines(h);
    const board = buildQuadrantView(
      timelines,
      leagueFragility(h).map((f) => ({
        rosterId: f.rosterId,
        fragility: f.fragility,
        percentile: f.percentile,
        band: f.band,
        spofName: f.singlePointOfFailure?.name ?? null,
        spofShare: f.singlePointOfFailure?.damageShare ?? null,
      })),
      h.me.rosterId,
    );
    const census = postureCensus(timelines);
    // Every tile is labelled with a word the board can actually print.
    expect(census.map((c) => c.posture)).toEqual(TIMELINE_AXIS.words);
    for (const c of census)
      expect(c.count).toBe(
        board.points.filter((p) => p.posture === c.posture).length,
      );
    expect(census.reduce((s, c) => s + c.count, 0)).toBe(board.points.length);
  });
  it("memoizes the league pass without changing its answer", () => {
    const h = buildFixtureHistory();
    expect(cachedLeagueTimelines(h)).toEqual(leagueTimelines(h));
    expect(cachedLeagueTimelines(h)).toBe(cachedLeagueTimelines(h));
  });
});
describe("one stance implementation", () => {
  it("gives a roster the same direction wherever it is asked", async () => {
    // /plan's `diagnose` and the trade finder's appetite model both call `stanceOf`.
    // They used to hold a copy each, kept in step by a test - which is the shape that
    // let `tierOf` drift. This asserts the shared function is reached with the same
    // inputs from the engine's own entry point.
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const ranked = leagueValueRanking(h);
    const byRoster = new Map(
      cachedLeagueTimelines(h).map((t) => [t.rosterId, t]),
    );
    ranked.forEach((a, i) => {
      const dx = diagnose(h, a.rosterId, principals);
      const direct = stanceOf({
        posture: byRoster.get(a.rosterId).posture,
        coreAge: a.coreAge,
        stars: dx.starCount,
        valueRank: i + 1,
        teams: ranked.length,
      });
      expect(dx.direction).toBe(direct.stance);
      expect(PLAN_STANCES).toContain(dx.direction);
      expect(["posture", "standing", "unread"]).toContain(dx.directionBasis);
    });
  });
  it("reads the plan off the timeline, so a disagreement can only be the standing override", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    for (const r of h.rosters) {
      const dx = diagnose(h, r.rosterId, principals);
      if (dx.directionBasis !== "posture") continue;
      // Straddling and contending each point at exactly one stance; the longer-dated
      // pair split on standing, which is a question about assets and not about timing.
      const allowed =
        dx.posture === "ascending" || dx.posture === "rebuilding"
          ? ["ascend", "rebuild"]
          : [STANCE_FROM_POSTURE[dx.posture]];
      expect(allowed).toContain(dx.direction);
    }
  });
  it("names its basis in words a reader can check, never as a bare verdict", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    for (const r of h.rosters) {
      const dx = diagnose(h, r.rosterId, principals);
      expect(dx.directionNote.length).toBeGreaterThan(20);
      // D6: the direction is a recommendation with a stated reason, and the reason is
      // never "you are bad at this". No grade words anywhere in the basis.
      expect(dx.directionNote).not.toMatch(/\b(good|bad|worst|best|grade)\b/i);
    }
  });
});
describe("core age bands", () => {
  it("bands against the league when it has one, and falls back to absolutes when it does not", () => {
    const ages = [22, 23, 24, 25, 26, 27, 28, 29];
    expect(coreAgeBandOf(29, ages)).toBe("veteran core");
    expect(coreAgeBandOf(22, ages)).toBe("young core");
    expect(coreAgeBandOf(26, ages)).toBe("mixed-age core");
    // No league context: the absolute fallback, unchanged from the old `window` read.
    expect(coreAgeBandOf(24)).toBe("young core");
    expect(coreAgeBandOf(29)).toBe("veteran core");
    expect(coreAgeBandOf(27)).toBe("mixed-age core");
    // No core to read is not a band claim.
    expect(coreAgeBandOf(null, ages)).toBe("mixed-age core");
  });
  it("says nothing about strategy, which is the whole point of the rename", () => {
    // D19: an old core is not evidence that anyone chose to win now. If any of these
    // words ever reads as an intent again, this fails.
    for (const w of CORE_AGE_AXIS.words) {
      expect(w).toMatch(/core$/);
      expect(w).not.toMatch(/win|rebuild|contend|tank|push/i);
    }
  });
});
