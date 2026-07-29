import { getLeagueHistory } from "@/lib/history";
import { VALUATION_CONFIG } from "@/lib/valuation/config";
import {
  ageMultiplier,
  pickValue,
  positionMultipliers,
} from "@/lib/valuation";
import { PageHeader, Card, SectionHeader } from "@/components/ui";
import { LineChart } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function MethodologyPage() {
  const h = await getLeagueHistory();
  const scoring = h.currentLeague.scoringSettings;
  const cfg = VALUATION_CONFIG;
  const posMults = positionMultipliers(scoring);

  const baseExamples = [1, 10, 25, 50, 100, 150, 220].map((rank) => ({
    label: `#${rank}`,
    value: Math.round(cfg.maxValue * Math.exp(-cfg.rankDecay * (rank - 1))),
  }));

  const ageExamples = [19, 22, 25, 28, 31, 34, 37];

  return (
    <div>
      <PageHeader
        kicker="Methodology"
        title="How the values work"
        subtitle="No black box, no scraped market. Every number below is a tunable constant in one config file. Transparency is the point."
      />

      <Card className="mb-4">
        <p className="text-sm leading-relaxed text-ink">
          A player&apos;s dynasty value is a base value from consensus rank, bent by
          four multipliers:
        </p>
        <p className="mt-3 rounded-[--radius-sm] bg-bg/60 p-3 text-center font-mono text-[13px] text-accent">
          value = base(rank) × age × injury × role × position
        </p>
      </Card>

      <SectionHeader title="1 · Base value from consensus rank" />
      <Card>
        <p className="mb-3 text-sm text-muted">
          Value decays exponentially with rank (studs are scarce):
          <span className="font-mono text-ink"> base = {cfg.maxValue.toLocaleString()} · e^(−{cfg.rankDecay} · (rank−1))</span>
        </p>
        <LineChart data={baseExamples} format={(n) => n.toLocaleString()} />
      </Card>

      <SectionHeader title="2 · Age curve (dynasty premium for youth)" />
      <Card>
        <LineChart
          data={ageExamples.map((a) => ({ label: `${a}`, value: Math.round(ageMultiplier(a) * 100) }))}
          yLabel="age multiplier (%)"
          format={(n) => `${n}%`}
        />
        <p className="mt-2 text-center text-[11px] text-faint">
          Anchors (linearly interpolated):{" "}
          {cfg.ageAnchors.map(([a, m]) => `${a}→${m}`).join("  ")}
        </p>
      </Card>

      <SectionHeader title="3 · Positional value - from YOUR scoring" />
      <Card>
        <p className="mb-3 text-sm text-muted">
          Each position&apos;s canonical stat line is scored under this league&apos;s
          actual settings, then normalized. Steals &amp; blocks are weighted
          {" "}{scoring.stl ?? 0}× / {scoring.blk ?? 0}× here, which lifts the
          positions that produce them.
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {Object.entries(posMults).map(([pos, m]) => (
            <div key={pos} className="rounded-[--radius-sm] border border-border bg-surface/60 p-2 text-center">
              <div className="text-[11px] text-faint">{pos}</div>
              <div className="font-mono text-sm font-semibold text-ink">{m.toFixed(2)}×</div>
            </div>
          ))}
        </div>
      </Card>

      <SectionHeader title="4 · Injury & role" />
      <Card>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-faint">Injury</div>
            <ul className="space-y-0.5 font-mono text-xs text-muted">
              {Object.entries(cfg.injury).map(([k, v]) => (
                <li key={k}>{k}: {v}×</li>
              ))}
              <li>healthy: 1.0×</li>
            </ul>
          </div>
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-faint">Role (depth chart)</div>
            <ul className="space-y-0.5 font-mono text-xs text-muted">
              <li>starter: {cfg.role.starter}×</li>
              <li>2nd unit: {cfg.role.secondary}×</li>
              <li>bench: {cfg.role.bench}×</li>
            </ul>
          </div>
        </div>
      </Card>

      <SectionHeader title="5 · Draft picks (present-valued)" />
      <Card>
        <p className="mb-2 text-sm text-muted">
          Base value by round, discounted {Math.round((1 - cfg.pick.discountPerYear) * 100)}% per
          season into the future.
        </p>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[1, 2, 3].map((round) => (
            <div key={round} className="rounded-[--radius-sm] border border-border bg-surface/60 p-2">
              <div className="text-[11px] text-faint">Round {round}</div>
              <div className="font-mono text-sm text-ink">this yr {pickValue(round, 0).toLocaleString()}</div>
              <div className="font-mono text-[11px] text-faint">+3yr {pickValue(round, 3).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </Card>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-faint">
        Every constant lives in <span className="font-mono">lib/valuation/config.ts</span>.
        A crowdsourced market (KTC-style voting) is intentionally deferred until there&apos;s
        enough liquidity to trust it - see the research notes in the repo.
      </p>
    </div>
  );
}
