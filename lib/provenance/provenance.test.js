import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory.js";
import { buildAssetMoves, buildHoldings } from "../tradegraph/index.js";
import { buildPrincipals } from "../principals.js";
import { REASON_TEXT } from "../lineage/index.js";
import {
  buildProvenance,
  indexMovesByAsset,
  ORIGIN_TEXT,
  parsePickKey,
} from "./index.js";
import {
  chainSummary,
  daysFormatter,
  formatDaysPair,
  formatGap,
  hopNotes,
  repeatHolders,
} from "../../components/ProvenanceRail";
const DAY = 86_400_000;
const T0 = Date.UTC(2022, 9, 1);
const at = (days) => T0 + days * DAY;
/**
 * A hand-built context. Nothing here touches a provider - the whole point of keeping
 * the walk pure is that the interesting shapes (a pick bought back, a player signed
 * off waivers after a trade, a chain that crosses a draft) can be stated in ten lines
 * rather than reverse-engineered out of fixture data.
 */
function move(p) {
  return {
    id: `${p.tradeId ?? "t"}|${p.assetKey}`,
    kind: p.assetKey.startsWith("k:") ? "pick" : "player",
    label: p.label ?? p.assetKey,
    became: null,
    tradeId: p.tradeId ?? "t",
    season: p.season ?? "2023",
    week: p.week ?? 1,
    fromOwnerId: p.fromOwnerId ?? null,
    toOwnerId: p.toOwnerId ?? null,
    ...p,
  };
}
function ctxOf(over = {}) {
  return {
    moves: [],
    holdings: {},
    draftedFrom: {},
    playerOfPick: {},
    signings: {},
    names: { 1: "Alpha", 2: "Bravo", 3: "Charlie" },
    ownerNames: { u1: "Alpha", u2: "Bravo", u3: "Charlie" },
    playerNames: { p9: "Nine Player" },
    recordStart: T0,
    pendingPickText: REASON_TEXT["no-draft"],
    ...over,
  };
}
describe("the backwards walk", () => {
  it("is a chain: every hop of an asset appears once, oldest first", () => {
    const ctx = ctxOf({
      moves: [
        move({
          assetKey: "p:p9",
          from: 1,
          to: 2,
          created: at(10),
          tradeId: "A",
        }),
        move({
          assetKey: "p:p9",
          from: 2,
          to: 3,
          created: at(40),
          tradeId: "B",
        }),
      ],
      holdings: { p9: 3 },
    });
    const chain = buildProvenance(ctx, "p:p9");
    expect(chain.hops).toBe(2);
    const hops = chain.events.filter((e) => e.node === "hop");
    expect(hops.map((h) => h.tradeId)).toEqual(["A", "B"]);
    expect(hops.map((h) => h.to)).toEqual([2, 3]);
    // Oldest first, terminus last.
    expect(chain.events[0].node).toBe("origin");
    expect(chain.today.rosterId).toBe(3);
  });
  it("stops at the acquisition that actually put the asset here, not at every trade", () => {
    // Traded 1 -> 2, dropped, then signed off waivers by 3. The trade is NOT how
    // roster 3 came to hold him, and a chain that walked it anyway would be telling a
    // story about somebody else's roster.
    const ctx = ctxOf({
      moves: [move({ assetKey: "p:p9", from: 1, to: 2, created: at(10) })],
      holdings: { p9: 3 },
      signings: {
        p9: [
          {
            playerId: "p9",
            rosterId: 3,
            at: at(50),
            type: "waiver",
            transactionId: "w1",
          },
        ],
      },
    });
    const chain = buildProvenance(ctx, "p:p9");
    expect(chain.hops).toBe(0);
    expect(chain.events).toHaveLength(1);
    expect(chain.events[0]).toMatchObject({ node: "origin", reason: "waiver" });
  });
  it("prefers the LATER of a trade and a signing when both could explain a hop", () => {
    // Signed off waivers first, then traded in. The trade is the acquisition.
    const ctx = ctxOf({
      moves: [move({ assetKey: "p:p9", from: 1, to: 2, created: at(60) })],
      holdings: { p9: 2 },
      signings: {
        p9: [
          {
            playerId: "p9",
            rosterId: 1,
            at: at(20),
            type: "waiver",
            transactionId: "w",
          },
        ],
      },
    });
    const chain = buildProvenance(ctx, "p:p9");
    expect(chain.hops).toBe(1);
    // ...and the signing then explains how the GIVER had him.
    expect(chain.events[0]).toMatchObject({ node: "origin", reason: "waiver" });
  });
  it("crosses the draft: a player resolves into the pick that produced him", () => {
    const ctx = ctxOf({
      moves: [
        // The pick moves twice before the draft, then the player moves once after.
        move({
          assetKey: "k:2024-1-1",
          from: 1,
          to: 2,
          created: at(10),
          tradeId: "A",
        }),
        move({
          assetKey: "k:2024-1-1",
          from: 2,
          to: 3,
          created: at(30),
          tradeId: "B",
        }),
        move({
          assetKey: "p:p9",
          from: 3,
          to: 1,
          created: at(300),
          tradeId: "C",
        }),
      ],
      holdings: { p9: 1 },
      draftedFrom: {
        p9: {
          playerId: "p9",
          season: "2024",
          round: 1,
          pickNo: 5,
          originalRoster: 1,
          usedByRoster: 3,
          at: at(200),
          isStartup: false,
        },
      },
    });
    const chain = buildProvenance(ctx, "p:p9");
    expect(chain.crossesDraft).toBe(true);
    expect(chain.hops).toBe(3);
    const kinds = chain.events.map((e) => e.node);
    expect(kinds).toEqual(["origin", "hop", "hop", "resolution", "hop"]);
    const res = chain.events.find((e) => e.node === "resolution");
    expect(res.playerName).toBe("Nine Player");
    expect(res.pickNo).toBe(5);
    expect(res.pickKey).toBe("k:2024-1-1");
    // The pick's own hops come BEFORE the resolution and the player's after it.
    expect(kinds.indexOf("resolution")).toBe(3);
  });
  it("never branches: hop count equals the number of hop nodes, at every length", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const moves = Array.from({ length: n }, (_, i) =>
        move({
          assetKey: "p:p9",
          from: i + 1,
          to: i + 2,
          created: at(10 * (i + 1)),
          tradeId: `t${i}`,
        }),
      );
      const ctx = ctxOf({ moves, holdings: { p9: n + 1 } });
      const chain = buildProvenance(ctx, "p:p9");
      expect(chain.hops).toBe(n);
      expect(chain.events.filter((e) => e.node === "hop")).toHaveLength(n);
    }
  });
  it("carries the trade's own party count onto its hop, for a 3+ team deal", () => {
    // Verified live: this league has run exactly two 3-team deals (a 2023
    // commissioner-executed reshuffle and a 2024 four-player, three-pick deal), and
    // `HopBody`'s sentence only ever names the two seats on THIS asset's own end -
    // `from`/`to` - which is the correct predecessor, but says nothing about the
    // OTHER assets moving between OTHER seats in the same transaction. `parties`
    // is what lets the rail disclose "this was bigger than it looks" instead of
    // reading like an ordinary two-team trade.
    const ctx = ctxOf({
      moves: [
        move({
          assetKey: "p:p9",
          from: 1,
          to: 2,
          created: at(10),
          tradeId: "A",
          parties: 3,
        }),
      ],
      holdings: { p9: 2 },
    });
    const chain = buildProvenance(ctx, "p:p9");
    const hop = chain.events.find((e) => e.node === "hop");
    expect(hop.parties).toBe(3);
  });
  it("a two-team hop's party count is 2, or undefined for a context predating the field", () => {
    const ctx = ctxOf({
      moves: [
        move({ assetKey: "p:p9", from: 1, to: 2, created: at(10), tradeId: "A" }),
      ],
      holdings: { p9: 2 },
    });
    const chain = buildProvenance(ctx, "p:p9");
    const hop = chain.events.find((e) => e.node === "hop");
    // `move()` doesn't set `parties` unless told to, and that must not crash the
    // walk or read as a multi-team deal - see `isMultiTeam` in ProvenanceRail.
    expect(hop.parties).toBeUndefined();
  });
  it("handles a pick traded away and bought back by the same seat", () => {
    // The shape this feature was rebuilt for: 1 -> 2 -> 3 -> 1. The old tree called
    // this "gave up" and /drafts called it "acquired", and neither knew about the
    // other. One chain, four nodes, all three hops present.
    const ctx = ctxOf({
      moves: [
        move({
          assetKey: "k:2024-1-1",
          from: 1,
          to: 2,
          created: at(10),
          tradeId: "A",
        }),
        move({
          assetKey: "k:2024-1-1",
          from: 2,
          to: 3,
          created: at(58),
          tradeId: "B",
        }),
        move({
          assetKey: "k:2024-1-1",
          from: 3,
          to: 1,
          created: at(81),
          tradeId: "C",
        }),
      ],
    });
    const chain = buildProvenance(ctx, "k:2024-1-1");
    expect(chain.hops).toBe(3);
    const hops = chain.events.filter((e) => e.node === "hop");
    expect(hops.map((h) => `${h.from}->${h.to}`)).toEqual([
      "1->2",
      "2->3",
      "3->1",
    ]);
    expect(chain.today.rosterId).toBe(1);
    expect(chain.today.pending).toBe(true);
  });
});
/**
 * Both of these were found by rendering the real league, not by reading the code, and
 * both are the kind of bug that looks completely plausible on the page.
 */
