import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import { getPrincipals } from "../principals";
import { titlesByOwner, seasonResults } from "../playoffs";
import { titleSummary, titleSummariesByOwner } from "./titles";

describe("titleSummary", () => {
  it("is null for no titles - silence, not a zero", () => {
    expect(titleSummary([])).toBeNull();
  });

  it("labels a single title with just the season", () => {
    expect(titleSummary(["2024"])).toEqual({
      count: 1,
      seasons: ["2024"],
      label: "2024 champion",
    });
  });

  it("labels multiple titles with a count and the full list, sorted ascending", () => {
    // Deliberately passed out of order to prove it sorts rather than trusting input.
    expect(titleSummary(["2025", "2022"])).toEqual({
      count: 2,
      seasons: ["2022", "2025"],
      label: "2x champion (2022, 2025)",
    });
  });
});

describe("titleSummariesByOwner", () => {
  const h = buildFixtureHistory();

  it("omits owners with no titles entirely, rather than a zero-count entry", async () => {
    const principals = await getPrincipals(h);
    const byOwner = titleSummariesByOwner(h, principals);
    for (const pr of principals.principals) {
      if (!byOwner.has(pr.ownerId)) continue;
      expect(byOwner.get(pr.ownerId)!.count).toBeGreaterThan(0);
    }
    // Every principal without an entry genuinely has zero titles per titlesByOwner.
    const rawByOwner = titlesByOwner(h, principals);
    for (const pr of principals.principals) {
      if (byOwner.has(pr.ownerId)) continue;
      expect(rawByOwner.get(pr.ownerId)?.length ?? 0).toBe(0);
    }
  });

  it("agrees with titlesByOwner on total titles awarded", async () => {
    const principals = await getPrincipals(h);
    const byOwner = titleSummariesByOwner(h, principals);
    const total = [...byOwner.values()].reduce((n, s) => n + s.count, 0);
    expect(total).toBe(seasonResults(h).length);
  });

  it("never credits the current, undecided season", async () => {
    const principals = await getPrincipals(h);
    const byOwner = titleSummariesByOwner(h, principals);
    for (const s of byOwner.values()) {
      expect(s.seasons).not.toContain(h.currentLeague.season);
    }
  });
});
