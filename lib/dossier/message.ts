/**
 * A ready-to-send opener, generated from a manager's dossier.
 *
 * The dossier's approach tips are advice ABOUT the manager, written to the
 * viewer; this is the message itself, written to the manager, so it works from
 * the same tags and derived numbers rather than pasting tips somebody was never
 * meant to read. Two rules keep it in this app's voice:
 *
 *   - Every angle cites the number behind the tell (picks spent, net pick
 *     balance, average acquisition age, trades per season) instead of a vague
 *     "I noticed you like picks". The recipient knows their own habits; naming
 *     the specific figure is what makes the opener read as a real observation
 *     rather than a form letter.
 *   - Each angle closes in its own words. A generator whose every output ends
 *     on the identical line is recognizably a generator, which defeats the
 *     point of a message meant to start a human conversation.
 *
 * Layer order is deliberate and mirrors the tag derivation's own specificity:
 * pick habits are the most actionable read, then age appetite, then raw volume,
 * then a plain fallback. The never-trades case is handled first and separately,
 * because every other angle presumes a trade history to cite.
 */

import type { Dossier } from "./index";

export function generateApproachMessage(d: Dossier): string {
  const { displayName, trades, picks, acquisitions } = d.profile;
  const { tags, tradesPerSeason } = d;

  const greeting = `Hey ${displayName},`;

  // No history to cite, so don't pretend to have read any.
  if (trades === 0) {
    return `${greeting}\n\nI know trades haven't really been your thing, but I've got an idea I think works for both sides. Open to hearing it?`;
  }

  let body: string;
  if (tags.includes("Pick spender")) {
    const spent =
      picks.spent > 0 ? ` (${picks.spent} out the door so far)` : "";
    body = `You're clearly not shy about spending picks${spent}, and I've got draft capital I'd move for the right player. Want to hear what I'm thinking?`;
  } else if (tags.includes("Pick hoarder")) {
    const net = picks.net > 0 ? ` (+${picks.net} net)` : "";
    body = `You've been stacking picks${net}, and a player-for-picks deal might suit us both. Interested?`;
  } else if (tags.includes("Name chaser")) {
    const age =
      acquisitions.avgAge != null ? ` (your adds average ${acquisitions.avgAge}y)` : "";
    body = `Your acquisitions lean toward proven names${age}, and I've got a veteran or two I could move. Worth a chat?`;
  } else if (tags.includes("Youth builder")) {
    const age =
      acquisitions.avgAge != null ? ` (your adds average ${acquisitions.avgAge}y)` : "";
    body = `You've been building young${age}, and I've got some younger pieces I'd part with in the right deal. Worth a chat?`;
  } else if (tags.includes("High-volume trader")) {
    body = `You're always open for business (~${tradesPerSeason} trades a season), so I'll keep it simple: I've got a deal in mind for us. Want the details?`;
  } else {
    body = `I think there's a deal to be made between our rosters. Want to hear it?`;
  }

  return `${greeting}\n\n${body}`;
}