describe("bugs live verification caught", () => {
  it("a SPENT pick resolves to the player it became, not to 'not drafted yet'", () => {
    const ctx = ctxOf({
      moves: [
        move({
          assetKey: "k:2025-1-2",
          from: 2,
          to: 1,
          created: at(100),
          tradeId: "A",
        }),
      ],
      holdings: { p9: 1 },
      playerOfPick: { "k:2025-1-2": "p9" },
      draftedFrom: {
        p9: {
          playerId: "p9",
          season: "2025",
          round: 1,
          pickNo: 1,
          originalRoster: 2,
          usedByRoster: 1,
          at: at(600),
          isStartup: false,
        },
      },
    });
    const chain = buildProvenance(ctx, "k:2025-1-2");
    // Asked for the pick, answered about the player - and said so in both fields.
    expect(chain.requestedKey).toBe("k:2025-1-2");
    expect(chain.assetKey).toBe("p:p9");
    expect(chain.today.pending).toBe(false);
    expect(chain.today.text).toBe("On Alpha today.");
    expect(chain.crossesDraft).toBe(true);
    expect(chain.today.text).not.toContain("Not drafted yet");
  });
  it("keeps a pick hop stamped after its own draft's scheduled start time", () => {
    // Picks get traded ON draft day, and `DraftMeta.startTime` is when the draft was
    // SCHEDULED - so bounding the pick's walk by that stamp dropped real hops. Eleven
    // picks in the real league gained back between one and three hops from this.
    const draftAt = at(500);
    const ctx = ctxOf({
      moves: [
        move({
          assetKey: "k:2025-1-2",
          from: 2,
          to: 3,
          created: at(400),
          tradeId: "A",
        }),
        // Stamped four hours after the draft's scheduled start.
        move({
          assetKey: "k:2025-1-2",
          from: 3,
          to: 1,
          created: draftAt + 4 * 3_600_000,
          tradeId: "B",
        }),
      ],
      holdings: { p9: 1 },
      playerOfPick: { "k:2025-1-2": "p9" },
      draftedFrom: {
        p9: {
          playerId: "p9",
          season: "2025",
          round: 1,
          pickNo: 1,
          originalRoster: 2,
          usedByRoster: 1,
          at: draftAt,
          isStartup: false,
        },
      },
    });
    const chain = buildProvenance(ctx, "p:p9");
    expect(chain.hops).toBe(2);
    // ...and the rail stays monotonic in time, because the DRAFT node is the one that
    // moves, not the recorded trade. A rail whose y-axis ran backwards for one node
    // would be worse than not drawing it.
    const times = [...chain.events.map((e) => e.at), chain.today.at];
    for (let i = 1; i < times.length; i++)
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    const res = chain.events.find((e) => e.node === "resolution");
    expect(res.dated).toBe(false);
    // No recorded trade timestamp was touched.
    const hops = chain.events.filter((e) => e.node === "hop");
    expect(hops.map((x) => x.at)).toEqual([at(400), draftAt + 4 * 3_600_000]);
  });
  it("keeps the PICK's own chain when the player it became has since moved on", () => {
    // The over-eager version of the redirect answered "what happened to my 2025 3rd?"
    // by showing a chain that had deleted the pick's whole history, because the player
    // was later signed off waivers by somebody else and his own chain honestly stops
    // there. Measured: one pick lost all five of its hops this way.
    const ctx = ctxOf({
      moves: [
        move({
          assetKey: "k:2025-3-2",
          from: 2,
          to: 3,
          created: at(100),
          tradeId: "A",
        }),
        move({
          assetKey: "k:2025-3-2",
          from: 3,
          to: 1,
          created: at(200),
          tradeId: "B",
        }),
      ],
      holdings: { p9: 2 },
      playerOfPick: { "k:2025-3-2": "p9" },
      draftedFrom: {
        p9: {
          playerId: "p9",
          season: "2025",
          round: 3,
          pickNo: 30,
          originalRoster: 2,
          usedByRoster: 1,
          at: at(300),
          isStartup: false,
        },
      },
      // Dropped after the draft, then claimed by roster 2.
      signings: {
        p9: [
          {
            playerId: "p9",
            rosterId: 2,
            at: at(400),
            type: "waiver",
            transactionId: "w",
          },
        ],
      },
    });
    const viaPick = buildProvenance(ctx, "k:2025-3-2");
    expect(viaPick.assetKey).toBe("k:2025-3-2");
    expect(viaPick.hops).toBe(2);
    expect(viaPick.today.text).toContain("Used on Nine Player");
    expect(viaPick.today.pending).toBe(false);
    // The player's own chain still stops at the waiver claim, which is the honest
    // answer to a different question.
    const viaPlayer = buildProvenance(ctx, "p:p9");
    expect(viaPlayer.hops).toBe(0);
    expect(viaPlayer.events[0]).toMatchObject({ reason: "waiver" });
  });
  it("names a pick's original owner from the season the chain starts, not tonight", () => {
    // Roster 2 changed hands: Bravo held it when the pick was traded away, Delta holds
    // it now. Crediting Delta with an asset Bravo had already sold is the exact D22
    // bug the whole principal index exists to prevent.
    const ctx = ctxOf({
      names: { 1: "Alpha", 2: "Delta" },
      ownerNames: { u1: "Alpha", u2: "Bravo", u4: "Delta" },
      moves: [
        move({
          assetKey: "k:2026-1-2",
          from: 2,
          to: 1,
          created: at(100),
          fromOwnerId: "u2",
          toOwnerId: "u1",
        }),
      ],
    });
    const chain = buildProvenance(ctx, "k:2026-1-2");
    expect(chain.events[0]).toMatchObject({
      reason: "pick-original",
      text: "Bravo's own 2026 1st pick.",
    });
    expect(chain.events[0].text).not.toContain("Delta");
  });
});
describe("the terminal vocabulary", () => {
  it("a never-traded, never-signed player predates the record", () => {
    const chain = buildProvenance(ctxOf({ holdings: { p9: 1 } }), "p:p9");
    expect(chain.hops).toBe(0);
    expect(chain.events[0]).toMatchObject({
      node: "origin",
      reason: "pre-record",
      text: "On this roster before the record begins.",
    });
  });
  it("a startup-draft player ends on the startup sentence and walks no pick above it", () => {
    const ctx = ctxOf({
      holdings: { p9: 1 },
      draftedFrom: {
        p9: {
          playerId: "p9",
          season: "2022",
          round: 3,
          pickNo: 31,
          originalRoster: 1,
          usedByRoster: 1,
          at: at(5),
          isStartup: true,
        },
      },
    });
    const chain = buildProvenance(ctx, "p:p9");
    expect(chain.events[0]).toMatchObject({
      node: "origin",
      reason: "startup-draft",
      text: "Acquired in the 2022 startup draft.",
    });
    // Still crosses a draft - the resolution node is what says "this was a pick".
    expect(chain.crossesDraft).toBe(true);
    expect(chain.events.filter((e) => e.node === "hop")).toHaveLength(0);
  });
  it("a waiver claim and a free-agent signing are different sentences", () => {
    for (const [type, text] of [
      ["waiver", "Signed off waivers."],
      ["free_agent", "Signed as a free agent."],
    ]) {
      const ctx = ctxOf({
        holdings: { p9: 2 },
        signings: {
          p9: [
            {
              playerId: "p9",
              rosterId: 2,
              at: at(9),
              type,
              transactionId: "x",
            },
          ],
        },
      });
      expect(buildProvenance(ctx, "p:p9").events[0]).toMatchObject({ text });
    }
  });
  it("an untraded pick ends on its original roster's own claim to it", () => {
    const chain = buildProvenance(ctxOf(), "k:2026-2-3");
    expect(chain.events[0]).toMatchObject({
      node: "origin",
      reason: "pick-original",
      text: "Charlie's own 2026 2nd pick.",
    });
    expect(chain.today.rosterId).toBe(3);
  });
  it("an undrafted pick's terminus quotes lib/lineage VERBATIM", () => {
    // The one guarantee that stops /drafts and this rail describing the same pick two
    // different ways. If REASON_TEXT is reworded, this fails rather than drifting.
    const chain = buildProvenance(ctxOf(), "k:2027-1-1");
    expect(chain.today.text).toContain(REASON_TEXT["no-draft"]);
    expect(REASON_TEXT["no-draft"]).toBe(
      "Not drafted yet - this pick is still in the future.",
    );
  });
  it("a player who has left the league says so rather than naming a roster", () => {
    const ctx = ctxOf({
      moves: [move({ assetKey: "p:p9", from: 1, to: 2, created: at(10) })],
    });
    const chain = buildProvenance(ctx, "p:p9");
    expect(chain.today.rosterId).toBeNull();
    expect(chain.today.text).toBe("No longer on a roster in this league.");
  });
  it("has exactly five origin sentences, and none of them is a grade", () => {
    const banned =
      /\b(win|won|lost|lose|steal|fleec|robbed|great|terrible|best|worst)\b/i;
    for (const make of Object.values(ORIGIN_TEXT)) {
      const s = make({ season: "2024", round: 1, who: "Alpha" });
      expect(s).not.toMatch(banned);
      expect(s.endsWith(".")).toBe(true);
      // No em dashes in user-facing copy, in any encoding.
      expect(s).not.toMatch(/[—–]/);
    }
    expect(Object.keys(ORIGIN_TEXT)).toHaveLength(5);
  });
});
describe("keys and indexing", () => {
  it("round-trips a pick key and rejects a player key", () => {
    expect(parsePickKey("k:2024-1-11")).toEqual({
      season: "2024",
      round: 1,
      originalRoster: 11,
    });
    expect(parsePickKey("p:1234")).toBeNull();
    expect(parsePickKey("k:garbage")).toBeNull();
  });
  it("indexes every move under its own asset, preserving chronological order", () => {
    const moves = [
      move({ assetKey: "p:a", from: 1, to: 2, created: at(1) }),
      move({ assetKey: "p:b", from: 1, to: 2, created: at(2) }),
      move({ assetKey: "p:a", from: 2, to: 3, created: at(3) }),
    ];
    const idx = indexMovesByAsset(moves);
    expect(idx.get("p:a").map((m) => m.created)).toEqual([at(1), at(3)]);
    expect(idx.get("p:b")).toHaveLength(1);
  });
});
describe("the rail's own arithmetic", () => {
  it("says elapsed time in the coarsest unit that stays true", () => {
    expect(formatGap(0)).toBe("same day");
    expect(formatGap(DAY)).toBe("1 day");
    expect(formatGap(71 * DAY)).toBe("2 months");
    expect(formatGap(548 * DAY)).toBe("18 months");
    expect(formatGap(1500 * DAY)).toBe("4.1 years");
  });
  it("summarises a never-traded asset without an empty state", () => {
    const chain = buildProvenance(ctxOf({ holdings: { p9: 1 } }), "p:p9");
    expect(chainSummary(chain)).toBe("Never traded");
  });
});
describe("against the fixture corpus", () => {
  const h = buildFixtureHistory();
  const usersById = new Map(h.users.map((u) => [u.userId, u]));
  const principals = buildPrincipals(
    h.chain.map((c) => ({
      season: c.season,
      owners: new Map(
        h.rosters.filter((r) => r.ownerId).map((r) => [r.rosterId, r.ownerId]),
      ),
      users: usersById,
    })),
    h.rosters,
    usersById,
  );
  it("builds a chain for every asset that has ever moved, and never branches", () => {
    const moves = buildAssetMoves(h, principals);
    const ctx = ctxOf({
      moves,
      holdings: buildHoldings(h),
      names: Object.fromEntries(
        h.rosters.map((r) => [r.rosterId, `Roster ${r.rosterId}`]),
      ),
      playerNames: Object.fromEntries(
        [...h.players.values()].map((p) => [p.playerId, p.fullName]),
      ),
    });
    const keys = [...new Set(moves.map((m) => m.assetKey))];
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const chain = buildProvenance(ctx, key);
      expect(chain).not.toBeNull();
      // At least one node, always, and the hop count matches the node count - the
      // property that makes this a chain rather than a tree.
      expect(chain.events.length).toBeGreaterThan(0);
      expect(chain.events.filter((e) => e.node === "hop")).toHaveLength(
        chain.hops,
      );
    }
  });
});
/**
 * THE NOTE SWEEP - the regression guard that replaced two hand-measured row heights.
 *
 * The bug: `MIN_ROW` was measured against a hop with NO extra sentence,
 * `HOMECOMING_ROW = 40` bought the homecoming note its own room, and the multi-team
 * note bought nothing - so a hop that was BOTH overflowed onto the row below. Fixing
 * the one combination would have left the next one broken, which is why the row heights
 * are gone entirely (rows size to their content now) and why this sweeps every
 * combination instead of testing the pair that happened to ship broken.
 *
 * What it pins is that each condition contributes EXACTLY ONE note, independently, in a
 * fixed order. A note that silently dropped when combined with another is the same
 * class of bug wearing different clothes.
 */
