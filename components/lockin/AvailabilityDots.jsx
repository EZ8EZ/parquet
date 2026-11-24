import { availabilityView } from "@/lib/lockin/matchupView";

const R = 5.5;
const C = 2 * Math.PI * R;

/** A ring filled to the chance he plays; the printed percentage carries the value. */
function Ring({ dash }) {
  const filled = Number.isFinite(dash) ? Math.max(0, Math.min(100, dash)) : 0;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      <circle cx="7" cy="7" r={R} fill="none" stroke="var(--color-border-strong)" strokeWidth="2" />
      {filled > 0 && <circle cx="7" cy="7" r={R} fill="none" stroke="var(--color-secondary)" strokeWidth="2" strokeDasharray={`${((filled / 100) * C).toFixed(2)} ${C.toFixed(2)}`} transform="rotate(-90 7 7)" />}
    </svg>
  );
}

/** Chance he plays each remaining game, and all of them, with n. */
export function AvailabilityDots({ card }) {
  const v = availabilityView(card);
  if (!v) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-secondary" data-availability>
      <span className="sr-only">Chance he plays: </span>
      {v.games.map((g) => (
        <span key={g.date} className="inline-flex items-center gap-1">
          <Ring dash={g.dash} />
          {g.day} <span className="figure font-semibold text-ink">{g.pct}</span>
        </span>
      ))}
      {v.games.length > 1 && (
        <span>
          plays all <span className="figure font-semibold text-ink">{v.allPct}</span>
        </span>
      )}
      {v.n != null && <span>n={v.n}</span>}
    </div>
  );
}
