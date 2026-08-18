import { describeTransaction, rosterName } from "./derive/describe.js";
import { buildIsNotable } from "./ledger.js";
import { lineupSlots } from "./metrics/fragility.js";
import { dealHref } from "./tradegraph/url.js";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Three weeks with no roster move at all - a round, plainly-stated cutoff, not a
 *  calibrated model. Long enough that "hasn't gotten to it yet" stops being the
 *  likely explanation. */
export const STALE_DAYS_THRESHOLD = 21;
/**
 * Notable transactions (trades, plus whichever waiver signal actually applies to
 * this league - see `buildIsNotable`), across every roster in the league, newest
 * first. Same notability rule as `/ledger` by construction - see the file header
 * for why that matters.
 */
export function getAuditLog(h) {
  const notable = buildIsNotable(h);
  return h.transactions
    .filter(notable)
    .map((t) => {
      const rosterId = t.type !== "trade" ? (t.rosterIds[0] ?? null) : null;
      return {
        transactionId: t.transactionId,
        season: t.season,
        week: t.week,
        created: t.created,
        type: t.type,
        description: describeTransaction(h, t),
        tradeHref: t.type === "trade" ? dealHref(t.transactionId) : null,
        rosterId,
        rosterName: rosterId != null ? rosterName(h, rosterId) : null,
      };
    })
    .sort(
      (a, b) =>
        b.created - a.created || a.transactionId.localeCompare(b.transactionId),
    );
}
/**
 * Rosters worth a commissioner's attention right now. Two independent checks, a
 * roster can trip either or both:
 *
 *   - EMPTY LINEUP SLOTS: `starters` already drops Sleeper's "0" placeholders on
 *     ingest (see providers/sleeper/schemas.ts), so any shortfall against
 *     `lineupSlots()` is a real, unfilled slot today - not a parsing artifact.
 *   - NO RECENT MOVES: scoped to the CURRENT season on purpose. A team that traded
 *     two seasons ago but has done nothing since is exactly the team this check
 *     exists to surface; folding in ancient history would hide that behind a
 *     technically-true "last move: 2023."
 */
export function getStaleRosters(h, opts = {}) {
  const now = opts.now ?? Date.now();
  const slotsNeeded = lineupSlots(h).length;
  const lastMoveByRoster = new Map();
  for (const t of h.transactions) {
    if (t.season !== h.currentLeague.season) continue;
    for (const rid of t.rosterIds) {
      const prev = lastMoveByRoster.get(rid);
      if (prev == null || t.created > prev)
        lastMoveByRoster.set(rid, t.created);
    }
  }
  const out = [];
  for (const r of h.rosters) {
    const reasons = [];
    const emptySlots = Math.max(0, slotsNeeded - r.starters.length);
    if (emptySlots > 0) {
      reasons.push({
        kind: "empty-lineup-slots",
        detail: `${emptySlots} starting slot${emptySlots === 1 ? "" : "s"} empty right now`,
      });
    }
    const last = lastMoveByRoster.get(r.rosterId);
    if (last == null) {
      reasons.push({
        kind: "no-recent-moves",
        detail: "No moves yet this season",
      });
    } else {
      const days = Math.floor((now - last) / DAY_MS);
      if (days >= STALE_DAYS_THRESHOLD) {
        reasons.push({
          kind: "no-recent-moves",
          detail: `No moves in ${days} days`,
        });
      }
    }
    if (reasons.length > 0) {
      out.push({
        rosterId: r.rosterId,
        name: rosterName(h, r.rosterId),
        reasons,
      });
    }
  }
  return out.sort(
    (a, b) => b.reasons.length - a.reasons.length || a.rosterId - b.rosterId,
  );
}
