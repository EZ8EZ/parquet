import { CHART_ACCENT, CHART_FIELD, CHART_INK } from "@/lib/chart-colors";
import { fmt } from "@/lib/lockin/view";
import { rangeText } from "@/lib/lockin/matchupView";

/**
 * Both projected totals on one scale: each a band from the 10th to the 90th percentile
 * with the mean as a tick, the name and the figures printed beside it (HTML labels;
 * the position carries the value, the colour only says whose). Yours is violet, theirs
 * the field's blue (lib/chart-colors.js). `rows`: [{ name, range, you }].
 */
export function RangeBands({ scale, rows }) {
  if (!scale) {
    // No range to draw: keep the banked totals as text.
    return (
      <p className="flex flex-wrap justify-between gap-x-3 text-meta text-muted">
        {rows.map((r) => (
          <span key={r.name}>
            <span className="font-semibold">{r.you ? "You" : r.name}</span> <span className="figure font-bold text-ink">{fmt(r.banked)}</span> banked
          </span>
        ))}
      </p>
    );
  }
  return (
    <figure className="m-0" aria-label="Projected final totals: range with the most likely total marked">
      <ul className="space-y-2.5">
        {rows.map((r, i) => {
          const g = scale.rows[i];
          const colour = r.you ? CHART_ACCENT : CHART_FIELD;
          return (
            <li key={r.name + i}>
              <p className="flex items-baseline justify-between gap-3 text-meta">
                <span className="min-w-0 text-muted">
                  <span className="font-semibold">{r.you ? "You" : r.name}</span>
                  {r.banked != null && (
                    <>
                      {" "}
                      <span className="figure font-bold text-ink">{fmt(r.banked)}</span> banked
                    </>
                  )}
                </span>
                <span className="shrink-0 figure text-secondary">
                  {g ? (
                    <>
                      final <span className="font-semibold text-ink">{Math.round(r.range.mean)}</span> ({rangeText(r.range)})
                    </>
                  ) : (
                    "final unknown"
                  )}
                </span>
              </p>
              <div className="relative mt-1 h-2.5 rounded-full bg-elevated" aria-hidden="true">
                {g && (
                  <>
                    <span className="absolute inset-y-0 rounded-full" style={{ left: `${g.lo}%`, width: `${Math.max(g.width, 1)}%`, background: colour, opacity: 0.55 }} />
                    <span className="absolute -inset-y-1 w-[3px] -translate-x-1/2 rounded-full" style={{ left: `${g.mean}%`, background: CHART_INK }} />
                  </>
                )}
              </div>
              {g && r.note && <p className="mt-0.5 text-micro text-secondary">{r.note}</p>}
            </li>
          );
        })}
      </ul>
      <div className="relative mt-1 h-4 text-micro text-faint" aria-hidden="true">
        {scale.ticks.map((t) => (
          <span key={t.v} className="figure absolute -translate-x-1/2" style={{ left: `${t.pct}%` }}>
            {Math.round(t.v)}
          </span>
        ))}
      </div>
    </figure>
  );
}
