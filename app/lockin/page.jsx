import Link from "next/link";
import { Chip, PageHeader } from "@/components/ui";
import { LockDeskBoard } from "@/components/lockin/LockDeskBoard";
import { RefreshControl } from "@/components/lockin/RefreshControl";
import { readLensRosterId } from "@/lib/auth/server";
import { isFixtureDesk, loadLockDesk, replayAllowed } from "@/lib/lockin/source";
import { boardHeader } from "@/lib/lockin/view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lock or hold" };

const one = (v) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function LockInPage({ searchParams }) {
  const sp = await searchParams;
  const rosterId = await readLensRosterId();
  if (rosterId == null) {
    return (
      <>
        <PageHeader title="Lock or hold" />
        <p className="text-body text-muted">
          <Link href="/teams" className="font-semibold text-accent-text underline">
            Pick a team
          </Link>{" "}
          to see its week.
        </p>
      </>
    );
  }
  const replay = replayAllowed() ? one(sp.at) : null;
  const desk = await loadLockDesk({ rosterId, replay });
  const hd = boardHeader(desk);
  const fullHref = replay ? `/lockin?at=${encodeURIComponent(replay)}` : "/lockin";
  return (
    <>
      <PageHeader
        kicker={hd.kicker}
        title="Lock or hold"
        aside={<RefreshControl rosterId={rosterId} asOf={desk.generatedAt} live={hd.live} updating={hd.updating} disabled={!!replay || isFixtureDesk(desk)} />}
        below={isFixtureDesk(desk) ? <Chip className="mt-2">Sample week, invented players</Chip> : null}
      />
      <LockDeskBoard rosterId={rosterId} desk={desk} mode="full" open={one(sp.open)} fullHref={fullHref} methodOpen={one(sp.method) === "open"} />
    </>
  );
}
