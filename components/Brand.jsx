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
 * the mark re-tunes itself on paper (dark gold on warm white) and on contrast (bright
 * gold on near-black) instead of staying frozen at dark's values.
 *
 * `var()` goes through `style`, not a presentation attribute: presentation attributes
 * are the weakest cascade level and `stop-color` in particular is inconsistent about
 * custom properties across engines. `style` is unambiguous everywhere.
 *
 * `gradientId` exists because two marks on one page would otherwise both define
 * `<linearGradient id="wm">` and the second would lose. It is a static prop rather
 * than `useId` so the file stays a server component.
 */
export function BrandMark({ size = 36, gradientId = "parquet-mark" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
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
      <g transform="translate(256 262)" fill={`url(#${gradientId})`}>
        <rect
          x="-150"
          y="-24"
          width="150"
          height="48"
          rx="10"
          transform="rotate(45 -75 0)"
        />
        <rect
          x="0"
          y="-24"
          width="150"
          height="48"
          rx="10"
          transform="rotate(-45 75 0)"
        />
        <rect
          x="-150"
          y="-24"
          width="150"
          height="48"
          rx="10"
          transform="translate(0 -104) rotate(45 -75 0)"
          opacity="0.72"
        />
        <rect
          x="0"
          y="-24"
          width="150"
          height="48"
          rx="10"
          transform="translate(0 -104) rotate(-45 75 0)"
          opacity="0.72"
        />
        <rect
          x="-150"
          y="-24"
          width="150"
          height="48"
          rx="10"
          transform="translate(0 104) rotate(45 -75 0)"
          opacity="0.72"
        />
        <rect
          x="0"
          y="-24"
          width="150"
          height="48"
          rx="10"
          transform="translate(0 104) rotate(-45 75 0)"
          opacity="0.72"
        />
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
