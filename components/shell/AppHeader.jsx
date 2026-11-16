import Link from "next/link";
import { BrandMark } from "@/components/Brand";
import { TeamAvatar } from "@/components/TeamAvatar";

/**
 * The app header: brand home link left, the team you are viewing as right (opens the
 * team switcher). Sticky, solid, clears the notch via safe-area-inset-top.
 */
export function AppHeader({ seat }) {
  return (
    <header className="sticky top-0 z-30 bg-bg pt-[env(safe-area-inset-top)]">
      <div className="flex h-[var(--header-h)] items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          aria-label="Parquet, This Week"
          className="-ml-1.5 flex min-h-11 items-center gap-2 px-1.5"
        >
          <BrandMark size={26} gradientId="header-mark" />
          <span className="text-lede font-bold tracking-tight text-ink">Parquet</span>
        </Link>
        {seat ? (
          <Link
            href="/teams"
            aria-label={`Viewing as ${seat.label}. Switch team`}
            className="-mr-1.5 flex min-h-11 min-w-11 items-center justify-center rounded-full px-1.5"
          >
            <TeamAvatar
              name={seat.label}
              avatarId={seat.avatarId}
              teamLogoUrl={seat.teamLogoUrl}
              size="xs"
              className="rounded-full"
            />
          </Link>
        ) : (
          <Link
            href="/teams"
            className="-mr-1.5 inline-flex min-h-11 items-center px-1.5 text-note font-semibold text-accent-text"
          >
            Pick your team
          </Link>
        )}
      </div>
    </header>
  );
}
