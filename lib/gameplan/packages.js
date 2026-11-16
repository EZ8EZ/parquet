/**
 * THE PLAN'S TRADE MOVES ARE FINDER PACKAGES, OR THEY ARE NOT SHOWN.
 *
 * /plan used to print templates ("you send Haliburton + Fox + a 1st, you target one
 * Cornerstone-or-better player"): 0 of 46 moves across the live league named what came
 * back, and four contend rosters spent the same 2028 1st in two moves. The trade finder
 * already searches named, two-sided packages that clear its fairness band on the app's
 * own values, so each trade move now asks that search a constrained question - which of
 * my assets may go, which of theirs may come back - and either carries the best package
 * any leaguemate offers or is dropped.
 *
 * This module only narrows the finder's inputs; the search, the fairness band, the star
 * guard and the appetite model are the finder's own (`searchPackages`, `appetiteFor`,
 * `price`), so a package here is one /trade/finder could print for the same pair.
 */
import {
  appetiteFor,
  assetsOf,
  packageBuilderHref,
  price,
  searchPackages,
} from "../tradefinder/index.js";
import { buildDossier } from "../dossier/index.js";
import { cachedLeagueTimelines } from "../metrics/duration.js";
/** Packages examined per partner per move; the finder's own default board shows 3. */
const PER_PARTNER = 6;
/**
 * @typedef {Object} PlanAsset
 * @property {string} id
 * @property {"player"|"pick"} kind
 * @property {string} name
 * @property {number} value
 * @property {number|null} age
 * @property {string|null} position
 * @property {string|null} tier the /values tier label, players only
 */
/**
 * @typedef {Object} PlanPackage
 * @property {{ rosterId: number, name: string }} counterparty
 * @property {PlanAsset[]} give
 * @property {PlanAsset[]} get
 * @property {number} giveValue
 * @property {number} getValue
 * @property {string} builderHref
 */
/**
 * @typedef {Object} PackageSpec
 * @property {(asset: any) => boolean} give which of the viewer's assets may be sent
 * @property {(asset: any) => boolean} get which of the partner's assets may come back
 * @property {string|null} [force] an asset id every package must include
 * @property {(pkg: any) => boolean} [accept] a final shape test on a candidate
 */
/**
 * A search bound to one viewer. Partner contexts (dossier, appetite, both priced asset
 * lists) are built once, on first use, and shared by every move on the plan.
 *
 * @param {any} h
 * @param {any} principals
 * @param {number} rosterId
 * @param {any[]} ranking `leagueValueRanking(h)`, already computed by the caller
 * @param {(value: number) => string} tierFor
 */
export function packageSearch(h, principals, rosterId, ranking, tierFor) {
  const rankOf = new Map(ranking.map((r, i) => [r.rosterId, i + 1]));
  const postureOf = new Map(
    cachedLeagueTimelines(h).map((t) => [t.rosterId, t.posture]),
  );
  const teams = ranking.length;
  const mineA = ranking.find((r) => r.rosterId === rosterId);
  const you = appetiteFor(mineA, rankOf.get(rosterId) ?? 0, teams, {
    viewer: true,
    posture: postureOf.get(rosterId) ?? null,
  });
  const myAssets = assetsOf(mineA);
  /** @type {any[]|null} */
  let partners = null;
  const partnerList = () => {
    if (partners) return partners;
    partners = ranking
      .filter((pa) => pa.rosterId !== rosterId)
      .map((pa) => {
        let dossier;
        try {
          dossier = principals
            ? buildDossier(h, pa.rosterId, principals)
            : undefined;
        } catch {
          dossier = undefined;
        }
        const partner = appetiteFor(pa, rankOf.get(pa.rosterId) ?? 0, teams, {
          dossier,
          posture: postureOf.get(pa.rosterId) ?? null,
        });
        return {
          partner,
          mine: price(myAssets, you, partner),
          theirs: price(assetsOf(pa), partner, you),
        };
      });
    return partners;
  };
  const shape = (a) => ({
    id: String(a.id),
    kind: a.kind,
    name: a.label,
    value: a.value,
    age: a.age ?? null,
    position: a.position ?? null,
    tier: a.kind === "player" ? tierFor(a.value) : null,
  });
  /**
   * The best package any leaguemate offers for this spec, avoiding every asset id in
   * `used`, or null when none clears the finder's bar.
   * @param {PackageSpec} spec
   * @param {Set<string>} used
   * @returns {PlanPackage|null}
   */
  return function search(spec, used) {
    if (spec.force && used.has(String(spec.force))) return null;
    let best = null;
    for (const p of partnerList()) {
      const mine = p.mine.filter(
        (x) => !used.has(String(x.asset.id)) && spec.give(x.asset),
      );
      const theirs = p.theirs.filter(
        (x) => !used.has(String(x.asset.id)) && spec.get(x.asset),
      );
      if (!mine.length || !theirs.length) continue;
      const found = searchPackages(mine, theirs, you, p.partner, PER_PARTNER, {
        forceGiveId: spec.force ?? null,
      });
      // `searchPackages` returns score-descending, so the first accepted is this
      // partner's best; ties across partners keep the earlier (higher-valued) roster.
      const pkg = found.find((c) => !spec.accept || spec.accept(c));
      if (pkg && (!best || pkg.score > best.pkg.score)) best = { pkg, p };
    }
    if (!best) return null;
    const giveAssets = best.pkg.give.map((x) => x.asset);
    const getAssets = best.pkg.get.map((x) => x.asset);
    return {
      counterparty: { rosterId: best.p.partner.rosterId, name: best.p.partner.name },
      give: giveAssets.map(shape),
      get: getAssets.map(shape),
      giveValue: best.pkg.giveTotal,
      getValue: best.pkg.getTotal,
      builderHref: packageBuilderHref(giveAssets, getAssets),
    };
  };
}
