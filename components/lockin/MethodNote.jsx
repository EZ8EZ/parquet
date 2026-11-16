import { ChevronRight } from "lucide-react";

const pp = (x) => `${Math.round(x * 1000) / 10}%`;

/** "How these numbers are made", from MODEL_INFO and LEAN_RECORD. One screen at most. */
export function MethodNote({ model, record }) {
  const c = model.calibration;
  const p = model.params;
  return (
    <details id="lockin-method" className="group mt-6 scroll-mt-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-meta font-semibold text-muted hover:text-accent-text">
        How these numbers are made
        <ChevronRight size={12} aria-hidden="true" className="disclosure-chevron shrink-0 group-open:rotate-90" />
      </summary>
      <div className="space-y-2.5 rounded-[var(--radius-sm)] border border-border bg-surface p-3 text-meta leading-snug text-muted">
        <section>
          <h3 className="font-semibold text-ink">The forecast</h3>
          <p>
            His next game: recent games weighted most (half-life {p.halfLife} games), spread taken from his last {p.shapeGames} played games, widened x{p.widen}. Under {p.minShapeGames} games of his own, the spread is the league&apos;s. Fit: R² {model.fit.r2}, typical miss {model.fit.residualSd} points (n={model.fit.n.toLocaleString("en-US")} games).
          </p>
        </section>
        <section>
          <h3 className="font-semibold text-ink">Left out on purpose</h3>
          <ul className="list-disc pl-4">
            {model.notInForecast.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p>Each was measured and found too small or too noisy to help. Marks on past games (overtime, a minutes jump, a usual starter not starting) are facts about those games, not causes.</p>
        </section>
        <section>
          <h3 className="font-semibold text-ink">Calibration</h3>
          <p>
            The 8-in-10 range held {pp(c.insideRange10to90)} of outcomes ({c.window}, n={c.n.toLocaleString("en-US")}). The &ldquo;if he plays&rdquo; chance {c.pLaterBeatsIfPlays}. {model.lockStateNote} {model.injuryNote}
          </p>
        </section>
        <section>
          <h3 className="font-semibold text-ink">The lean and its record</h3>
          <p>
            {record.policy}. Against {record.comparedWith}: +{record.gainPerTeamWeek} per team-week, 95% interval +{record.interval95[0]} to +{record.interval95[1]} ({record.intervalMethod}), n={record.n} {record.unit}, {record.sample}.
          </p>
          <p className="mt-1">{record.rotationCaveat}</p>
          <p className="mt-1">{record.availabilityCaveat}</p>
          <p className="mt-1">Confidence is the gap between locking and holding in units of his spread: under 0.25 marginal, under 0.75 moderate, otherwise clear.</p>
        </section>
      </div>
    </details>
  );
}
