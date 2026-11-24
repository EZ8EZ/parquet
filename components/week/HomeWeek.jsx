import { LockDeskBoard } from "@/components/lockin/LockDeskBoard";
import { RefreshControl } from "@/components/lockin/RefreshControl";
import { winPctOf } from "@/lib/lockin/view";
import { isFixtureDesk } from "@/lib/lockin/source";
import { boardHeader } from "@/lib/lockin/view";
import { teamIdentity } from "@/lib/lockin/matchupView";
import { loadWeek } from "@/lib/week/load";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { soonDeadline } from "@/lib/week";
import { InjuredStarters } from "./InjuredStarters";

/** One quiet line for a league deadline inside 48 hours; the list is on the Team tab. */
function SoonDeadline({ d }) {
  if (!d) return null;
  return (
    <Link href="/roster#deadlines-title" className="mt-3 flex min-h-11 items-center gap-2 text-note text-muted" data-soon-deadline>
      <CalendarClock size={16} aria-hidden="true" className="shrink-0 text-warn" />
      <span>
        {d.label} {d.when} · <span className="font-semibold text-accent-text">see Team</span>
      </span>
    </Link>
  );
}

/**
 * Home's week: one status line with the refresh control, the compact lock-in board,
 * then injured starters and, inside 48 hours, one line for a league deadline. Streams in behind SlotPreview (app/page.jsx).
 */
export async function HomeWeek({ h, rosterId, replay = null }) {
  const week = await loadWeek(h, rosterId, { replay });
  const desk = week.desk;
  const hd = week.header;
  const bh = desk ? boardHeader(desk) : null;
  const fullHref = replay ? `/lockin?at=${encodeURIComponent(replay)}` : "/lockin";
  return (
    <>
      {desk && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <p className="min-w-0 pt-1 figure text-note text-secondary">
            {hd ? [bh.week, `${hd.locked} locked`, `${hd.open} open`, `${hd.points} pts`].filter(Boolean).join(" · ") : bh?.kicker}
          </p>
          <RefreshControl asOf={desk.generatedAt} asOfText={bh.asOf} winPct={winPctOf(desk)} live={bh.live} updating={bh.updating} disabled={!!replay || isFixtureDesk(desk)} />
        </div>
      )}
      {desk && <LockDeskBoard rosterId={rosterId} desk={desk} mode="compact" fullHref={fullHref} replay={replay} me={teamIdentity(h, rosterId)} them={desk.opponent ? teamIdentity(h, desk.opponent.rosterId) : null} />}
      <InjuredStarters injured={week.injured} />
      <SoonDeadline d={soonDeadline(week.deadlines, week.window)} />
    </>
  );
}
