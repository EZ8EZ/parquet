import Link from "next/link";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { safeNextPath } from "@/lib/auth/entry";
import { focusPassword } from "@/lib/auth/focus";
import { unlockAction } from "@/lib/auth/unlock";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unlock" };

/**
 * Focus mode's door (lib/auth/focus.js): this deployment shows only the start-or-not
 * pages unless you have the password. Without PARQUET_FULL_ACCESS_PASSWORD set there is
 * nothing to unlock.
 */
export default async function UnlockPage({ searchParams }) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp?.next === "string" ? sp.next : "") ?? "/";
  const wrong = sp?.wrong === "1";
  const on = !!focusPassword();
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="The rest of Parquet is locked" />
      {on ? (
        <>
          <p className="text-note text-secondary">
            This link is set up for one thing: the lock-or-hold helper, which stays open. Trades, rosters and league pages need the password.
          </p>
          <form action={unlockAction} className="mt-4 space-y-3 rounded-card bg-surface p-4">
            <input type="hidden" name="next" value={next} />
            <label htmlFor="unlock-password" className="block text-note font-semibold text-ink">
              Password
            </label>
            <input id="unlock-password" name="password" type="password" autoComplete="current-password" required aria-invalid={wrong ? "true" : undefined} className="min-h-11 w-full rounded-control bg-bg px-3 text-body text-ink outline-1 outline-border-strong focus-visible:outline-2 focus-visible:outline-accent" />
            {wrong && <p role="alert" className="text-meta text-warn">That password did not work.</p>}
            <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-accent text-note font-semibold text-accent-ink">
              <Lock size={16} aria-hidden="true" />
              Unlock
            </button>
          </form>
        </>
      ) : (
        <p className="text-note text-secondary">Nothing is locked on this deployment.</p>
      )}
      <Link href="/lockin" className="mt-4 inline-flex min-h-11 items-center text-note font-semibold text-accent-text">
        Back to lock or hold
      </Link>
    </div>
  );
}
