import { cn } from "@/lib/ui";
import { DeckTrigger } from "./PlayerDeck";
import { Opp } from "./Opp";

const CELL = {
  banked: "figure font-bold text-ink underline decoration-accent decoration-2 underline-offset-[3px]",
  played: "figure text-secondary",
  dnp: "text-secondary",
  pending: "text-secondary",
  upcoming: "rounded-[4px] bg-elevated px-1 font-semibold text-ink",
  live: "rounded-[4px] bg-accent-wash px-1 font-semibold text-accent-text",
  none: "",
};

function Swatch({ kind }) {
  if (kind === "upcoming") return <span aria-hidden="true" className="inline-block h-3.5 w-6 rounded-[4px] bg-elevated" />;
  if (kind === "banked") return <span aria-hidden="true" className="inline-block h-[3px] w-6 rounded-full bg-accent" />;
  return <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-secondary" />;
}

/** Who plays which night. `grid` is weekGrid() or playerWeekGrid() output. */
export function WeekGrid({ grid, caption, single = false, triggers = false }) {
  if (!grid || !grid.nights.length) return <p className="text-note text-muted">No nights left this week.</p>;
  if (!grid.rows.length && !grid.bench) return <p className="text-note text-muted">Nobody still to play.</p>;
  return (
    <div>
      <table className="w-full table-fixed border-collapse text-meta">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          {!single && <col className="w-[32%]" />}
          {grid.nights.map((n) => (
            <col key={n.date} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {!single && (
              <th scope="col" className="pb-1 text-left font-normal">
                <span className="sr-only">Player</span>
              </th>
            )}
            {grid.nights.map((n) => (
              <th key={n.date} scope="col" className={cn("pb-1.5 text-center font-medium leading-tight", n.today ? "text-ink" : "text-secondary")}>
                <span className={cn("inline-block rounded-full px-1.5 py-0.5", n.today && "bg-elevated")}>
                  {n.day}
                  <span className="figure block">{n.label}</span>
                </span>
                {n.today && <span className="sr-only"> (today)</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((r) => (
            <tr key={r.playerId} className="border-t border-border">
              {!single && (
                <th scope="row" className="py-1 pr-1 text-left align-middle font-normal">
                  {triggers ? (
                    <DeckTrigger playerId={r.playerId} label={`${r.name}. Show details`} className="min-h-11 rounded-control py-1 hover:text-accent-text">
                      <span className="block text-note font-semibold text-ink">{r.name}</span>
                      {r.slotLabel && <span className="text-meta text-secondary">{r.slotLabel}</span>}
                    </DeckTrigger>
                  ) : (
                    <>
                      <span className="block text-note font-semibold text-ink">{r.name}</span>
                      {r.slotLabel && <span className="text-meta text-secondary">{r.slotLabel}</span>}
                    </>
                  )}
                </th>
              )}
              {r.cells.map((c, i) => (
                <td key={c.date} className={cn("py-2 text-center align-middle", grid.nights[i]?.today && "bg-surface-2")}>
                  {c.kind === "none" ? (
                    <span className="text-faint" aria-hidden="true">
                      ·
                    </span>
                  ) : (
                    <span className={CELL[c.kind]} aria-hidden="true">
                      {/* A crest beside the code where the row has room (one player's week);
                          the seven-night grid keeps the code alone at 390px. */}
                      {single && (c.kind === "upcoming" || c.kind === "live") ? <Opp team={c.text} /> : c.text}
                    </span>
                  )}
                  <span className="sr-only">{c.sr}</span>
                </td>
              ))}
            </tr>
          ))}
          {grid.bench && (
            <tr className="border-t border-border">
              <th scope="row" className="py-2 pr-1 text-left align-middle font-normal">
                <span className="block text-note font-semibold text-ink">Bench</span>
                <span className="text-meta text-secondary">games per night</span>
              </th>
              {grid.bench.cells.map((c, i) => (
                <td key={c.date} className={cn("py-2 text-center align-middle", grid.nights[i]?.today && "bg-surface-2")}>
                  <span className={cn("figure", c.count ? "font-bold text-ink" : "text-secondary")}>{c.count}</span>
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <Swatch kind="upcoming" /> to play
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Swatch kind="banked" /> in his slot
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Swatch kind="played" /> played, not in his slot
        </span>
      </p>
    </div>
  );
}
