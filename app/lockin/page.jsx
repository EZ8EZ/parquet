import Link from "next/link";
import { Chip, PageHeader } from "@/components/ui";
import { LockDeskBoard } from "@/components/lockin/LockDeskBoard";
import { RefreshControl } from "@/components/lockin/RefreshControl";
import { getLeagueHistory } from "@/lib/history";
import { isFixtureDesk, loadLockDesk, replayAllowed } from "@/lib/lockin/source";
import { boardHeader, winPctOf } from "@/lib/lockin/view";
import { teamIdentity } from "@/lib/lockin/matchupView";
import { parseAssume } from "@/lib/lockin/assume";
import { keepAssume } from "@/lib/lockin/assumeView";

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
  // the viewer's what-if lock states (?assume=m3L,t5O): URL only, never stored
  const assume = parseAssume(sp.assume).list;
  const desk = await loadLockDesk({ rosterId, replay, players: h.players, assume });
  const hd = boardHeader(desk);
  const fullHref = keepAssume(replay ? `/lockin?at=${encodeURIComponent(replay)}` : "/lockin", desk.assumptions ? assume : []);
  return (
    <>
      {/* the same one-line bar as Home: the page as the heading, the week beside it, refresh with the zone */}
      <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lede font-bold text-ink">
            Lock or hold
            {hd.kicker && <span className="ml-2 text-note font-normal text-secondary">{hd.kicker}</span>}
          </h1>
          {isFixtureDesk(desk) && (
            <Chip size="sm" className="mt-1">
              Sample week, invented players
            </Chip>
          )}
        </div>
        <RefreshControl asOf={desk.generatedAt} asOfText={hd.asOf} winPct={winPctOf(desk)} live={hd.live} updating={hd.updating} disabled={!!replay || isFixtureDesk(desk)} />
      </div>
      <LockDeskBoard
        rosterId={rosterId}
        desk={desk}
        mode="full"
        open={one(sp.open)}
        tab={one(sp.tab)}
        fullHref={fullHref}
        replay={replay}
        methodOpen={one(sp.method) === "open"}
        me={teamIdentity(h, rosterId)}
        them={desk.opponent ? teamIdentity(h, desk.opponent.rosterId) : null}
      />
    </>
  );
}
