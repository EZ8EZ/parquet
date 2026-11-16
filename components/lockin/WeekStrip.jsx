import { SLOT_STATES, fmt, slotStateKey } from "@/lib/lockin/view";
import { StateIcon } from "./StateIcon";

/** The seven slots: who, what is banked, and in what state. */
export function WeekStrip({ slots, summary }) {
  return (
    <div>
      <ol className="divide-y divide-border rounded-[var(--radius)] border border-border bg-surface">
        {slots.map((s) => {
          const key = slotStateKey(s);
          return (
            <li key={s.index} className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2">
              <span className="font-mono text-micro font-semibold text-faint">{s.label}</span>
              <span className="min-w-0">
                <span className="block text-body font-medium leading-snug text-ink">{s.name ?? "Empty slot"}</span>
                <span className="mt-0.5 flex items-center gap-1 text-micro text-muted">
                  <StateIcon state={key} className={key === "locked" ? "text-ink" : ""} />
                  {SLOT_STATES[key].label}
                </span>
              </span>
              <span className={`figure text-lede font-semibold ${s.banked == null ? "text-faint" : "text-ink"}`}>{s.banked == null ? "-" : fmt(s.banked)}</span>
            </li>
          );
        })}
      </ol>
      {summary && <PressureLine summary={summary} />}
    </div>
  );
}

export function PressureLine({ summary }) {
  const open = summary.openMin === summary.openMax ? `${summary.openMax}` : `${summary.openMin}-${summary.openMax}`;
  return (
    <dl className="mt-2 grid grid-cols-3 gap-2">
      <Fig label={summary.openMin === summary.openMax ? "open slots" : `open slots (${summary.openMax - summary.openMin} lock state unknown)`} value={open} />
      <Fig label={summary.playersStillToPlay === 1 ? "player still to play" : "players still to play"} value={summary.playersStillToPlay} />
      <Fig label={summary.gamesRemaining === 1 ? "game left" : "games left"} value={summary.gamesRemaining} />
    </dl>
  );
}

function Fig({ label, value }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1.5">
      <dt className="sr-only">{label}</dt>
      <dd className="figure text-lede font-semibold leading-tight text-ink">{value}</dd>
      <dd aria-hidden="true" className="text-micro leading-tight text-muted">
        {label}
      </dd>
    </div>
  );
}
