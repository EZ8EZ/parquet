/**
 * Decision Ledger helpers. A "decision" is a transaction the user made that is
 * worth capturing reasoning for: every trade, plus notable waiver claims. What
 * makes a waiver claim "notable" is not one fixed rule - see `buildIsNotable`.
 */
import { myAnnotation, type Annotation, type LeagueHistory } from "./history";
import { describeTradeForRoster, describeTransaction } from "./derive/describe";
import { tenureSeasons, type PrincipalIndex } from "./principals";
import type { Transaction } from "./providers/types";

export interface LedgerEntry {
  transactionId: string;
  season: string;
  week: number;
  created: number;
  type: Transaction["type"];
  notable: boolean;
  description: string;
  annotation: Annotation | null;
}

const NOTABLE_FAAB = 20;

/**
 * True only for a league that actually runs FAAB (Free Agent Acquisition Budget)
 * waivers - Sleeper `waiver_type: 2`. Rolling-priority (0) and reverse-standings
 * (1) leagues both leave `waiverBid` null on every single waiver transaction,
 * forever, so thresholding against NOTABLE_FAAB below is dead code for them.
 * Verified live: this league runs waiver_type 0, and all 261 waiver rows this
 * season carry a null bid. Read straight from the live league setting rather than
 * inferred from the bid data itself, because an empty bid history can't tell "this
 * league doesn't use FAAB" apart from "nobody has made a big claim yet".
 */
export function isFaabLeague(h: LeagueHistory): boolean {
  return h.currentLeague.settings.waiver_type === 2;
}

/**
 * Waiver transactions where more than one manager tried to add the SAME player in
 * the SAME week - the honest notability signal for a non-FAAB league, which has no
 * bid amount to threshold at all. Sleeper's transaction feed already carries the
 * losing side of a claim war (`status: "failed"`) right alongside the winner, so
 * this reads straight off the corpus already in hand rather than a new fetch.
 * Verified live: 41 contested player-weeks in the 2025 season alone.
 */
function contestedWaiverIds(h: LeagueHistory): Set<string> {
  const rostersByKey = new Map<string, Set<number>>();
  for (const t of h.transactions) {
    if (t.type !== "waiver") continue;
    for (const [playerId, rosterId] of Object.entries(t.adds)) {
      const key = `${t.season}|${t.week}|${playerId}`;
      (rostersByKey.get(key) ?? rostersByKey.set(key, new Set()).get(key)!).add(rosterId);
    }
  }
  const contested = new Set<string>();
  for (const t of h.transactions) {
    if (t.type !== "waiver" || t.status !== "complete") continue;
    for (const playerId of Object.keys(t.adds)) {
      const key = `${t.season}|${t.week}|${playerId}`;
      if ((rostersByKey.get(key)?.size ?? 0) > 1) {
        contested.add(t.transactionId);
        break;
      }
    }
  }
  return contested;
}

/**
 * Builds the notability check ONCE per page load instead of recomputing the
 * contested-claim index on every transaction - the difference between one pass
 * over the season's waivers and one pass PER waiver when this runs inside a
 * `.filter()`. FAAB leagues skip building that index entirely, since they never
 * need it.
 */
export function buildIsNotable(h: LeagueHistory): (t: Transaction) => boolean {
  const faab = isFaabLeague(h);
  const contested = faab ? null : contestedWaiverIds(h);
  return (t: Transaction): boolean => {
    if (t.type === "trade") return true;
    if (t.type !== "waiver") return false;
    if (faab) return (t.waiverBid ?? 0) >= NOTABLE_FAAB;
    return contested!.has(t.transactionId);
  };
}

/**
 * Plain-language name for whatever counts as a "big" waiver claim in THIS league -
 * shared by /ledger, /commissioner and /recap so all three describe the same
 * filter in the same words, and none of them promise a FAAB bid threshold this
 * league's waiver type can never produce.
 */
export function notableWaiverLabel(h: LeagueHistory): string {
  return isFaabLeague(h) ? "big-FAAB waiver claims" : "contested waiver claims";
}

/**
 * All of the user's decisions, newest first.
 *
 * `principals` CONFINES THIS TO THE VIEWER'S OWN TENURE, which is the difference
 * between a to-do list and an accusation. Every row here is captioned "You acquired
 * ..." and the badge above it says "log why you made them - while you still
 * remember"; keyed on the seat alone, the manager who took over roster 11 in 2025 was
 * shown 25 decisions of which 19 were their predecessor's, each addressed to them in
 * the second person. D22 is explicit that `ownerAt(season, rosterId)` is the only
 * sanctioned way to turn a historical fact into a person, and lib/recap.ts already
 * gates on exactly that. Optional, so a caller without an index degrades to the old
 * seat-scoped behaviour and a league with no handovers is unchanged.
 */
