/**
 * Decision Ledger helpers. A "decision" is a transaction the user made that is
 * worth capturing reasoning for: every trade, plus notable waiver claims. What
 * makes a waiver claim "notable" is not one fixed rule - see `buildIsNotable`.
 */
import { myAnnotation, type Annotation, type LeagueHistory } from "./history";
import { describeTradeForRoster, describeTransaction } from "./derive/describe";
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

/** All of the user's decisions, newest first. */
export function getLedgerEntries(h: LeagueHistory): LedgerEntry[] {
  const rosterId = h.me.rosterId;
  if (rosterId == null) return [];
  const notable = buildIsNotable(h);
  const mine = h.transactions.filter(
    (t) =>
      t.rosterIds.includes(rosterId) ||
      Object.values(t.adds).includes(rosterId) ||
      Object.values(t.drops).includes(rosterId),
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

export interface LedgerSummary {
  total: number;
  notable: number;
  annotated: number;
  unannotatedNotable: number;
}

export function getLedgerSummary(h: LeagueHistory): LedgerSummary {
  const entries = getLedgerEntries(h);
  const notable = entries.filter((e) => e.notable);
  return {
    total: entries.length,
    notable: notable.length,
    annotated: entries.filter((e) => e.annotation).length,
    unannotatedNotable: notable.filter((e) => !e.annotation).length,
  };
}
