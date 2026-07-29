import { getLeagueHistory } from "@/lib/history";
import { VALUATION_CONFIG } from "@/lib/valuation/config";
import {
  ageMultiplier,
  pickValue,
  positionMultipliers,
  slotValue,
} from "@/lib/valuation";
import { pickDuration, playerDuration } from "@/lib/metrics/duration";
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

  // Live league shape for the pick model - the model reads these, so the page does too.
  const teams = h.currentLeague.totalRosters || h.rosters.length || 12;
  const playoffTeams = h.currentLeague.settings.playoff_teams;
  const lotterySize = playoffTeams != null ? teams - playoffTeams : 0;
  const rounds = h.currentLeague.settings.draft_rounds || 3;

  // The raw slot curve across the whole draft, before time/class adjustments.
  const slotSamples = [1, 2, 4, 7, 10, teams, teams + Math.ceil(teams / 2), teams * 2, teams * 3]
    .filter((o, i, arr) => o <= teams * rounds && arr.indexOf(o) === i)
    .map((overall) => {
      const round = Math.ceil(overall / teams);
      const slot = overall - (round - 1) * teams;
      return {
        label: `${round}.${String(slot).padStart(2, "0")}`,
        value: Math.round(slotValue(overall)),
      };
    });

  const ctxBase = { teams, rounds, playoffTeams };
  const pickExamples = [
    { label: "1st owed by the worst team", rank: teams },
    { label: "1st, nothing known (mid-round)", rank: undefined },
    { label: "1st owed by the champion", rank: 1 },
  ].map((e) => ({
    label: e.label,
    now: pickValue(1, 0, { ...ctxBase, originalTeamRank: e.rank }),
    later: pickValue(1, 2, { ...ctxBase, originalTeamRank: e.rank }),
  }));

  const classEntries = Object.entries(cfg.classStrength);

  const durationExamples = [
    { label: "21-year-old", d: playerDuration(21) },
    { label: "27-year-old", d: playerDuration(27) },
    { label: "33-year-old", d: playerDuration(33) },
    { label: "1st two seasons out", d: pickDuration(2) },
  ];

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

      <SectionHeader title="5 · Draft picks - slot-aware, lottery-aware" />
      <Card>
        <p className="text-sm leading-relaxed text-muted">
          Picks are NOT priced by round. The 1.01 and the 1.{String(teams).padStart(2, "0")}{" "}
          are wildly different assets, so value decays exponentially over the OVERALL
          pick number, toward a floor:
        </p>
        <p className="mt-2 rounded-[--radius-sm] bg-bg/60 p-2.5 text-center font-mono text-[12px] text-accent">
          value = {cfg.pick.floor} + ({cfg.pick.topPickValue.toLocaleString()} − {cfg.pick.floor}) · e^(−{cfg.pick.slotDecay} · (overall − 1))
        </p>
        <LineChart data={slotSamples} format={(n) => n.toLocaleString()} />
        <p className="mt-1 text-center text-[11px] text-faint">
          The raw slot curve across all {rounds} rounds ({teams * rounds} picks), before
          time and class adjustments.
        </p>
      </Card>

      <Card className="mt-2">
        <p className="text-sm font-semibold text-ink">Which slot? A distribution, not a guess.</p>
        <ul className="mt-1.5 space-y-1.5 text-sm leading-relaxed text-muted">
          <li>
            <span className="font-semibold text-ink">Known slot</span> (draft order set):
            priced exactly.
          </li>
          <li>
            <span className="font-semibold text-ink">Future pick:</span> estimated from
            the current strength of the team that ORIGINALLY owes it - a first from a bad
            team is close to a top pick, a first from the champion is a late one. In the
            preseason, strength is read from roster talent, because every record is 0-0.
          </li>
          <li>
            <span className="font-semibold text-ink">The lottery:</span> this league sends{" "}
            {playoffTeams ?? "?"} of {teams} teams to the playoffs, so the{" "}
            {lotterySize || "remaining"} teams that miss are all lottery-eligible for
            picks 1-{lotterySize || "?"}. A bad team&apos;s first is therefore a SPREAD
            over the lottery range, not a fixed slot
            {cfg.pick.lotteryWeighting === 0
              ? " (flat odds by default - the exact odds are unconfirmed, and flat adds the least unearned precision)"
              : ""}
            . Playoff teams pick after the lottery in reverse standings, champion last.
          </li>
          <li>
            <span className="font-semibold text-ink">Expected value, not value at the
            expected slot.</span> The slot curve is convex, so averaging value across the
            distribution is worth more than pricing the average slot. The model does the
            former - the honest one.
          </li>
          <li>
            <span className="font-semibold text-ink">Uncertainty and time:</span> the slot
            estimate regresses toward mid-round by {cfg.pick.slotUncertaintyPerYear}/season
            (you can guess next year&apos;s order; you cannot guess one three years out),
            and the whole pick is discounted{" "}
            {Math.round((1 - cfg.pick.discountPerYear) * 100)}% per season into the future.
          </li>
        </ul>
        <div className="mt-3 space-y-1">
          {pickExamples.map((e) => (
            <div
              key={e.label}
              className="flex items-baseline justify-between gap-2 rounded-[--radius-sm] border border-border bg-surface/60 px-2.5 py-1.5"
            >
              <span className="min-w-0 truncate text-[12px] text-ink">{e.label}</span>
              <span className="shrink-0 font-mono text-[12px] tnum text-muted">
                <span className="font-semibold text-ink">{e.now.toLocaleString()}</span> now
                · {e.later.toLocaleString()} in 2yr
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-2">
        <p className="text-sm font-semibold text-ink">Class strength - subjective, on purpose.</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          A class can be strong at the very top (a generational talent lifts the 1.01 and
          almost nothing else) or deep (the middle and late picks lift while the top is
          ordinary). Each season carries a <span className="font-mono">top</span> and{" "}
          <span className="font-mono">depth</span> multiplier, interpolated by where the
          pick sits. Converting consensus opinion about a class into value is a real part
          of pick trading; these are exposed so they can be argued with rather than buried.
        </p>
        <ul className="mt-2 space-y-0.5 font-mono text-xs text-muted">
          {classEntries.length === 0 && <li>all classes currently neutral (1.0 / 1.0)</li>}
          {classEntries.map(([season, s]) => (
            <li key={season}>
              {season}: top {(s.top ?? 1).toFixed(2)}× · depth {(s.depth ?? 1).toFixed(2)}×
            </li>
          ))}
          <li>any unlisted season: neutral (1.0 / 1.0)</li>
        </ul>
      </Card>

      <SectionHeader title="6 · Timelines - Dynasty Duration & TCI" />
      <Card>
        <p className="text-sm leading-relaxed text-muted">
          Every asset is a claim on production at some point in TIME. Borrowing Macaulay
          duration from fixed income, each asset&apos;s{" "}
          <span className="font-semibold text-ink">duration</span> is the value-weighted
          average number of seasons until it pays out - the age curve is the payout
          profile, and a pick is the wait until it converts plus the duration of the
          rookie it becomes.
        </p>
        <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
          {durationExamples.map((e) => (
            <div key={e.label} className="rounded-[--radius-sm] border border-border bg-surface/60 p-2">
              <div className="text-[11px] leading-tight text-faint">{e.label}</div>
              <div className="mt-0.5 font-mono text-sm font-semibold tnum text-ink">
                {e.d.toFixed(1)}s
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          A roster&apos;s duration says WHEN its value arrives. The{" "}
          <span className="font-semibold text-ink">Timeline Coherence Index</span> says
          whether its assets AGREE: it is the value-weighted dispersion of duration,
          inverted onto 0-100.
        </p>
        <p className="mt-2 rounded-[--radius-sm] bg-bg/60 p-2.5 text-center font-mono text-[12px] text-accent">
          TCI = 100 · (1 − min(1, dispersion / 3))
        </p>
        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted">
          <li>
            <span className="font-semibold text-ink">Coherence is direction-free.</span>{" "}
            A great rebuild and a great contender both score high - the index measures
            whether you have a plan, not whether we approve of it.
          </li>
          <li>
            <span className="font-semibold text-ink">Below TCI 55 a roster is
            straddling</span> - a 33-year-old star next to a stack of far-out firsts. It
            owns two teams that share a logo, and neither timeline is served. That is the
            only bad quadrant.
          </li>
          <li>
            <span className="font-semibold text-ink">Posture is league-relative.</span> A
            3.8-season roster is win-now in a league of rebuilders and a rebuilder in a
            league of veterans, so contending / ascending / rebuilding are assigned by
            within-league percentile of duration.
          </li>
        </ul>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          This is only computable because players and picks are valued on one common
          scale (sections 1-5). See the league quadrant on the League page.
        </p>
      </Card>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-faint">
        Player and pick constants live in <span className="font-mono">lib/valuation/config.ts</span>;
        the timeline math in <span className="font-mono">lib/metrics/duration.ts</span>.
        Ranking tiers are not part of the model - they break where the value distribution
        actually cliffs, instead of at fixed thresholds. A crowdsourced vote-driven market
        is intentionally deferred until there&apos;s enough participation to trust it.
      </p>
    </div>
  );
}
