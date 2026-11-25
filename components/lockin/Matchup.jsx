import { Info } from "lucide-react";
import { Disclosure, List, ListRow } from "@/components/ui";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { fmt } from "@/lib/lockin/view";
import { assumptionLines, intentLine, rangeText, stillToPlayText } from "@/lib/lockin/matchupView";
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
export function OpponentBody({ v, desk }) {
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
          <p className="text-meta text-muted">{them.range ? `range ${rangeText(them.range)}, narrower than reality` : "range unknown"}</p>
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
        <p className="mt-1 text-meta text-secondary">These describe past weeks only; the win chance uses league-wide habits, not theirs.</p>
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

/** One quiet line when the board has no opponent (bye, or the opponent did not load). */
export function NoOpponent() {
  return (
    <p className="mb-3 flex items-center gap-2 text-note text-muted" data-matchup="none">
      <Info size={16} aria-hidden="true" className="shrink-0" />
      No opponent loaded for this week; the points view is shown.
    </p>
  );
}
