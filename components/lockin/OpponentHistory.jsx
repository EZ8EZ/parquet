import { History } from "lucide-react";
import { Chip } from "@/components/ui";
import { fmt } from "@/lib/lockin/view";

/** Past meetings with the next opponent: history, on a sunken tile apart from the decision. */
export function OpponentHistory({ v }) {
  return (
    <section className="rounded-control bg-bg p-3" aria-label={`History against ${v.opponent ?? "the next opponent"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body font-semibold text-ink">{v.opponent ? `Past games vs ${v.opponent}` : "Past games vs next opponent"}</h3>
        <Chip icon={History} size="sm">
          History only
        </Chip>
      </div>
      {v.ok ? (
        <>
          <ul className="mt-2 space-y-1.5">
            {v.rows.map((r) => (
              <li key={r.date} className="grid grid-cols-[5rem_1fr_3rem] items-center gap-2 text-note">
                <span className="figure text-secondary">{r.label}</span>
                <span className="block h-2 rounded-full bg-elevated" aria-hidden="true">
                  <span className="block h-full rounded-full bg-[var(--color-secondary)]" style={{ width: `${r.widthPct}%` }} />
                </span>
                <span className="figure text-right font-semibold text-ink">{fmt(r.fp)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-meta text-secondary">Not used in the forecast: no measurable signal (partial correlation 0.026, n=18,812).</p>
        </>
      ) : (
        <p className="mt-1 text-note text-muted">{v.missing}</p>
      )}
    </section>
  );
}
