import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { LockDeskBoard } from "@/components/lockin/LockDeskBoard";
import { readLensRosterId } from "@/lib/auth/server";
import { replayAllowed } from "@/lib/lockin/source";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lock or hold" };

const one = (v) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function LockInPage({ searchParams }) {
  const sp = await searchParams;
  const rosterId = await readLensRosterId();
  const mode = one(sp.view) === "compact" ? "compact" : "full";
  const replay = replayAllowed() ? one(sp.at) : null;
  return (
    <>
      <PageHeader kicker="This week" title="Lock or hold" subtitle="Your slots, the scores on the table and what the model expects from each." />
      {rosterId == null ? (
        <p className="text-muted">
          Pick a team first.{" "}
          <Link href="/teams" className="text-accent-text underline">
            Teams
          </Link>
        </p>
      ) : (
        <LockDeskBoard rosterId={rosterId} mode={mode} open={one(sp.open)} replay={replay} />
      )}
    </>
  );
}
