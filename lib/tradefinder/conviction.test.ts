import { describe, expect, it } from "vitest";
import type { Player } from "../providers/types";
import {
  CONVICTION_MIN_GAP,
  convictionIndex,
  convictionNotes,
  convictionSummary,
  MAX_CONVICTION_NOTES,
} from "./conviction";

function player(id: string, name: string, rank: number | null): Player {
  return {
    playerId: id,
    fullName: name,
    firstName: name.split(" ")[0],
    lastName: name.split(" ").slice(1).join(" "),
    team: "BOS",
    position: "SF",
    fantasyPositions: ["SF"],
    age: 25,
    yearsExp: 4,
    birthDate: null,
    injuryStatus: null,
    depthChartOrder: 1,
    status: "ACT",
    number: 0,
    searchRank: rank,
    espnId: null,
  };
}

/** A pool of `n` players with contiguous consensus ranks, ids p1..pn. */
function pool(n: number): Map<string, Player> {
  const m = new Map<string, Player>();
  for (let i = 1; i <= n; i++) m.set(`p${i}`, player(`p${i}`, `Player ${i}`, i));
  return m;
}

const asset = (id: string, label = id) => ({ kind: "player" as const, id, label });
const pick = (id: string) => ({ kind: "pick" as const, id, label: `${id} pick` });

describe("convictionIndex", () => {
  it("returns nothing for a viewer who has never ranked anyone", () => {
    expect(convictionIndex([], pool(30)).size).toBe(0);
  });

  it("reports a positive delta when you rate a player better than consensus", () => {
    const players = pool(30);
    // p20 dragged to the very top: your #1, consensus #20.
    const order = ["p20", ...[...players.keys()].filter((id) => id !== "p20")];
    const d = convictionIndex(order, players).get("p20")!;
    expect(d.yourRank).toBe(1);
    expect(d.consensusRank).toBe(20);
    expect(d.delta).toBe(19);
  });
});

describe("the four-way verdict", () => {
  const players = pool(60);
  // p40 to the top (you are 39 above consensus), p2 to the bottom (you are well below).
  const order = [
    "p40",
    ...[...players.keys()].filter((id) => id !== "p40" && id !== "p2"),
    "p2",
  ];
  const index = convictionIndex(order, players);

  it("supports the trade when you RECEIVE someone you rate above consensus", () => {
    const [n] = convictionNotes({ give: [], get: [asset("p40")] }, index);
    expect(n.side).toBe("get");
    expect(n.above).toBe(true);
    expect(n.verdict).toBe("supports");
    expect(n.text).toContain("buys him at consensus value");
    expect(n.text).toContain("below your own number");
  });

  it("questions the trade when you SEND someone you rate above consensus", () => {
    const [n] = convictionNotes({ give: [asset("p40")], get: [] }, index);
    expect(n.side).toBe("give");
    expect(n.above).toBe(true);
    expect(n.verdict).toBe("questions");
    expect(n.text).toContain("sends him out at consensus value");
  });

  it("questions the trade when you RECEIVE someone you rate below consensus", () => {
    const [n] = convictionNotes({ give: [], get: [asset("p2")] }, index);
    expect(n.side).toBe("get");
    expect(n.above).toBe(false);
    expect(n.verdict).toBe("questions");
    expect(n.text).toContain("above your own number");
  });

  it("supports the trade when you SEND someone you rate below consensus", () => {
    const [n] = convictionNotes({ give: [asset("p2")], get: [] }, index);
    expect(n.side).toBe("give");
    expect(n.above).toBe(false);
    expect(n.verdict).toBe("supports");
  });

  it("names the same player on both sides of the two-by-two with opposite verdicts", () => {
    // The whole point of the matrix: an identical rank gap is good news or bad news
    // purely as a function of which way the player is moving.
    const [recv] = convictionNotes({ give: [], get: [asset("p40")] }, index);
    const [sent] = convictionNotes({ give: [asset("p40")], get: [] }, index);
    expect(recv.gap).toBe(sent.gap);
    expect(recv.verdict).not.toBe(sent.verdict);
  });
});

