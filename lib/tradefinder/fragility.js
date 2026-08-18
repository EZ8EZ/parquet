import {
  leagueReplacementValue,
  spofOfPlayers,
  startableRosterIds,
} from "../metrics/fragility.js";
import { VALUATION_CONFIG } from "../valuation/index.js";
/**
 * How much the single point of failure's share has to move before it is worth a line.
 *
 * Three points of startable value. Below that the change is inside the noise of a
 * re-solved lineup - swapping one bench body for another of the same value shifts the
 * share by a point or two without changing anything a manager would act on, and a note
 * that fires on every package is a note nobody reads.
 */
export const SPOF_SHIFT_MIN = 0.03;
const pct = (n) => Math.round(n * 100);
/**
 * The note itself, as a pure function of the two reads. Separated from the roster
 * arithmetic so both directions can be pinned by test without having to manufacture a
 * league that happens to produce them.
 */
export function fragilityNoteFor(before, after) {
  if (!before || !after) return null;
  const delta = after.damageShare - before.damageShare;
  if (Math.abs(delta) < SPOF_SHIFT_MIN) return null;
  const sameMan = after.playerId === before.playerId;
  const beforePct = pct(before.damageShare);
  const afterPct = pct(after.damageShare);
  if (delta < 0) {
    return {
      direction: "relieves",
      text: sameMan
        ? `Your season leans less on ${before.name} afterwards: ${afterPct}% of startable value ` +
          `instead of ${beforePct}%, because the lineup has somebody else to re-solve around.`
        : `Afterwards the roster hinges on ${after.name} at ${afterPct}% of startable value, ` +
          `where today it hinges on ${before.name} at ${beforePct}%. The load moves, and it gets lighter.`,
      before,
      after,
    };
  }
  return {
    direction: "creates",
    text: sameMan
      ? `This puts more of your season on ${before.name}: ${afterPct}% of startable value ` +
        `instead of ${beforePct}%. That is what concentrating value costs, and it is worth ` +
        `paying only if you are trying to win the nights he plays.`
      : `This makes ${after.name} your single point of failure at ${afterPct}% of startable ` +
        `value, above the ${beforePct}% ${before.name} carries today. You would be buying a ` +
        `higher ceiling and a shorter fall to nothing.`,
    before,
    after,
  };
}
/** The player ids the viewer would be able to start after this package. */
export function rosterAfter(current, give, get) {
  const out = new Set(current);
  for (const a of give) if (a.kind === "player") out.delete(a.id);
  // Picks cannot fill a lineup slot tonight, so they are not startable depth and are
  // excluded here for exactly the reason the index excludes them everywhere else.
  for (const a of get) if (a.kind === "player") out.add(a.id);
  return [...out];
}
/**
 * The fragility line for one package, or null when the package does not move the number
 * enough to be worth saying.
 */
export function packageFragilityNote(h, rosterId, give, get, opts = {}) {
  const cfg = opts.cfg ?? VALUATION_CONFIG;
  const replacementValue =
    opts.replacementValue ?? leagueReplacementValue(h, cfg);
  const current = startableRosterIds(h, rosterId);
  if (current.length === 0) return null;
  const before = spofOfPlayers(h, current, { cfg, replacementValue });
  const after = spofOfPlayers(h, rosterAfter(current, give, get), {
    cfg,
    replacementValue,
  });
  return fragilityNoteFor(before, after);
}
