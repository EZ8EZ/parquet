/**
 * Client-side glue for the /rank drag board: turning a drag gesture and a
 * localStorage string into the ordered id list `customSource()` expects.
 *
 * Kept out of ./index on purpose - that module is pure rank arithmetic with no
 * notion of storage, gestures, or a rankable pool that changes week to week.
 * This module is the only place that knows about any of that.
 */

/** Versioned so a future schema change can migrate or discard old saves instead
 *  of silently misreading them. */
export const CUSTOM_RANK_STORAGE_KEY = "parquet:custom-rank:v1";

/** Turn a drag order into a localStorage-ready string. */
export function serializeCustomOrder(orderedPlayerIds: string[]): string {
  return JSON.stringify(orderedPlayerIds);
}

/**
 * Parse whatever localStorage handed back. This is untrusted input - a stale
 * schema version, hand-edited storage, or plain corruption - so it degrades to
 * "no custom ranking yet" instead of throwing and blanking the page.
 */
export function parseCustomOrder(raw: string | null): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((x): x is string => typeof x === "string");
}

/**
 * Move one entry to a new position in an ordered list, immutably.
 *
 * This is the one piece of pure logic behind the drag gesture: the pointer
 * handler only has to work out `toIndex` from where the finger is, then hand
 * off here, so the actual list surgery is unit-testable with no DOM involved.
 * Out-of-range or no-op moves return the input unchanged (same reference),
 * which lets a caller skip a re-render when nothing actually moved.
 */
export function reorder<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= list.length ||
    toIndex < 0 ||
    toIndex >= list.length
  ) {
    return list;
  }
  const next = list.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * Reconcile a stored custom order against this week's rankable pool.
 *
 * A dynasty roster churns: a player traded away or dropped below the pool
 * cutoff shouldn't linger in the saved order forever, and a player who newly
 * entered the pool needs a slot or blending silently ignores them (their rank
 * just falls through to consensus, per blendSources - fine as a default, but
 * they should still be draggable). Order is preserved for everyone already
 * ranked; newcomers land at the end in whatever order the pool already has
 * them, which is consensus order.
 */
export function syncCustomOrder(stored: string[], poolIds: string[]): string[] {
  const pool = new Set(poolIds);
  const kept = stored.filter((id) => pool.has(id));
  const keptSet = new Set(kept);
  const additions = poolIds.filter((id) => !keptSet.has(id));
  return [...kept, ...additions];
}
