/**
 * Reconstruct commissioner-executed trades.
 *
 * REAL-DATA PROBLEM: when a commissioner processes a trade by hand (common for
 * multi-team deals, which Sleeper's UI can't express), it lands as several separate
 * `commissioner` transactions — one per player moved — with no link between them.
 * Every trade analytic (strategy, dossiers, ledger, pick flow) then misses the deal
 * entirely, and the individual moves look like unexplained roster edits.
 *
 * Verified example (NSL Fantasy Hoops, 2023-07-03) — four commissioner rows that are
 * actually ONE three-team trade:
 *   Devin Booker    NSLKB    -> EZ8
 *   Jordan Poole    EZ8      -> NSLKB
 *   Klay Thompson   NSLKB    -> aidsnuge
 *   Deandre Ayton   aidsnuge -> NSLKB
 *
 * Approach: bucket commissioner transactions into time windows, then union-find
 * roster pairs within a bucket. Any connected group that moves players in BOTH
 * directions (i.e. it's an exchange, not a one-way admin fix) becomes a synthetic
 * `trade` with all adds/drops/rosters merged. One-way moves are left alone — those
 * really are admin corrections, not trades.
 */
import type { TradedPick, Transaction } from "../providers/types";

/** Commissioner moves this far apart still count as the same deal. */
const WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface CoalesceResult {
  transactions: Transaction[];
  /** How many synthetic trades were reconstructed. */
  reconstructed: number;
}

function isCommissioner(t: Transaction): boolean {
  return t.type === "commissioner";
}

/** All rosters a transaction touches (via adds/drops, not just roster_ids). */
function touchedRosters(t: Transaction): number[] {
  const s = new Set<number>(t.rosterIds);
  for (const r of Object.values(t.adds)) s.add(r);
  for (const r of Object.values(t.drops)) s.add(r);
  return [...s];
}

export function coalesceCommissionerTrades(
  input: Transaction[],
): CoalesceResult {
  const commissioner = input.filter(isCommissioner);
  const others = input.filter((t) => !isCommissioner(t));
  if (commissioner.length < 2) return { transactions: input, reconstructed: 0 };

  // Bucket by season + time window.
  const sorted = [...commissioner].sort((a, b) => a.created - b.created);
  const buckets: Transaction[][] = [];
  for (const t of sorted) {
    const last = buckets[buckets.length - 1];
    const prev = last?.[last.length - 1];
    if (
      last &&
      prev &&
      prev.season === t.season &&
      t.created - prev.created <= WINDOW_MS
    ) {
      last.push(t);
    } else {
      buckets.push([t]);
    }
  }

  const out: Transaction[] = [...others];
  let reconstructed = 0;

  for (const bucket of buckets) {
    if (bucket.length < 2) {
      out.push(...bucket);
      continue;
    }
    // Union-find over rosters to find connected groups within the bucket.
    const parent = new Map<number, number>();
    const find = (x: number): number => {
      if (!parent.has(x)) parent.set(x, x);
      let r = parent.get(x)!;
      while (r !== parent.get(r)!) r = parent.get(r)!;
      parent.set(x, r);
      return r;
    };
    const union = (a: number, b: number) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };
    for (const t of bucket) {
      const rs = touchedRosters(t);
      for (let i = 1; i < rs.length; i++) union(rs[0], rs[i]);
    }

    // Group the bucket's transactions by connected component.
    const groups = new Map<number, Transaction[]>();
    for (const t of bucket) {
      const rs = touchedRosters(t);
      const key = rs.length ? find(rs[0]) : -1;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
    }

    for (const group of groups.values()) {
      if (group.length < 2) {
        out.push(...group);
        continue;
      }
      // Merge adds/drops.
      const adds: Record<string, number> = {};
      const drops: Record<string, number> = {};
      const rosterSet = new Set<number>();
      const draftPicks = [] as Transaction["draftPicks"];
      for (const t of group) {
        Object.assign(adds, t.adds);
        Object.assign(drops, t.drops);
        for (const r of touchedRosters(t)) rosterSet.add(r);
        draftPicks.push(...t.draftPicks);
      }
      // Only a TRADE if value moved in more than one direction — i.e. at least two
      // distinct rosters each received something. Otherwise it's an admin fix.
      const receivers = new Set(Object.values(adds));
      if (receivers.size < 2 || rosterSet.size < 2) {
        out.push(...group);
        continue;
      }
      const first = group[0];
      const rosterIds = [...rosterSet].sort((a, b) => a - b);
      out.push({
        ...first,
        // Deterministic id derived from the group so re-ingests are stable.
        transactionId: `coalesced-${group
          .map((t) => t.transactionId)
          .sort()
          .join("+")}`,
        type: "trade",
        status: "complete",
        adds,
        drops,
        draftPicks,
        rosterIds,
        consenterIds: rosterIds,
        created: Math.min(...group.map((t) => t.created)),
        statusUpdated: Math.max(...group.map((t) => t.statusUpdated)),
      });
      reconstructed++;
    }
  }

  out.sort((a, b) => a.created - b.created);
  return { transactions: out, reconstructed };
}

