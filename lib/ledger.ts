/**
 * Decision Ledger helpers. A "decision" is a transaction the user made that is
 * worth capturing reasoning for: every trade, plus notable waiver claims.
 */
import type { Annotation, LeagueHistory } from "./history";
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

export function isNotable(t: Transaction): boolean {
  if (t.type === "trade") return true;
  if (t.type === "waiver" && (t.waiverBid ?? 0) >= NOTABLE_FAAB) return true;
  return false;
}

/** All of the user's decisions, newest first. */
export function getLedgerEntries(h: LeagueHistory): LedgerEntry[] {
  const rosterId = h.me.rosterId;
  if (rosterId == null) return [];
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
      notable: isNotable(t),
      description:
        t.type === "trade"
          ? `You ${describeTradeForRoster(h, t, rosterId)}`
          : describeTransaction(h, t),
      annotation: h.annotations.get(t.transactionId) ?? null,
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