describe("what is deliberately NOT reported", () => {
  it("says nothing at all when the viewer has no ranking on record", () => {
    expect(
      convictionNotes({ give: [asset("p1")], get: [asset("p2")] }, new Map()),
    ).toEqual([]);
  });

  it("stays silent below the meaningful-gap threshold", () => {
    const players = pool(60);
    // Swap two adjacent players: a real but trivial one-place disagreement.
    const ids = [...players.keys()];
    const order = [...ids];
    [order[10], order[11]] = [order[11], order[10]];
    const index = convictionIndex(order, players);
    expect(convictionNotes({ give: [], get: [asset(order[10])] }, index)).toEqual([]);
  });

  it("NEVER fabricates a gap from an untouched board, even with ties and holes in consensus", () => {
    // This is the real calibration trap. Consensus ranks as this app actually
    // receives them are not contiguous: in the live corpus two players share rank
    // 46, two share 73, and 107 is missing entirely. A viewer's position in the
    // pool therefore drifts from consensus rank by a place or two through nobody's
    // opinion. Reporting that drift would be inventing the exact signal this
    // feature exists to report honestly, so the threshold has to clear it.
    const m = new Map<string, Player>();
    const ranks: number[] = [];
    for (let i = 1; i <= 120; i++) {
      // Reproduce the live shape: duplicate at 46 and 73, nothing at 107.
      let r = i;
      if (i > 46) r = i - 1;
      if (i > 73) r = i - 2;
      if (i > 107) r = i - 1;
      ranks.push(r);
      m.set(`p${i}`, player(`p${i}`, `Player ${i}`, r));
    }
    // Confirm the fixture really does contain the pathology before relying on it.
    expect(new Set(ranks).size).toBeLessThan(ranks.length);

    const untouched = [...m.keys()];
    const index = convictionIndex(untouched, m);
    // Every single player, both sides. Nothing may surface.
    for (const id of untouched) {
      expect(convictionNotes({ give: [asset(id)], get: [] }, index)).toEqual([]);
      expect(convictionNotes({ give: [], get: [asset(id)] }, index)).toEqual([]);
    }
  });

  it("skips picks, which have no consensus player rank to disagree with", () => {
    const players = pool(60);
    const order = ["p40", ...[...players.keys()].filter((id) => id !== "p40")];
    const index = convictionIndex(order, players);
    const notes = convictionNotes({ give: [pick("2027-1-3")], get: [pick("2028-1-5")] }, index);
    expect(notes).toEqual([]);
  });

  it("skips a player the viewer never ranked, rather than treating unranked as agreement", () => {
    const players = pool(60);
    // A ranking that covers only the top handful, as a real short list would.
    const index = convictionIndex(["p5", "p1", "p2"], players);
    expect(convictionNotes({ give: [], get: [asset("p59")] }, index)).toEqual([]);
  });
});

describe("ordering and caps", () => {
  const players = pool(120);
  const order = [
    "p60", // 59 above consensus
    "p30", // 28 above
    "p20", // 17 above
    ...[...players.keys()].filter((id) => !["p60", "p30", "p20"].includes(id)),
  ];
  const index = convictionIndex(order, players);

  it("leads with the biggest gap", () => {
    const notes = convictionNotes(
      { give: [], get: [asset("p20"), asset("p60"), asset("p30")] },
      index,
    );
    expect(notes.map((n) => n.playerId)).toEqual(["p60", "p30", "p20"]);
  });

  it("caps the notes so the block stays a supporting read", () => {
    const many = [...players.keys()].slice(0, 40).map((id) => asset(id));
    const notes = convictionNotes({ give: [], get: many }, index);
    expect(notes.length).toBeLessThanOrEqual(MAX_CONVICTION_NOTES);
  });

  it("honours an explicit threshold override", () => {
    const notes = convictionNotes(
      { give: [], get: [asset("p20")] },
      index,
      { minGap: CONVICTION_MIN_GAP * 100 },
    );
    expect(notes).toEqual([]);
  });
});

describe("convictionSummary", () => {
  const players = pool(120);
  const index = convictionIndex(
    ["p60", ...[...players.keys()].filter((id) => id !== "p60")],
    players,
  );

  it("is null with nothing to say", () => {
    expect(convictionSummary([])).toBeNull();
  });

  it("leads with a warning rather than burying it, when the warning is the bigger gap", () => {
    // A package that quietly sells a player you rate 59 places above consensus is
    // the most useful thing this feature can say, so it must not be outranked by a
    // supporting note just because supporting news reads better.
    const notes = convictionNotes({ give: [asset("p60")], get: [] }, index);
    const summary = convictionSummary(notes)!;
    expect(summary.verdict).toBe("questions");
    expect(summary.text).toContain("Your ranking questions this");
    expect(summary.text).toContain("you would be sending him");
  });

  it("says so plainly when your own board backs the trade", () => {
    const notes = convictionNotes({ give: [], get: [asset("p60")] }, index);
    const summary = convictionSummary(notes)!;
    expect(summary.verdict).toBe("supports");
    expect(summary.text).toContain("Your ranking backs this");
    expect(summary.text).toContain("you would be getting him");
  });
});

describe("house style", () => {
  it("uses no em or en dashes in any generated prose", () => {
    const players = pool(120);
    const index = convictionIndex(
      ["p60", "p90", ...[...players.keys()].filter((id) => !["p60", "p90"].includes(id))],
      players,
    );
    const notes = convictionNotes(
      { give: [asset("p60")], get: [asset("p90")] },
      index,
    );
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.text).not.toMatch(/[–—]/);
    }
    expect(convictionSummary(notes)!.text).not.toMatch(/[–—]/);
  });

  it("pluralises a one-place gap correctly if the threshold is lowered", () => {
    const players = pool(60);
    const ids = [...players.keys()];
    const order = [...ids];
    [order[10], order[11]] = [order[11], order[10]];
    const index = convictionIndex(order, players);
    const [n] = convictionNotes({ give: [], get: [asset(order[10])] }, index, {
      minGap: 1,
    });
    expect(n.gap).toBe(1);
    expect(n.text).toContain("1 spot above");
    expect(n.text).not.toContain("1 spots");
  });
});
