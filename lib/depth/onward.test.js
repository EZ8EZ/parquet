import { describe, expect, it } from "vitest";
import { ALL_SURFACES } from "../nav.js";
import { depthOnwardSteps } from "./onward.js";
import { depthChartHref, readAnchorId } from "./url.js";
/**
 * THE SAME FOUR PROPERTIES lib/nav.test.js pins on every registered surface, applied
 * to a route the registry cannot hold because it has a parameter. A leaf route is not
 * an excuse for a dead end.
 */
const CASES = [
  { name: "no anchor at all", input: {} },
  { name: "an anchored player nobody owns", input: { playerId: "1234" } },
  {
    name: "an anchored player a rival owns",
    input: { playerId: "1234", ownerRosterId: 7 },
  },
  {
    name: "an anchored player the viewer owns",
    input: { playerId: "1234", ownerRosterId: 3, ownedByViewer: true },
  },
];
describe("depthOnwardSteps - the no-dead-ends rule on a dynamic route", () => {
  for (const { name, input } of CASES) {
    it(`gives at least two ways out with ${name}`, () => {
      expect(depthOnwardSteps(input).length).toBeGreaterThanOrEqual(2);
    });
    it(`never repeats a destination with ${name}`, () => {
      const hrefs = depthOnwardSteps(input).map((s) => s.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    });
    it(`never points back at a depth chart with ${name}`, () => {
      for (const s of depthOnwardSteps(input)) {
        expect(s.href.startsWith("/depth")).toBe(false);
      }
    });
    it(`says why, in the reader's voice, without an em dash, with ${name}`, () => {
      for (const s of depthOnwardSteps(input)) {
        expect(s.why.length).toBeGreaterThan(8);
        expect(s.why).not.toMatch(/[—–]/);
        expect(s.label.length).toBeGreaterThan(0);
      }
    });
    it(`takes every registered destination's name from the registry with ${name}`, () => {
      const byHref = new Map(ALL_SURFACES.map((s) => [s.href, s.label]));
      for (const s of depthOnwardSteps(input)) {
        const registered = byHref.get(s.href.split("?")[0]);
        if (registered) expect(s.label).toBe(registered);
      }
    });
    it(`never offers more than three with ${name}`, () => {
      expect(depthOnwardSteps(input).length).toBeLessThanOrEqual(3);
    });
  }
  it("offers the anchored player's value and provenance before anything generic", () => {
    const steps = depthOnwardSteps({ playerId: "99" });
    expect(steps[0].href).toBe("/values?focus=99");
    expect(steps[1].href).toBe("/lineage/p%3A99");
  });
  it("offers the holder's dossier only when someone else holds him", () => {
    const rival = depthOnwardSteps({ playerId: "1", ownerRosterId: 7 });
    expect(rival.map((s) => s.href)).toContain("/managers/7");
    const mine = depthOnwardSteps({
      playerId: "1",
      ownerRosterId: 3,
      ownedByViewer: true,
    });
    expect(mine.map((s) => s.href)).not.toContain("/managers/3");
    expect(mine.map((s) => s.href)).toContain("/roster");
  });
});
describe("depthChartHref / readAnchorId", () => {
  it("puts the team in the path and the player in the query", () => {
    expect(depthChartHref("LAL", "1234")).toBe("/depth/LAL?player=1234");
    expect(depthChartHref("LAL")).toBe("/depth/LAL");
  });
  it("normalises the team code so one row cannot link somewhere else than another", () => {
    expect(depthChartHref("lal", "1")).toBe("/depth/LAL?player=1");
    expect(depthChartHref(" lal ", "1")).toBe("/depth/LAL?player=1");
  });
  it("returns null for a player with no team, so a free agent links nowhere", () => {
    expect(depthChartHref(null, "1")).toBe(null);
    expect(depthChartHref("", "1")).toBe(null);
    expect(depthChartHref(undefined)).toBe(null);
  });
  it("escapes anything odd in either half rather than emitting a broken URL", () => {
    expect(depthChartHref("L/L", "a b")).toBe("/depth/L%2FL?player=a%20b");
  });
  it("reads the anchor out of a searchParams object, and shrugs off junk", () => {
    expect(readAnchorId({ player: "123" })).toBe("123");
    expect(readAnchorId({ player: ["123", "456"] })).toBe("123");
    expect(readAnchorId({ player: "  123  " })).toBe("123");
    expect(readAnchorId({ player: "" })).toBe(null);
    expect(readAnchorId({})).toBe(null);
    expect(readAnchorId(null)).toBe(null);
    // A non-string reaches here only from a hand-built caller, and it must still
    // read as "no anchor" rather than throwing on `.trim()`.
    expect(readAnchorId(/** @type {any} */ ({ player: 5 }))).toBe(null);
    // A hand-edited monster is truncated, not trusted.
    expect(readAnchorId({ player: "x".repeat(500) })?.length).toBe(64);
  });
});