describe("hopNotes: every combination of note types on one hop", () => {
  const conditions = [
    { key: "repeat-holder", apply: (h) => h, repeat: { forDays: 570 } },
    { key: "multi-team", apply: (h) => ({ ...h, parties: 3 }) },
    { key: "commissioner", apply: (h) => ({ ...h, commissionerExecuted: true }) },
  ];
  const baseHop = {
    node: "hop",
    toName: "Rebuild Co",
    fromName: "Win Now",
    parties: 2,
    commissionerExecuted: false,
    assetKey: "p:p9",
  };
  // All 8 subsets of the three conditions.
  for (let mask = 0; mask < 8; mask++) {
    const active = conditions.filter((_, i) => mask & (1 << i));
    const names = active.map((c) => c.key);
    const title = names.length ? names.join(" + ") : "no notes";
    it(`renders exactly ${names.length} note(s) for: ${title}`, () => {
      let hop = { ...baseHop };
      let repeat = null;
      for (const c of active) {
        hop = c.apply(hop);
        if (c.repeat) repeat = c.repeat;
      }
      const notes = hopNotes(hop, repeat);
      expect(
        notes.map((n) => n.kind),
        `wrong notes for ${title}`,
      ).toEqual(names);
      // Every note is a real sentence with a tone the renderer knows, and no note is
      // ever empty - an empty note would take up a row's height and say nothing.
      for (const n of notes) {
        expect(n.text.length, `${n.kind} has no text`).toBeGreaterThan(10);
        expect(["muted", "info", "warn"]).toContain(n.tone);
      }
    });
  }
  it("uses the deal receipt's own words for a commissioner move, verbatim", () => {
    // One condition, one sentence, everywhere it appears. `/deals` and the receipt both
    // open with this, and a third phrasing here would make the fact unlearnable.
    const notes = hopNotes({ ...baseHop, commissionerExecuted: true }, null);
    expect(notes[0].text).toContain("Pick record missing.");
    expect(notes[0].text).toContain(
      "Sleeper records no picks against commissioner moves",
    );
  });
  it("keeps the repeat-holder note muted, never the accent", () => {
    // Accent means "you" everywhere in this app. A returning holder is a fact about
    // the asset, and the old treatment made it the loudest thing on the rail.
    const notes = hopNotes(baseHop, { forDays: 100 });
    expect(notes[0].tone).toBe("muted");
  });
  it("states the earlier hold's length when it is known, and omits it when not", () => {
    expect(hopNotes(baseHop, { forDays: 570 })[0].text).toContain("19 months");
    expect(hopNotes(baseHop, { forDays: null })[0].text).toContain(
      "had held this before",
    );
  });
});
/**
 * REPEATED HOLDERS - generalized off the old pick-only `isHomecoming`, which could
 * never fire for a player because only a pick key carries an original owner.
 */
