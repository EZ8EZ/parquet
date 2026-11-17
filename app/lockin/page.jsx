import Link from "next/link";
import { Chip, PageHeader } from "@/components/ui";
import { LockDeskBoard } from "@/components/lockin/LockDeskBoard";
import { RefreshControl } from "@/components/lockin/RefreshControl";
import { getLeagueHistory } from "@/lib/history";
import { isFixtureDesk, loadLockDesk, replayAllowed } from "@/lib/lockin/source";
import { boardHeader } from "@/lib/lockin/view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lock or hold" };

const one = (v) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function LockInPage({ searchParams }) {
  const sp = await searchParams;
  // Through the corpus so an unknown team cookie bounces to the picker (lib/history.js).
  const h = await getLeagueHistory();
  const rosterId = h.me.rosterId;
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
  const desk = await loadLockDesk({ rosterId, replay, players: h.players });
  const hd = boardHeader(desk);
  const fullHref = replay ? `/lockin?at=${encodeURIComponent(replay)}` : "/lockin";
  return (
    <>
      <PageHeader
        kicker={hd.kicker}
        title="Lock or hold"
        aside={<RefreshControl asOf={desk.generatedAt} live={hd.live} updating={hd.updating} disabled={!!replay || isFixtureDesk(desk)} />}
        below={isFixtureDesk(desk) ? <Chip className="mt-2">Sample week, invented players</Chip> : null}
      />
      <LockDeskBoard rosterId={rosterId} desk={desk} mode="full" open={one(sp.open)} fullHref={fullHref} replay={replay} methodOpen={one(sp.method) === "open"} />
    </>
  );
}
