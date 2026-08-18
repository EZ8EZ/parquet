import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory.js";
import { getPrincipals } from "../principals.js";
import { leagueValueRanking } from "../roster.js";
import { spofOfPlayers, startableRosterIds } from "../metrics/fragility.js";
import {
  fragilityNoteFor,
  packageFragilityNote,
  rosterAfter,
  SPOF_SHIFT_MIN,
} from "./fragility.js";
import { findTrades } from "./index.js";
const h = buildFixtureHistory();
const ME = h.me.rosterId;
function read(name, damageShare, playerId = name) {
  return {
    playerId,
    name,
    damage: Math.round(damageShare * 10000),
    damageShare,
    startableValue: 10000,
    depthBeyondStarters: 1,
  };
}
/** Every valued player in the league, by name, so a package can be written readably. */
const byName = new Map(
  leagueValueRanking(h).flatMap((r) => r.valued.map((v) => [v.name, v])),
);
function asset(name) {
  const v = byName.get(name);
  if (!v) throw new Error(`fixture has no player named ${name}`);
  return {
    kind: "player",
    id: v.playerId,
    label: name,
    value: v.value,
    age: v.age,
    position: v.position,
  };
}
describe("fragilityNoteFor", () => {
  it("reads a falling share as relief, and names both men when the load moves", () => {
    const note = fragilityNoteFor(
      read("Luka Doncic", 0.4),
      read("Scottie Barnes", 0.2),
    );
    expect(note?.direction).toBe("relieves");
    expect(note?.text).toContain("Scottie Barnes");
    expect(note?.text).toContain("Luka Doncic");
    expect(note?.text).toContain("20%");
  });
  it("reads a falling share on the SAME man as relief too", () => {
    const note = fragilityNoteFor(
      read("Luka Doncic", 0.4),
      read("Luka Doncic", 0.3),
    );
    expect(note?.direction).toBe("relieves");
    expect(note?.text).toContain("leans less");
  });
  it("reads a rising share as a point of failure being created", () => {
    const note = fragilityNoteFor(
      read("Luka Doncic", 0.25),
      read("Nikola Jokic", 0.45),
    );
    expect(note?.direction).toBe("creates");
    expect(note?.text).toContain("Nikola Jokic");
    expect(note?.text).toContain("45%");
  });
  /**
   * The threshold is the difference between a note worth reading and a note on every
   * package. A swap that moves the share by a point has not changed what the season
   * rides on, and saying so anyway would train the reader to skip the line.
   */
  it("says nothing when the share barely moves", () => {
    const below = SPOF_SHIFT_MIN / 2;
    expect(fragilityNoteFor(read("A", 0.4), read("A", 0.4 + below))).toBeNull();
    expect(fragilityNoteFor(read("A", 0.4), read("A", 0.4 - below))).toBeNull();
  });
  it("says nothing when either side of the comparison is missing", () => {
    expect(fragilityNoteFor(null, read("A", 0.4))).toBeNull();
    expect(fragilityNoteFor(read("A", 0.4), null)).toBeNull();
  });
  /** D6: a thesis, not a grade. Neither direction is allowed to render a verdict. */
  it("never grades the package in either direction", () => {
    const banned =
      /\b(good|bad|great|terrible|winner|loser|grade|avoid|do not make)\b/i;
    for (const note of [
      fragilityNoteFor(read("A", 0.4), read("B", 0.2)),
      fragilityNoteFor(read("A", 0.2), read("B", 0.4)),
    ]) {
      expect(note).not.toBeNull();
      expect(note.text).not.toMatch(banned);
    }
  });
});
describe("rosterAfter", () => {
  it("drops what you send and adds what you get", () => {
    expect(
      rosterAfter(["a", "b", "c"], [asAsset("b")], [asAsset("z")]).sort(),
    ).toEqual(["a", "c", "z"]);
  });
  /** A pick cannot fill a slot tonight, so it is not startable depth (see fragility.ts). */
  it("ignores incoming picks entirely", () => {
    const incomingPick = {
      kind: "pick",
      id: "2028-1-9",
      label: "2028 R1",
      value: 3000,
      age: null,
      position: null,
      pick: { round: 1, season: "2028", originalRosterId: 9 },
    };
    expect(rosterAfter(["a"], [], [incomingPick])).toEqual(["a"]);
  });
});
function asAsset(id) {
  return {
    kind: "player",
    id,
    label: id,
    value: 1000,
    age: 25,
    position: "SF",
  };
}
/**
 * Both directions against the REAL fixture league, on packages shaped like ones the
 * finder actually proposes. The synthetic tests above pin the wording; these pin that
 * the roster arithmetic underneath moves in the direction a manager would expect.
 */
