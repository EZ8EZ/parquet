import { describe, expect, it } from "vitest";
import {
  CHART_POSITIONS,
  depthChartFor,
  depthChartsByTeam,
  depthLineFor,
  normalizeTeam,
  standingFor,
  standingRefusal,
  teamsPresent,
} from "./index.js";
/**
 * The fixtures below are not invented shapes - each one is a case taken off the live
 * `/players/nba` payload (measured 2026-08-19, 593 on-team players, 149 (team,
 * position) groups) and reduced to the smallest list that reproduces it:
 *
 *   LAL C  -> 1, 2, 5           non-contiguous, the most common shape (116 of 149)
 *   LAL SF -> 2, 2, 3, 4        a duplicate AND no order 1 at all (43 and 18 groups)
 *   LAL PF -> 2                 a one-man group whose only order is not 1
 *   LAL PG -> Bronny James      listed SG, charted PG (120 of 474 are off-position)
 *
 * A test suite that only covered 1, 2, 3 would have passed against every wrong
 * implementation of this module.
 */
/**
 * @param {Partial<import('../providers/types.js').Player> & {playerId: string}} p
 * @returns {import('../providers/types.js').Player}
 */
function player(p) {
  return {
    playerId: p.playerId,
    fullName: p.fullName ?? `Player ${p.playerId}`,
    firstName: "",
    lastName: "",
    team: p.team ?? null,
    position: p.position ?? null,
    fantasyPositions: [],
    age: p.age ?? null,
    yearsExp: null,
    birthDate: null,
    injuryStatus: p.injuryStatus ?? null,
    injuryBodyPart: null,
    injuryNotes: null,
    depthChartPosition: p.depthChartPosition ?? null,
    depthChartOrder: p.depthChartOrder ?? null,
    newsUpdated: p.newsUpdated ?? null,
    status: "ACT",
    number: null,
    searchRank: p.searchRank ?? null,
    espnId: null,
  };
}
/** The real Lakers chart, trimmed to the four groups that carry a defect each. */
const LAL = [
  player({
    playerId: "pg1",
    fullName: "Luka Doncic",
    team: "LAL",
    position: "PG",
    depthChartPosition: "PG",
    depthChartOrder: 1,
    searchRank: 1,
  }),
  player({
    playerId: "pg2",
    fullName: "Quentin Grimes",
    team: "LAL",
    position: "PG",
    depthChartPosition: "PG",
    depthChartOrder: 2,
    searchRank: 90,
  }),
  // Listed SG, charted PG. The chart's position is the truth for this feature.
  player({
    playerId: "pg4",
    fullName: "Bronny James",
    team: "LAL",
    position: "SG",
    depthChartPosition: "PG",
    depthChartOrder: 4,
    searchRank: 400,
  }),
  // Centres come back 1, 2, 5 - the gap is in the source, not a missing player.
  player({
    playerId: "c1",
    fullName: "Walker Kessler",
    team: "LAL",
    position: "C",
    depthChartPosition: "C",
    depthChartOrder: 1,
  }),
  player({
    playerId: "c2",
    fullName: "Sandro Mamukelashvili",
    team: "LAL",
    position: "C",
    depthChartPosition: "C",
    depthChartOrder: 2,
  }),
  player({
    playerId: "c5",
    fullName: "Kevon Looney",
    team: "LAL",
    position: "C",
    depthChartPosition: "C",
    depthChartOrder: 5,
  }),
  // Two small forwards at 2, and nobody at 1.
  player({
    playerId: "sf2a",
    fullName: "Ziaire Williams",
    team: "LAL",
    position: "SF",
    depthChartPosition: "SF",
    depthChartOrder: 2,
  }),
  player({
    playerId: "sf2b",
    fullName: "Matisse Thybulle",
    team: "LAL",
    position: "SF",
    depthChartPosition: "SF",
    depthChartOrder: 2,
  }),
  player({
    playerId: "sf3",
    fullName: "Jake LaRavia",
    team: "LAL",
    position: "SF",
    depthChartPosition: "SF",
    depthChartOrder: 3,
  }),
  // The only listed power forward, and his order is 2.
  player({
    playerId: "pf2",
    fullName: "Jarred Vanderbilt",
    team: "LAL",
    position: "PF",
    depthChartPosition: "PF",
    depthChartOrder: 2,
  }),
  // On the team, no depth chart entry at all - 119 of 593 players, every night.
  player({
    playerId: "none1",
    fullName: "Nobody Charted",
    team: "LAL",
    position: "SG",
    searchRank: 700,
  }),
];
describe("depthChartFor - the shape of one team's chart", () => {
  it("groups by the CHART position, in the five's canonical order", () => {
    const chart = depthChartFor(LAL, "LAL");
    expect(chart.groups.map((g) => g.position)).toEqual([
      "PG",
      "SF",
      "PF",
      "C",
    ]);
    // SG is absent rather than empty: the team has no charted shooting guard, and an
    // empty group would render as a heading with nothing under it.
    expect(chart.groups.every((g) => g.entries.length > 0)).toBe(true);
    expect(CHART_POSITIONS).toEqual(["PG", "SG", "SF", "PF", "C"]);
  });
  it("counts the roster and the charted half separately", () => {
    const chart = depthChartFor(LAL, "LAL");
    expect(chart.rosterCount).toBe(11);
    expect(chart.chartedCount).toBe(10);
    expect(chart.unplaced.map((e) => e.playerId)).toEqual(["none1"]);
  });
  it("takes a team code in any case, and an empty one asks for nothing", () => {
    expect(depthChartFor(LAL, "lal").chartedCount).toBe(10);
    expect(depthChartFor(LAL, " LaL ").chartedCount).toBe(10);
    const nothing = depthChartFor(LAL, "");
    expect(nothing.groups).toEqual([]);
    expect(nothing.rosterCount).toBe(0);
    expect(normalizeTeam(null)).toBe("");
  });
  it("returns a well-formed chart for a team the payload has never heard of", () => {
    const chart = depthChartFor(LAL, "SEA");
    expect(chart.team).toBe("SEA");
    expect(chart.groups).toEqual([]);
    expect(chart.unplaced).toEqual([]);
    expect(chart.newestRecord).toBe(null);
  });
  it("survives an empty payload and a Map instead of an array", () => {
    expect(depthChartFor([], "LAL").rosterCount).toBe(0);
    const asMap = new Map(LAL.map((p) => [p.playerId, p]));
    expect(depthChartFor(asMap, "LAL").chartedCount).toBe(10);
  });
  it("handles a one-player team without pretending the order is a rank", () => {
    const chart = depthChartFor(LAL, "LAL");
    const pf = chart.groups.find((g) => g.position === "PF");
    expect(pf?.entries).toHaveLength(1);
    // His order is 2 and he is the only one. Contiguous means "1..n exactly", so a
    // lone 2 is NOT contiguous, and nothing anywhere calls him first or second.
    expect(pf?.entries[0].order).toBe(2);
    expect(pf?.contiguous).toBe(false);
  });
});
describe("non-contiguous orders - 116 of 149 live groups", () => {
  it("sorts by the order and never fills the gap", () => {
    const c = depthChartFor(LAL, "LAL").groups.find((g) => g.position === "C");
    expect(c?.entries.map((e) => e.order)).toEqual([1, 2, 5]);
    expect(c?.entries.map((e) => e.playerId)).toEqual(["c1", "c2", "c5"]);
    expect(c?.contiguous).toBe(false);
    expect(c?.hasTies).toBe(false);
  });
  it("counts a gap as no players, not as missing ones", () => {
    const chart = depthChartFor(LAL, "LAL");
    // The centre at order 5 has TWO players ahead of him, not four. Anything that
    // read the integer as a position in a list would say "5th of 3".
    const s = standingFor(chart, "c5");
    expect(s?.ahead.map((e) => e.playerId)).toEqual(["c1", "c2"]);
    expect(s?.behind).toEqual([]);
    expect(s?.groupSize).toBe(3);
  });
  it("flags a group as contiguous only when the orders really are 1..n", () => {
    const tidy = [
      player({
        playerId: "a",
        team: "BOS",
        depthChartPosition: "PG",
        depthChartOrder: 1,
      }),
      player({
        playerId: "b",
        team: "BOS",
        depthChartPosition: "PG",
        depthChartOrder: 2,
      }),
    ];
    const g = depthChartFor(tidy, "BOS").groups[0];
    expect(g.contiguous).toBe(true);
    expect(g.hasTies).toBe(false);
  });
});
describe("duplicate orders - 43 live groups, 18 of them with no order 1", () => {
  it("reports the pair as LEVEL rather than picking a winner", () => {
    const chart = depthChartFor(LAL, "LAL");
    const s = standingFor(chart, "sf2a");
    expect(s?.ahead).toEqual([]);
    expect(s?.level.map((e) => e.playerId)).toEqual(["sf2b"]);
    expect(s?.behind.map((e) => e.playerId)).toEqual(["sf3"]);
  });
  it("is symmetric - each of the tied pair sees the other as level", () => {
    const chart = depthChartFor(LAL, "LAL");
    const a = standingFor(chart, "sf2a");
    const b = standingFor(chart, "sf2b");
    expect(a?.level.map((e) => e.playerId)).toEqual(["sf2b"]);
    expect(b?.level.map((e) => e.playerId)).toEqual(["sf2a"]);
    expect(a?.behind.map((e) => e.playerId)).toEqual(
      b?.behind.map((e) => e.playerId),
    );
  });
  it("breaks the tie alphabetically, which claims nothing about either player", () => {
    // Matisse before Ziaire, and Ziaire is the better player by consensus rank -
    // deliberately, so the sort cannot be misread as a ranking. `hasTies` is what
    // the surface reads to say so out loud.
    const sf = depthChartFor(LAL, "LAL").groups.find((g) => g.position === "SF");
    expect(sf?.entries.map((e) => e.name)).toEqual([
      "Matisse Thybulle",
      "Ziaire Williams",
      "Jake LaRavia",
    ]);
    expect(sf?.hasTies).toBe(true);
  });
  it("nobody is ahead when the group's lowest order is a shared 2", () => {
    const chart = depthChartFor(LAL, "LAL");
    // The honest reading of "SF: 2, 2, 3" is that Sleeper lists nobody first at all.
    expect(standingFor(chart, "sf2a")?.ahead).toEqual([]);
    expect(standingFor(chart, "sf3")?.ahead).toHaveLength(2);
  });
});
describe("the chart position, not the listed position", () => {
  it("places a player where the CHART puts him and keeps his listed position as a fact", () => {
    const chart = depthChartFor(LAL, "LAL");
    const pg = chart.groups.find((g) => g.position === "PG");
    const bronny = pg?.entries.find((e) => e.playerId === "pg4");
    expect(bronny?.chartPosition).toBe("PG");
    expect(bronny?.listedPosition).toBe("SG");
    expect(bronny?.offPosition).toBe(true);
    // And he is NOT in an SG group, because the chart does not put him there.
    expect(chart.groups.some((g) => g.position === "SG")).toBe(false);
  });
  it("does not flag an on-position player, or one with no listed position at all", () => {
    const chart = depthChartFor(
      [
        player({
          playerId: "x",
          team: "MIA",
          position: null,
          depthChartPosition: "C",
          depthChartOrder: 1,
        }),
      ],
      "MIA",
    );
    expect(chart.groups[0].entries[0].offPosition).toBe(false);
    expect(chart.groups[0].entries[0].listedPosition).toBe(null);
  });
});
describe("positions and orders the five do not cover", () => {
  it("keeps a non-standard chart position rather than dropping the player", () => {
    const odd = [
      ...LAL,
      player({
        playerId: "g1",
        fullName: "Guard Guard",
        team: "LAL",
        position: "SG",
        depthChartPosition: "G",
        depthChartOrder: 1,
      }),
    ];
    const chart = depthChartFor(odd, "LAL");
    const positions = chart.groups.map((g) => g.position);
    // After the five, never mixed into them, and marked as not one of them.
    expect(positions).toEqual(["PG", "SF", "PF", "C", "G"]);
    expect(chart.groups.find((g) => g.position === "G")?.standard).toBe(false);
    expect(chart.chartedCount).toBe(11);
  });
  it("sorts several unexpected codes alphabetically after the five", () => {
    const odd = [
      player({
        playerId: "f",
        team: "UTA",
        depthChartPosition: "F",
        depthChartOrder: 1,
      }),
      player({
        playerId: "g",
        team: "UTA",
        depthChartPosition: "G",
        depthChartOrder: 1,
      }),
      player({
        playerId: "c",
        team: "UTA",
        depthChartPosition: "C",
        depthChartOrder: 1,
      }),
    ];
    expect(depthChartFor(odd, "UTA").groups.map((g) => g.position)).toEqual([
      "C",
      "F",
      "G",
    ]);
  });
  it("places a charted player with NO order last, and refuses to compare him", () => {
    const mixed = [
      player({
        playerId: "ordered",
        team: "NYK",
        depthChartPosition: "PG",
        depthChartOrder: 1,
      }),
      player({
        playerId: "unordered",
        team: "NYK",
        depthChartPosition: "PG",
        depthChartOrder: null,
      }),
    ];
    const chart = depthChartFor(mixed, "NYK");
    expect(chart.groups[0].entries.map((e) => e.playerId)).toEqual([
      "ordered",
      "unordered",
    ]);
    const s = standingFor(chart, "unordered");
    expect(s?.unplacedInOrder).toBe(true);
    // Being listed last in the group is NOT being behind anyone: the source gave
    // no order, so nothing can be said, and saying "last" would be the invention.
    expect(s?.ahead).toEqual([]);
    expect(s?.behind).toEqual([]);
    expect(s?.level).toEqual([]);
    // The ordered player sees him as neither ahead nor behind, only as unordered.
    const other = standingFor(chart, "ordered");
    expect(other?.behind).toEqual([]);
    expect(other?.unordered.map((e) => e.playerId)).toEqual(["unordered"]);
  });
  it("normalises a lowercase chart position instead of splitting the group", () => {
    const messy = [
      player({
        playerId: "a",
        team: "SAC",
        depthChartPosition: "pg",
        depthChartOrder: 1,
      }),
      player({
        playerId: "b",
        team: "SAC",
        depthChartPosition: "PG",
        depthChartOrder: 2,
      }),
    ];
    const chart = depthChartFor(messy, "SAC");
    expect(chart.groups).toHaveLength(1);
    expect(chart.groups[0].position).toBe("PG");
  });
});
describe("a player the payload puts on two teams", () => {
  const traded = [
    player({
      playerId: "moved",
      fullName: "Traded Guy",
      team: "MEM",
      depthChartPosition: "SG",
      depthChartOrder: 1,
      newsUpdated: 1_000,
    }),
    player({
      playerId: "moved",
      fullName: "Traded Guy",
      team: "PHX",
      depthChartPosition: "SG",
      depthChartOrder: 3,
      newsUpdated: 9_000,
    }),
    player({
      playerId: "stays",
      team: "MEM",
      depthChartPosition: "SG",
      depthChartOrder: 2,
    }),
  ];
  it("lists him on the team of the FRESHER record, and only there", () => {
    expect(
      depthChartFor(traded, "PHX").groups[0].entries.map((e) => e.playerId),
    ).toEqual(["moved"]);
    expect(
      depthChartFor(traded, "MEM").groups[0].entries.map((e) => e.playerId),
    ).toEqual(["stays"]);
  });
  it("never counts him twice on one team either", () => {
    const twice = [
      player({
        playerId: "dup",
        team: "ORL",
        depthChartPosition: "C",
        depthChartOrder: 1,
      }),
      player({
        playerId: "dup",
        team: "ORL",
        depthChartPosition: "C",
        depthChartOrder: 4,
      }),
    ];
    const chart = depthChartFor(twice, "ORL");
    expect(chart.rosterCount).toBe(1);
    expect(chart.groups[0].entries).toHaveLength(1);
  });
  it("falls back to the first record when neither is timestamped", () => {
    const undated = [
      player({ playerId: "d", team: "DEN", depthChartPosition: "PF" }),
      player({ playerId: "d", team: "DET", depthChartPosition: "PF" }),
    ];
    expect(depthChartFor(undated, "DEN").rosterCount).toBe(1);
    expect(depthChartFor(undated, "DET").rosterCount).toBe(0);
  });
});
describe("freshness, and the players with no entry", () => {
  it("reports the freshest and stalest charted record it was given", () => {
    const stamped = [
      player({
        playerId: "a",
        team: "TOR",
        depthChartPosition: "PG",
        depthChartOrder: 1,
        newsUpdated: 500,
      }),
      player({
        playerId: "b",
        team: "TOR",
        depthChartPosition: "PG",
        depthChartOrder: 2,
        newsUpdated: 9_999,
      }),
      // Untimestamped players narrow nothing and widen nothing.
      player({
        playerId: "c",
        team: "TOR",
        depthChartPosition: "PG",
        depthChartOrder: 3,
      }),
    ];
    const chart = depthChartFor(stamped, "TOR");
    expect(chart.newestRecord).toBe(9_999);
    expect(chart.oldestRecord).toBe(500);
  });
  it("orders the unplaced by Sleeper's own rank, and never invents a slot for them", () => {
    const unplaced = [
      player({ playerId: "low", team: "CHI", searchRank: 900 }),
      player({ playerId: "high", team: "CHI", searchRank: 12 }),
      player({ playerId: "none", team: "CHI", searchRank: null }),
    ];
    const chart = depthChartFor(unplaced, "CHI");
    expect(chart.groups).toEqual([]);
    expect(chart.unplaced.map((e) => e.playerId)).toEqual([
      "high",
      "low",
      "none",
    ]);
    expect(chart.chartedCount).toBe(0);
    expect(chart.rosterCount).toBe(3);
  });
});
describe("standingFor - the honest empty state", () => {
  it("returns null for a player this chart does not place", () => {
    const chart = depthChartFor(LAL, "LAL");
    expect(standingFor(chart, "none1")).toBe(null);
    expect(standingFor(chart, "not-a-player")).toBe(null);
    expect(standingFor(chart, null)).toBe(null);
  });
  it("states ahead, level and behind for the ordinary case", () => {
    const chart = depthChartFor(LAL, "LAL");
    const s = standingFor(chart, "pg2");
    expect(s?.position).toBe("PG");
    expect(s?.ahead.map((e) => e.name)).toEqual(["Luka Doncic"]);
    expect(s?.level).toEqual([]);
    expect(s?.behind.map((e) => e.name)).toEqual(["Bronny James"]);
    expect(s?.unplacedInOrder).toBe(false);
  });
});
describe("teamsPresent and depthChartsByTeam", () => {
  it("names every team the payload has a player on, sorted, and nothing else", () => {
    const mixed = [
      ...LAL,
      player({ playerId: "fa", team: null }),
      player({ playerId: "bos", team: "bos" }),
    ];
    expect(teamsPresent(mixed)).toEqual(["BOS", "LAL"]);
  });
  it("builds the same chart per team as the one-team call", () => {
    const charts = depthChartsByTeam(LAL);
    expect([...charts.keys()]).toEqual(["LAL"]);
    expect(charts.get("LAL")).toEqual(depthChartFor(LAL, "LAL"));
  });
  it("gives a dense row four counts and no rank", () => {
    const charts = depthChartsByTeam(LAL);
    const bronny = LAL.find((p) => p.playerId === "pg4");
    expect(depthLineFor(charts, bronny)).toEqual({
      team: "LAL",
      position: "PG",
      ahead: 2,
      level: 0,
      behind: 0,
      unordered: 0,
      unplacedInOrder: false,
      offPosition: true,
      listedPosition: "SG",
    });
  });
  it("says nothing at all about a free agent or an unplaced player", () => {
    const charts = depthChartsByTeam(LAL);
    expect(depthLineFor(charts, LAL.find((p) => p.playerId === "none1"))).toBe(
      null,
    );
    expect(depthLineFor(charts, player({ playerId: "fa", team: null }))).toBe(
      null,
    );
    expect(depthLineFor(charts, null)).toBe(null);
    // A charted player whose team has no chart in this index (a stale link, a
    // payload that moved on) reads as nothing, never as a crash.
    expect(
      depthLineFor(
        charts,
        player({
          playerId: "elsewhere",
          team: "SEA",
          depthChartPosition: "PG",
          depthChartOrder: 1,
        }),
      ),
    ).toBe(null);
  });
});
describe("standingRefusal", () => {
  it("is null for a player the chart does place", () => {
    expect(standingRefusal(depthChartFor(LAL, "LAL"), "c1")).toBeNull();
  });
  it("is SOURCE_GAP for an on-team player the source omits, with the counts in it", () => {
    // `standingFor` returns null here, which is honest and unreadable: a null does
    // not survive an export, a count, or a screen reader (lib/refusal.js).
    const r = standingRefusal(depthChartFor(LAL, "LAL"), "none1");
    expect(r.code).toBe("SOURCE_GAP");
    expect(r.because).toContain("places 10 of its 11 players");
    expect(r.because).toContain("one of the 1 it does not");
    // The base rate is the number that tells a reader whether the gap is unusual.
    expect(r.withheld).toEqual({
      label: "Players the source places",
      value: "10 of 11",
    });
  });
  it("says nothing about the player, only about the payload (D6)", () => {
    const r = standingRefusal(depthChartFor(LAL, "LAL"), "none1");
    expect(r.because).toContain("gap in the source");
    expect(r.because).not.toMatch(
      /\b(good|bad|worse|better|weak|strong|deep|buried|irrelevant)\b/i,
    );
  });
  it("withholds nothing for a team the payload has never heard of", () => {
    const r = standingRefusal(depthChartFor(LAL, "SEA"), "c1");
    expect(r.code).toBe("SOURCE_GAP");
    expect(r.withheld).toBeNull();
  });
});
