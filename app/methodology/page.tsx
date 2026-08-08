import { getLeagueHistory } from "@/lib/history";
import { VALUATION_CONFIG, type InjuryClass } from "@/lib/valuation/config";
import {
  AGE_CURVE_PROVENANCE,
  CURVE_SUPPORTED_MAX,
  CURVE_SUPPORTED_MIN,
  DERIVED_AGE_CURVE,
  INJURY_CLASS_LABELS,
  ageMultiplier,
  firstCliffAge,
  pickValue,
  positionMultipliers,
  slotValue,
} from "@/lib/valuation";
import { deriveExitWindow } from "@/lib/valuation/exitWindow";
import { pickDuration, playerDuration } from "@/lib/metrics/duration";
import {
  W_LOO,
  W_CONCENTRATION,
  W_EXPOSURE,
  LOO_TOP_K,
} from "@/lib/metrics/fragility";
import { PageHeader, Card, SectionHeader } from "@/components/ui";
import { LineChart } from "@/components/charts";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Onward } from "@/components/Onward";

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
  const cliff = firstCliffAge();
  const peakAnchor = Math.max(...cfg.ageAnchors.map(([, m]) => m));
  const decline29to34 = Math.round(
    (1 - ageMultiplier(34) / ageMultiplier(29)) * 100,
  );
  // The market half. Pure arithmetic over transactions already on the corpus - no
  // request, no memoized slot, nothing added to assembleCorpus (D25).
  const market = deriveExitWindow(h);

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

  // Injury classes, ordered by how much they cost, with the body parts that map into
  // each one read back out of the config rather than retyped here.
  const partsByClass = new Map<InjuryClass, string[]>();
  for (const [part, k] of Object.entries(cfg.injury.bodyPartClass)) {
    partsByClass.set(k, [...(partsByClass.get(k) ?? []), part]);
  }
  const injuryClasses = (Object.keys(cfg.injury.classPenalty) as InjuryClass[])
    .map((key) => {
      const label = INJURY_CLASS_LABELS[key];
      const parts = partsByClass.get(key) ?? [];
      return {
        key,
        label,
        // Suppress the body-part line when it would only repeat the class name.
        parts:
          parts.length === 0
            ? "anything unrecognised"
            : parts.length === 1 && parts[0] === label
              ? null
              : parts.join(", "),
        penalty: cfg.injury.classPenalty[key],
        slope: cfg.injury.classAgeSlope[key],
      };
    })
    .sort((a, b) => b.penalty - a.penalty);

  // Measured off the corpus this page is rendering, not a number typed in a comment,
  // so the claim below cannot quietly go stale.
  const flagged = [...h.players.values()].filter((p) => p.injuryStatus);
  const dtd = flagged.filter((p) => p.injuryStatus === "DTD").length;
  const liveDtdShare =
    flagged.length > 0 ? `${Math.round((dtd / flagged.length) * 100)}%` : "most";

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
        action={
          <Link
            href="/about"
            className="inline-flex min-h-11 items-center gap-0.5 rounded-full border border-border px-3 text-meta font-semibold text-muted transition-colors hover:border-accent hover:text-accent-text"
          >
            What this is
            <ChevronRight size={12} aria-hidden="true" />
          </Link>
        }
      />

      <Card className="mb-4">
        <p className="text-body leading-relaxed text-ink">
          A player&apos;s dynasty value is a base value from consensus rank, bent by
          four multipliers:
        </p>
        <p className="mt-3 rounded-[--radius-sm] bg-bg/60 p-3 text-center font-mono text-body text-accent-text">
          value = base(rank) × age × injury × role × position
        </p>
      </Card>

      <SectionHeader title="1 · Base value from consensus rank" />
      <Card>
        <p className="mb-3 text-body leading-relaxed text-muted">
          Value decays exponentially with rank (studs are scarce):
          <span className="font-mono text-ink"> base = {cfg.maxValue.toLocaleString()} · e^(−{cfg.rankDecay} · (rank−1))</span>
        </p>
        <LineChart data={baseExamples} format={(n) => n.toLocaleString()} />
      </Card>

      <SectionHeader title="2 · Age curve, measured" />
      <Card>
        <LineChart
          data={ageExamples.map((a) => ({ label: `${a}`, value: Math.round(ageMultiplier(a) * 100) }))}
          yLabel="age multiplier (%)"
          format={(n) => `${n}%`}
        />
        <p className="mt-3 text-body leading-relaxed text-muted">
          These multipliers used to be hand-set. They are now measured from{" "}
          <span className="figure text-ink">
            {AGE_CURVE_PROVENANCE.playerSeasons.toLocaleString()}
          </span>{" "}
          real NBA player-seasons ({AGE_CURVE_PROVENANCE.firstSeason} through{" "}
          {AGE_CURVE_PROVENANCE.lastSeason}), every one of them scored under this
          league&apos;s own settings. The league is only five seasons old; the games
          are not. Production is taken per 36 minutes and divided by that season&apos;s
          own league mean, so a role change is not read as decline and a scoring era is
          not read as everyone improving. Then the same players are followed{" "}
          {AGE_CURVE_PROVENANCE.horizon} seasons forward, discounted{" "}
          {AGE_CURVE_PROVENANCE.discountPerSeason} a year.
        </p>
        <p className="mt-2 text-body leading-relaxed text-muted">
          A player who stopped clearing the bar counts as a zero, not as missing data.
          That one choice is the difference between this and the age curves that
          conclude 36-year-olds hold up fine: the 36-year-olds still playing do hold up
          fine, and half of them are not still playing.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-meta">
            <caption className="sr-only">
              Measured age curve: multiplier, sample size and one-season survival at
              each age
            </caption>
            <thead>
              <tr className="text-secondary">
                <th scope="col" className="py-1 pr-2 text-left font-semibold">age</th>
                <th scope="col" className="py-1 pr-2 text-right font-semibold">multiplier</th>
                <th scope="col" className="py-1 pr-2 text-right font-semibold">n</th>
                <th scope="col" className="py-1 text-right font-semibold">
                  still playing +1
                </th>
              </tr>
            </thead>
            <tbody>
              {DERIVED_AGE_CURVE.map((r) => (
                <tr key={r.age} className="border-t border-border">
                  <th
                    scope="row"
                    className="figure py-1 pr-2 text-left font-normal text-ink"
                  >
                    {r.age}
                    {r.age === cliff && <span className="ml-1 text-secondary">▾</span>}
                  </th>
                  <td className="figure py-1 pr-2 text-right text-ink">
                    {r.multiplier.toFixed(3)}
                  </td>
                  <td className="figure py-1 pr-2 text-right text-secondary">
                    {r.cohort}
                  </td>
                  <td className="figure py-1 text-right text-secondary">
                    {Math.round(r.stillPlaying * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-meta leading-snug text-secondary">
          ▾ marks {cliff}, the steepest single year anywhere before 34, and the age the
          quiet marker on /values and /roster points at. Below {CURVE_SUPPORTED_MIN}{" "}
          and above {CURVE_SUPPORTED_MAX} the curve holds flat: past{" "}
          {CURVE_SUPPORTED_MAX} the thinnest sample cell holds fifteen careers, which
          is not enough to draw a line through. The peak stays exactly{" "}
          <span className="figure text-ink">{peakAnchor}</span>, deliberately - it is
          folded into the constant every value in this app is divided by, so moving it
          would rescale every price here for no reason at all.
        </p>
      </Card>

      <SectionHeader title="2b · What this league actually paid" />
      <Card>
        <p className="text-body leading-relaxed text-muted">
          The curve above says when production declines. It does not say when{" "}
          <span className="text-ink">this league</span> stops paying, and those are
          different questions. A price is what fourteen people believed on a given day,
          and no amount of box-score arithmetic recovers that for seasons the league
          did not exist for. So this half gets only the five seasons it has:{" "}
          <span className="figure text-ink">{market.tradesRead}</span> trades, yielding{" "}
          <span className="figure text-ink">{market.acquisitions}</span> usable player
          acquisitions after setting aside {market.sidesPickOnly} pick-only sides,{" "}
          {market.sidesNoPricedCost} with no priced cost, and {market.sidesPickHeavy}{" "}
          where picks outweighed the players.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-meta">
            <caption className="sr-only">
              Realised return by age at the time of the trade, with sample size
            </caption>
            <thead>
              <tr className="text-secondary">
                <th scope="col" className="py-1 pr-2 text-left font-semibold">
                  age when traded
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-semibold">n</th>
                <th scope="col" className="py-1 pr-2 text-right font-semibold">
                  back per 100 paid
                </th>
                <th scope="col" className="py-1 text-right font-semibold">
                  biggest single deal
                </th>
              </tr>
            </thead>
            <tbody>
              {market.buckets.map((b) => (
                <tr key={b.label} className="border-t border-border">
                  <th scope="row" className="py-1 pr-2 text-left font-normal text-ink">
                    {b.label}
                  </th>
                  <td className="figure py-1 pr-2 text-right text-ink">{b.n}</td>
                  <td className="figure py-1 pr-2 text-right text-secondary">
                    {b.n ? Math.round(b.ratio * 100) : "-"}
                  </td>
                  <td className="figure py-1 text-right text-secondary">
                    {b.n ? `${Math.round(b.concentration * 100)}%` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-meta leading-snug text-secondary">
          Every bucket fails the bar, and the last column is why. A bucket is being
          asked to resolve an effect worth about five percent, and in every one of them
          a single deal carries far more of the total than that. So nothing in the
          model is calibrated against this table. It is published because looking and
          finding nothing is a result, and because the count of trades at each age is
          itself the thing worth knowing.
        </p>
        <p className="mt-2 text-meta leading-snug text-secondary">
          Two limits, stated rather than buried. Everything here is priced at
          today&apos;s value, so it describes how deals turned out, not how they were
          reasoned, and it is not a forecast. And picks are a separate model, so a side
          that was mostly picks is weak evidence about the player who came with it;
          commissioner-run trades record no picks at all, which is not detectable and
          not corrected for.
        </p>
        <p className="mt-2 text-meta leading-snug text-secondary">
          The gap between the two halves is the finding. Production keeps a measured
          schedule: <span className="figure text-ink">{decline29to34}%</span>{" "}
          of a player&apos;s dynasty value goes between 29 and 34, and that is what the
          price above already charges him. Whether this league charges the same is the
          part that cannot be answered. The correlation between age at the trade and
          how the deal turned out is{" "}
          <span className="figure text-ink">
            {market.rho != null ? market.rho.toFixed(2) : "-"}
          </span>
          , and its sign is worth nothing: every bucket behind it fails the bar. One
          half of this section rests on{" "}
          {AGE_CURVE_PROVENANCE.playerSeasons.toLocaleString()} player-seasons and the
          other on {market.acquisitions}. Only the first half is allowed to move a
          price.
        </p>
      </Card>

      <SectionHeader title="3 · Positional value - from YOUR scoring" />
      <Card>
        <p className="mb-3 text-body leading-relaxed text-muted">
          Each position&apos;s canonical stat line is scored under this league&apos;s
          actual settings, then normalized. Steals &amp; blocks are weighted
          {" "}{scoring.stl ?? 0}× / {scoring.blk ?? 0}× here, which lifts the
          positions that produce them.
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {Object.entries(posMults).map(([pos, m]) => (
            <div key={pos} className="rounded-[--radius-sm] border border-border bg-surface p-2 text-center">
              <div className="text-meta text-secondary">{pos}</div>
              <div className="figure text-body leading-relaxed font-semibold text-ink">{m.toFixed(2)}×</div>
            </div>
          ))}
        </div>
      </Card>

      <SectionHeader title="4 · Injury - by body part, note and age" />
      <Card>
        <p className="text-body leading-relaxed text-muted">
          An injury is not one number. The same word means different things to
          different bodies at different ages, so this term reads what actually
          happened and how old the player was when it did.
        </p>
        <p className="mt-3 rounded-[--radius-sm] bg-bg/60 p-3 text-center font-mono text-note text-accent-text">
          injury = 1 − class × note × status × age
        </p>
        <p className="mt-3 text-body leading-relaxed text-muted">
          Each class penalty below is the share of dynasty value a{" "}
          <span className="text-ink">surgical</span> event in that class costs a{" "}
          {cfg.injury.ageReference}-year-old. The age column is how much that grows
          per decade older, and it is the whole point: an Achilles rupture at 33 is
          often career-altering, at 23 it is a lost season.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[290px] figure text-meta">
            <thead>
              <tr className="border-b border-border text-left text-secondary">
                <th className="py-1 pr-2 font-normal">Class</th>
                <th className="py-1 pr-2 text-right font-normal">Cost</th>
                <th className="py-1 text-right font-normal">/decade</th>
              </tr>
            </thead>
            <tbody>
              {injuryClasses.map((c) => (
                <tr key={c.key} className="border-b border-border">
                  <td className="py-1 pr-2 text-ink">
                    {c.label}
                    {c.parts && (
                      <span className="block text-micro text-faint">{c.parts}</span>
                    )}
                  </td>
                  <td className="py-1 pr-2 text-right text-muted">
                    {Math.round(c.penalty * 100)}%
                  </td>
                  <td className="py-1 text-right text-muted">
                    {c.slope === 0 ? "flat" : `×${(1 + c.slope).toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-2">
        <div className="grid grid-cols-2 gap-4 text-body leading-relaxed">
          <div>
            <div className="mb-1 text-meta uppercase tracking-wide text-secondary">
              Note (vs surgery)
            </div>
            <ul className="space-y-0.5 font-mono text-note leading-snug text-muted">
              {Object.entries(cfg.injury.noteScale).map(([k, v]) => (
                <li key={k}>
                  {k}: {v.toFixed(2)}×
                </li>
              ))}
              <li className="text-secondary">
                none: {cfg.injury.noteMissingScale.toFixed(2)}×
              </li>
            </ul>
          </div>
          <div>
            <div className="mb-1 text-meta uppercase tracking-wide text-secondary">
              Status
            </div>
            <ul className="space-y-0.5 font-mono text-note leading-snug text-muted">
              {Object.entries(cfg.injury.statusScale).map(([k, v]) => (
                <li key={k}>
                  {k}: {v.toFixed(2)}×
                </li>
              ))}
              <li className="text-secondary">healthy: 1.00×</li>
            </ul>
          </div>
        </div>
        <p className="mt-3 text-note leading-relaxed text-secondary">
          Status barely moves anything, on purpose. Sleeper marks {liveDtdShare}
          {" "}of all flagged NBA players &quot;DTD&quot;, and that bucket holds both a
          bruised quad and a ruptured Achilles. A field that calls a season-ending
          injury day-to-day cannot be trusted to say how bad something is.
        </p>
      </Card>

      <Card className="mt-2">
        <p className="text-body leading-relaxed font-semibold text-ink">
          What this cannot see
        </p>
        <p className="mt-1.5 text-body leading-relaxed text-muted">
          Only the injury a player is carrying <span className="text-ink">today</span>.
          Sleeper publishes no injury history at all: no past injuries, no dates, no
          games missed. So a 28-year-old with three back surgeries behind him and no
          current flag prices at a clean 1.00×, exactly like a 22-year-old who has
          never been hurt.
        </p>
        <p className="mt-2 text-body leading-relaxed text-muted">
          That is a real hole and it is left open on purpose. Filling it would mean
          inventing a history the data does not contain, or hardcoding a list of
          players we happen to think are fragile. An acknowledged gap beats a
          confident guess.
        </p>
      </Card>

      <SectionHeader title="5 · Role" />
      <Card>
        <ul className="space-y-0.5 font-mono text-note leading-snug text-muted">
          <li>starter: {cfg.role.starter}×</li>
          <li>2nd unit: {cfg.role.secondary}×</li>
          <li>bench: {cfg.role.bench}×</li>
        </ul>
      </Card>

      <SectionHeader title="6 · Draft picks - slot-aware, lottery-aware" />
      <Card>
        <p className="text-body leading-relaxed text-muted">
          Picks are NOT priced by round. The 1.01 and the 1.{String(teams).padStart(2, "0")}{" "}
          are wildly different assets, so value decays exponentially over the OVERALL
          pick number, toward a floor:
        </p>
        <p className="mt-2 rounded-[--radius-sm] bg-bg/60 p-2.5 text-center font-mono text-note text-accent-text">
          value = {cfg.pick.floor} + ({cfg.pick.topPickValue.toLocaleString()} − {cfg.pick.floor}) · e^(−{cfg.pick.slotDecay} · (overall − 1))
        </p>
        <LineChart data={slotSamples} format={(n) => n.toLocaleString()} />
        <p className="mt-1 text-center text-meta text-secondary">
          The raw slot curve across all {rounds} rounds ({teams * rounds} picks), before
          time and class adjustments.
        </p>
      </Card>

      <Card className="mt-2">
        <p className="text-body leading-relaxed font-semibold text-ink">Which slot? A distribution, not a guess.</p>
        <ul className="mt-1.5 space-y-1.5 text-body leading-relaxed text-muted">
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
              className="flex items-baseline justify-between gap-2 rounded-[--radius-sm] border border-border bg-surface px-2.5 py-1.5"
            >
              <span className="min-w-0 truncate text-note text-ink">{e.label}</span>
              <span className="shrink-0 figure text-note text-muted">
                <span className="font-semibold text-ink">{e.now.toLocaleString()}</span> now
                · {e.later.toLocaleString()} in 2yr
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-2">
        <p className="text-body leading-relaxed font-semibold text-ink">Class strength - subjective, on purpose.</p>
        <p className="mt-1 text-body leading-relaxed text-muted">
          A class can be strong at the very top (a generational talent lifts the 1.01 and
          almost nothing else) or deep (the middle and late picks lift while the top is
          ordinary). Each season carries a <span className="font-mono">top</span> and{" "}
          <span className="font-mono">depth</span> multiplier, interpolated by where the
          pick sits. Converting consensus opinion about a class into value is a real part
          of pick trading; these are exposed so they can be argued with rather than buried.
        </p>
        <ul className="mt-2 space-y-0.5 font-mono text-note leading-snug text-muted">
          {classEntries.length === 0 && <li>all classes currently neutral (1.0 / 1.0)</li>}
          {classEntries.map(([season, s]) => (
            <li key={season}>
              {season}: top {(s.top ?? 1).toFixed(2)}× · depth {(s.depth ?? 1).toFixed(2)}×
            </li>
          ))}
          <li>any unlisted season: neutral (1.0 / 1.0)</li>
        </ul>
      </Card>

      <SectionHeader title="7 · Timelines - Dynasty Duration & TCI" />
      <Card>
        <p className="text-body leading-relaxed text-muted">
          Every asset is a claim on production at some point in TIME. Borrowing Macaulay
          duration from fixed income, each asset&apos;s{" "}
          <span className="font-semibold text-ink">duration</span> is the value-weighted
          average number of seasons until it pays out - the age curve is the payout
          profile, and a pick is the wait until it converts plus the duration of the
          rookie it becomes.
        </p>
        <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
          {durationExamples.map((e) => (
            <div key={e.label} className="rounded-[--radius-sm] border border-border bg-surface p-2">
              <div className="text-meta leading-tight text-secondary">{e.label}</div>
              <div className="mt-0.5 figure text-body leading-relaxed font-semibold text-ink">
                {e.d.toFixed(1)}s
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-body leading-relaxed text-muted">
          A roster&apos;s duration says WHEN its value arrives. The{" "}
          <span className="font-semibold text-ink">Timeline Coherence Index</span> says
          whether its assets AGREE: it is the value-weighted dispersion of duration,
          inverted onto 0-100.
        </p>
        <p className="mt-2 rounded-[--radius-sm] bg-bg/60 p-2.5 text-center font-mono text-note text-accent-text">
          TCI = 100 · (1 − min(1, dispersion / 3))
        </p>
        <ul className="mt-2 space-y-1.5 text-body leading-relaxed text-muted">
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
          <li>
            <span className="font-semibold text-ink">
              Which makes posture a forced curve, and that is worth saying.
            </span>{" "}
            Because the cutoffs are quartiles, about a quarter of coherent rosters are
            labelled contending in every league, however that league is built.
            &ldquo;Contending&rdquo; is the claim that you are in the shortest-dated
            quarter of THIS league, not that you are ready to win a title. Read it as a
            rank, because that is what it is.
          </li>
          <li>
            <span className="font-semibold text-ink">
              The index is on one formula, not proven to be on one scale.
            </span>{" "}
            A roster&apos;s TCI depends only on its own assets, so the same roster scores
            the same anywhere and two readings of this league can be subtracted. But the
            3 in that formula was calibrated to the dispersion actually observed across
            this league&apos;s fourteen rosters, so comparing a TCI here against one from
            a league of a different size or shape is not something we have established.
          </li>
        </ul>
        <p className="mt-2 text-meta leading-relaxed text-secondary">
          This is only computable because players and picks are valued on one common
          scale (sections 1-5). See the league quadrant on the League page.
        </p>
      </Card>

      <SectionHeader title="8 · Fragility - the RFI" />
      <Card>
        <p className="text-body leading-relaxed text-muted">
          Duration says WHEN a roster&apos;s value arrives; the{" "}
          <span className="font-semibold text-ink">Roster Fragility Index</span> asks
          what breaks first. Two rosters can hold the same value on the same timeline
          and be in completely different danger: one loses its season the night a knee
          goes, the other re-solves around the loss. RFI is three measurements of that
          difference, weighted and combined onto 0-100, higher = more fragile:
        </p>
        <p className="mt-2 rounded-[--radius-sm] bg-bg/60 p-2.5 text-center font-mono text-note text-accent-text">
          RFI = 100 · ({W_LOO} · damage + {W_CONCENTRATION} · concentration +{" "}
          {W_EXPOSURE} · exposure)
        </p>
        <ul className="mt-2 space-y-1.5 text-body leading-relaxed text-muted">
          <li>
            <span className="font-semibold text-ink">Leave-one-out damage
            ({W_LOO}).</span> Delete each player, RE-SOLVE the best legal lineup out
            of who is left, and measure the startable value lost - so a star with a
            real backup shows small damage, and the biggest loss names your single
            point of failure. Scored on the top {LOO_TOP_K} damages together. Weighted
            heaviest because it is the only component that runs an actual
            counterfactual.
          </li>
          <li>
            <span className="font-semibold text-ink">Concentration
            ({W_CONCENTRATION}).</span> A normalized Herfindahl-Hirschman index over
            starter-weighted value - the shape of the whole distribution, which
            leave-one-out cannot see. A roster whose stars are individually
            replaceable can still hold every real point of value in four men.
          </li>
          <li>
            <span className="font-semibold text-ink">Availability exposure
            ({W_EXPOSURE}).</span> How much value sits in bodies that may not play,
            priced with the value model&apos;s own injury term and the duration
            curve&apos;s age taper, so the three models cannot disagree. Weighted
            least: injury status is a snapshot that can change in a day, so it
            adjusts the index rather than driving it.
          </li>
        </ul>
        <p className="mt-3 text-body leading-relaxed text-muted">
          <span className="font-semibold text-ink">What it refuses to count.</span>{" "}
          Picks are excluded: a future first cannot fill a lineup slot tonight, and
          folding pick capital in would make the most extreme teardown in the league
          read as robust, which is the opposite of true. And RFI is not a quality
          score - low fragility is not the same as good. A torn-down roster with
          nothing to lose scores mid-pack, because there is nothing left to fail.
        </p>
        <p className="mt-2 text-meta leading-relaxed text-secondary">
          Bands (resilient / balanced / brittle) are league-relative quartiles, for
          the same reason posture is: brittle only means something next to the
          rosters you actually have to beat. Each reference constant was calibrated
          against the observed spread of a real 14-team league, not a theoretical
          worst case.
        </p>
      </Card>

      <p className="mt-6 text-center text-meta leading-relaxed text-secondary">
        Player and pick constants live in <span className="font-mono">lib/valuation/config.ts</span>;
        the timeline math in <span className="font-mono">lib/metrics/duration.ts</span>;
        fragility in <span className="font-mono">lib/metrics/fragility.ts</span>.
        Ranking tiers are not part of the model - they break where the value distribution
        actually cliffs, instead of at fixed thresholds. A crowdsourced vote-driven market
        is intentionally deferred until there&apos;s enough participation to trust it.
      </p>
      <Onward from="/methodology" />
    </div>
  );
}
