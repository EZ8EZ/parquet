/**
 * THE REFUSAL MARK - one drawn glyph for "not enough to say", D19's house style.
 *
 * The blue-sky idea D51's addendum recorded and shelved: generalize `WindowMap`'s
 * dotted unfilled span into one deliberate mark for a refusal, so the app's rare habit
 * of publishing a negative result reads as a visible house style rather than prose a
 * reader skips past. It was blocked because the first attempt read as a loading
 * skeleton one iteration in - and that failure mode is worth naming precisely, because
 * avoiding it is the whole design problem: `.skeleton` (app/globals.css) is a solid,
 * ANIMATED, gradient-filled RECTANGLE, shimmering to say "the shape is known, the
 * values are not" (components/PageSkeleton.tsx). A dashed rectangle - the obvious
 * first guess for "unknown" - keeps two of those three properties (rectangular,
 * static-gray) and reads as the same object mid-animation.
 *
 * This mark shares NONE of the three. It is a CIRCLE, not a bar - no reading of this
 * app's skeletons is circular. It is STATIC - no shimmer, no keyframe, ever. And it
 * carries a mark INSIDE it (a short diagonal tick, the universal "not this" stroke)
 * rather than being an empty gap waiting to fill with content, which is what a
 * skeleton always is and this deliberately is not: nothing will ever load into this
 * shape, because there is nothing more to load - the record itself stops here.
 *
 * Always paired with its own text, passed as `children`, because D47's rule 1 applies
 * to a one-off glyph exactly as it does to a chart: colour and shape are never the
 * only encoding. A screen reader gets the label; the glyph is `aria-hidden`.
 */
export function RefusalMark({ className, children }) {
  return (
    <span className={`inline-flex items-start gap-1.5 ${className ?? ""}`}>
      <svg
        width={14}
        height={14}
        viewBox="0 0 14 14"
        aria-hidden="true"
        className="mt-0.5 shrink-0"
      >
        <circle
          cx={7}
          cy={7}
          r={5.5}
          fill="none"
          stroke="var(--color-faint)"
          strokeWidth={1.5}
          strokeDasharray="2.2 2.2"
        />
        <line
          x1={4.6}
          y1={9.4}
          x2={9.4}
          y2={4.6}
          stroke="var(--color-faint)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </svg>
      <span className="text-meta italic leading-snug text-faint">
        {children}
      </span>
    </span>
  );
}
