import { describe, expect, it } from "vitest";
import { ALL_SURFACES, curatedSurfaces, groupedSurfaces } from "./nav";

describe("the surface registry", () => {
  it("has no duplicate hrefs - the exact bug this file exists to prevent", () => {
    const hrefs = ALL_SURFACES.map((s) => s.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("includes the two surfaces the round-6 brainstorm found with zero nav entry", () => {
    const hrefs = ALL_SURFACES.map((s) => s.href);
    expect(hrefs).toContain("/managers/compare");
    expect(hrefs).toContain("/rank");
  });

  it("flags every bottom-nav tab as primary, and nothing else", () => {
    const primaryHrefs = ALL_SURFACES.filter((s) => s.primary).map((s) => s.href);
    expect(new Set(primaryHrefs)).toEqual(new Set(["/", "/roster", "/plan", "/trade", "/league"]));
  });
});

describe("curatedSurfaces", () => {
  it("is the exact set Home and League both render - see their own tests", () => {
    const curated = curatedSurfaces();
    expect(curated.length).toBeGreaterThan(0);
    for (const s of curated) expect(s.curated).toBe(true);
  });

  it("never includes a primary tab - those already have a permanent tab", () => {
    for (const s of curatedSurfaces()) expect(s.primary).toBeUndefined();
  });
});

describe("groupedSurfaces", () => {
  it("accounts for every surface in the registry exactly once", () => {
    const grouped = groupedSurfaces().flatMap((g) => g.items);
    expect(grouped.length).toBe(ALL_SURFACES.length);
    expect(new Set(grouped.map((s) => s.href)).size).toBe(ALL_SURFACES.length);
  });

  it("puts Primary first when present", () => {
    const groups = groupedSurfaces();
    expect(groups[0].group).toBe("Primary");
  });
});
