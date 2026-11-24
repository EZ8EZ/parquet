import { ChevronRight, Info } from "lucide-react";
import { Disclosure, List, ListRow, Sheet } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { fmt } from "@/lib/lockin/view";
import { assumptionLines, intentLine, rangeText, stillToPlayText } from "@/lib/lockin/matchupView";
import { RangeBands } from "./RangeBands";
import { OppStrip } from "./OppStrip";
import { StateIcon } from "./StateIcon";
import { Habits } from "./Habits";

function Block({ title, children }) {
  return (
    <section className="pt-5">
      <h3 className="text-body font-semibold text-ink">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Everything about this week's opponent, for the sheet. */
function OpponentBody({ v, desk }) {
  const them = v.them;
  const toPlay = stillToPlayText(them);
  const intent = intentLine(desk.opponent?.intent);
  const lines = assumptionLines(desk.winProb);
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-control bg-surface-2 p-3">
          <p className="text-meta text-secondary">Banked</p>
          <p className="mt-1 figure text-display font-bold text-ink">{fmt(them.banked)}</p>
          <p className="text-meta text-muted">you {fmt(v.me.banked)}</p>
        </div>
        <div className="rounded-control bg-surface-2 p-3">
          <p className="text-meta text-secondary">Projected final</p>
          <p className="mt-1 figure text-display font-bold text-ink">{them.range ? Math.round(them.range.mean) : "unknown"}</p>
          <p className="text-meta text-muted">{them.range ? `8 in 10: ${rangeText(them.range)}` : "range unknown"}</p>
        </div>
      </div>
      <p className="mt-3 text-note text-muted">{toPlay.line}.</p>
      {toPlay.names.length > 0 && <p className="mt-1 text-note text-muted">Still to play: {toPlay.names.join(", ")}.</p>}

      <Block title="Their slots">
        <List>
          {v.oppSlots.map((s) => (
            <li key={s.index}>
              <ListRow
                dense
                leading={s.label}
                avatar={s.playerId ? <PlayerAvatar name={s.name ?? s.playerId} playerId={s.playerId} size="sm" decorative /> : null}
                title={s.name ?? "Empty"}
                meta={
                  <span className="flex items-center gap-1">
                    <StateIcon state={s.key} /> {s.stateLong}
                  </span>
                }
                value={s.banked == null ? "-" : fmt(s.banked)}
              />
            </li>
          ))}
        </List>
      </Block>

      <Block title="How they play">
        {intent ? (
          <p className="mb-3 text-note text-ink">
            {intent.text}
            {intent.confidence && <span className="text-secondary"> ({intent.confidence})</span>}.
          </p>
        ) : (
          <p className="mb-3 text-note text-muted">Too little this season to read how they are playing it.</p>
        )}
        <Habits profile={desk.opponent?.profile} season={desk.season} emptyText="Too few past weeks to describe their habits yet." />
      </Block>

      {lines.length > 0 && (
        <div className="pt-4">
          <Disclosure summary="What the win chance assumes">
            <ul className="list-disc space-y-1 pl-4">
              {lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Disclosure>
        </div>
      )}
    </div>
  );
}

/**
/**
 * The head-to-head: win chance as the hero figure (the model's estimate), both
 * projected finals on one scale with the banked totals, then (passed in) your slots,
 * then the opponent's slots as a strip that opens the opponent sheet, then one legend
 * for both. Without a win chance it keeps the banked totals and says so.
 */
export function Matchup({ v, desk, mySlots, legend = null }) {
  const them = v.them;
  const label = `${them.name}: ${v.oppSummary || "no slots"}. Show details`;
  return (
    <section aria-label="This week's matchup" data-matchup={v.state} className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {v.winPct ? (
            <p className="flex items-baseline gap-2">
              <span className="figure text-hero font-bold leading-none text-ink" data-win-prob>
                {v.winPct}
              </span>
              <span className="text-body font-semibold text-muted">to win</span>
            </p>
          ) : (
            <p className="text-lede font-semibold text-ink" data-win-prob="unknown">
              Win chance unknown
            </p>
          )}
          <p className="mt-1 text-meta text-secondary">{v.winPct ? `Model estimate if you follow its calls, vs ${them.name}` : "The model could not work it out; the points view is shown."}</p>
          {v.winPct && <p className="text-meta text-secondary">Win chances are model estimates; how well they match results is still being checked.</p>}
        </div>
        <div className="flex shrink-0 items-center pt-1">
          <TeamAvatar name={v.me.name} avatarId={v.me.avatarId} teamLogoUrl={v.me.teamLogoUrl} size="sm" isMe />
          <span className="px-1 text-meta text-secondary">vs</span>
          <TeamAvatar name={them.name} avatarId={them.avatarId} teamLogoUrl={them.teamLogoUrl} size="sm" />
        </div>
      </div>
      <RangeBands
        scale={v.scale}
        rows={[
          { name: v.me.name, range: v.me.range, banked: v.me.banked, you: true },
          { name: them.name, range: them.range, banked: them.banked, you: false },
        ]}
      />
      {mySlots}
      <Sheet
        trigger={
          <span className="block">
            <span className="mb-1 flex items-center justify-between gap-2 text-meta">
              <span className="min-w-0 font-semibold text-muted">
                {them.name}
                {v.oppSummary && <span className="font-normal text-secondary"> · {v.oppSummary}</span>}
              </span>
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-accent-text" />
            </span>
            <OppStrip slots={v.oppSlots} />
          </span>
        }
        triggerLabel={label}
        triggerClassName="rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        title={them.name}
        subtitle={[them.ownerName, them.record].filter(Boolean).join(" · ") || null}
        leading={<TeamAvatar name={them.name} avatarId={them.avatarId} teamLogoUrl={them.teamLogoUrl} size="md" />}
      >
        <OpponentBody v={v} desk={desk} />
      </Sheet>
      {legend}
    </section>
  );
}

/** One quiet line when the board has no opponent (bye, or the opponent did not load). */
export function NoOpponent() {
  return (
    <p className="mb-3 flex items-center gap-2 text-note text-muted" data-matchup="none">
      <Info size={16} aria-hidden="true" className="shrink-0" />
      No opponent loaded for this week; the points view is shown.
    </p>
  );
}