describe("repeatHolders", () => {
  const hop = (to, extra = {}) => ({ node: "hop", to, ...extra });
  it("catches a PLAYER returning to a seat that already held him", () => {
    // The case the old check was structurally incapable of seeing.
    const nodes = [
      { node: "origin", rosterId: 1 },
      hop(2),
      hop(3),
      hop(1),
      { node: "today", rosterId: 1 },
    ];
    const r = repeatHolders(nodes);
    expect(r.get(3)).toBe(0);
    // Both ends of the pair are ringed, so the reader can see where it was before.
    expect(r.has(0)).toBe(true);
  });
  it("still catches a pick returning to its original owner", () => {
    // The old behaviour, subsumed: a pick's origin node carries the original roster,
    // so this is just a holder appearing twice - no key parsing needed.
    const nodes = [
      { node: "origin", rosterId: 7 },
      hop(4),
      hop(7),
      { node: "today", rosterId: 7 },
    ];
    expect(repeatHolders(nodes).get(2)).toBe(0);
  });
  it("does NOT treat a continuing holder as a return", () => {
    // A resolution node inherits the seat that held the pick - the manager who used
    // it - and "you still have it" is not "it came back to you".
    const nodes = [
      { node: "origin", rosterId: 1 },
      hop(5),
      { node: "resolution", usedByRoster: 5 },
      { node: "today", rosterId: 5 },
    ];
    expect(repeatHolders(nodes).size).toBe(0);
  });
  it("reports nothing for a chain that never revisits a seat", () => {
    const nodes = [
      { node: "origin", rosterId: 1 },
      hop(2),
      hop(3),
      { node: "today", rosterId: 3 },
    ];
    expect(repeatHolders(nodes).size).toBe(0);
  });
  it("ignores a null seat rather than counting it as a holder", () => {
    // A dropped player has no holder today, and two nulls are not the same manager.
    const nodes = [
      { node: "origin", rosterId: null },
      hop(2),
      { node: "today", rosterId: null },
    ];
    expect(repeatHolders(nodes).size).toBe(0);
  });
});
/**
 * PAIRED DURATIONS IN ONE UNIT. A comparison printed in two units is not a comparison -
 * it is the conversion the sentence was supposed to save the reader.
 */
