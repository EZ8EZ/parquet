import { History } from "lucide-react";
import { Chip } from "@/components/ui";
import { fmt } from "@/lib/lockin/view";
import { Opp } from "./Opp";

/**
 * Past meetings with every team he still faces this week, one block per game left: each
 * meeting as a bar (newest first) with anything unusual about it (a starter out, his
 * minutes), and the average against that team beside his season average. History only,
 * on a sunken tile apart from the decision: it feeds no number.
 */
export function OpponentHistory({ v }) {
  return (
    <section className="rounded-control bg-bg p-3" aria-label="Past games against this week's opponents">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body font-semibold text-ink">Past games vs this week&apos;s opponents</h3>
        <Chip icon={History} size="sm">
          History only
        </Chip>
      </div>
      {v.season && (
        <p className="mt-1 text-meta text-secondary">
          Season average <span className="figure font-semibold text-ink">{fmt(v.season.mean)}</span> (n={v.season.n} games)
        </p>
      )}
      {v.ok ? (
        <div className="mt-2 space-y-4">
          {v.blocks.map((b) => (
            <div key={b.key}>
              <p className="flex items-baseline justify-between gap-2 text-note">
                <span className="font-semibold text-ink">
                  {b.day ? `${b.day} ` : ""}
                  <Opp team={b.opponent} away={b.away} />
                </span>
                {b.avg != null && (
                  <span className="text-meta text-secondary">
                    avg <span className="figure font-semibold text-ink">{fmt(b.avg)}</span> · n={b.n}
                  </span>
                )}
              </p>
              {b.rows.length ? (
                <ul className="mt-1.5 space-y-1.5">
                  {b.rows.map((r) => (
                    <li key={r.date} className="text-note">
                      <span className="grid grid-cols-[5rem_1fr_3rem] items-center gap-2">
                        <span className="figure text-secondary">{r.label}</span>
                        <span className="block h-2 rounded-full bg-elevated" aria-hidden="true">
                          <span className="block h-full rounded-full bg-secondary" style={{ width: `${r.widthPct}%` }} />
                        </span>
                        <span className="figure text-right font-semibold text-ink">{fmt(r.fp)}</span>
                      </span>
                      {(r.minutes != null || r.notes.length > 0) && (
                        <span className="block pl-[5.5rem] text-micro text-secondary">
                          {/* the notes already name his minutes when they were unusual */}
                          {r.notes.length ? r.notes.join("; ") : `${fmt(r.minutes)} min`}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-note text-muted">{b.missing}</p>
              )}
            </div>
          ))}
          <p className="text-meta text-secondary">Not used in the forecast: no measurable signal (partial correlation 0.026, n=18,812).</p>
        </div>
      ) : (
        <p className="mt-1 text-note text-muted">{v.missing}</p>
      )}
    </section>
  );
}