/**
 * Re-attach pick movements that commissioner rows dropped.
 *
 * Because commissioner transactions always carry `draft_picks: []`, a hand-executed
 * trade's pick component exists only in the traded_picks snapshot. For every pick
 * whose ownership changed but which NO transaction records, we attach it to a
 * coalesced commissioner trade whose participating rosters match the pick's
 * from→to pair. In dynasty, picks are as important as players — losing them makes
 * the trade record wrong, not merely incomplete.
 */
export function attachInferredPicks(
  transactions: Transaction[],
  tradedPicks: TradedPick[],
): { transactions: Transaction[]; attached: number } {
  // Key by the SPECIFIC HOP (which pick, from whom, to whom) — not just the pick's
  // identity. Keying only on (season, round, originalRoster) was a real bug: a pick
  // that later moved in a properly-recorded trade marked every OTHER hop of that
  // same pick "explained", so genuinely unrecorded transfers were skipped while
  // unrelated ones got attached.
  const explained = new Set<string>();
  for (const t of transactions) {
    for (const dp of t.draftPicks) {
      explained.add(
        `${dp.season}|${dp.round}|${dp.rosterId}|${dp.previousOwnerId}|${dp.ownerId}`,
      );
    }
  }
  const orphans = tradedPicks.filter(
    (tp) =>
      tp.ownerId !== tp.rosterId &&
      tp.previousOwnerId !== tp.ownerId &&
      !explained.has(
        `${tp.season}|${tp.round}|${tp.rosterId}|${tp.previousOwnerId}|${tp.ownerId}`,
      ),
  );
  if (!orphans.length) return { transactions, attached: 0 };

  // Only coalesced commissioner trades are candidates — those are the ones known
  // to have lost their pick component.
  const candidates = transactions.filter(
    (t) => t.type === "trade" && t.transactionId.startsWith("coalesced-"),
  );
  if (!candidates.length) return { transactions, attached: 0 };

  let attached = 0;
  const byId = new Map(transactions.map((t) => [t.transactionId, t]));
  for (const tp of orphans) {
    // Both parties to the hop must be in the deal, AND the deal must be a plausible
    // cause: only picks for the trade's season or later can have moved in it.
    const matches = candidates.filter(
      (t) =>
        t.rosterIds.includes(tp.previousOwnerId) &&
        t.rosterIds.includes(tp.ownerId) &&
        parseInt(tp.season, 10) >= parseInt(t.season, 10),
    );
    // Ambiguous attribution is worse than none: if several deals could explain the
    // hop we cannot know which, so we leave it off rather than invent a trade.
    if (matches.length !== 1) continue;
    const target = byId.get(matches[0].transactionId)!;
    target.draftPicks = [
      ...target.draftPicks,
      {
        round: tp.round,
        season: tp.season,
        rosterId: tp.rosterId,
        ownerId: tp.ownerId,
        previousOwnerId: tp.previousOwnerId,
        inferred: true,
      },
    ];
    attached++;
  }
  return { transactions: [...byId.values()], attached };
}
