/**
 * SINGLE-FLIGHT, KEYED, TTL MEMO - the one copy of a pattern that used to be
 * hand-rolled six times (history, principals, metrics/skill, lineage, the Sleeper
 * provider, lab/regret/source).
 *
 * WHAT IT IS FOR NOW. Sleeper responses are cached in Next's fetch data cache, which
 * is shared across serverless instances and survives a process restart. This memo is
 * NOT that cache: it lives in one instance's memory and dies with it. Its job is
 * request de-duplication on top of the shared cache - N concurrent renders on one
 * instance join one assembly instead of each starting its own - plus a short reuse
 * window so a derived object (the corpus, the principals index) keeps its identity
 * across renders (lib/valuation keys a WeakMap on `corpus.players`).
 *
 * Semantics, unchanged from the six copies it replaces:
 *  - it stores the in-flight PROMISE, so a caller arriving mid-load joins it;
 *  - the TTL is anchored to completion time, and nothing expires while in flight;
 *  - on rejection the slot is deleted (only if it is still the current slot), so a
 *    transient failure is not pinned for the rest of the TTL window;
 *  - `fresh: true` starts a new load and replaces the slot.
 *
 * `ttlMs` may be a function of the resolved value, so a result built on incomplete
 * data (one carrying gaps) can be kept for seconds rather than minutes and retried
 * soon instead of being served as if it were whole.
 *
 * @template T
 * @param {{ ttlMs: number | ((value: T) => number) }} opts
 */
export function createMemo({ ttlMs }) {
  /** @type {Map<string, { promise: Promise<T>, resolvedAt?: number, ttl?: number }>} */
  const slots = new Map();
  const ttlOf = (value) => (typeof ttlMs === "function" ? ttlMs(value) : ttlMs);
  return {
    /**
     * @param {string} key
     * @param {() => Promise<T>} load
     * @param {{ fresh?: boolean }} [opts]
     * @returns {Promise<T>}
     */
    get(key, load, { fresh = false } = {}) {
      const hit = slots.get(key);
      if (hit && !fresh) {
        if (hit.resolvedAt === undefined) return hit.promise;
        if (Date.now() - hit.resolvedAt < hit.ttl) return hit.promise;
      }
      const slot = {};
      slot.promise = Promise.resolve()
        .then(load)
        .then(
          (value) => {
            slot.ttl = ttlOf(value);
            slot.resolvedAt = Date.now();
            // a zero-TTL memo is in-flight de-dup only: drop the settled slot, or unique keys
            // (e.g. cache-busting query strings) would accumulate for the life of the process
            if (!(slot.ttl > 0) && slots.get(key) === slot) slots.delete(key);
            return value;
          },
          (err) => {
            if (slots.get(key) === slot) slots.delete(key);
            throw err;
          },
        );
      slots.set(key, slot);
      return slot.promise;
    },
    /** The current slot's promise (in flight or resolved), or null. Never loads. */
    peek(key) {
      return slots.get(key)?.promise ?? null;
    },
    delete(key) {
      slots.delete(key);
    },
    clear() {
      slots.clear();
    },
  };
}
