/**
 * THE CHART COLOUR VOCABULARY - four rules, and the measurements behind them.
 *
 * Parquet draws every chart by hand (D3). Until now each one picked its own colours
 * off the semantic tokens, which meant `--color-positive` was doing three unrelated
 * jobs at once: "this went up", "this is good", and "this is the green bar". This
 * file is the one place a chart asks what colour something should be.
 *
 * ---------------------------------------------------------------------------
 * RULE 1. COLOUR IS NEVER THE ONLY ENCODING (WCAG 1.4.1).
 * Every hue below sits beside a position, a length, or a printed number carrying the
 * same value. Delete the colour and the chart still reads. That is the acceptance
 * test, and it is why this file ships no "colour key" for anything that is not also
 * an axis.
 *
 * RULE 2. MAGNITUDE IS ONE HUE, VARYING ONLY IN STRENGTH.
 * `magnitudeOpacity()` returns a five-step ramp applied to `var(--color-accent)`.
 * Single-hue sequential ramps are the only kind that survive every form of colour
 * vision deficiency, because the ordering is carried in lightness rather than in
 * hue. Using the accent rather than a fixed hex is what makes it theme-proof: the
 * ramp is gold on the dark ground and dark ochre on Paper without this file knowing
 * which ground it is on, because the opacity composites against whatever is behind it.
 *
 * MEASURED, AND THE LIMIT IS REAL: composited against its own ground, the ramp runs
 * 1.55 / 1.99 / 2.61 / 3.86 / 5.92 on Paper, 1.89 / 2.85 / 4.21 / 6.78 / 10.18 on
 * dark, 2.05 / 3.42 / 5.44 / 9.34 / 14.75 on contrast. The bottom two steps are under
 * 3:1 on every ground, and no floor fixes it: the weakest step only clears 3:1 at
 * opacity 0.70 or above, and a five-step ramp from 0.70 to 1.00 is not a ramp anyone
 * can read. An opacity ramp cannot be both a legible ordering and 3:1 at every step.
 * So the ramp is only ever a THIRD encoding - it is allowed where a length and a
 * printed number already carry the value independently (the bar charts, the receipt),
 * and it is not allowed where a mark's visibility is itself the datum. That is why
 * DistributionStrip's peer ticks are flat: their position is the value, and ramping
 * them faded the low tail out of a chart whose whole job is showing the tail.
 *
 * RULE 3. SIGNED VALUES USE A CVD-SAFE DIVERGING PAIR, AND IT IS NOT RED/GREEN.
 * `RdYlGn` - the reflex choice - is not colourblind-safe at any class count. `PiYG`
 * still reads as "red-ish versus green-ish" to a trichromat while staying separable
 * under deuteranopia and protanopia, so it is the pair used here. The two endpoints
 * are shifted off canonical PiYG (#c51b7d / #4d9221) for one reason: canonical
 * magenta measures 2.69:1 against the dark ground, which is under the 3:1 bar a
 * graphical object has to clear. Measured contrast of the shipped pair, against all
 * three grounds this app has - and against each theme's card surface as well, since a
 * chart sits on a card more often than on the page:
 *
 *                    Paper bg / surface   Dark bg / surface   Contrast bg / surface
 *   low   #d2569f       3.43   3.74         5.19   4.71         5.57   4.80
 *   high  #4d9221       3.51   3.82         5.08   4.61         5.45   4.70
 *
 * All twelve clear 3:1; the tightest is 3.43. None clears 4.5:1 on all three, which
 * is rule 4.
 *
 * RULE 4. THE FILL VALUE AND THE TEXT VALUE OF A HUE ARE DIFFERENT VALUES.
 * A colour that works as a 10px-tall bar does not work as 11px type, and the split
 * is not optional here - it is arithmetically forced. Text needs 4.5:1, so against
 * Paper (relative luminance 0.885) a text colour needs luminance at or below ~0.185,
 * and against the dark ground (0.004) it needs ~0.19 or above. No single fixed value
 * satisfies both, so there is no hex that can be a legible label in every Parquet
 * theme. The text half of each hue therefore resolves to the app's own ink token,
 * which every theme already defines correctly for its own ground. In practice:
 * **the hue goes in the fill, the number goes in ink, and they sit next to each
 * other.** A caller that wants to tint type has misread this file.
 */
/** Ink for a printed figure sitting inside or beside a chart. */
export const CHART_INK = "var(--color-ink)";
/** Ink for axis labels and anything the eye should skip on the first pass. */
export const CHART_FAINT = "var(--color-faint)";
/** Rules, frames, baselines. */
export const CHART_GRID = "var(--color-border)";
/** A neutral mark: present, countable, not the subject. */
export const CHART_NEUTRAL = "var(--color-border-strong)";
/** The subject. One per chart at most - the moment two things are accent, neither is. */
export const CHART_ACCENT = "var(--color-accent)";
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
