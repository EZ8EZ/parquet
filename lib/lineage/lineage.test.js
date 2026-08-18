import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory.js";
import { FixtureProvider } from "../providers/fixture/index.js";
import * as providers from "../providers/index.js";
import {
  buildDraftIndex,
  draftedByName,
  getDraftBoard,
  getDraftSeasons,
  getTradedPickLineages,
  invalidateDraftIndex,
  resolvePickLineage,
} from "./index.js";
// The fixture scripts three pick movements we can assert against:
//   fx-2022-rebuildA — roster 8's 2024 1st  -> roster 1  (draft has happened)
//   fx-2023-rebuildB — roster 13's 2025 1st -> roster 1  (draft has happened)
//   fx-2025-pivot    — roster 1's 2026 + 2027 1sts -> roster 6 (2026 is pre-draft,
//                      2027 has no draft at all)
describe("pick lineage", () => {
  const h = buildFixtureHistory();
  it("resolves a traded pick to the player it became", async () => {
    const l = await resolvePickLineage(h, {
      season: "2024",
      round: 1,
      originalRoster: 8,
    });
    expect(l.resolved).toBe(true);
    expect(l.reason).toBeNull();
    expect(l.playerId).toBeTruthy();
    expect(l.playerName).toBeTruthy();
    // The pick was acquired by "you" in the 2022 rebuild, so "you" used it.
    expect(l.wasTraded).toBe(true);
    expect(l.currentOwnerRoster).toBe(1);
    expect(l.usedByRoster).toBe(1);
    expect(l.pickNo).toBeGreaterThan(0);
    expect(l.draftSlot).toBeGreaterThan(0);
    // The resolved player must exist in the player universe.
    expect(h.players.has(l.playerId)).toBe(true);
    expect(l.label).toContain("2024");
  });
  it("resolves an untraded pick to its original team's own selection", async () => {
    const l = await resolvePickLineage(h, {
      season: "2024",
      round: 2,
      originalRoster: 5,
    });
    expect(l.resolved).toBe(true);
    expect(l.usedByRoster).toBe(5);
    expect(l.wasTraded).toBe(false);
  });
  it("returns unresolved (not thrown) for a pick whose draft hasn't happened", async () => {
    // 2026 draft exists but is pre_draft with zero picks made.
    const l = await resolvePickLineage(h, {
      season: "2026",
      round: 1,
      originalRoster: 1,
    });
    expect(l.resolved).toBe(false);
    expect(l.reason).toBe("not-yet-drafted");
    expect(l.reasonText).toBeTruthy();
    expect(l.playerId).toBeNull();
    // Ownership is still known: the 2025 pivot sent it to roster 6.
    expect(l.currentOwnerRoster).toBe(6);
    expect(l.wasTraded).toBe(true);
  });
  it("returns unresolved for a future season with no draft at all", async () => {
    const l = await resolvePickLineage(h, {
      season: "2027",
      round: 1,
      originalRoster: 1,
    });
    expect(l.resolved).toBe(false);
    expect(l.reason).toBe("no-draft");
    expect(l.draftId).toBeNull();
    expect(l.currentOwnerRoster).toBe(6);
  });
  it("returns unresolved for a roster with no slot in that draft", async () => {
    const l = await resolvePickLineage(h, {
      season: "2024",
      round: 1,
      originalRoster: 999,
    });
    expect(l.resolved).toBe(false);
    expect(l.reason).toBe("slot-unknown");
  });
  it("never throws for nonsense input", async () => {
    const l = await resolvePickLineage(h, {
      season: "1999",
      round: 42,
      originalRoster: -1,
    });
    expect(l.resolved).toBe(false);
    expect(l.reason).toBe("no-draft");
  });
});
describe("draft board", () => {
  const h = buildFixtureHistory();
  it("returns picks in true draft order with no gaps", async () => {
    const board = await getDraftBoard(h, "2024");
    expect(board.reason).toBeNull();
    expect(board.picks.length).toBe(board.rounds * board.teams);
    // Strictly ascending by the API's own pickNo, and 1..n contiguous.
    const nos = board.picks.map((p) => p.pickNo);
    expect(nos).toEqual([...nos].sort((a, b) => a - b));
    expect(new Set(nos).size).toBe(nos.length);
    expect(nos[0]).toBe(1);
    expect(nos[nos.length - 1]).toBe(board.picks.length);
    // Rounds are non-decreasing across the ordered board.
    for (let i = 1; i < board.picks.length; i++) {
      expect(board.picks[i].round).toBeGreaterThanOrEqual(
        board.picks[i - 1].round,
      );
    }
  });
  it("labels every pick with a player and a drafting team", async () => {
    const board = await getDraftBoard(h, "2024");
    for (const p of board.picks) {
      expect(p.playerName).toBeTruthy();
      expect(p.usedByName).toBeTruthy();
      expect(p.originalRosterName).toBeTruthy();
    }
  });
  it("flags traded picks and the viewing user's own picks", async () => {
    const board = await getDraftBoard(h, "2024");
    // Roster 8's 1st was acquired by roster 1 in the 2022 rebuild.
    const traded = board.picks.find(
      (p) => p.round === 1 && p.originalRoster === 8,
    );
    expect(traded).toBeDefined();
    expect(traded.wasTraded).toBe(true);
    expect(traded.usedByRoster).toBe(1);
    expect(traded.isMine).toBe(true); // fixture "me" is roster 1
    // A pick that never moved is not flagged.
    const own = board.picks.find(
      (p) => p.round === 3 && p.originalRoster === p.usedByRoster,
    );
    expect(own?.wasTraded).toBe(false);
  });
  it("agrees with resolvePickLineage on the same pick", async () => {
    const board = await getDraftBoard(h, "2024");
    const l = await resolvePickLineage(h, {
      season: "2024",
      round: 1,
      originalRoster: 8,
    });
    const onBoard = board.picks.find((p) => p.pickNo === l.pickNo);
    expect(onBoard?.playerId).toBe(l.playerId);
    expect(onBoard?.usedByRoster).toBe(l.usedByRoster);
  });
  it("reports an empty pre-draft board without throwing", async () => {
    const board = await getDraftBoard(h, "2026");
    expect(board.picks).toEqual([]);
    expect(board.reason).toBe("not-yet-drafted");
    expect(board.draftId).toBeTruthy();
    expect(board.status).toBe("pre_draft");
  });
  it("reports a season with no draft without throwing", async () => {
    const board = await getDraftBoard(h, "2031");
    expect(board.picks).toEqual([]);
    expect(board.reason).toBe("no-draft");
    expect(board.draftId).toBeNull();
  });
});
describe("draft seasons + traded-pick lineages", () => {
  const h = buildFixtureHistory();
  it("lists draft seasons newest first", async () => {
    const seasons = await getDraftSeasons(h);
    expect(seasons.length).toBeGreaterThan(1);
    expect(seasons.map((s) => s.season)).toEqual(
      [...seasons.map((s) => s.season)].sort().reverse(),
    );
    const completed = seasons.filter((s) => s.pickCount > 0);
    expect(completed.length).toBeGreaterThan(0);
    for (const s of completed) expect(s.tradedCount).toBeGreaterThanOrEqual(0);
  });
  it("traces traded picks, resolved ones first", async () => {
    const rows = await getTradedPickLineages(h);
    expect(rows.length).toBeGreaterThan(0);
    // Resolved rows sort ahead of unresolved ones.
    const firstUnresolved = rows.findIndex((r) => !r.resolved);
    if (firstUnresolved !== -1) {
      expect(rows.slice(firstUnresolved).every((r) => !r.resolved)).toBe(true);
    }
    // The scripted 2022 rebuild pick is traced to a real player.
    const rebuild = rows.find(
      (r) => r.season === "2024" && r.round === 1 && r.originalRoster === 8,
    );
    expect(rebuild?.resolved).toBe(true);
    expect(rebuild?.toRoster).toBe(1);
    expect(rebuild?.playerName).toBeTruthy();
  });
  it("filters traded-pick lineages by roster", async () => {
    const mine = await getTradedPickLineages(h, { rosterId: 1 });
    expect(mine.length).toBeGreaterThan(0);
    for (const r of mine) {
      expect([r.fromRoster, r.toRoster, r.originalRoster]).toContain(1);
    }
  });
});
// SHELVED.md S3: "which players did other managers take with your old picks" is
// `getTradedPickLineages` filtered to fromRoster === me, rendered with perspective
// "gave" - and `draftedByName` is the one bit of display logic that join needed.
describe("draftedByName", () => {
  const single = { resolved: true, toName: "Sweet Home We...", usedByName: null };
  const multiHop = {
    resolved: true,
    toName: "Sweet Home We...",
    usedByName: "The Terror Tw...",
  };
  const unresolved = { resolved: false, toName: "Sweet Home We...", usedByName: null };
  it("on the 'gave' perspective, names the drafter even for an ordinary single-hop trade", () => {
    // This is the actual fix: it used to say nothing here because usedByName was
    // unset and toName was treated as already obvious from the hop arrow above it.
    expect(draftedByName(single, "gave")).toBe("Sweet Home We...");
  });
  it("on 'gave', prefers usedByName when the pick moved again after the last hop", () => {
    expect(draftedByName(multiHop, "gave")).toBe("The Terror Tw...");
  });
  it("outside 'gave', stays silent when usedByName agrees with toName", () => {
    expect(draftedByName(single, "got")).toBeNull();
    expect(draftedByName(single, null)).toBeNull();
  });
  it("outside 'gave', still surfaces a genuine multi-hop mismatch", () => {
    expect(draftedByName(multiHop, "got")).toBe("The Terror Tw...");
    expect(draftedByName(multiHop, null)).toBe("The Terror Tw...");
  });
  it("never names a drafter for a pick that hasn't been drafted yet", () => {
    expect(draftedByName(unresolved, "gave")).toBeNull();
  });
});
describe("draft index", () => {
  it("is deterministic across rebuilds of the fixture", async () => {
    const a = await buildDraftIndex(buildFixtureHistory(), { fresh: true });
    const b = await buildDraftIndex(buildFixtureHistory(), { fresh: true });
    expect([...a.bySeason.keys()]).toEqual([...b.bySeason.keys()]);
    for (const season of a.bySeason.keys()) {
      expect(a.bySeason.get(season).picks).toEqual(
        b.bySeason.get(season).picks,
      );
    }
  });
});
describe("buildDraftIndex single-flight", () => {
  // Measured against the real league: this is the single slowest cold loader in the
  // app (1,483ms, 15 requests). Without single-flight, N concurrent cold callers each
  // ran their own full pass over the chain's drafts. `getDrafts` is called once per
  // season in `h.chain` per assembly, so its call COUNT (not just "was it called") is
  // the signal: N concurrent calls must cost the same as one call, not N times as much.
  afterEach(() => {
    vi.restoreAllMocks();
    invalidateDraftIndex();
  });
  it("dedupes N concurrent cold callers into exactly one assembly", async () => {
    invalidateDraftIndex();
    const h = buildFixtureHistory();
    const spy = vi.spyOn(FixtureProvider.prototype, "getDrafts");
    const results = await Promise.all(
      Array.from({ length: 5 }, () => buildDraftIndex(h)),
    );
    const callsForOneAssembly = spy.mock.calls.length;
    expect(callsForOneAssembly).toBeGreaterThan(0);
    expect(callsForOneAssembly).toBe(
      h.chain.length > 0 ? spy.mock.calls.length : 0,
    );
    // Every caller joined the same assembly: same object identity, and issuing the
    // load again right after (still within TTL) costs zero further calls.
    for (const r of results.slice(1)) expect(r).toBe(results[0]);
    await buildDraftIndex(h);
    expect(spy.mock.calls.length).toBe(callsForOneAssembly);
  });
  it("clears the slot on rejection so a transient failure does not pin it", async () => {
    // Per-season draft/pick failures are already caught INSIDE `assembleDraftIndex`
    // (never throws by contract — see its docstring), so a rejection can only reach
    // the single-flight slot from something outside that loop, e.g. `getLeagueProvider`
    // itself throwing. That is what this simulates, to exercise the slot-level
    // guarantee: a caller must not get stuck on a permanently-rejected promise,
    // mirroring `ensureIngested()` in lib/ingest.ts.
    invalidateDraftIndex();
    const h = buildFixtureHistory();
    const spy = vi.spyOn(providers, "getLeagueProvider");
    spy.mockImplementationOnce(() => {
      throw new Error("simulated provider failure");
    });
    await expect(buildDraftIndex(h)).rejects.toThrow(
      "simulated provider failure",
    );
    // The slot must be clear now — the next call gets a real (mocked-through) provider
    // and succeeds instead of replaying the same rejection.
    await expect(buildDraftIndex(h)).resolves.toBeDefined();
  });
});
