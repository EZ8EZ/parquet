import { describe, expect, it } from "vitest";
import type { Dossier } from "./index";
import { generateApproachMessage } from "./message";

/**
 * The generator reads exactly four things off a dossier: the display name, the
 * trade count, the pick/acquisition figures it cites, and the tags. The fixture
 * fills only what the function's contract actually touches and casts the rest -
 * a full Dossier here would couple this test to profile fields the message
 * never reads.
 */
function dossier(opts: {
  name?: string;
  trades?: number;
  tradesPerSeason?: number;
  tags?: string[];
  picks?: { spent?: number; net?: number };
  avgAge?: number | null;
}): Dossier {
  return {
    profile: {
      displayName: opts.name ?? "Sam",
      trades: opts.trades ?? 10,
      picks: { spent: opts.picks?.spent ?? 0, net: opts.picks?.net ?? 0 },
      acquisitions: { avgAge: opts.avgAge ?? null },
    },
    tags: opts.tags ?? [],
    tradesPerSeason: opts.tradesPerSeason ?? 2,
  } as Dossier;
}

describe("generateApproachMessage", () => {
  it("greets the manager by name", () => {
    expect(generateApproachMessage(dossier({ name: "Jordan" }))).toContain(
      "Hey Jordan,",
    );
  });

  it("approaches a manager who has never traded differently, and gently", () => {
    const msg = generateApproachMessage(
      dossier({ trades: 0, tags: ["Never trades"] }),
    );
    expect(msg).toContain("haven't really been your thing");
    // The non-trader path must not cite trade habits they do not have.
    expect(msg).not.toContain("picks");
  });

  it("cites the actual number behind each tell", () => {
    expect(
      generateApproachMessage(
        dossier({ tags: ["Pick spender"], picks: { spent: 9 } }),
      ),
    ).toContain("(9 out the door so far)");
    expect(
      generateApproachMessage(
        dossier({ tags: ["Pick hoarder"], picks: { net: 4 } }),
      ),
    ).toContain("(+4 net)");
    expect(
      generateApproachMessage(dossier({ tags: ["Name chaser"], avgAge: 28.3 })),
    ).toContain("average 28.3y");
    expect(
      generateApproachMessage(
        dossier({ tags: ["High-volume trader"], tradesPerSeason: 6.5 }),
      ),
    ).toContain("~6.5 trades a season");
  });

  it("drops the parenthetical rather than citing a number it does not have", () => {
    const msg = generateApproachMessage(
      dossier({ tags: ["Youth builder"], avgAge: null }),
    );
    expect(msg).toContain("building young");
    expect(msg).not.toContain("(");
  });

  it("leads with the pick angle over the age angle when both tags are present", () => {
    // Layer order is the point: pick habits are the most specific, most
    // actionable read, so they win over the broader age appetite.
    const msg = generateApproachMessage(
      dossier({ tags: ["Name chaser", "Pick spender"], picks: { spent: 3 } }),
    );
    expect(msg).toContain("spending picks");
    expect(msg).not.toContain("proven names");
  });

  it("does not close every angle on the identical line", () => {
    const closers = new Set(
      [
        ["Pick spender"],
        ["Pick hoarder"],
        ["Name chaser"],
        ["High-volume trader"],
        [],
      ].map((tags) => {
        const msg = generateApproachMessage(dossier({ tags }));
        return msg.slice(msg.lastIndexOf(".") + 1).trim();
      }),
    );
    expect(closers.size).toBeGreaterThan(2);
  });

  it("still produces a sendable message with no recognized tags at all", () => {
    const msg = generateApproachMessage(dossier({ tags: ["Streamer"] }));
    expect(msg).toContain("Hey Sam,");
    expect(msg).toContain("deal to be made");
  });

  it("always ends on a question, the actual ask", () => {
    for (const tags of [[], ["Pick spender"], ["Never trades"], ["Youth builder"]]) {
      const msg = generateApproachMessage(
        dossier({ tags, trades: tags.includes("Never trades") ? 0 : 5 }),
      );
      expect(msg.endsWith("?")).toBe(true);
    }
  });

  it("uses no em or en dashes, per house style", () => {
    for (const tags of [[], ["Pick spender"], ["Name chaser"], ["High-volume trader"]]) {
      expect(generateApproachMessage(dossier({ tags }))).not.toMatch(/[–—]/);
    }
  });
});
