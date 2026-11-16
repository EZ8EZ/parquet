/**
 * THE CHART COLOUR VOCABULARY. Every hand-drawn chart (D3) asks this file for colour.
 * Measured against the dark palette in app/globals.css (surface #15181d, bg #0b0d10).
 *
 * 1. Colour is never the only encoding (WCAG 1.4.1). Every hue sits beside a position,
 *    a length or a printed number carrying the same value. Delete the colour and the
 *    chart still reads.
 * 2. One subject per chart: CHART_ACCENT (violet, "yours", 5.5:1 on surface). Peers are
 *    CHART_MARK (7.6:1). The field's side of a you-vs-them comparison is CHART_FIELD
 *    (info blue, 8.4:1) and nothing else gets that hue.
 * 3. Magnitude is one hue varying in strength (`magnitudeOpacity` over the accent). The
 *    bottom steps fall under 3:1, so the ramp is only ever a third encoding, next to a
 *    length and a printed number.
 * 4. Signed values use the CVD-safe PiYG-style pair in DIVERGING, never red/green:
 *    low #d2569f 4.72:1, high #4d9221 4.62:1 on surface (5.16 / 5.05 on bg).
 * 5. Fill and text are different jobs: the hue goes in the fill, the number goes in ink
 *    (CHART_INK) beside it. Labels are HTML text at >= 11px, never <text> inside a
 *    scaling viewBox (DESIGN.md, Charts).
 */
/** Ink for a printed figure sitting inside or beside a chart. */
export const CHART_INK = "var(--color-ink)";
/** Ink for axis labels and anything the eye should skip on the first pass. */
export const CHART_FAINT = "var(--color-faint)";
/** Rules, frames, baselines. */
export const CHART_GRID = "var(--color-border)";
/**
 * A neutral mark: present, countable, not the subject.
 *
 * 1.73:1 on surface: legitimate only where the value is also printed or carried by a
 * length, never where the mark's own visibility is the datum.
 *
 * If a mark's POSITION is the only statement of its value, use `CHART_MARK`.
 */
export const CHART_NEUTRAL = "var(--color-border-strong)";
/**
 * A context mark whose POSITION IS THE DATUM - a dot on a scale with no number printed
 * beside it, the quiet half of a dumbbell, a tick a reader is expected to locate.
 *
 * `--color-secondary`, 7.6:1 on surface. Still not the subject: CHART_ACCENT is.
 */
export const CHART_MARK = "var(--color-secondary)";
/** The subject. One per chart at most - the moment two things are accent, neither is. */
export const CHART_ACCENT = "var(--color-accent)";
/** The field: the market or everyone else's side of a comparison against you. */
export const CHART_FIELD = "var(--color-info)";
/**
 * The signed pair. `low` is the below-zero / below-median end, `high` the above.
 * Deliberately NOT named "bad" and "good": this app grades nothing (D6), and low
 * fragility is not the same as good (D23), so a caller decides what the ends mean.
 */
export const DIVERGING = {
  low: { fill: "#d2569f", text: CHART_INK, name: "magenta" },
  high: { fill: "#4d9221", text: CHART_INK, name: "green" },
};
/**
 * The five-step single-hue magnitude ramp, weakest first.
 *
 * The floor is 0.3 rather than 0 so the bottom step is a mark and not a ghost. It is
 * NOT enough to clear 3:1 - see the measurements in the header - and raising it until
 * it does would flatten the ramp into five indistinguishable steps. The floor buys
 * visibility, not contrast compliance, which is exactly why a caller may only reach
 * for this ramp when a length and a printed number are already carrying the value.
 */
export const MAGNITUDE_STEPS = [0.3, 0.45, 0.6, 0.8, 1];
/**
 * Strength for a magnitude mark, given where it sits in its own range.
 *
 * @param fraction 0 at the bottom of the range, 1 at the top. Clamped, so an
 *   unnormalised caller gets the end step rather than an invisible or an
 *   over-painted mark.
 */
export function magnitudeOpacity(fraction) {
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const i = Math.min(
    MAGNITUDE_STEPS.length - 1,
    Math.floor(f * MAGNITUDE_STEPS.length),
  );
  return MAGNITUDE_STEPS[i];
}
/** The fill for a signed value. Zero counts as `high` - a wash is not a deficit. */
export function divergingFill(value) {
  return value < 0 ? DIVERGING.low.fill : DIVERGING.high.fill;
}
