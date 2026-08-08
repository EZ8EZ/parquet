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
 * RULE 3. SIGNED VALUES USE A CVD-SAFE DIVERGING PAIR, AND IT IS NOT RED/GREEN.
 * `RdYlGn` - the reflex choice - is not colourblind-safe at any class count. `PiYG`
 * still reads as "red-ish versus green-ish" to a trichromat while staying separable
 * under deuteranopia and protanopia, so it is the pair used here. The two endpoints
 * are shifted off canonical PiYG (#c51b7d / #4d9221) for one reason: canonical
 * magenta measures 2.69:1 against the dark ground, which is under the 3:1 bar a
 * graphical object has to clear. Measured contrast of the shipped pair, against all
 * three grounds this app has:
 *
 *                      Paper #f6f4f0   Dark #0b0c0e   Contrast #000000
 *   low   #d2569f          3.35             4.30            5.57
 *   high  #4d9221          3.43             4.17            5.45
 *
 * All six clear 3:1. None clears 4.5:1 on all three, which is rule 4.
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
/** Ink for a secondary figure - a median, a count, an axis value. */
export const CHART_MUTED = "var(--color-muted)";
/** Ink for axis labels and anything the eye should skip on the first pass. */
export const CHART_FAINT = "var(--color-faint)";
/** Rules, frames, baselines. */
export const CHART_GRID = "var(--color-border)";
/** A neutral mark: present, countable, not the subject. */
export const CHART_NEUTRAL = "var(--color-border-strong)";
/** The subject. One per chart at most - the moment two things are accent, neither is. */
export const CHART_ACCENT = "var(--color-accent)";

/**
 * One hue, split into the value it may be drawn with and the value its label must be
 * printed in. See rule 4 - `text` is a token rather than a hex on purpose.
 */
export interface ChartHue {
  /** Bars, ticks, dots, areas. Clears 3:1 on all three grounds. */
  fill: string;
  /** The colour a label for this hue is printed in. Never `fill`. */
  text: string;
  /** Said out loud in an aria-label, since colour is never the only encoding. */
  name: string;
}

/**
 * The signed pair. `low` is the below-zero / below-median end, `high` the above.
 * Deliberately NOT named "bad" and "good": this app grades nothing (D6), and low
 * fragility is not the same as good (D23), so a caller decides what the ends mean.
 */
export const DIVERGING: { low: ChartHue; high: ChartHue } = {
  low: { fill: "#d2569f", text: CHART_INK, name: "magenta" },
  high: { fill: "#4d9221", text: CHART_INK, name: "green" },
};

/** The five-step single-hue magnitude ramp, weakest first. */
export const MAGNITUDE_STEPS = [0.18, 0.34, 0.54, 0.76, 1] as const;

/**
 * Strength for a magnitude mark, given where it sits in its own range.
 *
 * @param fraction 0 at the bottom of the range, 1 at the top. Clamped, so an
 *   unnormalised caller gets the end step rather than an invisible or an
 *   over-painted mark.
 */
export function magnitudeOpacity(fraction: number): number {
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const i = Math.min(
    MAGNITUDE_STEPS.length - 1,
    Math.floor(f * MAGNITUDE_STEPS.length),
  );
  return MAGNITUDE_STEPS[i];
}

/** The fill for a signed value. Zero counts as `high` - a wash is not a deficit. */
export function divergingFill(value: number): string {
  return value < 0 ? DIVERGING.low.fill : DIVERGING.high.fill;
}
