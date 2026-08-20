/**
 * THE RUNGS, RENDERED, against the shapes the live payload actually contains.
 *
 * `lib/depth/index.test.js` pins the `layers` DATA for these same five groups. This file
 * exists because the bug this redesign fixes was never in the data - the old surface had
 * `hasTies` available and correct, and still drew a stack of equal rows that read as a
 * ranking. What a reader concludes is a fact about the MARKUP, so the markup is what is
 * asserted here: how many rungs, who shares one, and above all that nothing distinguishes
 * the top rung from any other.
 *
 * The four shapes are the ones the dev-server fixture cannot produce. Measured against
 * the fixture, 0% of its groups have the no-order-1 case and 38% are non-contiguous;
 * measured against the live payload it is 18 of 149 and 117 of 149. A visual check on the
 * fixture would therefore have confirmed a layout that is wrong on exactly the groups
 * this component was rebuilt for, which is why these five fixtures are transcribed off
 * the live feed (2026-08-20) rather than taken from the dev data.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DepthLadder, OwnershipStrip } from "./DepthLadder.jsx";
import { depthChartFor } from "@/lib/depth";
/** @param {object} p */
function player(p) {
  return {
    playerId: p.playerId,
    fullName: p.fullName,
    firstName: "",
    lastName: "",
    team: p.team,
    position: p.position ?? null,
    fantasyPositions: [],
    age: null,
    yearsExp: null,
    birthDate: null,
    injuryStatus: null,
    injuryBodyPart: null,
    injuryNotes: null,
    depthChartPosition: p.depthChartPosition ?? null,
    depthChartOrder: p.depthChartOrder ?? null,
    newsUpdated: null,
    status: "ACT",
    number: null,
    searchRank: null,
    espnId: null,
  };
}
/** The five real groups, transcribed off `/players/nba`. */
const REAL = [
  ["LAL", "C", "Walker Kessler", "C", 1],
  ["LAL", "C", "Sandro Mamukelashvili", "C", 2],
  ["LAL", "C", "Kevon Looney", "C", 5],
  ["MEM", "PF", "Jerami Grant", "PF", 2],
  ["MEM", "PF", "Taylor Hendricks", "C", 2],
  ["MEM", "PF", "GG Jackson", "PF", 3],
  ["MEM", "C", "Zach Edey", "C", 1],
  ["MEM", "C", "Isaiah Stewart", "C", 2],
  ["MEM", "C", "Olivier-Maxence Prosper", "C", 2],
  ["MEM", "C", "Quinten Post", "C", 5],
  ["MEM", "C", "Taj Gibson", "C", 5],
  ["CHI", "C", "Jalen Smith", "C", 1],
  ["CHI", "C", "Nic Claxton", "C", 1],
  ["CHI", "C", "Zach Collins", "C", 2],
  ["CHA", "PF", "Dorian Finney-Smith", "PF", 2],
  ["CHA", "PF", "Grant Williams", "PF", 2],
  ["CHA", "PF", "Royce O'Neale", "PF", 2],
  ["CHA", "PF", "Tidjane Salaun", "PF", 3],
].map(([team, chartPos, fullName, listed, order], i) =>
  player({
    playerId: `p${i}`,
    fullName,
    team,
    position: listed,
    depthChartPosition: chartPos,
    depthChartOrder: order,
  }),
);
const noHolder = () => null;
const noHref = () => null;
/**
 * @param {string} team
 * @param {string} pos
 * @param {object} [opts]
 */
