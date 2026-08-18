import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory.js";
import { buildPrincipals } from "../principals.js";
import { buildTradeLedger } from "./index.js";
import {
  dealHref,
  dealsQueryString,
  EMPTY_DEALS_URL,
  lineageHref,
  managerDealsHref,
  pairDealsHref,
  parseDealsParams,
  playerLineageHref,
} from "./url.js";
const reader = (o) => ({ get: (k) => o[k] ?? null });
describe("the deal URL", () => {
  it("is one path segment per deal", () => {
    expect(dealHref("1234567890")).toBe("/deals/1234567890");
  });
  it("escapes a coalesced multi-team id rather than splicing it into the path raw", () => {
    // `coalesceCommissionerTrades` stitches several transactions into one synthetic
    // id joined with `+`, which is a space in a path segment if left unencoded.
    const id = "coalesced-111+222+333";
    expect(dealHref(id)).toBe("/deals/coalesced-111%2B222%2B333");
    expect(decodeURIComponent(dealHref(id).slice("/deals/".length))).toBe(id);
  });
});
describe("the lineage URL", () => {
  it("carries an asset key, player or pick", () => {
    expect(lineageHref("p:4892")).toBe("/lineage/p%3A4892");
    expect(lineageHref("k:2025-1-11")).toBe("/lineage/k%3A2025-1-11");
    expect(playerLineageHref("4892")).toBe(lineageHref("p:4892"));
  });
  it("round-trips through decodeURIComponent, which is what the route does", () => {
    for (const key of ["p:4892", "k:2025-1-11", "k:2027-3-14"]) {
      expect(
        decodeURIComponent(lineageHref(key).slice("/lineage/".length)),
      ).toBe(key);
    }
  });
});
describe("the deal index filters", () => {
  it("reads nothing out of an empty query string", () => {
    expect(parseDealsParams(reader({}))).toEqual(EMPTY_DEALS_URL);
    expect(dealsQueryString(EMPTY_DEALS_URL)).toBe("");
  });
  it("lets the more specific filter win rather than throwing the URL out", () => {
    const s = parseDealsParams(reader({ pair: "u1-u2", manager: "u9" }));
    expect(s.pair).toBe("u1-u2");
    expect(s.manager).toBeNull();
  });
  it("round-trips a pair and a manager through their own helpers", () => {
    expect(pairDealsHref("u1-u2")).toBe("/deals?pair=u1-u2");
    expect(managerDealsHref("u9")).toBe("/deals?manager=u9");
    expect(parseDealsParams(reader({ pair: "u1-u2" })).pair).toBe("u1-u2");
    expect(parseDealsParams(reader({ manager: "u9" })).manager).toBe("u9");
  });
  it("keeps the season alongside either filter", () => {
    expect(
      dealsQueryString({ manager: "u9", pair: null, season: "2024" }),
    ).toBe("?manager=u9&season=2024");
    const s = parseDealsParams(reader({ manager: "u9", season: "2024" }));
    expect(s).toEqual({ manager: "u9", pair: null, season: "2024" });
  });
  it("degrades untrusted input to absent instead of throwing", () => {
    // A URL is hand-editable and old links outlive the shapes they were written
    // against. Nothing here may throw; the caller checks the ids against the ledger.
    expect(parseDealsParams(reader({ manager: "   " })).manager).toBeNull();
    expect(parseDealsParams(reader({ pair: "x".repeat(300) })).pair).toBeNull();
    expect(parseDealsParams(reader({ season: "" })).season).toBeNull();
  });
  it("accepts a coalesced id at its real length rather than capping it too tight", () => {
    // A real coalesced id already runs past 100 characters. A tight cap here would
    // silently refuse the league's biggest deals.
    const long = `coalesced-${Array.from({ length: 6 }, (_, i) => `11111111111111111${i}`).join("+")}`;
    expect(long.length).toBeGreaterThan(100);
    expect(parseDealsParams(reader({ pair: long })).pair).toBe(long);
  });
});
/**
 * The pairing's two counts are NOT interchangeable, and the difference was live in a
 * headline: `/deals` sorted on the dossier-derived figure and announced "busiest
 * pairing: kdewitt4 and 6-Month Plan, 8 deals" when kdewitt4 has done 2 with them and
 * the other 6 belong to NSLKB, who left the league in 2024. The dossier fold is
 * ROSTER-keyed, so a seat that has changed hands blends both managers who held it -
 * exactly the D22 failure, surfacing in a sentence.
 */
describe("the pairing's two counts", () => {
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
  const ledger = buildTradeLedger(h, principals);
  it("reports dealCount as exactly what can be listed", () => {
    expect(ledger.pairings.length).toBeGreaterThan(0);
    for (const p of ledger.pairings) {
      expect(p.dealCount).toBe(p.tradeIds.length);
      // Never undersold: the dossier figure is a ceiling, never a floor breach.
      expect(p.dossierCount).toBeGreaterThanOrEqual(p.dealCount);
    }
  });
  it("sorts on the listable count, so the busiest pairing is one you can open", () => {
    const listed = ledger.pairings.map((p) => p.dealCount);
    expect([...listed].sort((a, b) => b - a)).toEqual(listed);
    // The headline figure must be reachable: filtering to that pair yields that many
    // deals, which is the property the dossier-derived count does not have.
    const top = ledger.pairings[0];
    const ids = new Set(top.tradeIds);
    expect(ledger.trades.filter((t) => ids.has(t.id))).toHaveLength(
      top.dealCount,
    );
  });
});
