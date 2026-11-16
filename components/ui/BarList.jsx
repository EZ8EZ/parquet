import { cn } from "@/lib/ui";
import { CHART_ACCENT, CHART_MARK } from "@/lib/chart-colors";

/**
 * Horizontal bars with direct labels: the default chart. Label left, printed value
 * right, bar underneath, so length and number say the same thing and colour only
 * marks which row is yours. HTML, not SVG, so labels stay real text at real sizes.
 * items: [{ key, label, value, display?, sub?, highlight? }]
 */
export function BarList({ items, max, format = (n) => String(n), label, className }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul aria-label={label} className={cn("space-y-2.5", className)}>
      {items.map((it) => (
        <li key={it.key ?? it.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className={cn("min-w-0 text-note", it.highlight ? "font-semibold text-ink" : "text-muted")}>
              {it.label}
              {it.sub && <span className="ml-1.5 text-meta text-secondary">{it.sub}</span>}
            </span>
            <span className="shrink-0 figure text-note font-semibold text-ink">{it.display ?? format(it.value)}</span>
          </div>
          <span aria-hidden="true" className="mt-1 block h-2 overflow-hidden rounded-full bg-elevated">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.max(2, Math.round((Math.max(0, it.value) / top) * 100))}%`,
                background: it.highlight ? CHART_ACCENT : CHART_MARK,
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
