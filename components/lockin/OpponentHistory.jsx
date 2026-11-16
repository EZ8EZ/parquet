import { fmt } from "@/lib/lockin/view";

/** Past meetings with the next opponent. History, set apart from the decision numbers. */
export function OpponentHistory({ v }) {
  return (
    <section className="rounded-[--radius-sm] border border-dashed border-border-strong p-2.5" aria-label={`History against ${v.opponent ?? "the next opponent"}`}>
      <h4 className="text-micro font-semibold uppercase tracking-[0.14em] text-muted">
        History{v.opponent ? ` vs ${v.opponent}` : ""}
      </h4>
      {v.ok ? (
        <>
          <ul className="mt-1.5 space-y-1">
            {v.rows.map((r) => (
              <li key={r.date} className="grid grid-cols-[4.75rem_1fr_2.75rem] items-center gap-2 text-meta">
                <span className="figure text-muted">{r.label}</span>
                <span className="block h-2.5 rounded-sm bg-elevated" aria-hidden="true">
                  <span className="block h-full rounded-sm bg-[var(--color-secondary)]" style={{ width: `${r.widthPct}%` }} />
                </span>
                <span className="figure text-right text-ink">{fmt(r.fp)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-micro leading-snug text-muted">
            Last {v.n} {v.n === 1 ? "meeting" : "meetings"} loaded, newest first. Not used in any number above: past games against one team carried almost no signal for the next (partial correlation 0.026, n=18,812).
          </p>
        </>
      ) : (
        <p className="mt-1 text-meta text-muted">{v.missing}</p>
      )}
    </section>
  );
}
