import { describe, expect, it } from "vitest";
import {
  ALL_SURFACES,
  REDIRECTS,
  TABS,
  groupedSurfaces,
  managerLinks,
  onwardFrom,
  primarySurfaces,
  surfacesIn,
  surfacesWithOnward,
  tabOf,
  utilitySurfaces,
} from "./nav.js";

describe("the surface registry", () => {
  it("has no duplicate hrefs", () => {
    const hrefs = ALL_SURFACES.map((s) => s.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("has exactly four tabs, in order: This Week, Team, Trade, League", () => {
    expect(primarySurfaces().map((s) => s.href)).toEqual([
      "/",
      "/roster",
      "/trade",
      "/league",
    ]);
    expect(primarySurfaces().map((s) => s.short)).toEqual([
      "This Week",
      "Team",
      "Trade",
      "League",
    ]);
    expect(TABS.map((t) => t.href)).toEqual(
      primarySurfaces().map((s) => s.href),
    );
  });

  it("keeps the decision ledger out of the tab bar but reachable under League", () => {
    expect(primarySurfaces().map((s) => s.href)).not.toContain("/ledger");
    const ledger = ALL_SURFACES.find((s) => s.href === "/ledger");
    expect(ledger.tab).toBe("league");
    expect(ledger.section).toBe("Record");
  });

  it("files every surface under a tab or the utility menu", () => {
    const tabs = new Set([...TABS.map((t) => t.id), "utility"]);
    for (const s of ALL_SURFACES) {
      expect(tabs.has(s.tab), `${s.href} has no home`).toBe(true);
    }
  });

  it("gives every tab a short label that fits a fifth of the bar", () => {
    for (const s of primarySurfaces()) {
      expect(s.short.length).toBeLessThanOrEqual(9);
    }
  });

  it("splits League into Record and History", () => {
    const sections = new Set(surfacesIn("league").map((s) => s.section));
    expect([...sections]).toEqual(["Record", "History"]);
    expect(
      surfacesIn("league")
        .filter((s) => s.section === "Record")
        .map((s) => s.href),
    ).toEqual(["/ledger", "/deals"]);
    expect(
      surfacesIn("league")
        .filter((s) => s.section === "History")
        .map((s) => s.href),
    ).toEqual(["/recap", "/awards", "/drafts", "/drafts/grades"]);
  });

  it("puts the trade hub's three jobs and partners under Trade", () => {
    const hrefs = surfacesIn("trade").map((s) => s.href);
    for (const h of ["/trade/finder", "/values", "/managers"]) {
      expect(hrefs).toContain(h);
    }
  });

  it("keeps the utility menu small: settings, team switcher, how it works", () => {
    const hrefs = utilitySurfaces().map((s) => s.href);
    expect(hrefs).toContain("/settings");
    expect(hrefs).toContain("/teams");
    expect(hrefs).toContain("/about");
    expect(hrefs.length).toBeLessThanOrEqual(5);
  });

  it("re-homes every Lab experiment and redirects /more and /lab", () => {
    const hrefs = ALL_SURFACES.map((s) => s.href);
    for (const h of [
      "/lab/pulse",
      "/lab/regret",
      "/lab/counterfactual",
      "/lab/leverage",
    ]) {
      expect(hrefs).toContain(h);
    }
    expect(hrefs).not.toContain("/more");
    expect(hrefs).not.toContain("/lab");
    const sources = REDIRECTS.map((r) => r.source);
    expect(sources).toEqual(["/more", "/lab"]);
    for (const r of REDIRECTS) expect(hrefs).toContain(r.destination);
  });
});

describe("tabOf - which tab lights for a path", () => {
  it("maps each hub to its own tab", () => {
    expect(tabOf("/")).toBe("week");
    expect(tabOf("/roster")).toBe("team");
    expect(tabOf("/trade")).toBe("trade");
    expect(tabOf("/league")).toBe("league");
  });

  it("maps sub-pages and dynamic routes to their tab by the longest prefix", () => {
    expect(tabOf("/plan")).toBe("team");
    expect(tabOf("/trade/finder")).toBe("trade");
    expect(tabOf("/managers/7")).toBe("trade");
    expect(tabOf("/managers/compare")).toBe("trade");
    expect(tabOf("/deals/abc")).toBe("league");
    expect(tabOf("/drafts/2026")).toBe("league");
    expect(tabOf("/lineage/p:123")).toBe("league");
    expect(tabOf("/lab/regret?season=2025")).toBe("team");
  });

  it("maps utility pages to the menu and unknown paths to nothing", () => {
    expect(tabOf("/settings")).toBe("utility");
    expect(tabOf("/teams")).toBe("utility");
    expect(tabOf("/nope")).toBe(null);
  });
});

describe("onwardFrom - the no-dead-ends rule", () => {
  it("gives every registered surface at least two ways out", () => {
    for (const s of ALL_SURFACES) {
      expect(
        onwardFrom(s.href).length,
        `${s.href} is a dead end - add it to ONWARD in lib/nav.js`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("defines onward steps for registered surfaces only", () => {
    const hrefs = new Set(ALL_SURFACES.map((s) => s.href));
    for (const from of surfacesWithOnward()) {
      expect(hrefs.has(from), `ONWARD has unregistered ${from}`).toBe(true);
    }
  });

  it("never points a page at itself, never repeats, never at a redirect", () => {
    const redirected = new Set(REDIRECTS.map((r) => r.source));
    for (const s of ALL_SURFACES) {
      const hrefs = onwardFrom(s.href).map((x) => x.href);
      expect(hrefs).not.toContain(s.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
      for (const h of hrefs) expect(redirected.has(h), h).toBe(false);
    }
  });

  it("takes every destination's name from the registry", () => {
    const byHref = new Map(ALL_SURFACES.map((s) => [s.href, s.label]));
    for (const s of ALL_SURFACES) {
      for (const step of onwardFrom(s.href)) {
        expect(byHref.get(step.href), `${s.href} -> ${step.href}`).toBe(
          step.label,
        );
      }
    }
  });

  it("says why, and never with an em dash", () => {
    for (const s of ALL_SURFACES) {
      for (const step of onwardFrom(s.href)) {
        expect(step.why.length).toBeGreaterThan(8);
        expect(step.why).not.toMatch(/[—–]/);
      }
    }
  });

  it("returns nothing for a path with no entry rather than throwing", () => {
    expect(onwardFrom("/managers/42")).toEqual([]);
    expect(onwardFrom("")).toEqual([]);
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
    const hrefs = managerLinks({
      rosterId: 3,
      ownerId: "me",
      isFormer: false,
      isMe: true,
    }).map((l) => l.href);
    expect(hrefs).not.toContain("/trade/finder?with=3");
    expect(hrefs).toContain("/ledger");
  });

  it("never offers a trade with, or a roster page for, a departed manager (D22)", () => {
    const hrefs = managerLinks({
      rosterId: 11,
      ownerId: "gone",
      isFormer: true,
      isMe: false,
    }).map((l) => l.href);
    expect(hrefs).toContain("/managers/former/gone");
    expect(hrefs).not.toContain("/managers/11");
    expect(hrefs.some((x) => x.startsWith("/trade/finder"))).toBe(false);
  });
});

describe("groupedSurfaces", () => {
  it("accounts for every surface exactly once, tabs first then the menu", () => {
    const groups = groupedSurfaces();
    expect(groups.map((g) => g.group)).toEqual([
      "This Week",
      "Team",
      "Trade",
      "League",
      "Menu",
    ]);
    const all = groups.flatMap((g) => g.items);
    expect(all.length).toBe(ALL_SURFACES.length);
    expect(new Set(all.map((s) => s.href)).size).toBe(ALL_SURFACES.length);
  });
});
