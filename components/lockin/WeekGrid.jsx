import { cn } from "@/lib/ui";

const CELL = {
  banked: "figure font-semibold text-ink underline decoration-[var(--color-accent)] decoration-2 underline-offset-[3px]",
  played: "figure text-secondary",
  dnp: "text-faint",
  upcoming: "font-mono font-semibold text-ink rounded-[3px] border border-border-strong px-0.5",
  live: "font-mono font-semibold text-ink rounded-[3px] border border-dashed border-ink px-0.5",
  none: "",
};

/** Who plays which night. `grid` is weekGrid() output; one row per player. */
export function WeekGrid({ grid, caption, single = false }) {
  if (!grid || !grid.nights.length) return <p className="text-meta text-muted">No nights left this week.</p>;
  if (!grid.rows.length) return <p className="text-meta text-muted">Nobody still to play.</p>;
  return (
    <div>
      <table className="w-full table-fixed border-collapse text-micro">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          {!single && <col className="w-[30%]" />}
          {grid.nights.map((n) => (
            <col key={n.date} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {!single && (
              <th scope="col" className="pb-1 text-left font-normal text-faint">
                <span className="sr-only">Player</span>
              </th>
            )}
            {grid.nights.map((n) => (
              <th key={n.date} scope="col" className={cn("pb-1 text-center font-normal leading-tight", n.today ? "text-ink" : "text-faint")}>
                <span className={cn("inline-block rounded px-1", n.today && "bg-elevated font-semibold")}>
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
                <th scope="row" className="py-1.5 pr-1 text-left align-middle font-normal">
                  <span className="block text-meta leading-tight text-ink">{r.name}</span>
                  {r.slotLabel && <span className="font-mono text-micro text-faint">{r.slotLabel}</span>}
                </th>
              )}
              {r.cells.map((c, i) => (
                <td key={c.date} className={cn("py-1.5 text-center align-middle", grid.nights[i]?.today && "bg-surface-2")}>
                  {c.kind === "none" ? (
                    <span className="text-faint" aria-hidden="true">
                      ·
                    </span>
                  ) : (
                    <span className={CELL[c.kind]} aria-hidden="true">
                      {c.text}
                    </span>
                  )}
                  <span className="sr-only">{c.sr}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-micro text-muted">
        <span>
          <span className="font-mono font-semibold text-ink rounded-[3px] border border-border-strong px-0.5">BOS</span> to play
        </span>
        <span>
          <span className="figure font-semibold text-ink underline decoration-[var(--color-accent)] decoration-2 underline-offset-[3px]">31.0</span> score in his slot
        </span>
        <span>
          <span className="figure text-secondary">24.5</span> played, not banked
        </span>
        <span>DNP did not play</span>
      </p>
    </div>
  );
}
