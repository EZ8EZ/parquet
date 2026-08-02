/**
 * Your own ranking, read against a suggested package.
 *
 * /rank already lets you drag a board into your own order and already computes
 * where that order disagrees with consensus (`disagreements`, lib/rankings). The
 * problem this module solves is that the answer lived on /rank, which is not a
 * page anybody opens in the middle of deciding whether to send an offer. Here it
 * becomes a line in the rationale of the package that actually contains the
 * player.
 *
 * THE PART THAT MAKES IT USEFUL: a rank gap on its own is not advice, because the
 * same gap means opposite things depending on which way the player is moving. So
 * every note carries a `verdict`, off a two-by-two of (which side he is on) by
 * (which way you disagree):
 *
 *                        you rate him ABOVE consensus   you rate him BELOW consensus
 *   you RECEIVE him      supports  - buying below your   questions - paying consensus
 *                                    own number                      for a player you fade
 *   you SEND him         questions - selling below your   supports  - moving him at a
 *                                    own number                      number you do not back
 *
 * WHY THIS ANNOTATES AND DOES NOT REPRICE. It would be easy to feed the custom
 * order through `applyRanks` and let every value in the finder shift. That is
 * deliberately not done, because /trade prices a hand-built package off consensus
 * ranks, and the finder's whole contract (see lib/tradefinder/index.ts) is that a
 * package it suggests and the same package priced by hand can never tell two
 * different stories. Repricing here would break that on the first drag. Every
 * number the finder shows is therefore still a consensus-derived number, which is
 * also exactly what makes the prose below literally true when it says a package
 * buys or sells someone "at consensus value".
 */
import type { Player } from "../providers/types";
import {
  consensusSource,
  customSource,
  disagreements,
  type Disagreement,
} from "../rankings";

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

/** Which way a note cuts for the trade in front of you. */
export type ConvictionVerdict = "supports" | "questions";

export interface ConvictionNote {
  playerId: string;
  name: string;
  /** Your position for him, 1 = best. */
  yourRank: number;
  consensusRank: number;
  /** Places between the two, always positive. Direction lives in `above`. */
  gap: number;
  /** True when you rate him better than consensus does. */
  above: boolean;
  /** Which side of this package he is on, from the viewer's point of view. */
  side: "give" | "get";
  verdict: ConvictionVerdict;
  text: string;
}

/** The shape this module needs off a package asset. Structural on purpose, so
 *  `index.ts` can import this module without this module importing it back. */
interface AssetRef {
  kind: "player" | "pick";
  id: string;
  label: string;
}

/**
 * Index the viewer's ranking against consensus, once per request.
 *
 * Returns an empty map for an empty order, which is the honest answer for a
 * viewer who has never opened /rank: no opinion on record, so no notes anywhere.
 * That is a different thing from an opinion that agrees with consensus, and the
 * callers below never render the two the same way.
 */
export function convictionIndex(
  customOrder: string[],
  players: Map<string, Player>,
): Map<string, Disagreement> {
  if (customOrder.length === 0) return new Map();
  // Both sources come straight from lib/rankings rather than being recomputed,
  // so /rank and the finder can never disagree about what your rank for a player
  // even is.
  const custom = customSource(customOrder);
  const consensus = consensusSource([...players.values()]);
  const out = new Map<string, Disagreement>();
  for (const d of disagreements(custom, consensus, players)) out.set(d.playerId, d);
  return out;
}

function noteText(
  name: string,
  gap: number,
  above: boolean,
  side: "give" | "get",
  yourRank: number,
  consensusRank: number,
): string {
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
export function convictionNotes(
  pkg: { give: AssetRef[]; get: AssetRef[] },
  index: Map<string, Disagreement>,
  opts: { minGap?: number; max?: number } = {},
): ConvictionNote[] {
  if (index.size === 0) return [];
  const minGap = opts.minGap ?? CONVICTION_MIN_GAP;
  const notes: ConvictionNote[] = [];

  const scan = (assets: AssetRef[], side: "give" | "get") => {
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
        text: noteText(d.name || a.label, gap, above, side, yourRank, consensusRank),
      });
    }
  };

  scan(pkg.get, "get");
  scan(pkg.give, "give");

  return notes.sort((a, b) => b.gap - a.gap).slice(0, opts.max ?? MAX_CONVICTION_NOTES);
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
export function convictionSummary(notes: ConvictionNote[]): {
  verdict: ConvictionVerdict;
  text: string;
} | null {
  if (notes.length === 0) return null;
  const lead = notes[0];
  const direction = lead.above ? "above" : "below";
  const label = lead.verdict === "supports" ? "Your ranking backs this" : "Your ranking questions this";
  const move = lead.side === "get" ? "you would be getting him" : "you would be sending him";
  return {
    verdict: lead.verdict,
    text: `${label}: ${lead.name} sits ${lead.gap} ${lead.gap === 1 ? "spot" : "spots"} ${direction} consensus on your board and ${move}.`,
  };
}
