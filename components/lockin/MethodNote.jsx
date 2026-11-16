import { Disclosure } from "@/components/ui";

const pp = (x) => `${Math.round(x * 1000) / 10}%`;

/** "How these numbers are made", from MODEL_INFO and LEAN_RECORD. One screen at most. */
export function MethodNote({ model, record, open = false }) {
  const c = model.calibration;
  const p = model.params;
  return (
    <div id="lockin-method" className="mt-6 scroll-mt-20">
      <Disclosure summary="How these numbers are made" open={open} bodyClassName="space-y-2">
        <p>
          <span className="font-semibold text-ink">Forecast.</span> Recent games weigh most (half-life {p.halfLife} games); the spread is his last {p.shapeGames} games widened x{p.widen}, or the league&apos;s under {p.minShapeGames}. R² {model.fit.r2}, typical miss {model.fit.residualSd} points, n={model.fit.n.toLocaleString("en-US")}.
        </p>
        <p>
          <span className="font-semibold text-ink">Left out on purpose:</span> {model.notInForecast.join("; ")}. Marks on past games are facts about those games, not causes.
        </p>
        <p>
          <span className="font-semibold text-ink">Calibration.</span> The 8-in-10 range held {pp(c.insideRange10to90)} of outcomes (n={c.n.toLocaleString("en-US")}). The &ldquo;if he plays&rdquo; chance {c.pLaterBeatsIfPlays}. {model.lockStateNote}
        </p>
        <p>
          <span className="font-semibold text-ink">The lean.</span> {record.policy}: +{record.gainPerTeamWeek} per team-week against {record.comparedWith} (95% interval +{record.interval95[0]} to +{record.interval95[1]}, n={record.n} {record.unit}, {record.sample}). {record.rotationCaveat} {record.availabilityCaveat} Confidence is the lock-versus-hold gap in units of his spread: under 0.25 marginal, under 0.75 moderate, otherwise clear.
        </p>
      </Disclosure>
    </div>
  );
}
