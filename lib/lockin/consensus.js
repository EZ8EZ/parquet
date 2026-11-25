/**
 * Sleeper serves more than one version of a finished week's matchups (QA, 2026-11-24: roster 6
 * week 3 read 196.5 / 208 / 165.5 within five minutes; league totals 2406.5 vs 2474.5). A
 * single read cannot tell, so this process keeps the versions it has seen per week and hands
 * back the most-seen one (most recent on a tie), with a flag when they disagree.
 */
const MAX_VERSIONS = 6;
// review 5: the two reads of a week are not simultaneous (one may come from a cache up to a day
// old), so a disagreement can be a genuine stat correction. A version not read for 6 hours is
// forgotten, so a corrected week becomes stable again once only the new version is served.
export const CONSENSUS_TTL_MS = 6 * 3600 * 1000;
const store = new Map();
// review2 SHOULD 1: when each week was last read past the cache. The cached copy is re-read on
// every request (its timestamp stays fresh) while the network version would expire, so a week
// could turn "stable" on a stale cached copy; a week is trusted only while its newest network
// read is within the TTL, and otherwise needs one (needsNetworkRead).
const networkAt = new Map();
// when a confirming read was last started: a failing read is not retried on every request
const attemptAt = new Map();
export const CONFIRM_RETRY_MS = 5 * 60 * 1000;
let tick = 0;

function expire(seen, nowMs) {
  for (const [fp, v] of seen) if (nowMs - v.at > CONSENSUS_TTL_MS) seen.delete(fp);
}

/** Fingerprint of a matchups payload: every roster's starters and banked points. */
export function matchupsFingerprint(ms) {
  return JSON.stringify(
    (ms || [])
      .map((m) => [m.roster_id, m.starters || [], m.starters_points || []])
      .sort((a, b) => a[0] - b[0]),
  );
}

/**
 * Record a read and return the consensus: { data, versions (distinct seen), reads, unstable }.
 * `key` identifies the week (league and week); `data` is the payload just read.
 */
export function weekConsensus(key, data, fingerprint = matchupsFingerprint, nowMs = Date.now(), { network = false } = {}) {
  if (data == null) return { data, versions: 0, reads: 0, unstable: false };
  if (network) networkAt.set(key, nowMs);
  const fp = fingerprint(data);
  let seen = store.get(key);
  if (!seen) store.set(key, (seen = new Map()));
  expire(seen, nowMs);
  const now = ++tick;
  const hit = seen.get(fp);
  if (hit) Object.assign(hit, { count: hit.count + 1, last: now, at: nowMs, data });
  else seen.set(fp, { count: 1, last: now, at: nowMs, data });
  if (seen.size > MAX_VERSIONS) {
    const oldest = [...seen.entries()].sort((a, b) => a[1].last - b[1].last)[0][0];
    seen.delete(oldest);
  }
  const ranked = [...seen.values()].sort((a, b) => b.count - a.count || b.last - a.last);
  const reads = [...seen.values()].reduce((t, v) => t + v.count, 0);
  return { data: ranked[0].data, versions: seen.size, reads, unstable: seen.size > 1 };
}

/** Reads recorded for a week so far in this process (0 when never read). */
export function readsOf(key, nowMs = Date.now()) {
  const seen = store.get(key);
  if (seen) expire(seen, nowMs);
  return seen ? [...seen.values()].reduce((t, v) => t + v.count, 0) : 0;
}

/**
 * True when the week has no read past the cache within CONSENSUS_TTL_MS and none was started
 * within CONFIRM_RETRY_MS (review3 SHOULD 2: record the attempt when it starts, so concurrent
 * renders and a failing read do not all go to the network).
 */
export function needsNetworkRead(key, nowMs = Date.now()) {
  const at = networkAt.get(key);
  if (at != null && nowMs - at <= CONSENSUS_TTL_MS) return false;
  const tried = attemptAt.get(key);
  return tried == null || nowMs - tried > CONFIRM_RETRY_MS;
}

/** True when a read past the cache of this week succeeded within CONSENSUS_TTL_MS. */
export function hasFreshNetworkRead(key, nowMs = Date.now()) {
  const at = networkAt.get(key);
  return at != null && nowMs - at <= CONSENSUS_TTL_MS;
}

/** Record that a confirming read of the week starts now. */
export function startNetworkRead(key, nowMs = Date.now()) {
  attemptAt.set(key, nowMs);
}

/** Test hook. */
export function resetConsensus() {
  store.clear();
  networkAt.clear();
  attemptAt.clear();
}
