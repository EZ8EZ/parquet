import { describe, expect, it } from "vitest";
import { buildFixtureHistory } from "../testing/fixtureHistory";
import { getPrincipals } from "../principals";
import { diagnose } from "../gameplan";
import { analyzeRoster, leagueValueRanking, type RosterAnalysis } from "../roster";
import { leagueWindows, windowShort, windowThesis } from "../metrics/window";
import {
  appetiteFor,
  assetsOf,
  findTrades,
  partnerBoard,
  perceive,
  price,
  searchPackages,
  stanceOf,
  CONSOLIDATION_PREMIUM,
  FAIR_BAND,
  FIT_CLAMP,
  STAR_VALUE,
  type Appetite,
  type FinderAsset,
  type Priced,
  type RawPackage,
} from "./index";

// --------------------------------------------------------------------- builders

function player(
  id: string,
  value: number,
  age: number | null,
  position: string | null = "SF",
): FinderAsset {
  return { kind: "player", id, label: `P-${id}`, value, age, position };
}

function pick(id: string, value: number, season = "2028", round = 1): FinderAsset {
  return {
    kind: "pick",
    id,
    label: `${season} R${round}`,
    value,
    age: null,
    position: null,
    pick: { round, season, originalRosterId: 9 },
  };
}

/** Minimal appetite, so each test states only the tell it is about. */
function appetite(over: Partial<Appetite> = {}): Appetite {
  return {
    rosterId: 1,
    name: "Team 1",
    window: "balanced",
    stance: "retool",
    viewer: false,
    wantsNow: false,
    wantsFuture: false,
    wantsPicks: false,
    wantsStars: false,
    picksAreAmmo: false,
    weakPositions: [],
    strongPositions: [],
    paysForAge: false,
    hoardsPicks: false,
    buildsYouth: false,
    reluctant: false,
    tags: [],
    ...over,
  };
}

/** A RosterAnalysis with only the fields the appetite read actually looks at. */
function analysis(over: Partial<RosterAnalysis> = {}): RosterAnalysis {
  return {
    rosterId: 1,
    ownerName: "owner",
    teamName: "Team",
    valued: [],
    totalValue: 0,
    playerValue: 0,
    picks: { picks: [], total: 0, firsts: 0, extraFirsts: 0, seasons: [] },
    coreAge: 26,
    byPosition: [],
    window: "balanced",
    record: { wins: 0, losses: 0 },
    ...over,
  };
}

const valued = (value: number) => ({ value }) as RosterAnalysis["valued"][number];

// -------------------------------------------------------------------- perceive

