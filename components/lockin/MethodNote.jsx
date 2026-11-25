import { Disclosure } from "@/components/ui";

const pp = (x) => `${Math.round(x * 1000) / 10}%`;

function Eq({ children }) {
  return <code className="block overflow-x-auto rounded-control bg-bg px-2.5 py-1.5 font-mono text-micro leading-5 text-ink">{children}</code>;
}

/**
 * "How these numbers are made": short and mathematical, one screen. Figures come from
 * MODEL_INFO and LEAN_RECORD; the opponent and calibration figures are D132 and D137.
 */
export function MethodNote({ model, record, open = false }) {
  const c = model.calibration;
  const p = model.params;
  return (
    <div id="lockin-method" className="mt-6 scroll-mt-20">
      <Disclosure summary="How these numbers are made" open={open} bodyClassName="space-y-3">
        <div>
          <p className="font-semibold text-ink">Next game</p>
          <Eq>{`Y ~ μ + w·(shape − mean(shape)),  μ = EWMA(fp; h=${p.halfLife})`}</Eq>
          <p className="mt-1">
            shape = his last {p.shapeGames} games (league&apos;s under {p.minShapeGames}), w = {p.widen}. R² {model.fit.r2}, σ<sub>resid</sub> {model.fit.residualSd}, n={model.fit.n.toLocaleString("en-US")}; 8-in-10 range covers {pp(c.insideRange10to90)}.
          </p>
        </div>
        <div>
          <p className="font-semibold text-ink">Plays?</p>
          <Eq>{"p_g = σ(β·[logit q, logit rate, b2b, missed₁, missed₃/₅])"}</Eq>
        </div>
        <div>
          <p className="font-semibold text-ink">Lock rule (optimal stopping)</p>
          <Eq>{"H₀(y)=y,  H_j(y) = q·max(y, r_j) + (1−q)·max(y, H_{j−1}(0)),  r_j = E[H_{j−1}(Y)]"}</Eq>
          <p className="mt-1">Hold value with k games left: p·r_k + (1−p)·H_{"{k−1}"}(0). The lean takes the lineup-wide version: a max-weight assignment of every open slot, lock vs hold; confidence = |Δ|/σ (&lt;0.25 marginal, &lt;0.75 moderate).</p>
        </div>
        <div>
          <p className="font-semibold text-ink">Win chance</p>
          <Eq>{"P(win) = P(T_you > T_opp) + ½·P(T_you = T_opp),  N = 2,000 seeded draws"}</Eq>
          <p className="mt-1">Each unlocked slot is a chain: keep x iff x ≥ C, C = E[slot&apos;s continuation] (his later games or the bench player assigned). The opponent locks with share w = 0.293 after every game (n=16,047), plus −1.55 per open slot. Brier 0.122 (n=1,442 decision points): rough in the middle.</p>
        </div>
        <div>
          <p className="font-semibold text-ink">Who could beat x</p>
          <Eq>{"P_i = g(1 − Π_games (1 − p_g · S_i(x))),  P_any = 1 − Π_i (1 − P_i)"}</Eq>
          <p className="mt-1">S<sub>i</sub>(x) = share of his draws ≥ x; g = the beat-it recalibration (logistic, fitted on real lock situations).</p>
        </div>
        <p className="text-meta text-secondary">
          Backtest: +{record.gainPerTeamWeek} pts/team-week vs {record.comparedWith} [{record.interval95[0]}, {record.interval95[1]}], n={record.n}. Opponent history, matchup and teammate effects stay out of every number (no measurable signal).
        </p>
      </Disclosure>
    </div>
  );
}
