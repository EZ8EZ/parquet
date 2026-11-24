/**
 * Sleeper serves more than one version of a finished week's matchups (QA, 2026-11-24: roster 6
 * week 3 read 196.5 / 208 / 165.5 within five minutes; league totals 2406.5 vs 2474.5). A
 * single read cannot tell, so this process keeps the versions it has seen per week and hands
 * back the most-seen one (most recent on a tie), with a flag when they disagree.
 */
const MAX_VERSIONS = 6;
const store = new Map();
let tick = 0;

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
export function weekConsensus(key, data, fingerprint = matchupsFingerprint) {
  if (data == null) return { data, versions: 0, reads: 0, unstable: false };
  const fp = fingerprint(data);
  let seen = store.get(key);
  if (!seen) store.set(key, (seen = new Map()));
  const now = ++tick;
  const hit = seen.get(fp);
  if (hit) Object.assign(hit, { count: hit.count + 1, last: now, data });
  else seen.set(fp, { count: 1, last: now, data });
  if (seen.size > MAX_VERSIONS) {
    const oldest = [...seen.entries()].sort((a, b) => a[1].last - b[1].last)[0][0];
    seen.delete(oldest);
  }
  const ranked = [...seen.values()].sort((a, b) => b.count - a.count || b.last - a.last);
  const reads = [...seen.values()].reduce((t, v) => t + v.count, 0);
  return { data: ranked[0].data, versions: seen.size, reads, unstable: seen.size > 1 };
}

/** Test hook. */
export function resetConsensus() {
  store.clear();
}
