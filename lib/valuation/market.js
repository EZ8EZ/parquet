/**
 * THE MARKET ANCHOR (D116) - which consensus a dynasty price descends from.
 *
 * Until D116 every price in this app descended from `search_rank` on /players/nba.
 * That number is Sleeper's REDRAFT ordinal: on the 2026 snapshot it tracks `adp_std`
 * (redraft ADP) almost exactly - Boozer 25 vs 25.1, Dybantsa 53 vs 53.6 - and it is a
 * one-season question. A dynasty value is a several-season question, and Sleeper
 * answers that one too, one endpoint over: `adp_dynasty` on /projections/nba/regular.
 * The model had been pricing dynasty assets off the wrong market the whole time.
 *
 * Nowhere did that cost more than on rookies. A 19-year-old with no NBA minutes is a
 * poor redraft pick and an expensive dynasty one, and the two ordinals disagree about
 * him by more than about anyone: Darryn Peterson (the 1.04 in this league's 2026
 * draft) is 42nd in redraft and 18th in dynasty; Keaton Wagler (the 1.07) is 180th and
 * 66th. Priced off the redraft ordinal, Wagler came out at 222 - below the dead-weight
 * line - and /plan told his owner to cut him two weeks after spending a top-7 pick on
 * him. That is the failure this file exists to end.
 *
 * ---------------------------------------------------------------------------------
 * WHAT THIS RETURNS, AND THE PROPERTY IT KEEPS
 * ---------------------------------------------------------------------------------
 * `marketRanks(players)` returns, for every player, the rank `valuePlayer` should price
 * him from, on the SAME 1..n ordinal scale `search_rank` used - so `rankDecay`, the
 * base curve and every threshold calibrated against it keep meaning what they meant.
 *
 *  - Players with a dynasty ADP are ordered by the blended anchor below and given
 *    ordinals 1..k. ADP is a
 *    mean of draft positions; an ordinal is what the base curve was fitted against,
 *    and re-ranking also removes the ADP's own gaps (it runs 1.3, 2.7, 3.5 ...).
 *  - A player the dynasty market does not carry is keyed on his redraft ADP alone (a
 *    blend weight of zero), and one with no usable redraft number on his dynasty ADP
 *    alone. A first cut ranked every player without a dynasty ADP BELOW the whole
 *    market; the red-team review caught what that does in July, before ADP fills in -
 *    every new rookie prices as dead weight, the exact failure this file ends - and at
 *    season rollover, when the new file is thin. One ordinal for everyone, keyed on
 *    whatever market evidence he has, has no such cliff.
 *  - With no market at all (fixture, CSV, or a failed fetch), every player keeps his
 *    `search_rank` untouched and the model is bit-for-bit its pre-D116 self. That is
 *    also what every pre-D116 test pins.
 *
 * ---------------------------------------------------------------------------------
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ---------------------------------------------------------------------------------
 * It does not blend in this league's own rookie-draft order. Measured, and no edge
 * is detectable (n = 126 gives a 95% band of about +/-0.17 on the partial, so this
 * is "no edge above ~0.17", not proof of none): across the 126 picks of the 2023-2025 rookie drafts, the room's order
 * predicted era-normalized NBA fantasy production through 2025 at rho 0.545 against
 * the market's 0.628, the two orders agree at 0.881, and the partial correlation of
 * the room's order GIVEN the market's is -0.022 (z = -0.24). The best blend weight on
 * the room is 0.05, worth +0.0004 of rho. This league does not out-draft Sleeper's
 * dynasty market, so the room's order is published as a MEASUREMENT on the draft
 * recap (who it let slide, who it took early) and kept out of the price.
 */

/**
 * WHEN THE MARKET COUNTS AS PRESENT. A ratio, not a count (red-team, D116): of the
 * players Sleeper's own redraft ordinal puts in its top 200, at least this share must
 * carry a dynasty ADP. The live 2026 file covers 100% of them. A thin file - season
 * rollover, a partial payload - fails this and the whole pool keeps `search_rank`,
 * rather than half the league being priced off one market and half off another.
 */
export const MIN_MARKET_COVERAGE = 0.9;

/**
 * @typedef {Object} MarketRank
 * @property {number} rank the ordinal this player is priced from
 * @property {"blend"|"dynasty"|"redraft"} source what his key was built from: both
 *   markets, the dynasty market alone, or the redraft ordinal alone (which is also
 *   every player's source when no market is present)
 * @property {number|null} dynastyAdp
 */