describe("formatDaysPair", () => {
  it("prints both numbers in the same unit", () => {
    expect(formatDaysPair(41, 87)).toEqual(["41 days", "87 days"]);
  });
  it("takes the unit from the SMALLER value, so nothing rounds to uselessness", () => {
    // Choosing from the larger would print "1 month" for 41 days, and 41 days is not
    // a month.
    expect(formatDaysPair(41, 400)).toEqual(["41 days", "400 days"]);
  });
  it("moves to months only when the smaller value is itself months-scale", () => {
    expect(formatDaysPair(120, 300)).toEqual(["4 months", "10 months"]);
  });
  it("moves to years only when the smaller value is years-scale", () => {
    expect(formatDaysPair(800, 1200)).toEqual(["2.2 years", "3.3 years"]);
  });
  it("never mixes units across one population, however wide the range", () => {
    // The strip formats its own low, median, high and highlighted value with one
    // formatter; a formatter that re-chose per value would label one axis in days and
    // the other end in years.
    const f = daysFormatter(30);
    for (const d of [30, 200, 900, 4000]) expect(f(d)).toMatch(/days$/);
  });
  it("says 1 day, not 1 days", () => {
    expect(formatDaysPair(1, 9)).toEqual(["1 day", "9 days"]);
  });
});
