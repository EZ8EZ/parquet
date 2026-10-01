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
 *  - Players with a dynasty ADP are ordered by it and given ordinals 1..k. ADP is a
 *    mean of draft positions; an ordinal is what the base curve was fitted against,
 *    and re-ranking also removes the ADP's own gaps (it runs 1.3, 2.7, 3.5 ...).
 *  - Players WITHOUT one rank below every player with one, in their redraft order.
 *    That is a claim and it is the right one: Sleeper's dynasty market drafted ~836
 *    players this season and he was not among them. It is not a claim about his
 *    talent; it is a claim about the market this price is read off.
 *  - With no market at all (fixture, CSV, or a failed fetch), every player keeps his
 *    `search_rank` untouched and the model is bit-for-bit its pre-D116 self. That is
 *    also what every pre-D116 test pins.
 *
 * ---------------------------------------------------------------------------------
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ---------------------------------------------------------------------------------
 * It does not blend in this league's own rookie-draft order. Measured, and it adds
 * nothing: across the 126 picks of the 2023-2025 rookie drafts, the room's order
 * predicted era-normalized NBA fantasy production through 2025 at rho 0.545 against
 * the market's 0.628, the two orders agree at 0.881, and the partial correlation of
 * the room's order GIVEN the market's is -0.022 (z = -0.24). The best blend weight on
 * the room is 0.05, worth +0.0004 of rho. This league does not out-draft Sleeper's
 * dynasty market, so the room's order is published as a MEASUREMENT on the draft
 * recap (who it let slide, who it took early) and kept out of the price.
 */

/**
 * Below this many players with a dynasty ADP the market is treated as absent. A real
 * snapshot carries ~836; a payload that parsed but came back nearly empty is a broken
 * snapshot, and pricing 250 rostered players off a 20-player market would rank 230 of
 * them "below the market" for no reason but a bad fetch.
 */
export const MIN_MARKET_POOL = 150;

/**
 * @typedef {Object} MarketRank
 * @property {number} rank the ordinal this player is priced from
 * @property {"dynasty"|"below-market"|"redraft"} source where the ordinal came from:
 *   his dynasty ADP; below every dynasty-ADP player (market exists, he is not in it);
 *   or plain `search_rank` because there is no market at all
 * @property {number|null} dynastyAdp
 */

/**
 * @param {{ playerId: string, searchRank?: number|null, dynastyAdp?: number|null }[]} players
 * @returns {{ ranks: Map<string, MarketRank>, active: boolean, pool: number }}
 */
export function marketRanks(players) {
  const withAdp = players.filter(
    (p) => typeof p.dynastyAdp === "number" && p.dynastyAdp > 0,
  );
  /** @type {Map<string, MarketRank>} */
  const ranks = new Map();
  if (withAdp.length < MIN_MARKET_POOL) {
    for (const p of players) {
      if (p.searchRank != null)
        ranks.set(p.playerId, {
          rank: p.searchRank,
          source: "redraft",
          dynastyAdp: p.dynastyAdp ?? null,
        });
    }
    return { ranks, active: false, pool: withAdp.length };
  }
  // Ties (ADP is a two-decimal mean, so they happen) break on the redraft ordinal and
  // then the id, so the order is deterministic across renders.
  const tie = (a, b) =>
    (a.searchRank ?? Infinity) - (b.searchRank ?? Infinity) ||
    a.playerId.localeCompare(b.playerId);
  [...withAdp]
    .sort((a, b) => a.dynastyAdp - b.dynastyAdp || tie(a, b))
    .forEach((p, i) =>
      ranks.set(p.playerId, {
        rank: i + 1,
        source: "dynasty",
        dynastyAdp: p.dynastyAdp,
      }),
    );
  const k = withAdp.length;
  players
    .filter((p) => !ranks.has(p.playerId) && p.searchRank != null)
    .sort(tie)
    .forEach((p, i) =>
      ranks.set(p.playerId, {
        rank: k + i + 1,
        source: "below-market",
        dynastyAdp: null,
      }),
    );
  return { ranks, active: true, pool: k };
}
