import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory.js";
import { getPrincipals } from "../principals.js";
import { analyzeRoster } from "../roster.js";
import {
  buildGamePlan,
  consolidationSends,
  deadWeightOf,
  diagnose,
  isDevelopmental,
  DEAD_THRESHOLD,
  STAR_THRESHOLD,
} from "./index.js";
describe("gameplan diagnose", () => {
  it("classifies a top-half, star-heavy roster as contend", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const dx = diagnose(h, 1, principals);
    expect(dx.direction).toBe("contend");
    expect(dx.headline.length).toBeGreaterThan(0);
    expect(dx.because.length).toBeGreaterThan(0);
    expect(dx.valueRank).toBeGreaterThanOrEqual(1);
    expect(dx.teams).toBe(h.rosters.length);
  });
  it("classifies a young, asset-poor bottom-half roster as rebuild", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const dx = diagnose(h, 2, principals);
    expect(dx.direction).toBe("rebuild");
  });
  it("classifies a mid-pack roster as retool", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const dx = diagnose(h, 5, principals);
    expect(dx.direction).toBe("retool");
  });
  it("computes weak/strong positions relative to the roster's own average, not fixed cutoffs", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const dx = diagnose(h, 1, principals);
    for (const pos of [...dx.weakPositions, ...dx.strengthPositions]) {
      expect(["PG", "SG", "SF", "PF", "C"]).toContain(pos);
    }
    // A position cannot be both a weakness and a strength at once.
    expect(dx.weakPositions.some((p) => dx.strengthPositions.includes(p))).toBe(
      false,
    );
  });
});
describe("gameplan buildGamePlan", () => {
  it("a contending roster gets consolidation-flavored moves, never rebuild-flavored ones", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const gp = buildGamePlan(h, 1, principals);
    expect(gp.diagnosis.direction).toBe("contend");
    const ids = gp.moves.map((m) => m.id);
    expect(ids).toContain("consolidate");
    expect(ids).not.toContain("sell-vets");
    expect(ids).not.toContain("buy-youth");
  });
  it("a rebuilding roster gets sell/buy-youth moves, never consolidate-into-a-star", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const gp = buildGamePlan(h, 2, principals);
    expect(gp.diagnosis.direction).toBe("rebuild");
    const ids = gp.moves.map((m) => m.id);
    expect(ids).toContain("buy-youth");
    expect(ids).not.toContain("consolidate");
    expect(ids).not.toContain("cash-picks");
  });
  it("a retooling roster gets a 'pick a lane' caveat naming the mid-pack bind", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const gp = buildGamePlan(h, 5, principals);
    expect(gp.diagnosis.direction).toBe("retool");
    expect(gp.caveats.some((c) => /mid-pack/i.test(c))).toBe(true);
  });
  it("every move names its cost, and never names a partner at all", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    for (const rosterId of [1, 2, 5]) {
      const gp = buildGamePlan(h, rosterId, principals);
      const owned = new Set(
        analyzeRoster(h, rosterId).valued.map((v) => v.playerId),
      );
      for (const m of gp.moves) {
        expect(m.cost.length).toBeGreaterThan(0);
        expect(m.give.length).toBeGreaterThan(0);
        expect(m.get.length).toBeGreaterThan(0);
        /*
         * NO MOVE PICKS A PARTNER ANY MORE (SHELVED S11). `choosePartner` scored
         * leaguemates off dossier tags with no check that either roster held an asset
         * the other one wanted, so it could name a counterparty the trade finder's own
         * search finds nothing with, three taps away on the same roster. The moves now
         * carry at most an asset id, and /plan hands the question to the finder.
         */
        expect(m.partnerRosterId).toBeUndefined();
        expect(m.partnerName).toBeUndefined();
        // A forced asset must be one the viewer actually owns, or absent.
        expect(m).toHaveProperty("moveAssetId");
        if (m.moveAssetId != null) expect(owned.has(m.moveAssetId)).toBe(true);
      }
    }
  });
  it("flags dead-weight streamlining only once three or more sub-threshold bodies exist", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const gp = buildGamePlan(h, 3, principals);
    const streamline = gp.moves.find((m) => m.id === "streamline");
    if (streamline) {
      expect(streamline.give.length).toBeGreaterThanOrEqual(1);
      expect(streamline.title).toMatch(/\d+ dead-weight/);
    }
  });
  it("is deterministic for the same roster and history", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const a = buildGamePlan(h, 1, principals);
    const b = buildGamePlan(h, 1, principals);
    expect(a).toEqual(b);
  });
});
/*
 * D116 - DEVELOPMENTAL PLAYERS ARE NOT CUTS OR SALE STOCK, AND CUTS START AT THE BOTTOM.
 *
 * The live failure: on a 5-15 rebuilding roster the plan said to package the #4 overall
 * rookie pick (age 19) for a star and to cut the #7 overall pick two weeks after the
 * draft. The cut list was also the three HIGHEST-valued sub-250 players, and the
 * ascend consolidation sent the two highest-valued mid-tier players, youth included.
 */
