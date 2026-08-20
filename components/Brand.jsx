import Link from "next/link";
/**
 * THE MARK, AS A TOKEN CITIZEN.
 *
 * It used to fill three hardcoded hexes: a `#131519` tile (a surface value that no
 * longer exists - `--color-surface` is `#16181d`) and a `#f0c268`/`#c9922f` gradient
 * that was a third gold, matching neither `--color-accent` nor `--color-accent-text`.
 * On the paper theme that made the logo a dark tile in a warm-white page: unthemed.
 *
 * Now the tile is `--color-surface` and the gradient runs `--color-accent-text` into
 * `--color-accent` - the same two golds the rest of the app already splits by job, so
 * the mark re-tunes itself on paper (dark gold on warm white) instead of staying
 * frozen at dark's values.
 *
 * `var()` goes through `style`, not a presentation attribute: presentation attributes
 * are the weakest cascade level and `stop-color` in particular is inconsistent about
 * custom properties across engines. `style` is unambiguous everywhere.
 *
 * `gradientId` exists because two marks on one page would otherwise both define
 * `<linearGradient id="wm">` and the second would lose. It is a static prop rather
 * than `useId` so the file stays a server component.
 *
 * ---------------------------------------------------------------------------------
 * THE GEOMETRY IS NOW THE FLOOR, AND THE OLD ONE WAS THE WRONG FLOOR (D96)
 * ---------------------------------------------------------------------------------
 * This mark shipped for nine rounds as six rounded planks at `rotate(45)` and
 * `rotate(-45)`: a herringbone chevron. The Boston Garden floor is not herringbone.
 * It is a basket-weave block parquet on a SQUARE GRID - alternating squares of red
 * oak with the grain turned 90 degrees between neighbours, 247 five-foot panels of
 * post-war scrap, laid orthogonal so a damaged panel could be swapped. Herringbone
 * is diagonal interlocked rectangles, which is a different floor in a different
 * building.
 *
 * And the correction is not cosmetic, because the app now reserves the 45-degree
 * diagonal for a REFUSAL (D96; components/RefusalMark.jsx shipped the first instance
 * in D95). Orthogonal is data, diagonal is "we will not say." The logo and the
 * grammar could not both be right, and the grammar is worth more than the logo:
 * a square-grid ground is what guarantees nothing else in the product runs at 45
 * degrees, which is what lets a hatched mark identify itself with no colour and no
 * caption.
 *
 * WHAT IS DRAWN. Four 168-unit blocks in a 2x2 on a 24-unit gutter, three 44-unit
 * slats per block on an 18-unit seam. Grain alternates between edge-neighbours, so
 * diagonal neighbours agree and orthogonal ones differ - a checkerboard whose only
 * variable is orientation. Orientation is one of Bertin's retinal variables and it
 * owes nothing to colour, which is why the mark keeps reading in every theme.
 *
 * TWO THINGS DELIBERATELY DROPPED. The `rx="10"` is gone: oak has hard edges and so
 * does everything else in this direction. And the old 0.72 opacity on the outer
 * planks is gone - it was faking depth on a chevron, and now that orientation carries
 * the alternation, a second varying channel would read as a magnitude ramp across a
 * mark that has no magnitude in it.
 *
 * The gradient also stops running corner-to-corner. `x2="0" y2="1"` is a vertical
 * axis, which both removes the last 45-degree line of any kind from the mark and
 * matches how the rest of the app models light (`--edge-hilite` is a top catchlight;
 * this floor is lit from above too). Same two golds, same tokens, no new colour.
 */
export function BrandMark({ size = 36, gradientId = "parquet-mark" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--color-accent-text)" }} />
          <stop offset="1" style={{ stopColor: "var(--color-accent)" }} />
        </linearGradient>
      </defs>
      <rect
        width="512"
        height="512"
        rx="112"
        style={{ fill: "var(--color-surface)" }}
      />
      <g fill={`url(#${gradientId})`} shapeRendering="crispEdges">
        {/* Top-left block: grain running vertically. */}
        <rect x="76" y="76" width="44" height="168" />
        <rect x="138" y="76" width="44" height="168" />
        <rect x="200" y="76" width="44" height="168" />
        {/* Top-right block: the same oak, turned 90 degrees. */}
        <rect x="268" y="76" width="168" height="44" />
        <rect x="268" y="138" width="168" height="44" />
        <rect x="268" y="200" width="168" height="44" />
        {/* Bottom-left: horizontal, so it disagrees with the block above it. */}
        <rect x="76" y="268" width="168" height="44" />
        <rect x="76" y="330" width="168" height="44" />
        <rect x="76" y="392" width="168" height="44" />
        {/* Bottom-right: vertical, agreeing with the diagonal neighbour, which is what
            makes this a checkerboard rather than a stripe. */}
        <rect x="268" y="268" width="44" height="168" />
        <rect x="330" y="268" width="44" height="168" />
        <rect x="392" y="268" width="44" height="168" />
      </g>
    </svg>
  );
}
export function Wordmark({ tagline }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      {/* -m-1 keeps the 36px mark visually in place while the hit area meets 44px. */}
      <Link
        href="/"
        aria-label="Parquet home"
        className="-m-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center"
      >
        <BrandMark size={36} gradientId="wordmark-gold" />
      </Link>
      <div>
        <div className="font-display text-lede font-semibold leading-none tracking-tight">
          Parquet
        </div>
        {tagline && (
          <div className="mt-0.5 text-meta uppercase tracking-[0.16em] text-secondary">
            {tagline}
          </div>
        )}
      </div>
    </div>
  );
}
