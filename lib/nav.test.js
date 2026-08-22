import { describe, expect, it } from "vitest";
import {
  ALL_SURFACES,
  groupedSurfaces,
  homeNext,
  managerLinks,
  onwardFrom,
  primarySurfaces,
  surfacesWithOnward,
} from "./nav.js";
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
  it("flags exactly the four always-visible tabs of the Desk's tab row as primary", () => {
    const primaryHrefs = primarySurfaces().map((s) => s.href);
    // Order matters: this IS the left-to-right order the four render in, as the
    // first four tabs of the Desk's persistent five-tab row (components/Desk.jsx,
    // DECISIONS.md D65) - the fifth tab, More, is not in this registry at all.
    expect(primaryHrefs).toEqual(["/", "/roster", "/plan", "/ledger"]);
  });
  it("gives every pinned slot a short label", () => {
    // A tab is a fifth of a five-across row. `label` is the index's full name and
    // is too long for one; without this a promoted surface would render "undefined".
    for (const s of primarySurfaces()) {
      expect(
        s.short,
        `${s.href} is primary but has no short label`,
      ).toBeTruthy();
      expect(s.short.length).toBeLessThanOrEqual(8);
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
describe("onwardFrom - the no-dead-ends rule", () => {
  it("gives EVERY registered surface at least two ways out", () => {
    // The measurement this exists for: four surfaces shipped with zero outbound
    // links and the app read as a set of destinations rather than one thing. Fixing
    // the four would have been a patch; this is the rule, so the fifth cannot ship.
    //
    // ONE exemption, by name: /more (VISION kill-list #7). Its entire body is the
    // surface registry itself - every registered page is a way out - so a WHERE
    // NEXT footer under it was the app repeating two links already on the screen.
    // The exemption is a named carve-out rather than a lowered bar so a real dead
    // end still cannot ship.
    for (const s of ALL_SURFACES) {
      if (s.href === "/more") continue;
      expect(
        onwardFrom(s.href).length,
        `${s.href} is a dead end - add it to ONWARD in lib/nav.ts`,
      ).toBeGreaterThanOrEqual(2);
    }
  });
  it("gives /more no onward steps - its body is the complete index", () => {
    expect(onwardFrom("/more")).toEqual([]);
  });
  it("defines onward steps for registered surfaces only", () => {
    const hrefs = new Set(ALL_SURFACES.map((s) => s.href));
    for (const from of surfacesWithOnward()) {
      expect(
        hrefs.has(from),
        `ONWARD has an entry for unregistered ${from}`,
      ).toBe(true);
    }
  });
  it("never points a page at itself, and never repeats a destination", () => {
    for (const s of ALL_SURFACES) {
      const steps = onwardFrom(s.href);
      const hrefs = steps.map((x) => x.href);
      expect(hrefs, `${s.href} links to itself`).not.toContain(s.href);
      expect(new Set(hrefs).size, `${s.href} repeats a destination`).toBe(
        hrefs.length,
      );
    }
  });
  it("takes every registered destination's name from the registry, never a copy", () => {
    // The label-drift bug in one sentence: the registry said "Draft history" and all
    // six inbound links said "Pick lineage". A step that hardcoded a name would
    // reopen it, so only UNregistered destinations may carry their own label.
    const byHref = new Map(ALL_SURFACES.map((s) => [s.href, s.label]));
    for (const s of ALL_SURFACES) {
      for (const step of onwardFrom(s.href)) {
        const registered = byHref.get(step.href);
        if (registered) expect(step.label).toBe(registered);
      }
    }
  });
  it("never keeps a step pointing at a surface the app no longer has", () => {
    // The gap this closes, found while shelving /analyst (SHELVED.md, S7):
    // `resolveSteps` falls back to the raw href when a destination is neither in the
    // registry nor given an explicit `label`, so a link left behind by a removed
    // surface renders as a step captioned "/analyst" and every other test in this
    // file stays green. The two deliberate unregistered targets
    // (/lab/counterfactual, /lab/regret) carry their own labels and are unaffected,
    // which is the distinction being pinned: unregistered is allowed, unnamed is not.
    for (const s of ALL_SURFACES) {
      for (const step of onwardFrom(s.href)) {
        expect(
          step.label,
          `${s.href} -> ${step.href} is unregistered and unlabelled`,
        ).not.toBe(step.href);
      }
    }
  });
  it("says WHY, in the reader's voice, and never with an em dash", () => {
    for (const s of ALL_SURFACES) {
      for (const step of onwardFrom(s.href)) {
        expect(step.why.length, `${s.href} -> ${step.href}`).toBeGreaterThan(8);
        expect(step.why).not.toMatch(/[—–]/);
      }
    }
  });
  it("returns nothing for a path with no entry rather than throwing", () => {
    // Callers pass a pathname, and a dynamic route legitimately has no entry.
    expect(onwardFrom("/managers/42")).toEqual([]);
    expect(onwardFrom("")).toEqual([]);
  });
});
describe("homeNext - Home is a landing page, not a third copy of the index", () => {
  const quiet = { outstanding: 0, moved: false, contradicted: false };
  it("falls back to the baseline when nothing is happening, never to nothing", () => {
    // A quiet week must still leave the landing page with real ways out - the whole
    // point of the no-dead-ends rule applies hardest to the page people open first.
    expect(homeNext(quiet)).toEqual(onwardFrom("/"));
  });
  it("never offers more than three, however much is going on", () => {
    const busy = homeNext({ outstanding: 27, moved: true, contradicted: true });
    expect(busy.length).toBe(3);
  });
  it("leads with the reasoning still to capture", () => {
    expect(homeNext({ ...quiet, outstanding: 4 })[0].href).toBe("/ledger");
  });
  it("re-words the plan step when the record contradicts the plan, rather than adding a fourth", () => {
    // The `contradicted` signal pointed at /analyst until that surface was shelved
    // (SHELVED.md, S7). It now lands on /plan, which is ALREADY the baseline's first
    // step - so what the flag buys is a different reason, not a different
    // destination, and this pins that it actually buys one. Delete the branch and
    // this fails; leave the branch pointing somewhere with nothing new to say and
    // the second assertion fails.
    const flagged = homeNext({ ...quiet, contradicted: true });
    const baseline = onwardFrom("/");
    expect(flagged[0].href).toBe("/plan");
    expect(flagged.map((s) => s.href)).toEqual(baseline.map((s) => s.href));
    expect(flagged[0].why).not.toBe(baseline[0].why);
  });
  it("never repeats a destination or points back at Home", () => {
    for (const outstanding of [0, 3]) {
      for (const moved of [false, true]) {
        for (const contradicted of [false, true]) {
          const steps = homeNext({ outstanding, moved, contradicted });
          const hrefs = steps.map((s) => s.href);
          expect(new Set(hrefs).size).toBe(hrefs.length);
          expect(hrefs).not.toContain("/");
        }
      }
    }
  });
  it("takes its labels from the registry, and says why without an em dash", () => {
    const byHref = new Map(ALL_SURFACES.map((s) => [s.href, s.label]));
    for (const step of homeNext({
      outstanding: 1,
      moved: true,
      contradicted: true,
    })) {
      expect(step.label).toBe(byHref.get(step.href));
      expect(step.why).not.toMatch(/[—–]/);
    }
  });
});
describe("managerLinks - wherever a manager is named", () => {
  it("offers a trade with a current leaguemate", () => {
    const links = managerLinks({
      rosterId: 7,
      ownerId: "u7",
      isFormer: false,
      isMe: false,
    });
    expect(links.map((l) => l.href)).toEqual([
      "/managers/7",
      "/trade/finder?with=7",
      "/deals?manager=u7",
    ]);
  });
  it("never offers a trade with yourself, and offers your own reasoning instead", () => {
    const links = managerLinks({
      rosterId: 3,
      ownerId: "me",
      isFormer: false,
      isMe: true,
    });
    const hrefs = links.map((l) => l.href);
    expect(hrefs).not.toContain("/trade/finder?with=3");
    expect(hrefs).toContain("/ledger");
  });
  it("never offers a trade with, or a roster page for, a departed manager (D22)", () => {
    // A former principal holds no roster tonight: there is nothing to trade for and
    // the roster route would land on whoever replaced them.
    const links = managerLinks({
      rosterId: 11,
      ownerId: "gone",
      isFormer: true,
      isMe: false,
    });
    const hrefs = links.map((l) => l.href);
    expect(hrefs).toContain("/managers/former/gone");
    expect(hrefs).not.toContain("/managers/11");
    expect(hrefs.some((x) => x.startsWith("/trade/finder"))).toBe(false);
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