describe("gameplan developmental protection (D116)", () => {
  const row = (playerId, value, age) => ({
    playerId,
    name: playerId,
    value,
    age,
  });
  const withYearsExp = (entries) => ({ players: new Map(entries) });
  it("treats yearsExp <= 1 or age <= 21 as developmental, and a missing yearsExp as not a rookie", () => {
    const h = withYearsExp([
      ["rookie", { yearsExp: 0 }],
      ["soph", { yearsExp: 1 }],
      ["vet", { yearsExp: 6 }],
    ]);
    expect(isDevelopmental(row("rookie", 100, 24), h)).toBe(true);
    expect(isDevelopmental(row("soph", 100, 25), h)).toBe(true);
    expect(isDevelopmental(row("vet", 100, 21), h)).toBe(true);
    expect(isDevelopmental(row("vet", 100, 22), h)).toBe(false);
    expect(isDevelopmental(row("unknown", 100, 26), h)).toBe(false);
  });
  it("never lists a rookie (yearsExp 0) under the dead-weight line as a cut", () => {
    const h = withYearsExp([
      ["rookie", { yearsExp: 0 }],
      ["a", { yearsExp: 5 }],
      ["b", { yearsExp: 5 }],
      ["c", { yearsExp: 5 }],
    ]);
    // The rookie is the cheapest body, so the ascending order would put him first.
    const dead = deadWeightOf(
      [row("a", 240, 27), row("b", 180, 28), row("c", 90, 30), row("rookie", 40, 22)],
      h,
    );
    expect(dead.map((v) => v.playerId)).not.toContain("rookie");
    expect(dead).toHaveLength(3);
  });
  it("orders the cut list worst body first", () => {
    const valued = [240, 200, 150, 120, 60, 10].map((v, i) =>
      row(`p${i}`, v, 28),
    );
    const values = deadWeightOf(valued, withYearsExp([])).map((v) => v.value);
    expect(values).toEqual([10, 60, 120, 150, 200, 240]);
  });
  it("ascend consolidation sends the oldest expendable depth and never a 19-year-old", () => {
    const h = withYearsExp([]);
    // Value-DESC, as midTier arrives from analyzeRoster: the 19-year-old is the most
    // valuable mid-tier piece, so the old midTier[0] rule would have sent him.
    const midTier = [
      row("teen", 3000, 19),
      row("prime", 2500, 25),
      row("older", 1200, 31),
      row("oldest-cheap", 800, 33),
      row("oldest-dear", 1500, 33),
    ];
    const sends = consolidationSends(midTier, "ascend", h).map((v) => v.playerId);
    expect(sends).not.toContain("teen");
    expect(sends.slice(0, 2)).toEqual(["oldest-cheap", "oldest-dear"]);
    // A contender may still sell youth for wins, so its order is untouched.
    expect(consolidationSends(midTier, "contend", h)[0].playerId).toBe("teen");
  });
  it("on the fixture league, marking a sub-line body as a rookie removes him from every cut list", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    let checked = 0;
    for (const r of h.rosters) {
      const valued = analyzeRoster(h, r.rosterId).valued;
      const sub = valued.filter((v) => v.value < DEAD_THRESHOLD);
      // Moves name players, and the generated fixture reuses names (two "Darnell
      // Nowak"s can share a roster), so only a roster-unique name is a fair probe.
      const unique = (v) => valued.filter((x) => x.name === v.name).length === 1;
      // The lowest-valued such body: the one the ascending cut list would lead with.
      const target = [...sub].reverse().find(unique);
      if (!target) continue;
      const p = h.players.get(target.playerId);
      h.players.set(target.playerId, { ...p, yearsExp: 0 });
      const gp = buildGamePlan(h, r.rosterId, principals);
      const streamline = gp.moves.find((m) => m.id === "streamline");
      if (streamline) {
        expect(streamline.give).not.toContain(target.name);
        // give arrives worst first.
        const byName = new Map(sub.map((v) => [v.name, v.value]));
        const vals = streamline.give.map((n) => byName.get(n));
        expect([...vals].sort((x, y) => x - y)).toEqual(vals);
      }
      for (const m of gp.moves) {
        if (m.id === "streamline") continue;
        if (gp.diagnosis.direction !== "contend")
          expect(m.give).not.toContain(target.name);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
describe("gameplan thresholds", () => {
  it("keeps the dead-weight cutoff well below the star cutoff", () => {
    expect(DEAD_THRESHOLD).toBeLessThan(STAR_THRESHOLD);
  });
});
