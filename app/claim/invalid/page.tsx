/**
 * Where a bad claim link lands.
 *
 * Static, and says only what is true: the link did not verify. It deliberately does
 * NOT distinguish "expired", "tampered with" or "signed with the old secret" - the
 * verifier itself refuses to tell them apart (see lib/auth/seat.ts), and inventing a
 * reason here would be the app guessing out loud.
 */
import Link from "next/link";
import { ChevronRight, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui";

export const metadata = {
  title: "Claim link - Parquet",
};

export default function ClaimInvalidPage() {
  return (
    <div>
      <PageHeader
        kicker="Claim link"
        title="That link did not check out"
        subtitle="The link is either incomplete, or it was signed before this deployment's key changed. Either way it cannot prove whose seat it is, so Parquet will not take its word for it."
      />

      <div className="rounded-[--radius] border border-border bg-surface/60 p-4">
        <div className="flex items-start gap-2.5">
          <KeyRound size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-faint" />
          <div className="min-w-0">
            <p className="text-body font-semibold leading-tight text-ink">
              Ask the commissioner for a fresh link
            </p>
            <p className="mt-1 text-meta leading-relaxed text-muted">
              Claim links are generated per manager and handed out once. Copying one
              out of a chat window sometimes drops the tail of it, so paste the whole
              thing rather than clicking a wrapped line.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-meta leading-relaxed text-muted">
        You do not need a link to look around. Everything Parquet shows about the
        league is public league data, and you can read all of it as any team.
      </p>

      <Link
        href="/teams"
        className="mt-2 inline-flex min-h-11 items-center gap-1 text-body font-semibold text-accent"
      >
        Pick a team and carry on
        <ChevronRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}
