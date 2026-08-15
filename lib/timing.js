/**
 * Opt-in timing instrumentation for the app's slowest cold loaders (corpus assembly in
 * lib/history.ts, the draft index in lib/lineage/index.ts). Gated on
 * `PARQUET_DEBUG_TIMINGS` so it costs nothing when unset — not a log call, not even an
 * extra Date.now() — which is the point: this is the measurement that tells the owner
 * WHEN cold-start latency has grown enough to justify the next stage (a persistent
 * cache), rather than a guess. See DECISIONS.md D25: corpus cold load is a budget to
 * protect, and a budget needs a meter.
 */
const debugTimingsEnabled = () => process.env.PARQUET_DEBUG_TIMINGS === "1";
/** Wrap an async loader; logs `[timing] <label>: <ms>ms` only when enabled. */
export async function timed(label, fn) {
  if (!debugTimingsEnabled()) return fn();
  const start = Date.now();
  try {
    return await fn();
  } finally {
    console.log(`[timing] ${label}: ${Date.now() - start}ms`);
  }
}
