/**
 * What a package does to the viewer's SINGLE POINT OF FAILURE.
 *
 * The Fragility Index's actionable output was never its 0-100 score - it is the name of
 * the player the season is load-bearing on, and the share of startable value that goes
 * with him. The Trade Finder is the one surface in the app that prices a roster it does
 * not have yet, so it is the only place that can answer the question a manager actually
 * asks about a proposed deal: does this take weight off that name, or move more onto it.
 *
 * Deliberately NOT a score, and deliberately not a verdict. Both directions are stated
 * as facts about the roster you would hold, in the same voice as the rest of the
 * package's case (D6: a thesis, not a grade). A package that relieves the load is not
 * therefore a good trade, and one that concentrates it is not therefore a bad one -
 * consolidating into one better player is a legitimate move this app recommends
 * elsewhere (D32), and it necessarily raises the number this note reports. Saying so
 * plainly is the whole point: the manager gets told what they are buying.
 *
 * The before and after rosters are built by the same `spofOfPlayers` call against the
 * same league replacement line, so a difference between them is a difference in the
 * roster rather than a difference in method.
 */
import type { LeagueHistory } from "../history";
import {
  leagueReplacementValue,
  spofOfPlayers,
  startableRosterIds,
  type SpofRead,
} from "../metrics/fragility";
import { VALUATION_CONFIG, type ValuationConfig } from "../valuation";
import type { FinderAsset } from "./index";

/**
 * How much the single point of failure's share has to move before it is worth a line.
 *
 * Three points of startable value. Below that the change is inside the noise of a
 * re-solved lineup - swapping one bench body for another of the same value shifts the
 * share by a point or two without changing anything a manager would act on, and a note
 * that fires on every package is a note nobody reads.
 */
export const SPOF_SHIFT_MIN = 0.03;

export interface FragilityNote {
  /** `relieves` = less of the season rides on one man afterwards. */
  direction: "relieves" | "creates";
  text: string;
  before: SpofRead;
  after: SpofRead;
}

const pct = (n: number) => Math.round(n * 100);

/**
 * The note itself, as a pure function of the two reads. Separated from the roster
 * arithmetic so both directions can be pinned by test without having to manufacture a
 * league that happens to produce them.
 */
export function fragilityNoteFor(
  before: SpofRead | null,
  after: SpofRead | null,
): FragilityNote | null {
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
export function rosterAfter(
  current: string[],
  give: FinderAsset[],
  get: FinderAsset[],
): string[] {
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
export function packageFragilityNote(
  h: LeagueHistory,
  rosterId: number,
  give: FinderAsset[],
  get: FinderAsset[],
  opts: { cfg?: ValuationConfig; replacementValue?: number } = {},
): FragilityNote | null {
  const cfg = opts.cfg ?? VALUATION_CONFIG;
  const replacementValue = opts.replacementValue ?? leagueReplacementValue(h, cfg);
  const current = startableRosterIds(h, rosterId);
  if (current.length === 0) return null;
  const before = spofOfPlayers(h, current, { cfg, replacementValue });
  const after = spofOfPlayers(h, rosterAfter(current, give, get), {
    cfg,
    replacementValue,
  });
  return fragilityNoteFor(before, after);
}