describe("perceive: what a side thinks an asset is worth", () => {
  it("prices the same prime veteran in opposite directions for a contender and a rebuilder", () => {
    const vet = player("vet", 2000, 31);
    const now = perceive(vet, appetite({ wantsNow: true }));
    const later = perceive(vet, appetite({ wantsFuture: true }));
    expect(now.value).toBeGreaterThan(vet.value);
    expect(later.value).toBeLessThan(vet.value);
    // The gap between the two views IS the trade. If it were zero there would be
    // nothing to propose.
    expect(now.value - later.value).toBeGreaterThan(0);
  });

  it("stops paying a win-now premium for players past their prime", () => {
    // The finder once described a 36-year-old as what a contender's window needed,
    // which is the kind of line that costs a tool its credibility in one screen.
    const contender = appetite({ wantsNow: true });
    expect(perceive(player("a", 1000, 33), contender).value).toBeGreaterThan(1000);
    expect(perceive(player("b", 1000, 36), contender).value).toBe(1000);
  });

  it("prices the same young player in opposite directions", () => {
    const kid = player("kid", 2000, 21);
    expect(perceive(kid, appetite({ wantsFuture: true })).value).toBeGreaterThan(2000);
    expect(perceive(kid, appetite({ wantsNow: true })).value).toBeLessThan(2000);
  });

  it("prices picks up for a hoarder, down for a contender, and up for a team ahead of schedule", () => {
    const p = pick("k", 1500);
    expect(
      perceive(p, appetite({ wantsPicks: true, hoardsPicks: true })).value,
    ).toBeGreaterThan(1500);
    expect(perceive(p, appetite({ wantsNow: true })).value).toBeLessThan(1500);
    // Ahead of schedule: the picks are ammunition, so they cost more to pry loose.
    expect(perceive(p, appetite({ picksAreAmmo: true })).value).toBeGreaterThan(1500);
  });

  it("applies positional need as a premium and positional surplus as a discount", () => {
    const c = player("c", 1000, 26, "C");
    expect(perceive(c, appetite({ weakPositions: ["C"] })).value).toBeGreaterThan(1000);
    expect(perceive(c, appetite({ strongPositions: ["C"] })).value).toBeLessThan(1000);
    // A position the side has no opinion about moves nothing.
    expect(perceive(c, appetite({ weakPositions: ["PG"] })).value).toBe(1000);
  });

  it("fires the name-chaser tell only on genuinely old players", () => {
    const chaser = appetite({ paysForAge: true });
    expect(perceive(player("a", 1000, 31), chaser).value).toBeGreaterThan(1000);
    expect(perceive(player("b", 1000, 27), chaser).value).toBe(1000);
  });

  it("never lets stacked tells move an asset more than the clamp", () => {
    const stacked = appetite({
      wantsNow: true,
      wantsStars: true,
      weakPositions: ["SF"],
      paysForAge: true,
    });
    expect(perceive(player("s", 5000, 32, "SF"), stacked).value).toBeLessThanOrEqual(
      Math.round(5000 * (1 + FIT_CLAMP)),
    );
    const negative = appetite({ wantsFuture: true, strongPositions: ["SF"] });
    expect(perceive(player("s", 5000, 34, "SF"), negative).value).toBeGreaterThanOrEqual(
      Math.round(5000 * (1 - FIT_CLAMP)),
    );
  });

  it("signs every reason, so a discount can never be quoted as an argument for a trade", () => {
    const p = perceive(
      player("x", 1000, 22, "C"),
      appetite({ wantsNow: true, strongPositions: ["C"] }),
    );
    expect(p.value).toBeLessThan(1000);
    expect(p.reasons.length).toBeGreaterThan(0);
    expect(p.reasons.every((r) => r.sign === -1)).toBe(true);
  });

  it("writes the viewer's reasons in the second person and the partner's in the third", () => {
    const asset = player("v", 1000, 26, "C");
    const yours = perceive(asset, appetite({ viewer: true, weakPositions: ["C"] }));
    const theirs = perceive(asset, appetite({ viewer: false, weakPositions: ["C"] }));
    expect(yours.reasons[0].text).toContain("your");
    expect(theirs.reasons[0].text).toContain("their");
  });

  it("is deterministic", () => {
    const a = appetite({ wantsNow: true, weakPositions: ["SF"] });
    expect(perceive(player("d", 1234, 29, "SF"), a)).toEqual(
      perceive(player("d", 1234, 29, "SF"), a),
    );
  });
});

// -------------------------------------------------------------------- appetite

