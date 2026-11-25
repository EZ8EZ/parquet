import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { DigestBeacon } from "@/components/DigestBeacon";
import { loadDigest } from "@/lib/digest";
import { isFocusLocked } from "@/lib/auth/focusServer";
import { Chip, PageHeader } from "@/components/ui";
import { LockDeskBoard } from "@/components/lockin/LockDeskBoard";
import { RefreshControl } from "@/components/lockin/RefreshControl";
import { getLeagueHistory } from "@/lib/history";
import { isFixtureDesk, loadLockDesk, replayAllowed } from "@/lib/lockin/source";
import { boardHeader, winPctOf } from "@/lib/lockin/view";
import { teamIdentity } from "@/lib/lockin/matchupView";
import { keepAssume } from "@/lib/lockin/assumeView";
import { savedAssumeFor } from "@/lib/lockin/savedAssumeServer";

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
  // the viewer's what-if lock states (?assume=m3L,t5O); without one in the URL, the marks
  // they kept (D141)
  const assumeInUrl = typeof sp?.assume === "string" ? sp.assume : Array.isArray(sp?.assume) ? sp.assume.join(",") : null;
  const assumeParam = assumeInUrl ?? (await savedAssumeFor(rosterId));
  const [desk, digest, focusLocked] = await Promise.all([loadLockDesk({ rosterId, replay, players: h.players, assumeParam }), loadDigest(h), isFocusLocked()]);
  const hd = boardHeader(desk);
  const fullHref = keepAssume(replay ? `/lockin?at=${encodeURIComponent(replay)}` : "/lockin", desk.assumptions?.list ?? []);
  return (
    <>
      {/* the same one-line bar as Home: the page as the heading, the week beside it, refresh with the zone */}
      <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lede font-bold text-ink">Lock or hold</h1>
          {hd.kicker && <p className="text-meta text-secondary">{hd.kicker}</p>}
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
      {/* D144: this page is This Week now; Home's two links come with it (not in focus mode) */}
      <DigestBeacon metrics={digest.nextMetrics} />
      {!focusLocked && (
        <nav aria-label="Also this week" className="mt-4 flex flex-wrap gap-x-5">
          <Link href="/lab/pulse" className="inline-flex min-h-11 items-center gap-0.5 text-note font-semibold text-accent-text">
            What moved in the league
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
          <Link href={`/managers/${rosterId}`} className="inline-flex min-h-11 items-center gap-0.5 text-note font-semibold text-accent-text">
            Your dossier
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </nav>
      )}
    </>
  );
}
