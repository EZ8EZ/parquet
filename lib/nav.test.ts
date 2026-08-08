import { describe, expect, it } from "vitest";
import { ALL_SURFACES, curatedSurfaces, groupedSurfaces, primarySurfaces } from "./nav";

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

  it("includes the front door - a first-time reader must be able to find it", () => {
    expect(ALL_SURFACES.map((s) => s.href)).toContain("/about");
  });

  it("includes /teams - the picker a cookie-less visitor is now routed to", () => {
    // /more promises "if it isn't listed below, it doesn't exist". A registry that
    // omitted the entry point of the whole identity flow would make that a lie.
    expect(ALL_SURFACES.map((s) => s.href)).toContain("/teams");
  });

  it("includes /more - the page that promises to list everything, itself included", () => {
    // The registry omitting /more is what made that page's own subtitle false. It
    // survives the Desk as the no-JS fallback and the drawer's "see everything".
    expect(ALL_SURFACES.map((s) => s.href)).toContain("/more");
  });

  it("flags exactly the Desk's four destination slots as primary", () => {
    const primaryHrefs = primarySurfaces().map((s) => s.href);
    // Order matters: this IS the left-to-right order of the destination row.
    expect(primaryHrefs).toEqual(["/", "/roster", "/plan", "/ledger"]);
  });

  it("gives every destination slot a short label", () => {
    // A slot is a quarter of a 390pt row. `label` is the index's full name and is
    // too long for one; without this a promoted surface would render "undefined".
    for (const s of primarySurfaces()) {
      expect(s.short, `${s.href} is primary but has no short label`).toBeTruthy();
      expect(s.short!.length).toBeLessThanOrEqual(8);
    }
  });

  it("keeps `primary` and the Primary group as the same set", () => {
    // Two ways of saying "this has a permanent slot" that could drift apart is the
    // exact failure this registry exists to prevent, so they are pinned to each other.
    for (const s of ALL_SURFACES) {
      expect(s.primary === true, `${s.href}`).toBe(s.group === "Primary");
    }
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