describe("stance and appetite", () => {
  it("reads an old, top-half, star-heavy roster as contending", () => {
    // Two cornerstone-tier assets, using /plan's own threshold for the word.
    const a = analysis({ coreAge: 27.5, valued: [valued(5000), valued(4600)] });
    expect(stanceOf(a, 2, 14)).toBe("contend");
    const ap = appetiteFor(a, 2, 14);
    expect(ap.wantsNow).toBe(true);
    expect(ap.wantsStars).toBe(true);
    expect(ap.wantsFuture).toBe(false);
  });

  it("reads a young top-half roster as ascending, not as a seller of youth or picks", () => {
    // The /plan `ascend` trap: ahead of schedule is not the same as rebuilding, and a
    // finder that conflated them would recommend cashing the very assets that make the
    // roster good.
    const ap = appetiteFor(analysis({ window: "rebuilding" }), 3, 14);
    expect(ap.stance).toBe("ascend");
    expect(ap.wantsFuture).toBe(false);
    expect(ap.wantsNow).toBe(false);
    expect(ap.picksAreAmmo).toBe(true);
  });

  it("reads a young bottom-half roster as rebuilding, picks included", () => {
    const ap = appetiteFor(analysis({ window: "rebuilding" }), 12, 14);
    expect(ap.stance).toBe("rebuild");
    expect(ap.wantsFuture).toBe(true);
    expect(ap.wantsPicks).toBe(true);
    // A rebuilder is the one team that should be willing to move its best player.
    expect(ap.wantsStars).toBe(false);
  });

  it("derives holes and surplus from byPosition, mean-relative", () => {
    const ap = appetiteFor(
      analysis({
        byPosition: [
          { pos: "PG", count: 3, value: 9000 },
          { pos: "SG", count: 1, value: 200 },
          { pos: "SF", count: 2, value: 1800 },
        ],
      }),
      7,
      14,
    );
    expect(ap.strongPositions).toContain("PG");
    expect(ap.weakPositions).toContain("SG");
    // A position nobody is rostered at is a hole too, which is correct.
    expect(ap.weakPositions).toContain("C");
  });

  /**
   * The anti-drift guard. This engine re-derives the four-way direction rather than
   * calling /plan's `diagnose` (which re-runs the whole league ranking per call, once
   * per leaguemate here). That is only safe as long as the two agree on every roster.
   */
  it("agrees with /plan's diagnosis on every roster in the league", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const ranking = leagueValueRanking(h);
    ranking.forEach((a, i) => {
      expect(stanceOf(a, i + 1, ranking.length)).toBe(
        diagnose(h, a.rosterId, principals).direction,
      );
    });
  });

  /** The same guard for the definition of a positional hole. */
  it("agrees with /plan about which positions are holes", async () => {
    const h = buildFixtureHistory();
    const principals = await getPrincipals(h);
    const ranking = leagueValueRanking(h);
    for (const a of ranking.slice(0, 5)) {
      const dx = diagnose(h, a.rosterId, principals);
      const ap = appetiteFor(a, ranking.indexOf(a) + 1, ranking.length);
      expect(ap.weakPositions).toEqual(dx.weakPositions);
      expect(ap.strongPositions).toEqual(dx.strengthPositions);
    }
  });
});

// ---------------------------------------------------------------------- search

/** Price both sides and run the search, the way the entrypoints do. */
function run(
  mine: FinderAsset[],
  theirs: FinderAsset[],
  you: Appetite,
  partner: Appetite,
  max = 3,
): RawPackage[] {
  return searchPackages(
    price(mine, you, partner),
    price(theirs, partner, you),
    you,
    partner,
    max,
  );
}

const relative = (pkg: RawPackage) =>
  (pkg.getTotal - pkg.giveTotal) / (Math.max(pkg.getTotal, pkg.giveTotal) || 1);
const top = (list: Priced[]) => Math.max(...list.map((p) => p.asset.value));

