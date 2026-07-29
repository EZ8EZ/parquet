import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import { buildDossier, getAllDossiers } from "./index";
import { MANAGERS } from "../providers/fixture/data";

const rosterFor = (archetype: string) =>
  MANAGERS.findIndex((m) => m.archetype === archetype) + 1;

describe("manager dossiers", () => {
  const h = buildFixtureHistory();

  it("produces a dossier for every non-user manager", () => {
    const all = getAllDossiers(h);
    expect(all.length).toBe(h.rosters.length - 1);
    for (const d of all) {
      expect(d.read.length).toBeGreaterThan(0);
      expect(d.approachTips.length).toBeGreaterThan(0);
    }
  });

  it("flags the pick hoarder", () => {
    const d = buildDossier(h, rosterFor("hoarder"));
    expect(d.profile.picks.net).toBeGreaterThan(0);
    expect(d.tags.join(" ")).toMatch(/hoarder|Pick/i);
  });

  it("flags the ghost as inactive", () => {
    const d = buildDossier(h, rosterFor("ghost"));
    expect(d.profile.totalTransactions).toBeLessThanOrEqual(3);
    expect(d.tags.join(" ")).toMatch(/Ghost|Never trades|Rarely/i);
  });

  it("flags the churner as high-volume", () => {
    const d = buildDossier(h, rosterFor("churner"));
    expect(d.profile.trades).toBeGreaterThanOrEqual(8);
    expect(d.tags.join(" ")).toMatch(/High-volume|Initiator/i);
  });

  it("flags the name chaser as paying up for veterans", () => {
    const d = buildDossier(h, rosterFor("name-chaser"));
    expect(d.tags.join(" ")).toMatch(/Name chaser|Deadline/i);
  });

  it("distinguishes initiators from responders", () => {
    const churner = buildDossier(h, rosterFor("churner"));
    // A churner initiates most of their own trades.
    expect(churner.profile.tradesInitiated).toBeGreaterThan(0);
  });
});
