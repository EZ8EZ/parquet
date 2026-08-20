import { describe, expect, it } from "vitest";
import {
  CHART_POSITIONS,
  chartRefusal,
  depthChartFor,
  depthChartsByTeam,
  depthLineFor,
  normalizeTeam,
  PROVIDER_PAIRS_POSITION_AND_ORDER,
  standingFor,
  standingRefusal,
  teamsPresent,
  unplacedRefusal,
} from "./index.js";
import { refusalSentence } from "../refusal.js";
/**
 * The fixtures below are not invented shapes - each one is a case taken off the live
 * `/players/nba` payload (measured 2026-08-20, 593 on-team players, 149 (team,
 * position) groups) and reduced to the smallest list that reproduces it:
 *
 *   LAL C  -> 1, 2, 5           non-contiguous, the most common shape (117 of 149)
 *   LAL SF -> 2, 2, 3, 4        a duplicate AND no order 1 at all (44 and 18 groups)
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
/**
 * THE FOUR SHAPES THE RUNGS HAVE TO SURVIVE, each one lifted whole off the live payload
 * (2026-08-20) with the real team, the real position, the real names and the real
 * orders. Named after the shape rather than after an abstract case, because the point of
 * each is the arithmetic the provider actually emitted, not a category we invented:
 *
 *   LAL C  -> 1, 2, 5        non-contiguous WITH an order 1. Three rungs, not five.
 *   MEM PF -> 2, 2, 3        tied at the FRONT and no order 1 anywhere in the group.
 *   CHI C  -> 1, 1, 2        tied at the very front, so "the starter" is two people.
 *   MEM C  -> 1, 2, 2, 5, 5  two separate ties AND two gaps in the same group.
 *
 * A pure two-man `1, 1` group does not exist in the live payload - the tied-at-the-front
 * groups all carry a third man - so `CHI C` is the real shape and the two-man version is
 * not pinned, because pinning a shape the provider does not emit is how a suite ends up
 * validating an implementation against a case that cannot happen. `CHA PF -> 2, 2, 2, 3`
 * is here too: three men on ONE rung is the widest rung the payload contains, and it is
 * the case that decides whether a rung can lay out at all at 390px.
 */
