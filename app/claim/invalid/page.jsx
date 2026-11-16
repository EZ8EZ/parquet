/**
 * Where a bad claim link lands.
 *
 * Static, and says only what is true: the link did not verify. It deliberately does
 * NOT distinguish "expired", "tampered with" or "signed with the old secret" - the
 * verifier itself refuses to tell them apart (see lib/auth/seat.js), and inventing a
 * reason here would be the app guessing out loud.
 */
import { KeyRound } from "lucide-react";
import { ButtonLink, Disclosure, EmptyState } from "@/components/ui";
export const metadata = {
  title: "Claim link - Parquet",
};
export default function ClaimInvalidPage() {
  return (
    <div className="pt-6">
      <EmptyState
        as="h1"
        tone="neutral"
        icon={<KeyRound size={32} aria-hidden="true" />}
        title="That link did not check out"
        action={<ButtonLink href="/teams">Pick a team and carry on</ButtonLink>}
      >
        Ask the commissioner for a fresh link. You can still read everything as any team.
      </EmptyState>
      <Disclosure summary="Why a link fails" className="mt-2">
        The link is either incomplete, or it was signed before this deployment&apos;s key
        changed. Either way it cannot prove whose seat it is, so Parquet will not take its
        word for it. Claim links are generated per manager and handed out once; copying
        one out of a chat window sometimes drops its tail, so paste the whole thing.
      </Disclosure>
    </div>
  );
}