/**
 * THE ANCHOR IS A BLEND OF THE TWO MARKETS, NOT A SWAP (measured, D116).
 *
 * The obvious move - replace the redraft ordinal with the dynasty one - is what the
 * first cut of this file did, and it is not what the data supports. Scored against
 * era-normalized fantasy production over the following three seasons (zeros for
 * seasons not played), pooled over the 2021-2023 snapshots (n = 986): dynasty ADP rho
 * 0.738, redraft ADP rho 0.751, a gap inside its own noise (-0.014 [-0.036, 0.009]);
 * the only significant gaps run AGAINST the dynasty side. But each carries what the
 * other does not - partial rho 0.231 [0.162, 0.299] for dynasty given redraft, 0.309
 * for redraft given dynasty - and a blend beats both by ~0.014. The best weight on the
 * dynasty market, in log-ADP space, is 0.50 [0.35, 0.65] (2021-23) and 0.45 [0.30,
 * 0.60] (2021-24); the curve is flat from 0.25 to 0.65. The dynasty side gains about
 * 0.01 rho per season of horizon added, and a dynasty price is about the long horizon.
 *
 * Rookies alone gave 0.15-0.30 with a CI of [0, 0.63] (n = 186) - wide enough to hold
 * 0.45 - so one weight is used for everyone rather than a noisier constant for one
 * cohort. Restricting the dynasty market to the young was tested too and shows no
 * edge either way. What these measure is PRODUCTION over at most five seasons, not
 * trade price; that is the estimand this app can score.
 *
 * So the rank key is the GEOMETRIC blend exp(w ln dyn + (1-w) ln std).
 */
export const DYNASTY_WEIGHT = 0.45;
/** Sleeper's redraft ordinal, unless it is the 999 sentinel or absent. */
function redraftOf(p) {
  const v = p.redraftAdp ?? p.searchRank;
  return v != null && v > 0 && v < 999 ? v : null;
}
function dynastyOf(p) {
  const v = p.dynastyAdp;
  return typeof v === "number" && v > 0 && v < 999 ? v : null;
}
/**
 * @param {{ playerId: string, searchRank?: number|null, dynastyAdp?: number|null, redraftAdp?: number|null }[]} players
 * @param {number} [w] weight on the dynasty market in the blend
 * @returns {{ ranks: Map<string, MarketRank>, active: boolean, coverage: number }}
 */
export function marketRanks(players, w = DYNASTY_WEIGHT) {
  const top = players
    .filter((p) => p.searchRank != null && p.searchRank <= 200)
    .filter((p) => redraftOf(p) != null);
  const covered = top.filter((p) => dynastyOf(p) != null).length;
  const coverage = top.length ? covered / top.length : 0;
  /** @type {Map<string, MarketRank>} */
  const ranks = new Map();
  if (coverage < MIN_MARKET_COVERAGE) {
    for (const p of players) {
      if (p.searchRank != null)
        ranks.set(p.playerId, {
          rank: p.searchRank,
          source: "redraft",
          dynastyAdp: dynastyOf(p),
        });
    }
    return { ranks, active: false, coverage };
  }
  /** @type {{ p: any, key: number, source: MarketRank["source"] }[]} */
  const keyed = [];
  for (const p of players) {
    const d = dynastyOf(p);
    const r = redraftOf(p);
    if (d != null && r != null)
      keyed.push({ p, key: Math.exp(w * Math.log(d) + (1 - w) * Math.log(r)), source: "blend" });
    else if (d != null) keyed.push({ p, key: d, source: "dynasty" });
    else if (r != null) keyed.push({ p, key: r, source: "redraft" });
  }
  // Ties break on the redraft ordinal, then the id, so the order is deterministic.
  keyed
    .sort(
      (a, b) =>
        a.key - b.key ||
        (a.p.searchRank ?? Infinity) - (b.p.searchRank ?? Infinity) ||
        a.p.playerId.localeCompare(b.p.playerId),
    )
    .forEach((k, i) =>
      ranks.set(k.p.playerId, {
        rank: i + 1,
        source: k.source,
        dynastyAdp: dynastyOf(k.p),
      }),
    );
  return { ranks, active: true, coverage };
}
