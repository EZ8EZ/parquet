/**
 * DOSSIER TAGS AS BEHAVIOURS WITH COUNTS.
 *
 * `assembleDossier` (./index.js) names what a manager's record shows with short labels
 * ("Usually starts trades", "Adds picks on net", "Trades for established names"): each
 * describes what they did, never a character trait (D6; the old judging labels such as
 * "Name chaser" and "Ghost" were renamed). This maps each tag to the behaviour it was
 * derived from and the count behind it, so
 * a chip says "12/17 trades started" instead of "Usually starts trades". Same thresholds, same
 * profile fields: nothing here re-derives or re-thresholds a tag. Where the profile
 * does not expose the count (the 30+ veteran rule only stores whether it fired), the
 * chip states the rule's own floor rather than inventing a number (D19).
 *
 * @param {string} tag one of the strings assembleDossier pushes
 * @param {object} p the dossier's profile (deriveManagerProfile output)
 * @param {number} tps trades per season, as the dossier computed it
 * @returns {string} the behaviour, with its count where one exists
 */
export function tagBehaviour(tag, p, tps) {
  switch (tag) {
    case "No trades on record":
      return "0 trades";
    case "Trades often":
    case "Trades rarely":
      return `${tps} trades a season`;
    case "Usually starts trades":
    case "Usually answers offers":
      return `${p.tradesInitiated}/${p.trades} trades started`;
    case "Few moves of any kind":
      return `${p.totalTransactions} moves in total`;
    case "Adds picks on net":
    case "Gives up picks on net":
      return `${p.picks.net > 0 ? "+" : ""}${p.picks.net} picks net`;
    case "Trades for established names":
      return "3+ trades for 30+ veterans";
    case "Acquires young players":
      return `Acquires at ${p.acquisitions.avgAge} on average`;
    case "Trades more after losses":
      return `${p.afterLoss.afterLoss}/${p.afterLoss.total} trades after a loss`;
    case "Buys at the deadline":
      return `${p.deadline.buys} deadline buys`;
    case "Sells at the deadline":
      return `${p.deadline.sells} deadline sells`;
    case "Works waivers and FA heavily":
      return `${p.waivers + p.freeAgents} waiver and FA moves`;
    case "Bids high on FAAB":
      return `Average FAAB bid ${p.faabAggression}`;
    default:
      return tag;
  }
}

/** Every tag of a dossier as its behaviour line, in the dossier's own order. */
export function dossierBehaviours(d) {
  return d.tags.map((t) => tagBehaviour(t, d.profile, d.tradesPerSeason));
}
