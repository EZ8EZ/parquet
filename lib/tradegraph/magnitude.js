/**
 * HOW MUCH VALUE A DEAL MOVED - a measurement, never a verdict.
 *
 * The deal index had no typography of importance: 141 deals as identical two-line
 * rows, the trade that reshaped the league indistinguishable from a throw-in swap.
 * This module computes the one standing fact that can order them without grading
 * them (D6): the TOTAL TWO-WAY VALUE MOVED - every player the transaction moved,
 * both directions summed, priced by the same `/values` model every other surface
 * uses. A sum over both sides deliberately cannot say who won; it says how much
 * weight changed hands, which is arithmetic on published values and nothing more.
 *
 * The honesty caveats ride along rather than being averaged away:
 *   - D23: prices are TODAY's. This measures how big a deal looks now, not how it
 *     was reasoned at the time. Every caller's copy must say "today's prices".
 *   - D24/D19: players only. Picks are never priced here, and a commissioner-
 *     executed deal has no pick record at all - so a deal whose weight was mostly
 *     picks measures small. That bias is stated where the number prints, not fixed
 *     by guessing.
 *
 * A deal none of whose players the model can price gets `ticks: null` - no
 * measurement, no mark (the D19 posture: an acknowledged gap beats a fabricated
 * zero-tick that would read as "measured: tiny").
 *
 * Buckets are QUARTILES of the priced deals, collapsed to three ticks so a row
 * glyph stays countable at a glance: bottom quartile = 1, middle half = 2, top
 * quartile = 3. Geometry carries the reading (tick COUNT), never colour.
 */

/** @typedef {{ value: number, ticks: 1|2|3|null }} DealMagnitude */

/**
 * @param {Array<{ type: string, transactionId: string, season: string,
 *   created: number, adds: Record<string, number> }>} transactions
 *   The corpus's transaction list (`h.transactions`); non-trades are skipped here
 *   so callers hand the list over unfiltered.
 * @param {(playerId: string) => number} priceOf
 *   Today's price for a player, 0 when the model cannot price them. Callers wrap
 *   `cachedValuePlayers(h)`; taking a function keeps this measurable without a
 *   full corpus in tests.
 * @returns {{
 *   byId: Map<string, DealMagnitude>,
 *   headlineBySeason: Map<string, string>,
 * }}
 *   `headlineBySeason` maps a season to the transaction id of its LARGEST deal by
 *   value moved - "most value moved", the measurement, not "best trade", the
 *   verdict this app does not issue. Seasons where nothing priced stay absent:
 *   a season of all-pick deals has no headline rather than an arbitrary one.
 */
export function dealMagnitudes(transactions, priceOf) {
  const rows = [];
  for (const t of transactions) {
    if (t.type !== "trade") continue;
    let value = 0;
    for (const pid of Object.keys(t.adds)) value += priceOf(pid) || 0;
    rows.push({
      id: t.transactionId,
      season: t.season,
      created: t.created,
      value: Math.round(value),
    });
  }

  // Quartile thresholds over the PRICED deals only. Zero-value deals are not
  // "small" - they are unmeasured (all picks, or all unpriceable players) - and
  // letting ~a dozen zeros anchor q1 would promote every real deal a bucket.
  const priced = rows
    .filter((r) => r.value > 0)
    .map((r) => r.value)
    .sort((a, b) => a - b);
  // Nearest-rank percentile: the smallest value with at least p of the sample at
  // or below it. Any consistent convention works here - the buckets feed a
  // three-step glyph, not a statistic anyone quotes.
  const q = (p) =>
    priced.length ? priced[Math.max(0, Math.ceil(p * priced.length) - 1)] : 0;
  const q1 = q(0.25);
  const q3 = q(0.75);

  const byId = new Map();
  for (const r of rows) {
    // Bucket edges: at-or-below q1 is the bottom quarter, strictly-above q3 the
    // top - with nearest-rank quartiles this keeps each outer bucket at (at most)
    // a quarter of the sample even when n is small.
    const ticks =
      r.value <= 0 ? null : r.value <= q1 ? 1 : r.value > q3 ? 3 : 2;
    byId.set(r.id, { value: r.value, ticks });
  }

  const headlineBySeason = new Map();
  const best = new Map();
  for (const r of rows) {
    if (r.value <= 0) continue;
    const cur = best.get(r.season);
    // Deterministic on ties: earlier deal wins, then id order - so a re-render
    // can never swap which deal a season leads with.
    if (
      !cur ||
      r.value > cur.value ||
      (r.value === cur.value &&
        (r.created < cur.created ||
          (r.created === cur.created && r.id < cur.id)))
    ) {
      best.set(r.season, r);
    }
  }
  for (const [season, r] of best) headlineBySeason.set(season, r.id);
  return { byId, headlineBySeason };
}

/** The copy every surface printing a tick glyph shares, so the label cannot
 *  drift into verdict language at one call site (D6). */
export function ticksLabel(ticks) {
  return ticks === 3
    ? "value moved: top quarter of all deals"
    : ticks === 2
      ? "value moved: middle half of all deals"
      : "value moved: bottom quarter of all deals";
}
