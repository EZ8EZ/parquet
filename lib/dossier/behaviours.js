/**
 * DOSSIER TAGS AS BEHAVIOURS WITH COUNTS.
 *
 * `assembleDossier` (./index.js) names a manager's tells with labels ("Initiator",
 * "Pick hoarder", "Name chaser"). Printed bare, several of those read as a label on a
 * person rather than a fact about what they did, which the house rules refuse (D6).
 * This maps each tag to the behaviour it was derived from and the count behind it, so
 * a chip says "12/17 trades started" instead of "Initiator". Same thresholds, same
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
    case "Never trades":
      return "0 trades";
    case "High-volume trader":
    case "Rarely trades":
      return `${tps} trades a season`;
    case "Initiator":
    case "Responder":
      return `${p.tradesInitiated}/${p.trades} trades started`;
    case "Ghost":
      return `${p.totalTransactions} moves in total`;
    case "Pick hoarder":
    case "Pick spender":
      return `${p.picks.net > 0 ? "+" : ""}${p.picks.net} picks net`;
    case "Name chaser":
      return "3+ trades for 30+ veterans";
    case "Youth builder":
      return `Acquires at ${p.acquisitions.avgAge} on average`;
    case "Reactive after losses":
      return `${p.afterLoss.afterLoss}/${p.afterLoss.total} trades after a loss`;
    case "Deadline buyer":
      return `${p.deadline.buys} deadline buys`;
    case "Deadline seller":
      return `${p.deadline.sells} deadline sells`;
    case "Streamer":
      return `${p.waivers + p.freeAgents} waiver and FA moves`;
    case "Aggressive on FAAB":
      return `Average FAAB bid ${p.faabAggression}`;
    default:
      return tag;
  }
}

/** Every tag of a dossier as its behaviour line, in the dossier's own order. */
export function dossierBehaviours(d) {
  return d.tags.map((t) => tagBehaviour(t, d.profile, d.tradesPerSeason));
}