export function getLedgerEntries(
  h: LeagueHistory,
  principals?: PrincipalIndex,
): LedgerEntry[] {
  const rosterId = h.me.rosterId;
  if (rosterId == null) return [];
  const notable = buildIsNotable(h);
  const viewer = h.me.userId ? principals?.byOwnerId.get(h.me.userId) : undefined;
  const seasons =
    viewer && principals?.hasSuccessions
      ? tenureSeasons(viewer, rosterId)
      : null;
  const mine = h.transactions.filter(
    (t) =>
      (seasons == null || seasons.has(t.season)) &&
      (t.rosterIds.includes(rosterId) ||
        Object.values(t.adds).includes(rosterId) ||
        Object.values(t.drops).includes(rosterId)),
  );
  return mine
    .map((t) => ({
      transactionId: t.transactionId,
      season: t.season,
      week: t.week,
      created: t.created,
      type: t.type,
      notable: notable(t),
      description:
        t.type === "trade"
          ? `You ${describeTradeForRoster(h, t, rosterId)}`
          : describeTransaction(h, t),
      // Only the VIEWER's own annotation — a trade partner's captured reasoning on
      // this same transactionId must never show up as "your" reasoning.
      annotation: myAnnotation(h, t.transactionId),
    }))
    .sort((a, b) => b.created - a.created);
}

/**
 * HOW RECENT A DECISION HAS TO BE TO STILL BE A TO-DO.
 *
 * The whole backlog is a real number and /ledger prints it. It is not, however, an
 * outstanding ACTION: a waiver claim from two seasons ago has no reasoning left to
 * capture at the moment of conviction, because the moment is gone. Treating it as a
 * task is what turned the Desk's status line - which is on the bottom of every
 * screen, in the accent colour, forever - into a counter that could only ever go
 * up. Thirty days is deliberately not a season or a league phase: a window keyed to
 * the calendar changes shape on boundaries the reader cannot see, and this one is
 * the same width every day of the year.
 */
export const RECENT_CAPTURE_DAYS = 30;

/**
 * THE ONE DECISION THE PAGE ASKS FOR FIRST.
 *
 * The Desk badge and the Home banner both promise a single next action and the ledger
 * used to answer with twenty-nine open textareas. This picks the one to pin: the most
 * recent NOTABLE entry with no reasoning on it yet.
 *
 * Newest, not oldest, and that is the whole argument of the feature - reasoning decays
 * from the moment the trade clears, so the freshest uncaptured decision is the one
 * whose "why" is still recoverable. The oldest is the one you would be inventing.
 *
 * `getLedgerEntries` already sorts newest-first, so this is a find rather than a
 * re-sort; it does not assume that and compares `created` anyway, because a caller
 * handing over a filtered or re-ordered array should still get the right answer.
 * Returns null when everything notable is captured (or nothing is notable yet), which
 * is the state the page renders as "all caught up".
 */
export function newestToCapture(entries: LedgerEntry[]): LedgerEntry | null {
  let best: LedgerEntry | null = null;
  for (const e of entries) {
    if (!e.notable || e.annotation) continue;
    if (!best || e.created > best.created) best = e;
  }
  return best;
}

export interface LedgerSummary {
  total: number;
  notable: number;
  annotated: number;
  /** Every notable decision with no reasoning captured, however old. */
  unannotatedNotable: number;
  /**
   * The subset of those made in the last `RECENT_CAPTURE_DAYS` - the ones a reader
   * can still honestly answer "why did I do that?" about. This is what chrome that
   * renders on every page should count; the full figure belongs on /ledger, which
   * is the page about the backlog.
   */
  recentUnannotated: number;
}

export function getLedgerSummary(
  h: LeagueHistory,
  principals?: PrincipalIndex,
  now: number = Date.now(),
): LedgerSummary {
  const entries = getLedgerEntries(h, principals);
  const notable = entries.filter((e) => e.notable);
  const unannotated = notable.filter((e) => !e.annotation);
  const cutoff = now - RECENT_CAPTURE_DAYS * 24 * 60 * 60 * 1000;
  return {
    total: entries.length,
    notable: notable.length,
    annotated: entries.filter((e) => e.annotation).length,
    unannotatedNotable: unannotated.length,
    recentUnannotated: unannotated.filter((e) => e.created >= cutoff).length,
  };
}
