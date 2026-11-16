import { LockDeskBoard } from "@/components/lockin/LockDeskBoard";
import { RefreshControl } from "@/components/lockin/RefreshControl";
import { isFixtureDesk } from "@/lib/lockin/source";
import { boardHeader } from "@/lib/lockin/view";
import { loadWeek } from "@/lib/week/load";
import { DeadlineStrip } from "./DeadlineStrip";
import { InjuredStarters } from "./InjuredStarters";

/**
 * Home's week: one status line with the refresh control, the compact lock-in board,
 * then injured starters and deadlines. Streams in behind SlotPreview (app/page.jsx).
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
          <RefreshControl rosterId={rosterId} asOf={desk.generatedAt} live={bh.live} updating={bh.updating} disabled={!!replay || isFixtureDesk(desk)} />
        </div>
      )}
      {desk && <LockDeskBoard rosterId={rosterId} desk={desk} mode="compact" fullHref={fullHref} />}
      <InjuredStarters injured={week.injured} />
      <DeadlineStrip deadlines={week.deadlines} window={week.window} />
    </>
  );
}
