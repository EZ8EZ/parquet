/**
 * COMMISSIONER TOOLS - a health-check dashboard, not a second ledger.
 *
 * Trade-veto history was in scope once and was dropped: Sleeper's API does not
 * reliably expose it, and a "veto log" that silently misses vetoes would be worse
 * than no veto log at all. What is left is two things this corpus can actually
 * answer honestly:
 *
 *   1. A TRANSACTION AUDIT LOG. This is deliberately NOT a re-listing of every
 *      transaction: `/ledger` already owns the viewer's own decisions (with
 *      annotation and reasoning), and copying its rows here would be a second
 *      surface the two pages would have to be kept in sync with by hand. Instead
 *      this scopes to NOTABLE transactions (`buildIsNotable`, imported straight
 *      from `lib/ledger.ts` rather than redefined - one definition of "worth
 *      showing" for the whole app) across EVERY roster, not just the viewer's, and
 *      hands each row a link to an existing surface: a trade opens on its own
 *      receipt via `dealHref`, everything else opens on the manager who made it.
 *   2. LEAGUE HEALTH CHECKS. Two signals, both genuinely new arithmetic over
 *      existing fields rather than a new model: a roster's current starting
 *      lineup against `lineupSlots()` (already built for the fragility solver),
 *      and a roster's most recent transaction this season against a plainly
 *      named threshold. Picks still in flight are not recomputed here at all -
 *      see the page, which calls `getTradedPickLineages` directly, the same
 *      primitive `lib/digest/` already reads for its own resolved-picks feed.
 */
import type { LeagueHistory } from "./history";
import { describeTransaction, rosterName } from "./derive/describe";
import { buildIsNotable } from "./ledger";
import { lineupSlots } from "./metrics/fragility";
import { dealHref } from "./tradegraph/url";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Three weeks with no roster move at all - a round, plainly-stated cutoff, not a
 *  calibrated model. Long enough that "hasn't gotten to it yet" stops being the
 *  likely explanation. */
export const STALE_DAYS_THRESHOLD = 21;

// ------------------------------------------------------------------ audit log

export interface AuditEntry {
  transactionId: string;
  season: string;
  week: number;
  created: number;
  type: string;
  description: string;
  /** Trades only - opens the deal's own receipt page. */
  tradeHref: string | null;
  /** Non-trades - the manager who made the move, for a page to link a dossier to. */
  rosterId: number | null;
  rosterName: string | null;
}

/**
 * Notable transactions (trades, plus whichever waiver signal actually applies to
 * this league - see `buildIsNotable`), across every roster in the league, newest
 * first. Same notability rule as `/ledger` by construction - see the file header
 * for why that matters.
 */
export function getAuditLog(h: LeagueHistory): AuditEntry[] {
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
      (a, b) => b.created - a.created || a.transactionId.localeCompare(b.transactionId),
    );
}

// ------------------------------------------------------------------ stale rosters

export type StaleReasonKind = "empty-lineup-slots" | "no-recent-moves";

export interface StaleReason {
  kind: StaleReasonKind;
  detail: string;
}

export interface StaleRoster {
  rosterId: number;
  name: string;
  reasons: StaleReason[];
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
export function getStaleRosters(
  h: LeagueHistory,
  opts: { now?: number } = {},
): StaleRoster[] {
  const now = opts.now ?? Date.now();
  const slotsNeeded = lineupSlots(h).length;

  const lastMoveByRoster = new Map<number, number>();
  for (const t of h.transactions) {
    if (t.season !== h.currentLeague.season) continue;
    for (const rid of t.rosterIds) {
      const prev = lastMoveByRoster.get(rid);
      if (prev == null || t.created > prev) lastMoveByRoster.set(rid, t.created);
    }
  }

  const out: StaleRoster[] = [];
  for (const r of h.rosters) {
    const reasons: StaleReason[] = [];

    const emptySlots = Math.max(0, slotsNeeded - r.starters.length);
    if (emptySlots > 0) {
      reasons.push({
        kind: "empty-lineup-slots",
        detail: `${emptySlots} starting slot${emptySlots === 1 ? "" : "s"} empty right now`,
      });
    }

    const last = lastMoveByRoster.get(r.rosterId);
    if (last == null) {
      reasons.push({ kind: "no-recent-moves", detail: "No moves yet this season" });
    } else {
      const days = Math.floor((now - last) / DAY_MS);
      if (days >= STALE_DAYS_THRESHOLD) {
        reasons.push({ kind: "no-recent-moves", detail: `No moves in ${days} days` });
      }
    }

    if (reasons.length > 0) {
      out.push({ rosterId: r.rosterId, name: rosterName(h, r.rosterId), reasons });
    }
  }

  return out.sort(
    (a, b) => b.reasons.length - a.reasons.length || a.rosterId - b.rosterId,
  );
}