describe("packageFragilityNote over the fixture league", () => {
  it("flags a consolidation as concentrating the season on one man", () => {
    const note = packageFragilityNote(
      h,
      ME,
      // Re-picked when the age curve was recalibrated from real NBA production
      // (lib/valuation/ageCurve.ts). The old package no longer concentrates anything
      // for a real reason rather than an incidental one: the measured curve is far
      // kinder to players past 32 than the hand-set one was, so this roster's veteran
      // tail now carries enough startable value to absorb losing three mid pieces.
      // The assertions below are unchanged - only the package that exercises them.
      [asset("Luka Doncic"), asset("Scottie Barnes"), asset("Franz Wagner")],
      [asset("Ja Morant")],
    );
    expect(note?.direction).toBe("creates");
    expect(note.after.damageShare).toBeGreaterThan(note.before.damageShare);
    // Three startable bodies out for one is the mechanism, so the depth has to fall.
    expect(note.after.depthBeyondStarters).toBeLessThan(
      note.before.depthBeyondStarters,
    );
  });
  it("flags selling the single point of failure as relief, and names his replacement", () => {
    const note = packageFragilityNote(
      h,
      ME,
      [asset("Luka Doncic")],
      [asset("Darius Garland"), asset("De'Aaron Fox")],
    );
    expect(note?.direction).toBe("relieves");
    expect(note.before.name).toBe("Luka Doncic");
    expect(note.after.name).not.toBe("Luka Doncic");
    expect(note.after.damageShare).toBeLessThan(note.before.damageShare);
  });
  it("says nothing about a swap of comparable pieces", () => {
    expect(
      // Also re-picked after the age-curve recalibration. Cunningham is now enough of
      // an upgrade on Barnes to move the single point of failure; Mitchell sits the
      // same distance the other side of him and is the genuinely comparable piece.
      packageFragilityNote(
        h,
        ME,
        [asset("Scottie Barnes")],
        [asset("Donovan Mitchell")],
      ),
    ).toBeNull();
  });
  it("measures the before-roster exactly as the index does", () => {
    const note = packageFragilityNote(h, ME, [asset("Luka Doncic")], []);
    const direct = spofOfPlayers(h, startableRosterIds(h, ME));
    expect(note?.before.playerId).toBe(direct?.playerId);
    expect(note?.before.damageShare).toBe(direct?.damageShare);
  });
  it("returns null for a roster that does not exist rather than throwing", () => {
    expect(
      packageFragilityNote(h, 9999, [], [asset("Luka Doncic")]),
    ).toBeNull();
  });
});
describe("findTrades attaches the note to every package", () => {
  it("carries a fragility field that is either a real note or an explicit null", async () => {
    const principals = await getPrincipals(h);
    const partner = h.rosters.find((r) => r.rosterId !== ME).rosterId;
    const result = findTrades(h, principals, {
      rosterId: ME,
      partnerRosterId: partner,
    });
    expect(result).not.toBeNull();
    for (const pkg of result.packages) {
      expect(pkg).toHaveProperty("fragility");
      if (pkg.fragility) {
        expect(["relieves", "creates"]).toContain(pkg.fragility.direction);
        // The note must describe THIS package, not a stale read of the roster.
        const recomputed = packageFragilityNote(h, ME, pkg.give, pkg.get);
        expect(recomputed?.text).toBe(pkg.fragility.text);
      }
    }
  });
});