const REAL = [
  // LAL C: 1, 2, 5. Non-contiguous, has an order 1.
  ["LAL", "C", "Walker Kessler", "C", 1],
  ["LAL", "C", "Sandro Mamukelashvili", "C", 2],
  ["LAL", "C", "Kevon Looney", "C", 5],
  // MEM PF: 2, 2, 3. Tied at the front, NO order 1 at all. Hendricks is listed C.
  ["MEM", "PF", "Jerami Grant", "PF", 2],
  ["MEM", "PF", "Taylor Hendricks", "C", 2],
  ["MEM", "PF", "GG Jackson", "PF", 3],
  // MEM C: 1, 2, 2, 5, 5. Two ties and two gaps in one group.
  ["MEM", "C", "Zach Edey", "C", 1],
  ["MEM", "C", "Isaiah Stewart", "C", 2],
  ["MEM", "C", "Olivier-Maxence Prosper", "C", 2],
  ["MEM", "C", "Quinten Post", "C", 5],
  ["MEM", "C", "Taj Gibson", "C", 5],
  // CHI C: 1, 1, 2. Tied at the very front.
  ["CHI", "C", "Jalen Smith", "C", 1],
  ["CHI", "C", "Nic Claxton", "C", 1],
  ["CHI", "C", "Zach Collins", "C", 2],
  // CHA PF: 2, 2, 2, 3. The widest rung in the payload, and no order 1.
  ["CHA", "PF", "Dorian Finney-Smith", "PF", 2],
  ["CHA", "PF", "Grant Williams", "PF", 2],
  ["CHA", "PF", "Royce O'Neale", "PF", 2],
  ["CHA", "PF", "Tidjane Salaün", "PF", 3],
].map(([team, chartPos, fullName, listed, order], i) =>
  player({
    playerId: `real${i}`,
    fullName,
    team,
    position: listed,
    depthChartPosition: chartPos,
    depthChartOrder: order,
  }),
);
/** @param {string} team @param {string} pos */
function realGroup(team, pos) {
  const g = depthChartFor(REAL, team).groups.find((x) => x.position === pos);
  if (!g) throw new Error(`no ${team} ${pos} group`);
  return g;
}
/** The rungs as plain data: one array of names per rung, ascending. */
const rungNames = (g) => g.layers.map((l) => l.map((e) => e.name));
describe("the real shapes - rungs, not rows", () => {
  it("LAL C (1, 2, 5) draws THREE rungs and never five slots", () => {
    const g = realGroup("LAL", "C");
    // The gap between 2 and 5 is not a rung. Five rungs with two empty would say two
    // players are missing from this group, and none is: the integer is not a count.
    expect(g.layers).toHaveLength(3);
    expect(rungNames(g)).toEqual([
      ["Walker Kessler"],
      ["Sandro Mamukelashvili"],
      ["Kevon Looney"],
    ]);
    // Rungs ascend by the STATED order, and the stated orders are what they were.
    expect(g.layers.map((l) => l[0].order)).toEqual([1, 2, 5]);
    expect(g.unordered).toEqual([]);
  });
  it("MEM PF (2, 2, 3) has no order 1, so the top rung holds TWO men and no starter", () => {
    const g = realGroup("MEM", "PF");
    expect(rungNames(g)).toEqual([
      // Alphabetical within the rung, which claims nothing (see `byDepth`).
      ["Jerami Grant", "Taylor Hendricks"],
      ["GG Jackson"],
    ]);
    // THE CASE THE WHOLE REDESIGN IS FOR. Sleeper never called anybody first here, so
    // there is nobody for a "starter" row to hold and nobody for a first-row accent to
    // point at - and the two men on the top rung are level, not first and second.
    expect(g.layers[0]).toHaveLength(2);
    expect(g.layers[0].every((e) => e.order === 2)).toBe(true);
    expect(g.entries.some((e) => e.order === 1)).toBe(false);
    // And the chart's position wins over the listed one: Hendricks is a listed C.
    const hendricks = g.entries.find((e) => e.name === "Taylor Hendricks");
    expect(hendricks?.offPosition).toBe(true);
    expect(hendricks?.chartPosition).toBe("PF");
  });
  it("CHI C (1, 1, 2) is tied at the very front - 'the starter' is two people", () => {
    const g = realGroup("CHI", "C");
    expect(rungNames(g)).toEqual([
      ["Jalen Smith", "Nic Claxton"],
      ["Zach Collins"],
    ]);
    expect(g.layers[0]).toHaveLength(2);
    // There IS an order 1 here and it still cannot produce one starter, which is why
    // "has an order 1" was never the condition worth branching on.
    expect(g.layers[0].every((e) => e.order === 1)).toBe(true);
    const [a, b] = g.layers[0];
    expect(standingFor(depthChartFor(REAL, "CHI"), a.playerId)?.level).toEqual([
      b,
    ]);
    expect(standingFor(depthChartFor(REAL, "CHI"), b.playerId)?.level).toEqual([
      a,
    ]);
  });
  it("MEM C (1, 2, 2, 5, 5) draws three rungs from five players", () => {
    const g = realGroup("MEM", "C");
    expect(rungNames(g)).toEqual([
      ["Zach Edey"],
      ["Isaiah Stewart", "Olivier-Maxence Prosper"],
      ["Quinten Post", "Taj Gibson"],
    ]);
    expect(g.layers.map((l) => l[0].order)).toEqual([1, 2, 5]);
    // Two ties and two gaps, and the rungs are still evenly spaced by construction:
    // the surface receives three arrays and has no integer to space them by.
    expect(g.layers).toHaveLength(3);
    expect(g.entries).toHaveLength(5);
  });
  it("CHA PF (2, 2, 2, 3) puts three men on one rung", () => {
    const g = realGroup("CHA", "PF");
    expect(rungNames(g)).toEqual([
      ["Dorian Finney-Smith", "Grant Williams", "Royce O'Neale"],
      ["Tidjane Salaün"],
    ]);
    expect(g.layers[0]).toHaveLength(3);
    expect(g.entries.some((e) => e.order === 1)).toBe(false);
  });
  it("layers.length < entries.length on exactly the groups that carry a tie", () => {
    // The assertion the redesign turns on: 44 of the live 149 groups are in this
    // state, and on every one of them a flat list of rows would have drawn more
    // rungs than the source stated distinct orders for.
    for (const [team, pos] of [
      ["MEM", "PF"],
      ["CHI", "C"],
      ["MEM", "C"],
      ["CHA", "PF"],
    ]) {
      const g = realGroup(team, pos);
      expect(g.layers.length).toBeLessThan(g.entries.length);
    }
    // And equal, never less, on a group with no tie at all.
    const lal = realGroup("LAL", "C");
    expect(lal.layers.length).toBe(lal.entries.length);
  });
  it("every rung holds exactly one stated order, and rungs strictly ascend", () => {
    for (const team of ["LAL", "MEM", "CHI", "CHA"]) {
      for (const g of depthChartFor(REAL, team).groups) {
        const heads = g.layers.map((l) => {
          // One order per rung: a rung with two different orders on it would be
          // drawing two facts as one.
          expect(new Set(l.map((e) => e.order)).size).toBe(1);
          return l[0].order;
        });
        expect(heads).toEqual([...heads].sort((a, b) => a - b));
        expect(new Set(heads).size).toBe(heads.length);
        // The partition is total: no charted player is dropped, none is duplicated.
        expect(g.layers.flat().length + g.unordered.length).toBe(
          g.entries.length,
        );
      }
    }
  });
  it("has no field left that a surface could read as an ordinal", () => {
    const g = realGroup("MEM", "PF");
    // `contiguous` and `hasTies` are gone. Both were computed, neither was drawn, and
    // the second was a boolean that had to agree with the geometry to stay true.
    expect("contiguous" in g).toBe(false);
    expect("hasTies" in g).toBe(false);
    expect(Object.keys(g).sort()).toEqual([
      "entries",
      "layers",
      "position",
      "standard",
      "unordered",
    ]);
  });
});
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
    // His order is 2 and he is the only one. One rung, holding one man whom Sleeper
    // never called first - and nothing anywhere calls him first or second.
    expect(pf?.entries[0].order).toBe(2);
    expect(pf?.layers).toHaveLength(1);
    expect(pf?.layers[0][0].order).toBe(2);
  });
});
describe("non-contiguous orders - 117 of 149 live groups", () => {
  it("sorts by the order and never fills the gap", () => {
    const c = depthChartFor(LAL, "LAL").groups.find((g) => g.position === "C");
    expect(c?.entries.map((e) => e.order)).toEqual([1, 2, 5]);
    expect(c?.entries.map((e) => e.playerId)).toEqual(["c1", "c2", "c5"]);
    // Three stated orders, three rungs. The gap between 2 and 5 is not drawn.
    expect(c?.layers.map((l) => l.map((e) => e.playerId))).toEqual([
      ["c1"],
      ["c2"],
      ["c5"],
    ]);
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
  it("gives a tidy 1..n group one rung per player, which is the only case where that holds", () => {
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
    expect(g.layers).toHaveLength(2);
    expect(g.layers.length).toBe(g.entries.length);
    expect(g.unordered).toEqual([]);
  });
});
describe("duplicate orders - 44 live groups, 18 of them with no order 1", () => {
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
    // deliberately, so the sort cannot be misread as a ranking. The SHARED RUNG is
    // what says so now, and it says it in geometry rather than in a caption.
    const sf = depthChartFor(LAL, "LAL").groups.find(
      (g) => g.position === "SF",
    );
    expect(sf?.entries.map((e) => e.name)).toEqual([
      "Matisse Thybulle",
      "Ziaire Williams",
      "Jake LaRavia",
    ]);
    expect(sf?.layers.map((l) => l.map((e) => e.name))).toEqual([
      ["Matisse Thybulle", "Ziaire Williams"],
      ["Jake LaRavia"],
    ]);
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
    expect(
      depthLineFor(
        charts,
        LAL.find((p) => p.playerId === "none1"),
      ),
    ).toBe(null);
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
  it("is NO_RECORD, not SOURCE_GAP, for a player who is not on this team", () => {
    // THE CONFLATION THIS PASS FIXED. `c1` is a Laker and this is Seattle's chart, so
    // the old code returned a SOURCE_GAP announcing that Seattle's chart "places 0 of
    // its 0 players and he is one of the 0 it does not" - a sentence about a team he
    // has nothing to do with. Only the page's branch ORDER kept it off the screen.
    const r = standingRefusal(depthChartFor(LAL, "SEA"), "c1");
    expect(r.code).toBe("NO_RECORD");
    // Nothing is withheld because there is no figure about HIM to withhold: this
    // team's placement rate is not a fact about a player who was never on it.
    expect(r.withheld).toBeNull();
    expect(r.because).not.toMatch(/does not place|one of the/);
  });
  it("keeps the two nothings apart without help from the caller's branch order", () => {
    const lal = depthChartFor(LAL, "LAL");
    // On the team, absent from the chart.
    expect(standingRefusal(lal, "none1")?.code).toBe("SOURCE_GAP");
    // Not on the team at all. Same function, same chart, different code - and the
    // distinction now survives being called in either order, or only once.
    expect(standingRefusal(lal, "stranger")?.code).toBe("NO_RECORD");
    // Placed: still null, still the honest empty state.
    expect(standingRefusal(lal, "c1")).toBeNull();
  });
});
describe("chartRefusal - the whole team, as a code", () => {
  it("is null when the chart places anybody at all", () => {
    expect(chartRefusal(depthChartFor(LAL, "LAL"))).toBeNull();
  });
  it("is SOURCE_GAP with a 0-of-n figure when a team has players but no chart", () => {
    const roster = [
      player({ playerId: "a", team: "SAC" }),
      player({ playerId: "b", team: "SAC" }),
    ];
    const r = chartRefusal(depthChartFor(roster, "SAC"));
    expect(r?.code).toBe("SOURCE_GAP");
    // NOT withheld: the page header prints this very count, so claiming the register
    // declined to publish it would be a false statement on the same screen.
    expect(r?.withheld).toBeNull();
    expect(r?.because).toContain("none of this team's 2 players");
  });
  it("says so differently when there is no team in the payload either", () => {
    const r = chartRefusal(depthChartFor(LAL, "SEA"));
    expect(r?.code).toBe("SOURCE_GAP");
    expect(r?.withheld).toBeNull();
    expect(r?.because).toContain("no players on it");
  });
  it("grades nothing (D6)", () => {
    const r = chartRefusal(
      depthChartFor([player({ playerId: "a", team: "SAC" })], "SAC"),
    );
    expect(r?.because).not.toMatch(
      /\b(good|bad|worse|better|weak|strong|deep|thin|shallow)\b/i,
    );
  });
});
describe("unplacedRefusal - the section, not the player", () => {
  it("is null when the chart places everybody", () => {
    const all = [
      player({
        playerId: "a",
        team: "SAC",
        depthChartPosition: "PG",
        depthChartOrder: 1,
      }),
    ];
    expect(unplacedRefusal(depthChartFor(all, "SAC"))).toBeNull();
  });
  it("carries the same code as the single-player case, counted once for the section", () => {
    const chart = depthChartFor(LAL, "LAL");
    const section = unplacedRefusal(chart);
    expect(section?.code).toBe("SOURCE_GAP");
    expect(section?.because).toContain("This player is on the roster");
    expect(section?.because).toContain("places 10 of the team's 11");
  });
  it("withholds nothing, because the page publishes the only figure it could withhold", () => {
    // `refusalSentence` prints "<label> would read <value>, and is not published" in
    // front of any withheld figure. With the placement rate attached, this section
    // announced that "8 of 10 is not published" a few hundred pixels under a header
    // reading "8 of 10 players placed" - the register contradicting the page.
    const r = unplacedRefusal(depthChartFor(LAL, "LAL"));
    expect(r?.withheld).toBeNull();
    expect(refusalSentence(r)).not.toContain("is not published");
  });
  it("counts one unplaced player in the singular", () => {
    const r = unplacedRefusal(depthChartFor(LAL, "LAL"));
    expect(r?.because).not.toContain("These 1");
    expect(r?.because).toContain("says nothing about him");
  });
});
describe("the provider's invariant, and the branch it makes unreachable", () => {
  it("is asserted rather than assumed", () => {
    expect(PROVIDER_PAIRS_POSITION_AND_ORDER).toBe(true);
  });
  it("keeps an order-less entry OFF the ladder if the provider ever emits one", () => {
    // Not a shape Sleeper produces - 0 of 593 on-team players carry a position without
    // an order. Pinned anyway, because the failure it prevents is silent: `null` sorts
    // below 1, so an implementation that read `order` as always-a-number would put
    // this man on the TOP rung of the group the day the provider changed.
    const partial = [
      player({
        playerId: "ord",
        team: "NYK",
        depthChartPosition: "PG",
        depthChartOrder: 3,
      }),
      player({
        playerId: "noord",
        team: "NYK",
        depthChartPosition: "PG",
        depthChartOrder: null,
      }),
    ];
    const g = depthChartFor(partial, "NYK").groups[0];
    // One rung, holding only the man with a stated order.
    expect(g.layers.map((l) => l.map((e) => e.playerId))).toEqual([["ord"]]);
    // He is a SIBLING of the rungs, never the last of them.
    expect(g.unordered.map((e) => e.playerId)).toEqual(["noord"]);
    // And still a member of the group for counting purposes.
    expect(g.entries).toHaveLength(2);
    expect(g.layers.flat()).not.toContainEqual(
      expect.objectContaining({ playerId: "noord" }),
    );
  });
});