function draw(team, pos, opts = {}) {
  const group = depthChartFor(REAL, team).groups.find(
    (g) => g.position === pos,
  );
  if (!group) throw new Error(`no ${team} ${pos}`);
  return renderToStaticMarkup(
    <DepthLadder
      group={group}
      anchorId={opts.anchorId ?? null}
      holder={opts.holder ?? noHolder}
      valueHref={opts.valueHref ?? noHref}
    />,
  );
}
/** The rungs as they exist in the DOM: one entry per `<li>`, in document order. */
function rungs(html) {
  // Each rung is one <li>; the cells inside it are divs, so counting the names per
  // <li> is exactly "who shares a rung" as a reader sees it.
  return html
    .split("<li")
    .slice(1)
    .map((chunk) => {
      const li = chunk.split("</li>")[0];
      return [...li.matchAll(/leading-tight text-ink">(?:<a[^>]*>)?([^<]+)</g)].map((m) =>
        // React escapes the apostrophe in "Royce O'Neale" to `&#x27;`, correctly.
        m[1].replace(/&#x27;/g, "'").replace(/&amp;/g, "&"),
      );
    });
}
describe("the rungs a reader actually sees", () => {
  it("LAL C (1, 2, 5) renders THREE rungs, not five", () => {
    expect(rungs(draw("LAL", "C"))).toEqual([
      ["Walker Kessler"],
      ["Sandro Mamukelashvili"],
      ["Kevon Looney"],
    ]);
  });
  it("MEM PF (2, 2, 3) puts the tied pair in ONE li, so no row is above the other", () => {
    expect(rungs(draw("MEM", "PF"))).toEqual([
      ["Jerami Grant", "Taylor Hendricks"],
      ["GG Jackson"],
    ]);
  });
  it("CHI C (1, 1, 2) shares the front rung between two men", () => {
    expect(rungs(draw("CHI", "C"))).toEqual([
      ["Jalen Smith", "Nic Claxton"],
      ["Zach Collins"],
    ]);
  });
  it("MEM C (1, 2, 2, 5, 5) renders five men on three rungs", () => {
    expect(rungs(draw("MEM", "C"))).toEqual([
      ["Zach Edey"],
      ["Isaiah Stewart", "Olivier-Maxence Prosper"],
      ["Quinten Post", "Taj Gibson"],
    ]);
  });
  it("CHA PF (2, 2, 2, 3) fits three men on one rung", () => {
    expect(rungs(draw("CHA", "PF"))).toEqual([
      ["Dorian Finney-Smith", "Grant Williams", "Royce O'Neale"],
      ["Tidjane Salaun"],
    ]);
  });
});
describe("what the geometry refuses to say", () => {
  it("prints no order integer anywhere, on any shape", () => {
    for (const [team, pos] of [
      ["LAL", "C"],
      ["MEM", "PF"],
      ["CHI", "C"],
      ["MEM", "C"],
      ["CHA", "PF"],
    ]) {
      const html = draw(team, pos);
      // The stated orders for these groups include 1, 2, 3 and 5. None may appear as
      // a rendered number: a printed "5" beside the third of three men is the exact
      // "5th of 3" reading the module refuses.
      const text = html.replace(/<[^>]*>/g, " ");
      expect(text).not.toMatch(/\b[1-9]\b/);
    }
  });
  it("uses an unordered list, so a screen reader is not told 'item 1 of 3'", () => {
    const html = draw("MEM", "C");
    expect(html).toContain("<ul");
    expect(html).not.toContain("<ol");
  });
  it("gives the TOP rung no styling any other rung does not have", () => {
    // THE ASSERTION THIS WHOLE FILE IS FOR. On MEM PF and CHA PF the top rung holds
    // men Sleeper never called first, so any first-rung accent is a claim the source
    // does not make. Comparing the class attributes of the first and last rung is the
    // cheapest way to pin "there is no such thing as a first row here".
    for (const [team, pos] of [
      ["MEM", "PF"],
      ["CHA", "PF"],
      ["LAL", "C"],
      ["CHI", "C"],
    ]) {
      const html = draw(team, pos);
      const cells = [
        ...html.matchAll(/<div class="([^"]*basis-\[8rem\][^"]*)"/g),
      ].map((m) => m[1]);
      expect(cells.length).toBeGreaterThan(1);
      // Every cell in the ladder carries the identical ground when nobody owns
      // anybody and there is no anchor: no accent, no emphasis, no exception.
      expect(new Set(cells).size).toBe(1);
      expect(cells[0]).toContain("border-border");
      expect(cells[0]).not.toContain("accent");
    }
  });
  it("braces a shared rung, so a tie survives being wrapped into a column", () => {
    // The bug this pins. `basis` cells carrying full names do not always fit two to a
    // line at 390px; the first build let them wrap, which drew the tied pair as one
    // above the other - the exact stacked reading the rungs exist to prevent. The
    // brace encloses the rung, so the tie holds at any width.
    const brace = /inset-y-0 -left-1 w-px bg-border-strong/g;
    // MEM C: rung 1 is solo, rungs 2 and 3 are pairs -> two braces.
    expect(draw("MEM", "C").match(brace)).toHaveLength(2);
    // CHA PF: one triple, one solo -> one brace.
    expect(draw("CHA", "PF").match(brace)).toHaveLength(1);
    // LAL C: 1, 2, 5, no ties at all -> nothing to bracket.
    expect(draw("LAL", "C").match(brace)).toBeNull();
  });
  it("does not draw an axis for a single rung", () => {
    const solo = [
      player({
        playerId: "solo",
        fullName: "Only Man",
        team: "SAC",
        position: "PF",
        depthChartPosition: "PF",
        depthChartOrder: 2,
      }),
    ];
    const group = depthChartFor(solo, "SAC").groups[0];
    const html = renderToStaticMarkup(
      <DepthLadder
        group={group}
        anchorId={null}
        holder={noHolder}
        valueHref={noHref}
      />,
    );
    // One man on an order of 2. An axis with one tick would be drawing an ordering
    // nobody stated, and a proportional axis would draw an empty rung above him.
    expect(html).toContain("Only Man");
    expect(html).not.toContain("bg-border");
  });
});
describe("ownership, and the one place a colour is allowed", () => {
  const mine = () => ({ rosterId: 1, isMe: true, name: "You" });
  const rival = () => ({ rosterId: 2, isMe: false, name: "Rival" });
  it("marks the viewer's other players with the border and never the wash", () => {
    const html = draw("MEM", "C", { holder: mine });
    // `border-accent-edge bg-surface` is app/league/page.jsx's own treatment for the
    // viewer's row. The wash stays reserved for the anchor.
    expect(html).toContain("border-accent-edge bg-surface");
    expect(html).not.toContain("bg-accent-wash");
  });
  it("gives the anchor the wash, and aria-current, and no redundant tag", () => {
    const html = draw("MEM", "C", { anchorId: "p6" });
    expect(html).toContain("border-accent-edge bg-accent-wash");
    expect(html).toContain('aria-current="true"');
    // The "Him" pill is gone: the anchor is already named in the h2 above, washed,
    // and aria-current. A fifth marker was the redundancy, not the safety net.
    expect(html).not.toContain(">Him<");
  });
  it("gives rivals and free agents no chromatic treatment at all", () => {
    const rivals = draw("MEM", "C", { holder: rival });
    expect(rivals).not.toMatch(/border-accent|bg-accent/);
    const free = draw("MEM", "C");
    expect(free).not.toMatch(/border-accent|bg-accent/);
    // Ownership is still stated - in words, where it cannot read as a grade.
    expect(rivals).toContain("Rival");
    expect(free).toContain("not held in this league");
  });
});
describe("the ownership strip", () => {
  const entries = (n) =>
    Array.from({ length: n }, (_, i) => ({ playerId: `s${i}`, name: `N${i}` }));
  it("draws one mark per charted player and states the count in words", () => {
    const html = renderToStaticMarkup(
      <OwnershipStrip
        entries={entries(4)}
        holder={(id) =>
          id === "s0"
            ? { rosterId: 1, isMe: true, name: "You" }
            : id === "s1"
              ? { rosterId: 2, isMe: false, name: "R" }
              : null
        }
      />,
    );
    // A strip of marks is not a reading on its own (D47 rule 1), so the count is the
    // accessible name and the marks are aria-hidden.
    expect(html).toContain(
      'aria-label="2 of 4 held in this league, 1 on your roster"',
    );
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(4);
  });
  it("says so explicitly when the viewer holds none of them", () => {
    const html = renderToStaticMarkup(
      <OwnershipStrip entries={entries(3)} holder={noHolder} />,
    );
    expect(html).toContain(
      'aria-label="0 of 3 held in this league, none on yours"',
    );
  });
  it("draws nothing for a one-man group, where a count is not a reading", () => {
    expect(
      renderToStaticMarkup(
        <OwnershipStrip entries={entries(1)} holder={noHolder} />,
      ),
    ).toBe("");
  });
});
