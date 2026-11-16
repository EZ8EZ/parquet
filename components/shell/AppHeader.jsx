import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { BrandMark } from "@/components/Brand";
import { TeamAvatar } from "@/components/TeamAvatar";

/**
 * The app header: brand home link left, the team you are viewing as right: avatar,
 * team name and a chevron, so "whose team is this" is answered on every page (opens
 * the team switcher). Sticky, solid, clears the notch via safe-area-inset-top.
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
            className="-mr-1.5 flex min-h-11 max-w-[60%] items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-2.5 transition-colors hover:bg-surface-2"
          >
            <TeamAvatar
              name={seat.label}
              avatarId={seat.avatarId}
              teamLogoUrl={seat.teamLogoUrl}
              size="sm"
              className="shrink-0 rounded-full"
            />
            {/* The name wraps to a second line rather than truncating (D111); the
                header row is tall enough for two lines at this size. */}
            <span className="min-w-0 text-meta font-semibold leading-[14px] text-ink">
              {seat.label}
            </span>
            <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-secondary" />
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