describe("searchPackages invariants", () => {
  // A contender with surplus depth and picks, against a rebuilder holding one star.
  const contender = appetite({
    rosterId: 1,
    viewer: true,
    stance: "contend",
    wantsNow: true,
    wantsStars: true,
    weakPositions: ["C"],
  });
  const rebuilder = appetite({
    rosterId: 2,
    stance: "rebuild",
    wantsFuture: true,
    wantsPicks: true,
    hoardsPicks: true,
    weakPositions: ["PG"],
  });
  const mine = [
    player("m1", 2400, 22, "PG"),
    player("m2", 2100, 23, "SG"),
    player("m3", 1400, 24, "SF"),
    player("m4", 900, 33, "PF"),
    pick("mp1", 1600),
    pick("mp2", 1100, "2029", 1),
  ];
  const theirs = [
    player("t1", 5200, 29, "C"),
    player("t2", 1900, 31, "PF"),
    player("t3", 800, 27, "SG"),
  ];

  it("finds mutually positive packages when the two sides want different things", () => {
    const out = run(mine, theirs, contender, rebuilder);
    expect(out.length).toBeGreaterThan(0);
    for (const pkg of out) {
      expect(pkg.yourGain).toBeGreaterThan(0);
      expect(pkg.theirGain).toBeGreaterThan(0);
      expect(pkg.mutual).toBe(Math.min(pkg.yourGain, pkg.theirGain));
    }
  });

  it("keeps every package inside the fair band, or inside the upward-consolidation premium", () => {
    for (const pkg of run(mine, theirs, contender, rebuilder, 4)) {
      const rel = relative(pkg);
      const upward =
        (rel < 0 &&
          pkg.get.length < pkg.give.length &&
          top(pkg.get) >= STAR_VALUE &&
          top(pkg.get) > top(pkg.give)) ||
        (rel > 0 &&
          pkg.give.length < pkg.get.length &&
          top(pkg.give) >= STAR_VALUE &&
          top(pkg.give) > top(pkg.get));
      const cap = upward ? CONSOLIDATION_PREMIUM : FAIR_BAND;
      expect(Math.abs(rel)).toBeLessThanOrEqual(cap + 1e-9);
    }
  });

  it("never asks a team that wants to win to downgrade its best asset", () => {
    // Swapping a superstar for two lesser stars is not consolidation, it is spreading
    // value thinner, and the band's premium must not licence it.
    const withStar = [player("star", 6000, 28, "SF"), ...mine];
    for (const pkg of run(withStar, theirs, contender, rebuilder, 4)) {
      if (top(pkg.give) >= STAR_VALUE)
        expect(top(pkg.get)).toBeGreaterThan(top(pkg.give));
    }
  });

  it("does not ask a CONTENDING partner to break up their star either", () => {
    const rival = appetite({
      rosterId: 2,
      stance: "contend",
      wantsNow: true,
      wantsStars: true,
      weakPositions: ["PG"],
    });
    for (const pkg of run(mine, theirs, contender, rival, 4)) {
      if (top(pkg.get) >= STAR_VALUE)
        expect(top(pkg.give)).toBeGreaterThan(top(pkg.get));
    }
  });

  it("lets a REBUILDING side sell its star for a bundle, with the value band as the guard", () => {
    const seller = appetite({
      rosterId: 1,
      viewer: true,
      stance: "rebuild",
      wantsFuture: true,
      wantsPicks: true,
      weakPositions: ["C"],
    });
    const buyer = appetite({
      rosterId: 2,
      stance: "contend",
      wantsNow: true,
      wantsStars: true,
      weakPositions: ["SF"],
    });
    const starRoster = [player("star", 5000, 31, "SF"), player("dep", 600, 27, "PG")];
    const buyerAssets = [
      player("b1", 2600, 22, "C"),
      player("b2", 2100, 21, "PG"),
      pick("bp1", 1400),
    ];
    const out = run(starRoster, buyerAssets, seller, buyer, 3);
    expect(out.length).toBeGreaterThan(0);
    const soldTheStar = out.filter((pkg) => top(pkg.give) >= STAR_VALUE);
    expect(soldTheStar.length).toBeGreaterThan(0);
    for (const pkg of soldTheStar) {
      // The bundle's top piece is allowed to be smaller than the star - that is what
      // selling one means - but the totals still have to line up.
      expect(Math.abs(relative(pkg))).toBeLessThanOrEqual(FAIR_BAND + 1e-9);
    }
  });

  /**
   * The zero-sum property, and the strongest statement this engine makes: two sides
   * that value every asset identically cannot both gain, so there is nothing to
   * suggest. Any output here would be an invented trade.
   */
  it("finds nothing when both sides perceive value identically", () => {
    expect(
      run(mine, theirs, appetite({ rosterId: 1, viewer: true }), appetite({ rosterId: 2 }), 4),
    ).toHaveLength(0);
  });

  it("surfaces one idea per headline target, not four spellings of one offer", () => {
    const heads = run(mine, theirs, contender, rebuilder, 4).map((p) => p.get[0].asset.id);
    expect(new Set(heads).size).toBe(heads.length);
  });

  it("respects the requested maximum and ranks by score descending", () => {
    const out = run(mine, theirs, contender, rebuilder, 2);
    expect(out.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < out.length; i++)
      expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
  });

  it("never puts the same asset on both sides of a package", () => {
    for (const pkg of run(mine, theirs, contender, rebuilder, 4)) {
      const ids = new Set(pkg.give.map((p) => p.asset.id));
      for (const g of pkg.get) expect(ids.has(g.asset.id)).toBe(false);
    }
  });

  it("keeps the reported totals consistent with the assets in the package", () => {
    for (const pkg of run(mine, theirs, contender, rebuilder, 4)) {
      const give = pkg.give.reduce((s: number, p: Priced) => s + p.asset.value, 0);
      const get = pkg.get.reduce((s: number, p: Priced) => s + p.asset.value, 0);
      expect(pkg.giveTotal).toBe(give);
      expect(pkg.getTotal).toBe(get);
      expect(pkg.delta).toBe(get - give);
    }
  });

  it("is deterministic across repeated runs", () => {
    expect(JSON.stringify(run(mine, theirs, contender, rebuilder, 4))).toBe(
      JSON.stringify(run(mine, theirs, contender, rebuilder, 4)),
    );
  });

  it("routes an aging asset toward the partner whose record says they pay for age", () => {
    // The dossier tip made executable: shop your vets where somebody overpays for
    // them. A rebuilder holding a 32-year-old, and one hole at PG.
    const seller = appetite({
      rosterId: 1,
      viewer: true,
      stance: "rebuild",
      wantsFuture: true,
      weakPositions: ["PG"],
    });
    const neutral = appetite({ rosterId: 2, weakPositions: ["SF"] });
    const chaser = appetite({ rosterId: 2, weakPositions: ["SF"], paysForAge: true });
    const pool = [player("old", 1800, 32, "PF"), player("m1", 1800, 24, "PF"), pick("mp1", 1700)];
    const target = [player("t1", 1900, 25, "PG")];
    const usedOld = (out: RawPackage[]) =>
      out.some((p) => p.give.some((g) => g.asset.id === "old"));
    expect(usedOld(run(pool, target, seller, chaser, 1))).toBe(true);
    expect(usedOld(run(pool, target, seller, neutral, 1))).toBe(false);
  });

  it("degrades safely on empty pools", () => {
    expect(run([], theirs, contender, rebuilder)).toHaveLength(0);
    expect(run(mine, [], contender, rebuilder)).toHaveLength(0);
    expect(run([], [], contender, rebuilder)).toHaveLength(0);
  });
});

