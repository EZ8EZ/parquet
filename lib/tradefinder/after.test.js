import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory.js";
import { analyzeRoster } from "../roster.js";
import {
  COHERENCE_FLOOR,
  coherenceOf,
  findTimelineBreak,
  getTimelineProfile,
  pickDuration,
  playerDuration,
} from "../metrics/duration.js";
import {
  byPositionAfter,
  packageParts,
  postTradeTimeline,
  rosterAfter,
  startableAfter,
} from "./after.js";
import { assetsOf } from "./index.js";
const h = buildFixtureHistory();
const ME = h.me.rosterId;
const mine = assetsOf(analyzeRoster(h, ME));
const someoneElse = h.rosters.find((r) => r.rosterId !== ME).rosterId;
const theirs = assetsOf(analyzeRoster(h, someoneElse));
const held = (assets) => assets.filter((a) => a.role !== "leaving");
describe("packageParts", () => {
  it("keys both sides by id, as strings, so a numeric id still matches", () => {
    const parts = packageParts([{ kind: "player", id: 7 }], [{ kind: "pick", id: "2028-1-9" }]);
    expect(parts.outIds.has("7")).toBe(true);
    expect(parts.inIds.has("2028-1-9")).toBe(true);
  });
});
describe("rosterAfter (the synthetic post-trade asset list)", () => {
  const give = mine.filter((a) => a.kind === "player").slice(0, 2);
  const get = theirs.filter((a) => a.kind === "player").slice(0, 1);
  it("tags departures rather than dropping them, so the strip can draw the gap", () => {
    const after = rosterAfter(h, ME, give, get);
    const leaving = after.filter((a) => a.role === "leaving");
    expect(leaving.map((a) => a.id).sort()).toEqual(
      give.map((a) => String(a.id)).sort(),
    );
    // ...and they are genuinely excluded from the roster the arithmetic reads.
    for (const a of held(after))
      expect(give.some((g) => String(g.id) === String(a.id))).toBe(false);
  });
  it("adds what you receive, marked as arriving", () => {
    const after = rosterAfter(h, ME, give, get);
    const arriving = after.filter((a) => a.role === "arriving");
    expect(arriving.map((a) => a.id)).toEqual(get.map((a) => String(a.id)));
  });
  it("dates an arriving asset on the SAME formula the roster it joins was dated on", () => {
    const incomingPlayer = theirs.find(
      (a) => a.kind === "player" && a.age != null,
    );
    const incomingPick = theirs.find((a) => a.kind === "pick");
    const after = rosterAfter(h, ME, [], [incomingPlayer, incomingPick].filter(Boolean));
    const byId = new Map(after.map((a) => [a.id, a]));
    expect(byId.get(String(incomingPlayer.id)).duration).toBe(
      playerDuration(incomingPlayer.age),
    );
    if (incomingPick) {
      const seasonsOut =
        parseInt(incomingPick.pick.season, 10) - h.currentSeasonYear;
      expect(byId.get(String(incomingPick.id)).duration).toBe(
        pickDuration(seasonsOut),
      );
    }
  });
  it("is a no-op for an empty package", () => {
    const before = getTimelineProfile(h, ME);
    const after = rosterAfter(h, ME, [], [], { before });
    expect(held(after).map((a) => a.id)).toEqual(before.assets.map((a) => a.id));
    expect(coherenceOf(held(after)).tci).toBe(before.tci);
  });
  it("ignores an incoming asset with no value to weight it by", () => {
    const after = rosterAfter(h, ME, [], [
      { kind: "player", id: "zero", label: "Zero", value: 0, age: 25, position: "SF" },
    ]);
    expect(after.some((a) => a.id === "zero")).toBe(false);
  });
  it("is deterministic", () => {
    expect(rosterAfter(h, ME, give, get)).toEqual(rosterAfter(h, ME, give, get));
  });
});
describe("startableAfter and byPositionAfter still answer their own questions", () => {
  it("keeps the three projections genuinely separate", () => {
    const pick = mine.find((a) => a.kind === "pick");
    // A pick is startable depth to nobody and positional value to nobody, but it is the
    // longest-dated thing on the roster and the timeline read must see it.
    expect(startableAfter(["a"], [], [pick])).toEqual(["a"]);
    expect(
      byPositionAfter([{ pos: "PG", value: 100 }], [], [pick]).touched.size,
    ).toBe(0);
    expect(rosterAfter(h, ME, [], [pick]).some((a) => a.id === String(pick.id))).toBe(
      true,
    );
  });
  it("never lets a position go negative", () => {
    const out = byPositionAfter(
      [{ pos: "PG", value: 100 }],
      [{ kind: "player", position: "PG", value: 9999 }],
      [],
    );
    expect(out.byPosition.find((r) => r.pos === "PG").value).toBe(0);
  });
});
describe("postTradeTimeline", () => {
  const give = mine.filter((a) => a.kind === "player").slice(0, 2);
  const get = theirs.filter((a) => a.kind === "player").slice(0, 1);
  it("reads 'before' off the roster's own published profile, not a second derivation", () => {
    const profile = getTimelineProfile(h, ME);
    const pt = postTradeTimeline(h, ME, give, get);
    expect(pt.before.tci).toBe(profile.tci);
    expect(pt.before.rosterDuration).toBe(profile.rosterDuration);
    expect(pt.before.dispersion).toBe(profile.dispersion);
  });
  it("computes 'after' on the identical formula, over the assets that would be held", () => {
    const pt = postTradeTimeline(h, ME, give, get);
    const recomputed = coherenceOf(held(pt.assets));
    expect(pt.after.tci).toBe(recomputed.tci);
    expect(pt.after.rosterDuration).toBe(recomputed.rosterDuration);
    expect(pt.after.dispersion).toBe(recomputed.dispersion);
  });
  it("leaves both readings identical for an empty package", () => {
    const pt = postTradeTimeline(h, ME, [], []);
    expect(pt.after.tci).toBe(pt.before.tci);
    expect(pt.departingBreak).toBeNull();
    expect(pt.arrivingBreak).toBeNull();
  });
  /*
   * THE HEADLINE FINDING, AND ITS TWO FAILURE MODES: claiming the coincidence when the
   * package does not send the break asset(s), and missing it when it does. `ME`'s real
   * break is a correlated PAIR on this fixture (D114), which is what makes the partial
   * case below a real test rather than a hypothetical: a trade that sends only ONE of
   * the two named assets must report exactly that one, never the untouched other name.
   */
  it("names the departing break asset(s) only when the package actually sends them", () => {
    const profile = getTimelineProfile(h, ME);
    const brk = profile.timelineBreak;
    expect(brk).not.toBeNull();
    const breakAssets = brk.assets.map(
      (b) => mine.find((a) => String(a.id) === String(b.id)),
    );
    expect(breakAssets.every(Boolean)).toBe(true);
    const withAll = postTradeTimeline(h, ME, breakAssets, get);
    expect(
      withAll.departingBreak.assets.map((a) => String(a.id)).sort(),
    ).toEqual(brk.assets.map((a) => String(a.id)).sort());
    const breakIds = new Set(brk.assets.map((a) => String(a.id)));
    const withoutAny = postTradeTimeline(
      h,
      ME,
      mine.filter((a) => !breakIds.has(String(a.id))).slice(0, 2),
      get,
    );
    expect(withoutAny.departingBreak).toBeNull();
    if (breakAssets.length > 1) {
      const partial = postTradeTimeline(h, ME, [breakAssets[0]], get);
      expect(partial.departingBreak.assets.map((a) => String(a.id))).toEqual([
        String(breakAssets[0].id),
      ]);
    }
  });
  it("sending every named break asset raises TCI by exactly its published delta", () => {
    const profile = getTimelineProfile(h, ME);
    const brk = profile.timelineBreak;
    const breakAssets = brk.assets.map(
      (b) => mine.find((a) => String(a.id) === String(b.id)),
    );
    const pt = postTradeTimeline(h, ME, breakAssets, []);
    // `findTimelineBreak` is defined as the removal that improves TCI most, so
    // removing every named asset must improve TCI by exactly the delta it published.
    expect(pt.after.tci).toBe(profile.tci + brk.delta);
    expect(pt.after.tci).toBeGreaterThan(pt.before.tci);
  });
  it("quotes the core WITHOUT the break asset(s), not the mean they are dragging", () => {
    const profile = getTimelineProfile(h, ME);
    const brk = profile.timelineBreak;
    const breakAssets = brk.assets.map(
      (b) => mine.find((a) => String(a.id) === String(b.id)),
    );
    const pt = postTradeTimeline(h, ME, breakAssets, []);
    const breakIds = new Set(brk.assets.map((a) => String(a.id)));
    const expected = coherenceOf(
      profile.assets.filter((a) => !breakIds.has(String(a.id))),
    ).rosterDuration;
    expect(pt.coreDurationWithoutDeparting).toBe(expected);
    // And it is a different number from the roster mean, which is the whole reason
    // for computing it separately.
    expect(pt.coreDurationWithoutDeparting).not.toBe(pt.before.rosterDuration);
  });
  it("only ever attributes an arriving break to assets that are arriving", () => {
    for (const partner of h.rosters.filter((r) => r.rosterId !== ME)) {
      const theirAssets = assetsOf(analyzeRoster(h, partner.rosterId));
      const incoming = theirAssets.slice(0, 2);
      const pt = postTradeTimeline(h, ME, mine.slice(0, 1), incoming);
      if (!pt?.arrivingBreak) continue;
      for (const a of pt.arrivingBreak.assets)
        expect(
          incoming.some((i) => String(i.id) === String(a.id)),
        ).toBe(true);
      // It is genuinely (part of) the post-trade roster's own break, not a leftover.
      const recomputed = findTimelineBreak(held(pt.assets), pt.after.tci);
      const recomputedIds = new Set(recomputed.assets.map((a) => String(a.id)));
      for (const a of pt.arrivingBreak.assets)
        expect(recomputedIds.has(String(a.id))).toBe(true);
    }
  });
  /*
   * THE WINDOW READ IS ALLOWED TO UNDER-CLAIM AND NOT TO OVER-CLAIM. Posture is
   * league-relative and cannot be re-derived for a hypothetical roster; the one part
   * that can is the absolute `tci < COHERENCE_FLOOR` test, so a package that drops the
   * viewer below the floor must refuse its after-window.
   */
  it("refuses an after-window for a package that leaves the roster incoherent", () => {
    for (const partner of h.rosters.filter((r) => r.rosterId !== ME)) {
      const theirAssets = assetsOf(analyzeRoster(h, partner.rosterId));
      const pt = postTradeTimeline(h, ME, mine.slice(0, 1), theirAssets.slice(0, 3));
      if (!pt) continue;
      if (pt.after.tci < COHERENCE_FLOOR)
        expect(pt.after.window.state).not.toBe("window");
    }
  });
  it("publishes a window whose state is one of the three the metric defines", () => {
    const pt = postTradeTimeline(h, ME, give, get);
    for (const w of [pt.before.window, pt.after.window])
      expect(["window", "split", "unreadable"]).toContain(w.state);
  });
  it("is deterministic", () => {
    expect(postTradeTimeline(h, ME, give, get)).toEqual(
      postTradeTimeline(h, ME, give, get),
    );
  });
});
