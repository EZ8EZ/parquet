import Link from "next/link";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { Chip } from "@/components/ui";
import { LockDeskBoard } from "@/components/lockin/LockDeskBoard";
import { RefreshControl } from "@/components/lockin/RefreshControl";
import { isFixtureDesk } from "@/lib/lockin/source";
import { boardHeader, winPctOf } from "@/lib/lockin/view";
import { teamIdentity } from "@/lib/lockin/matchupView";
import { loadWeek } from "@/lib/week/load";
import { keepAssume } from "@/lib/lockin/assumeView";
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
 * Home's week (direction A): a one-line top bar (the week as the page heading, the
 * refresh button carrying the as-of time and the board's zone), the scoreboard with
 * Tonight in its footer, then Your calls. Streams in behind SlotPreview (app/page.jsx).
 */
export async function HomeWeek({ h, rosterId, replay = null, record = null, assume = [] }) {
  const week = await loadWeek(h, rosterId, { replay, assume });
  const desk = week.desk;
  const bh = desk ? boardHeader(desk) : null;
  // links to the lock board keep the viewer's what-if assumptions while they are set
  const fullHref = keepAssume(replay ? `/lockin?at=${encodeURIComponent(replay)}` : "/lockin", desk?.assumptions ? assume : []);
  return (
    <>
      <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lede font-bold text-ink">
            {bh?.week ?? "This week"}
            {bh?.range && <span className="ml-2 text-note font-normal text-secondary">{bh.range}</span>}
          </h1>
          {h.provider === "fixture" && (
            <Chip tone="warn" icon={AlertTriangle} size="sm" className="mt-1">
              Demo data, not your league
            </Chip>
          )}
        </div>
        {desk && <RefreshControl asOf={desk.generatedAt} asOfText={bh.asOf} winPct={winPctOf(desk)} live={bh.live} updating={bh.updating} disabled={!!replay || isFixtureDesk(desk)} />}
      </div>
      {desk && <LockDeskBoard rosterId={rosterId} desk={desk} mode="compact" fullHref={fullHref} replay={replay} record={record} me={teamIdentity(h, rosterId)} them={desk.opponent ? teamIdentity(h, desk.opponent.rosterId) : null} />}
      <InjuredStarters injured={week.injured} />
      <SoonDeadline d={soonDeadline(week.deadlines, week.window)} />
    </>
  );
}