// ----------------------------------------------------------------- integration

describe("findTrades against the fixture league", () => {
  const h = buildFixtureHistory();
  const me = h.rosters[0].rosterId;
  const them = h.rosters[1].rosterId;

  /**
   * STAR_VALUE is a literal on a rescalable scale, which is the shape of defect the
   * `tierOf` deletion exists to prevent (SHELVED S5): the number does not move when the
   * valuation model does, so a recalibration can leave it selecting everybody or nobody
   * without anything throwing. Its docstring promises it is re-checked against the
   * distribution rather than against a tier boundary; this is that check, stated as a
   * band rather than a count so it fails on a real shift and not on noise.
   */
  it("selects a headline band rather than everybody or nobody", () => {
    const values = h.rosters
      .flatMap((r) => assetsOf(analyzeRoster(h, r.rosterId)))
      .map((a) => a.value)
      .filter((v) => v > 0);
    expect(values.length).toBeGreaterThan(50);
    const stars = values.filter((v) => v >= STAR_VALUE).length;
    expect(stars).toBeGreaterThan(0);
    expect(stars / values.length).toBeLessThan(0.15);
  });

  it("returns nothing for a trade with yourself", async () => {
    const principals = await getPrincipals(h);
    expect(findTrades(h, principals, { rosterId: me, partnerRosterId: me })).toBeNull();
  });

  /**
   * The contract with /trade: a package this engine suggests, priced by the evaluator,
   * must total exactly what the engine itself thinks the assets are worth. If these
   * ever diverge, the finder and the manual builder would tell the user two different
   * stories about the same trade.
   */
  it("prices every package through evaluateTrade, with no disagreement", async () => {
    const principals = await getPrincipals(h);
    let checked = 0;
    for (const other of h.rosters) {
      if (other.rosterId === me) continue;
      const r = findTrades(h, principals, {
        rosterId: me,
        partnerRosterId: other.rosterId,
      });
      for (const pkg of r?.packages ?? []) {
        const give = pkg.give.reduce((s, a) => s + a.value, 0);
        const get = pkg.get.reduce((s, a) => s + a.value, 0);
        expect(pkg.evaluation.give.total).toBe(give);
        expect(pkg.evaluation.get.total).toBe(get);
        expect(pkg.evaluation.delta).toBe(get - give);
        expect(pkg.evaluation.give.assets.length).toBe(pkg.give.length);
        expect(pkg.evaluation.get.assets.length).toBe(pkg.get.length);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("carries no conviction notes when the viewer has no ranking on record", async () => {
    const principals = await getPrincipals(h);
    const r = findTrades(h, principals, { rosterId: me, partnerRosterId: them });
    for (const pkg of r?.packages ?? []) expect(pkg.conviction).toEqual([]);
  });

  /**
   * The invariant that protects the /trade contract above. A custom ranking ANNOTATES
   * the finder; it must never reprice it. If a saved ranking moved a single value, a
   * package suggested here and the same package priced by hand on /trade would stop
   * agreeing, which is the one thing this engine promised not to do.
   */
  it("never lets a custom ranking move a single number", async () => {
    const principals = await getPrincipals(h);
    // A deliberately violent ranking: the whole board reversed.
    const reversed = [...h.players.keys()].reverse();
    let compared = 0;
    for (const other of h.rosters) {
      if (other.rosterId === me) continue;
      const plain = findTrades(h, principals, {
        rosterId: me,
        partnerRosterId: other.rosterId,
      });
      const ranked = findTrades(h, principals, {
        rosterId: me,
        partnerRosterId: other.rosterId,
        customOrder: reversed,
      });
      expect(ranked?.packages.length).toBe(plain?.packages.length);
      for (let i = 0; i < (plain?.packages.length ?? 0); i++) {
        const a = plain!.packages[i];
        const b = ranked!.packages[i];
        expect(b.headline).toBe(a.headline);
        expect(b.evaluation.give.total).toBe(a.evaluation.give.total);
        expect(b.evaluation.get.total).toBe(a.evaluation.get.total);
        expect(b.evaluation.delta).toBe(a.evaluation.delta);
        expect(b.fit).toEqual(a.fit);
        expect(b.score).toBe(a.score);
        expect(b.yourCase).toEqual(a.yourCase);
        expect(b.theirCase).toEqual(a.theirCase);
        expect(b.pushback).toEqual(a.pushback);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(0);
  });

  it("attaches conviction notes only to players actually in the package", async () => {
    const principals = await getPrincipals(h);
    const reversed = [...h.players.keys()].reverse();
    let seen = 0;
    for (const other of h.rosters) {
      if (other.rosterId === me) continue;
      const r = findTrades(h, principals, {
        rosterId: me,
        partnerRosterId: other.rosterId,
        customOrder: reversed,
      });
      for (const pkg of r?.packages ?? []) {
        const ids = new Map(
          [...pkg.give.map((a) => [a.id, "give"] as const),
           ...pkg.get.map((a) => [a.id, "get"] as const)],
        );
        for (const n of pkg.conviction) {
          expect(ids.get(n.playerId)).toBe(n.side);
          seen++;
        }
      }
    }
    // A fully reversed board must disagree with consensus somewhere, or this test
    // is passing without exercising anything.
    expect(seen).toBeGreaterThan(0);
  });

  it("only ever offers assets the two sides actually own", async () => {
    const principals = await getPrincipals(h);
    const r = findTrades(h, principals, { rosterId: me, partnerRosterId: them });
    expect(r).not.toBeNull();
    const mineIds = new Set(h.rostersById.get(me)!.players);
    const theirIds = new Set(h.rostersById.get(them)!.players);
    for (const pkg of r!.packages) {
      for (const a of pkg.give)
        if (a.kind === "player") expect(mineIds.has(a.id)).toBe(true);
      for (const a of pkg.get)
        if (a.kind === "player") expect(theirIds.has(a.id)).toBe(true);
    }
  });

  it("always states its caveats, package or no package", async () => {
    const principals = await getPrincipals(h);
    for (const other of h.rosters.slice(0, 5)) {
      if (other.rosterId === me) continue;
      const r = findTrades(h, principals, {
        rosterId: me,
        partnerRosterId: other.rosterId,
      })!;
      expect(r.caveats.length).toBeGreaterThan(0);
      if (!r.packages.length)
        expect(r.caveats.some((c) => c.includes("No package"))).toBe(true);
    }
  });

  it("argues both sides of every package, and never quotes a discount as an argument", async () => {
    const principals = await getPrincipals(h);
    let seen = 0;
    for (const other of h.rosters) {
      if (other.rosterId === me) continue;
      const r = findTrades(h, principals, {
        rosterId: me,
        partnerRosterId: other.rosterId,
      });
      for (const pkg of r?.packages ?? []) {
        expect(pkg.headline.length).toBeGreaterThan(0);
        expect(pkg.theirCase.length).toBeGreaterThan(0);
        expect(pkg.give.length).toBeGreaterThan(0);
        expect(pkg.get.length).toBeGreaterThan(0);
        // The viewer's own case must never be written about the other team.
        for (const line of pkg.yourCase) expect(line).not.toContain("their thinnest");
        for (const line of [...pkg.yourCase, ...pkg.theirCase])
          expect(line).not.toContain("already their surplus");
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("carries what the evaluator needs to price a pick", () => {
    for (const asset of assetsOf(analyzeRoster(h, me))) {
      if (asset.kind === "pick") {
        expect(asset.pick).toBeDefined();
        expect(asset.pick!.originalRosterId).toBeTypeOf("number");
      }
    }
  });
});

describe("partnerBoard", () => {
  const h = buildFixtureHistory();
  const me = h.rosters[0].rosterId;

  it("rates every leaguemate except you, best room first", async () => {
    const principals = await getPrincipals(h);
    const rows = partnerBoard(h, principals, me);
    expect(rows.length).toBe(h.rosters.length - 1);
    expect(rows.some((r) => r.rosterId === me)).toBe(false);
    for (let i = 1; i < rows.length; i++)
      expect(rows[i - 1].mutual).toBeGreaterThanOrEqual(rows[i].mutual);
  });

  it("agrees with findTrades about who the best partner is", async () => {
    const principals = await getPrincipals(h);
    const best = partnerBoard(h, principals, me)[0];
    if (best.mutual > 0) {
      const r = findTrades(h, principals, {
        rosterId: me,
        partnerRosterId: best.rosterId,
      })!;
      expect(r.packages.length).toBeGreaterThan(0);
      // The board's preview is the same package the detail view leads with.
      expect(r.packages[0].headline).toBe(best.bestIdea);
    }
  });

  it("returns nothing for a roster that is not in the league", async () => {
    const principals = await getPrincipals(h);
    expect(partnerBoard(h, principals, 9999)).toHaveLength(0);
  });

  /**
   * THE WINDOW READING IS PRINTED, NOT SCORED (D6).
   *
   * The whole point of feeding value windows into the finder is that a roster peaking
   * opposite the viewer is a natural counterparty - and the whole discipline is that
   * saying so must not quietly become a ranking. These pin both halves.
   */
  it("carries every partner's window without reordering the board on it", async () => {
    const principals = await getPrincipals(h);
    const rows = partnerBoard(h, principals, me);
    const windows = new Map(
      leagueWindows(h).rows.map((r) => [r.rosterId, r]),
    );
    for (const r of rows) {
      expect(r.valueWindow).toBe(windowShort(windows.get(r.rosterId)!));
    }
    // Still ordered on mutual fit alone - identical to the ordering by `mutual`.
    expect(rows.map((r) => r.rosterId)).toEqual(
      [...rows].sort((a, b) => b.mutual - a.mutual).map((r) => r.rosterId),
    );
  });

  it("distinguishes 'not your window' from 'no window at all'", async () => {
    const principals = await getPrincipals(h);
    const windows = new Map(leagueWindows(h).rows.map((r) => [r.rosterId, r]));
    for (const r of partnerBoard(h, principals, me)) {
      const theirs = windows.get(r.rosterId)!;
      if (theirs.state !== "window" || windows.get(me)!.state !== "window") {
        expect(r.sharesYourWindow).toBeNull();
      } else {
        expect(typeof r.sharesYourWindow).toBe("boolean");
      }
    }
  });

  it("states the timing thesis on every package, or on none of them", async () => {
    const principals = await getPrincipals(h);
    const other = h.rosters.find((x) => x.rosterId !== me)!.rosterId;
    const r = findTrades(h, principals, { rosterId: me, partnerRosterId: other })!;
    const theses = new Set(r.packages.map((p) => p.windowThesis));
    // One pairing, one timing fact: it cannot differ package to package.
    expect(theses.size).toBeLessThanOrEqual(1);
    const t = r.packages[0]?.windowThesis;
    if (t) {
      expect(t).toBe(
        windowThesis(
          leagueWindows(h).rows.find((w) => w.rosterId === me)!,
          leagueWindows(h).rows.find((w) => w.rosterId === other)!,
        ),
      );
      // D19: no intent, no prediction.
      expect(t).not.toMatch(/will (sell|buy|trade)/i);
    }
  });
});
