import { consensusSource, customSource, disagreements } from "../rankings";
/**
 * The smallest gap worth putting a sentence on screen for.
 *
 * There is a hard floor under this number, not just taste. The consensus ranks
 * this app receives contain ties and gaps (in the real corpus, two players share
 * rank 46, two share 73, and 107 is absent), so a player's position in /rank's
 * pool drifts from his consensus rank by a couple of places through no opinion of
 * anyone's. Anything at or below that drift is arithmetic, not conviction, and
 * reporting it would be inventing a signal. Eight places is clear of the drift
 * and is around seven percent of the 120-player board, which is about where a
 * disagreement starts being worth acting on rather than noting.
 */
export const CONVICTION_MIN_GAP = 8;
/** Notes per package. The block is a supporting read, not the main event. */
export const MAX_CONVICTION_NOTES = 3;
/**
 * Index the viewer's ranking against consensus, once per request.
 *
 * Returns an empty map for an empty order, which is the honest answer for a
 * viewer who has never opened /rank: no opinion on record, so no notes anywhere.
 * That is a different thing from an opinion that agrees with consensus, and the
 * callers below never render the two the same way.
 */
export function convictionIndex(customOrder, players) {
  if (customOrder.length === 0) return new Map();
  // Both sources come straight from lib/rankings rather than being recomputed,
  // so /rank and the finder can never disagree about what your rank for a player
  // even is.
  const custom = customSource(customOrder);
  const consensus = consensusSource([...players.values()]);
  const out = new Map();
  for (const d of disagreements(custom, consensus, players))
    out.set(d.playerId, d);
  return out;
}
function noteText(name, gap, above, side, yourRank, consensusRank) {
  const where = `(you #${yourRank}, consensus #${consensusRank})`;
  const direction = above ? "above" : "below";
  const relation = above ? "below your own number" : "above your own number";
  const clause =
    side === "get"
      ? above
        ? "This package buys him at consensus value, which is"
        : "This package takes him on at consensus value, which is"
      : above
        ? "This package sends him out at consensus value, which is"
        : "This package moves him at consensus value, which is";
  return `You have ${name} ${gap} ${gap === 1 ? "spot" : "spots"} ${direction} consensus ${where}. ${clause} ${relation}.`;
}
/**
 * The notes for one package, strongest disagreement first.
 *
 * Picks are skipped outright: a draft pick has no consensus player rank to
 * disagree with, and inventing one from the players it might become would be
 * fabricating the exact signal this feature exists to report honestly.
 */
export function convictionNotes(pkg, index, opts = {}) {
  if (index.size === 0) return [];
  const minGap = opts.minGap ?? CONVICTION_MIN_GAP;
  const notes = [];
  const scan = (assets, side) => {
    for (const a of assets) {
      if (a.kind !== "player") continue;
      const d = index.get(a.id);
      if (!d) continue;
      const delta = Math.round(d.delta);
      const gap = Math.abs(delta);
      if (gap < minGap) continue;
      const above = delta > 0;
      const yourRank = Math.round(d.yourRank);
      const consensusRank = Math.round(d.consensusRank);
      notes.push({
        playerId: a.id,
        name: d.name || a.label,
        yourRank,
        consensusRank,
        gap,
        above,
        side,
        // Receiving someone you rate above consensus, or sending someone you rate
        // below it, are the two ways this trade moves in the direction of your own
        // opinion. The other two diagonals move against it.
        verdict: (side === "get") === above ? "supports" : "questions",
        text: noteText(
          d.name || a.label,
          gap,
          above,
          side,
          yourRank,
          consensusRank,
        ),
      });
    }
  };
  scan(pkg.get, "get");
  scan(pkg.give, "give");
  return notes
    .sort((a, b) => b.gap - a.gap)
    .slice(0, opts.max ?? MAX_CONVICTION_NOTES);
}
/**
 * One line for a package card, before anyone drills in.
 *
 * Leads with whichever verdict has the biggest gap behind it rather than always
 * leading with the good news, because a package that quietly sells a player you
 * rate 30 places above consensus is the single most useful thing this feature can
 * tell you, and burying it under a supporting note would be the surface lying by
 * omission.
 */
export function convictionSummary(notes) {
  if (notes.length === 0) return null;
  const lead = notes[0];
  const direction = lead.above ? "above" : "below";
  const label =
    lead.verdict === "supports"
      ? "Your ranking backs this"
      : "Your ranking questions this";
  const move =
    lead.side === "get"
      ? "you would be getting him"
      : "you would be sending him";
  return {
    verdict: lead.verdict,
    text: `${label}: ${lead.name} sits ${lead.gap} ${lead.gap === 1 ? "spot" : "spots"} ${direction} consensus on your board and ${move}.`,
  };
}
