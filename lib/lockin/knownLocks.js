/**
 * Locks we were told about. Sleeper's public API has no lock flag (API_NOTES, matchups):
 * a lock is certain from the data only once the player's next game tips and his slot keeps
 * the old score. Until then the engine weighs every banked score with the league's
 * unknown-lock share. When the manager can see a lock in the Sleeper app (his own, or the
 * opponent's lock icon) it is recorded in lib/lockin/knownLocks.data.js with
 * scripts/lockin/mark-locks.mjs, and this module turns it into a certain lock.
 *
 * An entry is keyed by league, season, week, roster and player, and carries the score it
 * was locked at. It applies only while the slot's banked score equals that score (within
 * the lock-state tolerance): if the score moved, the slot reset at a tip (so it was not
 * locked) or the entry is stale, and it is ignored rather than trusted. It never overrides
 * a certain inference (a certain reset wins), and the viewer's what-if assumptions still
 * override it.
 */
import { KNOWN_LOCKS } from "./knownLocks.data.js";

const EPS = 0.011;

/** Index the entries: "league|season|week|roster|player" -> score. */
export function indexKnownLocks(entries = KNOWN_LOCKS) {
  const m = new Map();
  for (const e of entries) {
    if (!e || e.playerId == null || !Number.isFinite(e.score)) continue;
    m.set(`${e.leagueId}|${e.season}|${e.week}|${e.rosterId}|${e.playerId}`, e.score);
  }
  return m;
}

const DEFAULT_INDEX = indexKnownLocks();

/**
 * The lock state for a slot given what was reported: the inferred state unchanged, or a
 * certain lock with reason "reported_locked".
 */
export function withKnownLock(ls, { leagueId, season, week, rosterId, playerId, banked }, index = DEFAULT_INDEX) {
  if (!playerId || banked == null || !index.size) return ls;
  const score = index.get(`${leagueId}|${season}|${week}|${rosterId}|${playerId}`);
  if (score == null || Math.abs(score - banked) >= EPS) return ls;
  if (ls?.certain && ls.state === "reset") return ls;
  if (ls?.certain && ls.state === "locked") return ls;
  return { state: "locked", reason: "reported_locked", certain: true, score: banked };
}
