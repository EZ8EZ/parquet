import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import {
  buildDigest,
  currentMetrics,
  DIGEST_ADVANCE_FLOOR_MS,
  DIGEST_COOKIE,
  digestCookieName,
  encodeMarker,
  formatSince,
  FRAGILITY_MOVE_THRESHOLD,
  MAX_MOVES,
  MAX_PICKS,
  MAX_TRADES,
  parseMarker,
  shouldAdvanceMarker,
  TCI_MOVE_THRESHOLD,
} from "./index";
const h = buildFixtureHistory();
/**
 * Anchored to the corpus rather than to a literal, because the fixture's scripted arc
 * runs to the end of its final season and a hardcoded "now" that lands mid-corpus makes
 * "nothing has happened yet" untestable.
 */
const NOW =
  Math.max(...h.transactions.map((t) => t.created)) + 7 * 24 * 60 * 60 * 1000;
/** Deterministic pseudo-random source, so a failing property is always reproducible. */
function lcg(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}
function metricRows(count, seed = 7) {
  const rand = lcg(seed);
  return Array.from({ length: count }, (_, i) => ({
    rosterId: i + 1,
    tci: Math.floor(rand() * 101),
    fragility: Math.floor(rand() * 101),
  }));
}
function marker(seenAt, metrics = []) {
  return { seenAt, metrics };
}
function pick(key, resolvedAt, ownerRoster) {
  return {
    key,
    label: `2025 1st (orig. Roster ${ownerRoster})`,
    playerName: `Player ${key}`,
    position: "SF",
    ownerRoster,
    ownerName: `Roster ${ownerRoster}`,
    season: "2025",
    resolvedAt,
  };
}
function input(m, extra = {}) {
  return {
    marker: m,
    now: extra.now ?? NOW,
    metrics: extra.metrics ?? metricRows(h.rosters.length),
    pickResolutions: extra.picks ?? [],
  };
}
describe("marker codec", () => {
  it("round-trips any valid marker back to an identical value", () => {
    for (const count of [0, 1, 5, 14, 64]) {
      const m = marker(NOW - count * 1000, metricRows(count, count + 1));
      expect(parseMarker(encodeMarker(m))).toEqual(m);
    }
  });
  it("encodes into characters that are legal in a cookie value", () => {
    const encoded = encodeMarker(marker(NOW, metricRows(14)));
    // Comma, semicolon, space, quote and backslash are the ones that would force an
    // encoding layer to intervene; none of them may appear.
    expect(encoded).toMatch(/^[A-Za-z0-9.:~]+$/);
  });
  it("treats every malformed input as no marker instead of throwing", () => {
    const junk = [
      undefined,
      null,
      "",
      "v1",
      "v1.",
      "v1.abc.1:2:3",
      "v1.0.1:2:3", // a zero timestamp is not a visit
      "v1.-5.1:2:3",
      "v2.123.1:2:3", // a future shape must expire, not be misread
      "123.1:2:3",
      "v1.123.1:2", // short field list
      "v1.123.1:2:3:4", // long field list
      "v1.123.0:2:3", // roster ids start at 1
      "v1.123.1:200:3", // indices are bounded 0..100
      "v1.123.1:2:-1",
      "v1.123.1:2.5:3", // indices are integers
      "v1.1.5e3.1:2:3",
      "{}",
    ];
    for (const raw of junk) expect(parseMarker(raw)).toBeNull();
  });
  it("keeps the encoded marker small enough to never threaten a cookie limit", () => {
    expect(encodeMarker(marker(NOW, metricRows(64))).length).toBeLessThan(1000);
  });
  it("refuses to grow the cookie past the tracked-roster cap", () => {
    const encoded = encodeMarker(marker(NOW, metricRows(200)));
    expect(parseMarker(encoded)?.metrics).toHaveLength(64);
  });
});
describe("shouldAdvanceMarker - the S2 revival condition", () => {
  it("always advances on a first visit, so no marker never gets stuck", () => {
    expect(shouldAdvanceMarker(null, NOW)).toBe(true);
  });
  it("refuses to advance the instant after the marker was set", () => {
    expect(shouldAdvanceMarker(marker(NOW), NOW + 1)).toBe(false);
  });
  it("refuses to advance anywhere under the floor", () => {
    expect(
      shouldAdvanceMarker(marker(NOW), NOW + DIGEST_ADVANCE_FLOOR_MS - 1),
    ).toBe(false);
  });
  it("advances exactly at the floor, and past it", () => {
    expect(
      shouldAdvanceMarker(marker(NOW), NOW + DIGEST_ADVANCE_FLOOR_MS),
    ).toBe(true);
    expect(
      shouldAdvanceMarker(marker(NOW), NOW + DIGEST_ADVANCE_FLOOR_MS + 1),
    ).toBe(true);
  });
  it("never advances backwards, so a clock skew cannot erase the baseline", () => {
    expect(shouldAdvanceMarker(marker(NOW), NOW - 1_000)).toBe(false);
  });
});
describe("buildDigest first visit", () => {
  it("names the degraded case instead of reporting a league with no changes", () => {
    const d = buildDigest(h, input(null));
    expect(d.state).toBe("first-visit");
    expect(d.seenAt).toBeNull();
    expect(d.sinceLabel).toBeNull();
    expect(d.metricsTracked).toBe(false);
    expect(d.totals).toEqual({ trades: 0, picks: 0, moves: 0 });
  });
  it("still hands back a snapshot to record, or the next visit repeats the degrade", () => {
    const metrics = metricRows(h.rosters.length);
    expect(buildDigest(h, input(null, { metrics })).nextMetrics).toEqual(
      metrics,
    );
  });
});
describe("buildDigest trades", () => {
  const tradeCount = h.transactions.filter((t) => t.type === "trade").length;
  it("surfaces the whole trade history against a marker older than the league", () => {
    const d = buildDigest(h, input(marker(1)));
    expect(tradeCount).toBeGreaterThan(0);
    expect(d.totals.trades).toBe(tradeCount);
    expect(d.state).toBe("changes");
  });
  it("surfaces nothing against a marker set at this instant", () => {
    const d = buildDigest(h, input(marker(NOW)));
    expect(d.totals).toEqual({ trades: 0, picks: 0, moves: 0 });
    expect(d.state).toBe("quiet");
  });
  it("is monotonic in the marker: an older marker never reports fewer trades", () => {
    const created = h.transactions
      .filter((t) => t.type === "trade")
      .map((t) => t.created)
      .sort((a, b) => a - b);
    const cuts = [1, ...created, NOW];
    let previous = Infinity;
    for (const cut of cuts) {
      const total = buildDigest(h, input(marker(cut))).totals.trades;
      expect(total).toBeLessThanOrEqual(previous);
      previous = total;
    }
    expect(previous).toBe(0);
  });
  it("excludes anything at or before the marker, which is what makes it a diff", () => {
    const created = h.transactions
      .filter((t) => t.type === "trade")
      .map((t) => t.created);
    const cut = created.sort((a, b) => a - b)[Math.floor(created.length / 2)];
    const d = buildDigest(h, input(marker(cut)));
    for (const t of d.trades) expect(t.created).toBeGreaterThan(cut);
  });
  it("orders newest first", () => {
    const d = buildDigest(h, input(marker(1)));
    for (let i = 1; i < d.trades.length; i++) {
      expect(d.trades[i].created).toBeLessThanOrEqual(d.trades[i - 1].created);
    }
  });
  it("writes the viewer's own trades in second person and the rest neutrally", () => {
    const d = buildDigest(h, input(marker(1)));
    const mine = d.trades.filter((t) => t.mine);
    const theirs = d.trades.filter((t) => !t.mine);
    expect(mine.length + theirs.length).toBeGreaterThan(0);
    for (const t of mine) expect(t.description.startsWith("You ")).toBe(true);
    for (const t of theirs)
      expect(t.description.startsWith("You ")).toBe(false);
  });
  it("caps the rendered list but still reports the true total", () => {
    const d = buildDigest(h, input(marker(1)));
    expect(d.trades.length).toBeLessThanOrEqual(MAX_TRADES);
    expect(d.totals.trades).toBeGreaterThanOrEqual(d.trades.length);
  });
});
describe("buildDigest resolved picks", () => {
  const picks = [
    pick("a", NOW - 5_000, 1),
    pick("b", NOW - 4_000, 2),
    pick("c", NOW - 3_000, 1),
  ];
  it("only reports picks whose draft landed after the marker", () => {
    const d = buildDigest(h, input(marker(NOW - 4_500), { picks }));
    expect(d.picks.map((p) => p.key)).toEqual(["c", "b"]);
  });
  it("flags the viewer's own picks", () => {
    const d = buildDigest(h, input(marker(1), { picks }));
    const mine = d.picks.filter((p) => p.mine).map((p) => p.key);
    expect(mine.sort()).toEqual(["a", "c"]);
  });
  it("caps the rendered list but still reports the true total", () => {
    const many = Array.from({ length: MAX_PICKS + 4 }, (_, i) =>
      pick(`p${i}`, NOW - i - 1, 1),
    );
    const d = buildDigest(h, input(marker(1), { picks: many }));
    expect(d.picks).toHaveLength(MAX_PICKS);
    expect(d.totals.picks).toBe(many.length);
  });
});
describe("buildDigest metric movement", () => {
  const base = metricRows(h.rosters.length, 3);
  function shifted(rosterId, dTci, dFrag) {
    return base.map((r) =>
      r.rosterId === rosterId
        ? {
            ...r,
            tci: Math.min(100, Math.max(0, r.tci + dTci)),
            fragility: Math.min(100, Math.max(0, r.fragility + dFrag)),
          }
        : r,
    );
  }
  it("reports nothing when no roster moved", () => {
    const d = buildDigest(h, input(marker(1, base), { metrics: base }));
    expect(d.totals.moves).toBe(0);
  });
  it("ignores movement below the threshold, so the panel is not noise", () => {
    const metrics = shifted(
      2,
      TCI_MOVE_THRESHOLD - 1,
      FRAGILITY_MOVE_THRESHOLD - 1,
    );
    const d = buildDigest(h, input(marker(1, base), { metrics }));
    expect(d.moves.filter((m) => m.rosterId === 2)).toHaveLength(0);
  });
  it("reports a shift at the threshold with the right direction and endpoints", () => {
    const before = base.find((r) => r.rosterId === 3);
    // Shift down so the clamp at 100 can never swallow the move.
    const metrics = shifted(3, -TCI_MOVE_THRESHOLD, 0);
    const move = buildDigest(h, input(marker(1, base), { metrics })).moves.find(
      (m) => m.rosterId === 3 && m.metric === "tci",
    );
    expect(move).toBeDefined();
    expect(move.from).toBe(before.tci);
    expect(move.to).toBe(before.tci - TCI_MOVE_THRESHOLD);
    expect(move.delta).toBe(-TCI_MOVE_THRESHOLD);
  });
  it("puts the viewer's own roster first however small its shift", () => {
    const me = h.me.rosterId;
    const metrics = base.map((r) => {
      if (r.rosterId === me)
        return { ...r, tci: Math.max(0, r.tci - TCI_MOVE_THRESHOLD) };
      return { ...r, tci: Math.max(0, r.tci - 40) };
    });
    const d = buildDigest(h, input(marker(1, base), { metrics }));
    expect(d.moves[0].rosterId).toBe(me);
    expect(d.moves[0].mine).toBe(true);
  });
  it("says movement is untracked when the marker carries no snapshot", () => {
    const d = buildDigest(h, input(marker(1, [])));
    expect(d.metricsTracked).toBe(false);
    expect(d.totals.moves).toBe(0);
  });
  it("cannot invent movement for a roster that has no baseline", () => {
    const partial = base.filter((r) => r.rosterId !== 4);
    const metrics = shifted(4, -50, 0);
    const d = buildDigest(h, input(marker(1, partial), { metrics }));
    expect(d.moves.some((m) => m.rosterId === 4)).toBe(false);
  });
  it("caps the rendered list but still reports the true total", () => {
    const metrics = base.map((r) => ({ ...r, tci: Math.max(0, r.tci - 30) }));
    const d = buildDigest(h, input(marker(1, base), { metrics }));
    expect(d.moves.length).toBeLessThanOrEqual(MAX_MOVES);
    expect(d.totals.moves).toBeGreaterThan(MAX_MOVES);
  });
});
describe("buildDigest as a whole", () => {
  it("is deterministic across repeated calls", () => {
    const args = input(marker(1, metricRows(h.rosters.length, 11)), {
      picks: [pick("a", NOW - 1, 1)],
    });
    expect(buildDigest(h, args)).toEqual(buildDigest(h, args));
  });
  it("only claims changes when it has at least one thing to show", () => {
    for (const cut of [1, NOW / 2, NOW]) {
      const d = buildDigest(h, input(marker(Math.round(cut))));
      const shown = d.totals.trades + d.totals.picks + d.totals.moves;
      expect(d.state).toBe(shown > 0 ? "changes" : "quiet");
    }
  });
  it("carries the marker forward so a repeat visit advances", () => {
    const d = buildDigest(h, input(marker(1)));
    expect(d.seenAt).toBe(1);
    expect(d.nextMetrics.length).toBe(h.rosters.length);
  });
});
describe("formatSince", () => {
  it("never goes backwards as the gap grows", () => {
    const gaps = [0, 1_000, 60_000, 3_600_000, 86_400_000, 8 * 86_400_000];
    const labels = gaps.map((g) => formatSince(NOW - g, NOW));
    expect(new Set(labels).size).toBeGreaterThan(3);
    expect(labels[0]).toBe("just now");
  });
  it("reads naturally at each boundary", () => {
    expect(formatSince(NOW - 5 * 60_000, NOW)).toBe("5 minutes ago");
    expect(formatSince(NOW - 3_600_000, NOW)).toBe("an hour ago");
    expect(formatSince(NOW - 86_400_000, NOW)).toBe("yesterday");
    expect(formatSince(NOW - 3 * 86_400_000, NOW)).toBe("3 days ago");
    expect(formatSince(NOW - 40 * 86_400_000, NOW)).toBe("a month ago");
    expect(formatSince(NOW - 800 * 86_400_000, NOW)).toBe("2 years ago");
  });
  it("does not produce a negative phrase when a clock runs backwards", () => {
    expect(formatSince(NOW + 60_000, NOW)).toBe("just now");
  });
});
describe("currentMetrics", () => {
  it("covers every roster exactly once, in a stable order", () => {
    const rows = currentMetrics(h);
    expect(rows).toHaveLength(h.rosters.length);
    expect(new Set(rows.map((r) => r.rosterId)).size).toBe(rows.length);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].rosterId).toBeGreaterThan(rows[i - 1].rosterId);
    }
  });
  it("produces bounded integers, which is what the cookie codec promises", () => {
    for (const r of currentMetrics(h)) {
      for (const v of [r.tci, r.fragility]) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
  it("survives a round trip through the cookie unchanged", () => {
    const rows = currentMetrics(h);
    expect(parseMarker(encodeMarker(marker(NOW, rows)))?.metrics).toEqual(rows);
  });
});
describe("digestCookieName - one marker per identity, not one per browser", () => {
  it("keeps the historical bare name for a browser with no identity at all", () => {
    // A returning reader who somehow has neither a seat nor a lens keeps whatever
    // marker they already had, rather than being handed a spurious first visit.
    expect(digestCookieName("default")).toBe(DIGEST_COOKIE);
    expect(digestCookieName("")).toBe(DIGEST_COOKIE);
  });
  it("gives each identity its own cookie - the cross-contamination bug, pinned", () => {
    // The live symptom: flip the lens to a leaguemate and the panel announced
    // "nothing has moved since just now", because your own visit thirty seconds
    // earlier had already advanced the only marker in the browser.
    const mine = digestCookieName("462383675828461568");
    const lens = digestCookieName("r7");
    expect(mine).not.toBe(lens);
    expect(mine).not.toBe(DIGEST_COOKIE);
    expect(lens).not.toBe(DIGEST_COOKIE);
  });
  it("is stable for one identity, so a marker survives a reload", () => {
    expect(digestCookieName("r7")).toBe(digestCookieName("r7"));
  });
  it("emits a legal cookie NAME whatever it is handed", () => {
    // Cookie names have a narrower legal set than values and no encoding layer to
    // lean on, so anything outside it is dropped rather than escaped.
    for (const hostile of ["a b", "a;b=c", "a=b", "a\nb", "../../etc", "ü"]) {
      expect(digestCookieName(hostile)).toMatch(
        /^parquet_digest_seen(_[A-Za-z0-9_-]+)?$/,
      );
    }
  });
  it("bounds the name, so a hand-edited cookie cannot grow the header", () => {
    expect(digestCookieName("x".repeat(500)).length).toBeLessThanOrEqual(
      DIGEST_COOKIE.length + 65,
    );
  });
});
