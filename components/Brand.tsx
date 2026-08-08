import Link from "next/link";

export function Wordmark({ tagline }: { tagline?: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      {/* -m-1 keeps the 36px mark visually in place while the hit area meets 44px. */}
      <Link
        href="/"
        aria-label="Parquet home"
        className="-m-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center"
      >
        {/* Inline logo mark (matches public/icon.svg) */}
        <svg width="36" height="36" viewBox="0 0 512 512" aria-hidden="true">
          <defs>
            <linearGradient id="wm" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f0c268" />
              <stop offset="1" stopColor="#c9922f" />
            </linearGradient>
          </defs>
          <rect width="512" height="512" rx="112" fill="#131519" />
          <g transform="translate(256 262)" fill="url(#wm)">
            <rect x="-150" y="-24" width="150" height="48" rx="10" transform="rotate(45 -75 0)" />
            <rect x="0" y="-24" width="150" height="48" rx="10" transform="rotate(-45 75 0)" />
            <rect x="-150" y="-24" width="150" height="48" rx="10" transform="translate(0 -104) rotate(45 -75 0)" opacity="0.72" />
            <rect x="0" y="-24" width="150" height="48" rx="10" transform="translate(0 -104) rotate(-45 75 0)" opacity="0.72" />
            <rect x="-150" y="-24" width="150" height="48" rx="10" transform="translate(0 104) rotate(45 -75 0)" opacity="0.72" />
            <rect x="0" y="-24" width="150" height="48" rx="10" transform="translate(0 104) rotate(-45 75 0)" opacity="0.72" />
          </g>
        </svg>
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
