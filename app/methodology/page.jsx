import { getLeagueHistory } from "@/lib/history";
import { loadDraftOrderFidelity } from "@/lib/agency/source";
import { VALUATION_CONFIG } from "@/lib/valuation/config";
import {
  AGE_CURVE_PROVENANCE,
  CURVE_SUPPORTED_MAX,
  CURVE_SUPPORTED_MIN,
  DERIVED_AGE_CURVE,
  DERIVED_PRODUCTION,
  INJURY_CLASS_LABELS,
  PRODUCTION_PROVENANCE,
  STAR_AGE_ADJUSTMENT,
  STAR_AGE_ADJUSTMENT_PROVENANCE,
  STAR_SEARCH_RANK_CUTOFF,
  ageMultiplier,
  firstCliffAge,
  pickValue,
  cachedValuePlayers,
  cachedNoProductionValuePlayers,
  positionMultipliers,
  slotValue,
} from "@/lib/valuation";
import { deriveExitWindow } from "@/lib/valuation/exitWindow";
import {
  PRODUCTION_R2,
  productionBackingRefusal,
  rosteredWeeksBelowFloor,
} from "@/lib/valuation/production";
import { injuryLabel } from "@/lib/valuation/injury";
import { refusalSentence } from "@/lib/refusal";
import { VALUE_ROWS } from "@/lib/values/url";
import { pickDuration, playerDuration } from "@/lib/metrics/duration";
import {
  W_LOO,
  W_CONCENTRATION,
  W_EXPOSURE,
  LOO_TOP_K,
} from "@/lib/metrics/fragility";
import { baseCurveSamples, pickWalkthroughExample } from "@/lib/methodology";
import { PageHeader, Card } from "@/components/ui";
import { LineChart } from "@/components/charts";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Onward } from "@/components/Onward";
import { RefusalMark } from "@/components/RefusalMark";
import { ProductionEvidence } from "@/components/ProductionEvidence";
import { ProductionMovers } from "@/components/ProductionMovers";
import { MethodologyWalkthrough } from "@/components/MethodologyWalkthrough";
export const dynamic = "force-dynamic";
/**
 * TEN SECTIONS, EACH A DOOR. This page used to print every subsection's charts,
 * tables and prose fully open, one after another - a first-time reader's page and
 * a "wait, how is injury priced again" reference page were forced to be the same
 * length. They are not: the formula card above stays open always (it is the one
 * sentence every reader needs), the first two subsections (base value, the
 * measured age curve) arrive open because they are what most readers came for,
 * and the rest - the market half, position, injury, role, picks, timelines,
 * fragility - are one tap away rather than a scroll away. Nothing here is
 * shortened or removed; `SECTION_LINKS` below is only a map of what is already
 * on the page.
 */
const SECTION_LINKS = [
  { id: "base", label: "1 · Base value" },
  { id: "production", label: "1a · Production" },
  { id: "age", label: "2 · Age curve" },
  { id: "star", label: "2a · Star tier" },
  { id: "market", label: "2b · Market" },
  { id: "position", label: "3 · Position" },
  { id: "injury", label: "4 · Injury" },
  { id: "role", label: "5 · Role" },
  { id: "picks", label: "6 · Picks" },
  { id: "timelines", label: "7 · Timelines" },
  { id: "fragility", label: "8 · Fragility" },
];
function Subsection({ id, title, defaultOpen, children }) {
  return (
    <details id={id} className="group mt-4 scroll-mt-3" open={defaultOpen || undefined}>
      <summary className="mb-1.5 flex min-h-11 cursor-pointer list-none items-center gap-1.5">
        <ChevronRight
          size={13}
          aria-hidden="true"
          className="disclosure-chevron shrink-0 text-faint group-open:rotate-90"
        />
        <h2 className="min-w-0 text-note font-semibold uppercase tracking-[0.16em] text-muted">
          {title}
        </h2>
      </summary>
      <div className="disclosure-body space-y-2">{children}</div>
    </details>
  );
}
export default async function MethodologyPage() {
  const h = await getLeagueHistory();
  /*
   * WHETHER THIS LEAGUE'S DRAFT ORDER ACTUALLY IS REVERSE STANDINGS, measured rather than
   * assumed. This paragraph used to sit inside the pick-agency panel on /roster, which is
   * the wrong page for it twice over: it qualifies the PRICING MODEL documented in this
   * section, and it was long enough that the panel spent real vertical space on a footnote
   * whose reader was already here. /roster keeps one line and a link to it.
   *
   * No requests added (D25): `loadDraftOrderFidelity` reads the TTL-memoized draft index
   * and the per-season rosters, both of which this page's own corpus load already pays
   * for.
   */
  const orderFidelity = await loadDraftOrderFidelity(h);
  const scoring = h.currentLeague.scoringSettings;
  const cfg = VALUATION_CONFIG;
  const posMults = positionMultipliers(scoring);
  const baseExamples = [1, 10, 25, 50, 100, 150, 220].map((rank) => ({
    label: `#${rank}`,
    value: Math.round(cfg.maxValue * Math.exp(-cfg.rankDecay * (rank - 1))),
  }));
  // PRODUCTION COVERAGE, counted off the live corpus rather than restated from the
  // derivation's own run notes. The point of this page is that the model is auditable;
  // a coverage claim a reader cannot check against today's rosters is not auditable.
  // Free of extra cost: `cachedValuePlayers` is the same memoized map every other
  // surface already reads (D25).
  const valued = cachedValuePlayers(h);
  const rosteredIds = [...new Set(h.rosters.flatMap((r) => r.players))];
  const priced = rosteredIds
    .map((id) => ({ id, v: valued.get(id), p: h.players.get(id) }))
    .filter((x) => x.v);
  const backed = priced.filter((x) => x.v.productionBacked);
  const unbacked = priced.filter((x) => !x.v.productionBacked);
  const backedPct = priced.length
    ? Math.round((1000 * backed.length) / priced.length) / 10
    : 0;
  // The largest disagreements, which is the honest way to show what a 23% weight buys:
  // not "values changed" in the abstract, but these players, by this much, for this
  // reason.
  //
  // Sorted by the change in VALUE, not by the change in rank. Rank movement is a bad
  // illustration here and it is worth saying why: `base` decays exponentially, so the
  // same 80-place move is worth thousands of points at the top of the board and single
  // digits at the bottom - ranking by places moved fills the list with deep-bench
  // players nobody is pricing.
  //
  // THE COUNTERFACTUAL IS NOW THE MODEL, NOT THE ALGEBRA. This used to derive `wasValue`
  // from one exponential, which is correct to within the rounding and was fine while the
  // two numbers only ever appeared in a sentence. They are drawn now, and a dumbbell
  // claims its dots are where the model puts them - so both ends come from a real run.
  // See `cachedNoProductionValuePlayers`.
  const withoutProduction = cachedNoProductionValuePlayers(h);
  const population = priced
    .map((x) => {
      const was = withoutProduction.get(x.id)?.value ?? x.v.value;
      return {
        id: x.id,
        name: x.p?.fullName ?? x.id,
        now: x.v.value,
        was,
        move: x.v.value - was,
        injury: injuryLabel(
          {
            status: x.p?.injuryStatus,
            bodyPart: x.p?.injuryBodyPart,
            notes: x.p?.injuryNotes,
          },
          { short: true },
        ),
      };
    });
  // `population` IS EVERY ROSTERED PLAYER, with no value filter. A player priced at
  // zero is still a rostered player who did not move, and dropping him would quietly
  // shrink the denominator the strip's caption prints - "225 of 246" beside an injury
  // line reading "48 of 250" is two different populations in one paragraph.
  //
  // The named list is ten, across BOTH directions, on one axis - see
  // components/ProductionMovers.jsx for why this stopped being two lists of five - and
  // holds only players who ACTUALLY moved. On a corpus whose ids the production table
  // does not cover (the fixture provider, or any pool under `MIN_BLEND_POOL`) nothing
  // blends and every move is zero; ten rows of two coincident dots would draw a
  // comparison that was never made.
  const movers = [...population]
    .filter((x) => x.move !== 0)
    .sort((a, b) => Math.abs(b.move) - Math.abs(a.move))
    .slice(0, 10);
  // The ceiling the movers axis is anchored to: the top price this league actually
  // carries, off the same map /values ranks. Not `cfg.maxValue`, which is `base(1)`
  // before any multiplier and is reached by nobody.
  const valueCeiling = Math.max(...[...valued.values()].map((v) => v.value), 0);
  // WHAT SHARE OF THE BOARD /values ACTUALLY DRAWS rests on production - counted over
  // the same rows that page renders, not over the rostered set.
  //
  // This is a materially worse number than the rostered share and it belongs on the
  // page for exactly that reason: /values ranks the top VALUE_ROWS of the whole corpus,
  // so it is full of highly-ranked prospects this league has never rostered and the
  // table therefore cannot price. Reporting only the rostered 98% while the board a
  // reader is looking at is nearer 81% would be picking the flattering denominator.
  const rankedRows = [...valued.values()]
    .filter((v) => v.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, VALUE_ROWS);
  const rankedBacked = rankedRows.filter((v) => v.productionBacked).length;
  const rankedPct = rankedRows.length
    ? Math.round((1000 * rankedBacked) / rankedRows.length) / 10
    : 0;
  const flaggedTotal = priced.filter(
    (x) =>
      injuryLabel(
        {
          status: x.p?.injuryStatus,
          bodyPart: x.p?.injuryBodyPart,
          notes: x.p?.injuryNotes,
        },
        { short: true },
      ) != null,
  ).length;
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
  const slotSamples = [
    1,
    2,
    4,
    7,
    10,
    teams,
    teams + Math.ceil(teams / 2),
    teams * 2,
    teams * 3,
  ]
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
  const partsByClass = new Map();
  for (const [part, k] of Object.entries(cfg.injury.bodyPartClass)) {
    partsByClass.set(k, [...(partsByClass.get(k) ?? []), part]);
  }
  const injuryClasses = Object.keys(cfg.injury.classPenalty)
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
    flagged.length > 0
      ? `${Math.round((dtd / flagged.length) * 100)}%`
      : "most";
  const durationExamples = [
    { label: "21-year-old", d: playerDuration(21) },
    { label: "27-year-old", d: playerDuration(27) },
    { label: "33-year-old", d: playerDuration(33) },
    { label: "1st two seasons out", d: pickDuration(2) },
  ];
  /*
   * THE PINNED WALKTHROUGH (VISION.md M9): one real asset's price, drawn once and
   * carried through six steps as the reader scrolls, instead of the formula printed
   * as a sentence with no picture attached. `pickWalkthroughExample` and
   * `baseCurveSamples` are pure functions of the SAME `valued`/`h.players` maps every
   * other section on this page already reads (D25 - no request added), so the example
   * is a real rostered asset on today's board, not a synthetic one.
   *
   * Null only when the corpus has nobody with both a positive value and a search
   * rank - the fixture provider always clears that bar, and a real league does too
   * once a single player is priced - so the walkthrough is skipped rather than
   * printing a broken chart in the one theoretical case it is not.
   */
  const walkthroughExample = pickWalkthroughExample(valued, h.players);
  const walkthroughCurve = baseCurveSamples();
  const walkthroughModel = walkthroughExample && {
    example: walkthroughExample,
    curve: walkthroughCurve,
    maxBase: walkthroughCurve[0].base,
    productionWeight: cfg.productionWeight,
    ceiling: valueCeiling,
  };
  const walkthroughSteps = walkthroughExample && [
    {
      id: "rank",
      kicker: "1 · Base value",
      title: "Value starts as a rank, bent through an exponential",
      body: (
        <p className="text-body leading-relaxed text-muted">
          <span className="text-ink">{walkthroughExample.name}</span> sits at
          consensus rank{" "}
          <span className="figure text-ink">#{walkthroughExample.searchRank}</span>,
          which prices at{" "}
          <span className="figure text-ink">
            {walkthroughExample.consensusBase.toLocaleString()}
          </span>{" "}
          on the curve above - studs are scarce, so value decays exponentially with
          rank rather than in a straight line.
        </p>
      ),
    },
    {
      id: "production",
      kicker: "1a · In-league production",
      title: "The rank is a blend, and the blend can move it",
      body: (
        <p className="text-body leading-relaxed text-muted">
          {Math.round(cfg.productionWeight * 100)}% of the rank comes from what he has
          actually banked in this league, not just consensus opinion.{" "}
          {walkthroughExample.rank !== walkthroughExample.searchRank ? (
            <>
              For {walkthroughExample.name} that moves the working rank to{" "}
              <span className="figure text-ink">#{walkthroughExample.rank}</span> -
              base{" "}
              <span className="figure text-ink">
                {walkthroughExample.base.toLocaleString()}
              </span>{" "}
              instead of{" "}
              <span className="figure text-ink">
                {walkthroughExample.consensusBase.toLocaleString()}
              </span>
              , the gap between the hollow and filled dot above.
            </>
          ) : (
            <>
              For {walkthroughExample.name} the blend leaves the rank exactly where
              consensus had it - production agreed.
            </>
          )}
        </p>
      ),
    },
    {
      id: "age",
      kicker: "2 · Age curve",
      title: "Base value is bent by an age multiplier, measured from real careers",
      body: (
        <p className="text-body leading-relaxed text-muted">
          At {walkthroughExample.age ?? "an unstated"} years old,{" "}
          {walkthroughExample.name} carries an age multiplier of{" "}
          <span className="figure text-ink">
            ×{walkthroughExample.ageMultiplier.toFixed(2)}
          </span>{" "}
          - read off {AGE_CURVE_PROVENANCE.playerSeasons.toLocaleString()} real NBA
          player-seasons, not hand-set.
        </p>
      ),
    },
    {
      id: "injury",
      kicker: "4 · Injury",
      title: "A current injury flag prices forward risk, not history",
      body: (
        <p className="text-body leading-relaxed text-muted">
          {walkthroughExample.injuryMultiplier !== 1 ? (
            <>
              A current flag charges {walkthroughExample.name} an injury multiplier of{" "}
              <span className="figure text-ink">
                ×{walkthroughExample.injuryMultiplier.toFixed(2)}
              </span>
              .
            </>
          ) : (
            <>
              {walkthroughExample.name} carries no current injury flag, so this term is{" "}
              <span className="figure text-ink">×1.00</span> - a no-op, not an
              assumption of full health forever.
            </>
          )}
        </p>
      ),
    },
    {
      id: "rolepos",
      kicker: "3 · Position · 5 · Role",
      title: "Depth-chart role and scoring position bend the price two more times",
      body: (
        <p className="text-body leading-relaxed text-muted">
          Role sits at{" "}
          <span className="figure text-ink">
            ×{walkthroughExample.roleMultiplier.toFixed(2)}
          </span>{" "}
          and position at{" "}
          <span className="figure text-ink">
            ×{walkthroughExample.positionMultiplier.toFixed(2)}
          </span>{" "}
          for {walkthroughExample.name}
          {walkthroughExample.position ? ` (${walkthroughExample.position})` : ""} -
          this league&apos;s own scoring settings decide what a position is worth here.
        </p>
      ),
    },
    {
      id: "value",
      kicker: "The output",
      title: "Every term multiplies onto one price - never a grade",
      body: (
        <p className="text-body leading-relaxed text-muted">
          {walkthroughExample.name} prices at{" "}
          <span className="figure text-ink">
            {walkthroughExample.value.toLocaleString()}
          </span>
          , against a ceiling of{" "}
          <span className="figure text-ink">{valueCeiling.toLocaleString()}</span> on
          today&apos;s board. That is a measurement of dynasty value under this
          league&apos;s settings, not a verdict on the player - the sections below
          are the same arithmetic, opened out in full.
        </p>
      ),
    },
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

      {walkthroughModel ? (
        <div className="mb-4">
          <MethodologyWalkthrough model={walkthroughModel} steps={walkthroughSteps} />
        </div>
      ) : (
        // The theoretical no-example case (see the comment above walkthroughModel):
        // the formula still needs to be SAID somewhere, so it falls back to the
        // sentence-plus-equation form the walkthrough replaced.
        <Card className="mb-4">
          <p className="text-body leading-relaxed text-ink">
            A player&apos;s dynasty value is a base value from a rank, bent by
            four multipliers. The rank is part consensus opinion and part what he
            has actually produced in this league:
          </p>
          <p className="mt-3 rounded-[--radius-sm] bg-bg/60 p-3 text-center font-mono text-body text-accent-text">
            value = base(rank) × age × injury × role × position
          </p>
          <p className="mt-3 rounded-[--radius-sm] bg-bg/60 p-3 text-center font-mono text-body text-accent-text">
            rank = {Math.round((1 - cfg.productionWeight) * 100)}% consensus rank
            + {Math.round(cfg.productionWeight * 100)}% in-league production
          </p>
        </Card>
      )}

      {/* Jump rail: nine subsections is a long page - let people land on one
            rather than scroll every closed header on the way past. */}
      <nav aria-label="Sections" className="mt-2 flex flex-wrap gap-1.5">
        {SECTION_LINKS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-2.5 text-note font-medium text-ink transition-colors hover:border-border-strong hover:bg-surface-2"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <Subsection id="base" title="1 · Base value from consensus rank" defaultOpen>
      <Card>
        <p className="mb-3 text-body leading-relaxed text-muted">
          Value decays exponentially with rank (studs are scarce):
          <span className="font-mono text-ink">
            {" "}
            base = {cfg.maxValue.toLocaleString()} · e^(−{cfg.rankDecay} ·
            (rank−1))
          </span>
        </p>
        <LineChart data={baseExamples} format={(n) => n.toLocaleString()} />
      </Card>
      </Subsection>

      <Subsection id="production" title="1a · In-league production" defaultOpen>
      <Card>
        <p className="text-body leading-relaxed text-muted">
          The rank above used to be Sleeper&apos;s <span className="text-ink">search_rank</span>{" "}
          and nothing else. That is a <span className="text-ink">redraft popularity
          ordinal</span> - how eagerly people draft a player this year - and it is not a
          measurement of how anyone played. Every other number in this app descended from
          it, so the model priced assets without a single per-player input about
          production.
        </p>
        <p className="mt-3 text-body leading-relaxed text-muted">
          It now blends in what a player has actually banked{" "}
          <span className="text-ink">here</span>. This league runs Sleeper&apos;s lock-in
          format, so a week&apos;s score is one game, and the index is the mean points a
          player banked per rostered week - zeros included, because a week on a roster
          that scored nothing is a real zero - normalised so{" "}
          <span className="font-mono text-ink">1.000</span> is an average qualifying
          player-season, across{" "}
          {PRODUCTION_PROVENANCE.seasons.slice().reverse().join(" and ")} at{" "}
          {PRODUCTION_PROVENANCE.recency.join(" / ")}. That is{" "}
          {PRODUCTION_PROVENANCE.playerWeeks.toLocaleString()} player-weeks across{" "}
          {PRODUCTION_PROVENANCE.playerSeasons} player-seasons, read once offline and
          committed as a table of {DERIVED_PRODUCTION.length} players.
        </p>
      </Card>

      <Card className="mt-2">
        <h3 className="text-note font-semibold uppercase tracking-[0.16em] text-muted">
          The weight is {Math.round(cfg.productionWeight * 100)}%, and the first
          measurement said zero
        </h3>
        <p className="mt-2 text-body leading-relaxed text-muted">
          Asked the obvious question first: does past production here predict{" "}
          <span className="text-ink">next season&apos;s</span>{" "}
          production better than the consensus ordinal does? It does not, and it is not close - the ordinal scored
          ρ 0.590 against production&apos;s 0.420, and the partial correlation of
          production given the ordinal was −0.05. Sleeper&apos;s number is a live human
          forecast that already knows about injuries, trades and role changes. On a
          one-season question it wins.
        </p>
        <p className="mt-3 text-body leading-relaxed text-muted">
          But a dynasty value is not a one-season question. Re-run against the discounted
          sum of the <span className="text-ink">following three seasons</span> - counting
          a season a player did not produce in as a zero, the same survivorship rule the
          age curve uses - and production carries information the ordinal does not. Both
          runs are below, on one scale:
        </p>
        <div className="mt-3">
          <ProductionEvidence />
        </div>
        <p className="mt-3 text-body leading-relaxed text-muted">
          The standardised weight that falls out of the second run is{" "}
          <span className="font-mono text-ink">0.233</span>, and that is the weight used,
          unrounded. R² goes from{" "}
          <span className="font-mono text-ink">
            {PRODUCTION_R2.ordinal.toFixed(3)}
          </span>{" "}
          to{" "}
          <span className="font-mono text-ink">
            {PRODUCTION_R2.withProduction.toFixed(3)}
          </span>{" "}
          -
          stated here and deliberately not drawn, because a{" "}
          {(
            (PRODUCTION_R2.withProduction - PRODUCTION_R2.ordinal) *
            100
          ).toFixed(1)}
          -point move between two numbers that large is invisible on an honest axis and
          only becomes visible on a dishonest one.
        </p>
        <p className="mt-3 text-body leading-relaxed text-muted">
          <span className="text-ink">
            Both figures are optimistic, and not by an amount anyone here has measured.
          </span>{" "}
          The consensus ordinal is a snapshot taken today, and it postdates part of the
          window it is being scored over - so it was graded with hindsight on the very
          seasons it is supposed to be predicting, and production was not. That tilts the
          comparison toward the ordinal, which makes{" "}
          <span className="font-mono text-ink">0.233</span> a floor; it also inflates the
          0.889 the ordinal scores, so the gap between the two is overstated as well. How
          much on either count is unknown. There is no correction applied here and no
          range drawn for one, because a bound nobody measured is not a bound.
        </p>
      </Card>

      <Card className="mt-2">
        <h3 className="text-note font-semibold uppercase tracking-[0.16em] text-muted">
          It changes who sits where, never the scale
        </h3>
        <p className="mt-2 text-body leading-relaxed text-muted">
          Production is not a fifth multiplier. The two ranks are blended as percentiles,
          the blendable players are re-ordered, and each is then handed the rank belonging
          to his new position <span className="text-ink">in that same set</span>. The
          ranks coming out are exactly the ranks that went in, reshuffled - so the
          collection of values in this league is unchanged and only the assignment moves.
          Nothing was rescaled, which is deliberate: production earned a claim about who
          should be ahead of whom, and no claim at all about what a dynasty asset is worth
          in points.
        </p>
      </Card>

      <Card className="mt-2">
        <h3 className="text-note font-semibold uppercase tracking-[0.16em] text-muted">
          What it moved
        </h3>
        <div className="mt-2">
          <ProductionMovers
            moves={movers}
            population={population}
            ceiling={valueCeiling}
            flaggedTotal={flaggedTotal}
            pricedTotal={priced.length}
          />
        </div>
      </Card>

      <Card className="mt-2">
        <h3 className="text-note font-semibold uppercase tracking-[0.16em] text-muted">
          Which prices rest on production, and which do not
        </h3>
        <p className="mt-2 text-body leading-relaxed text-muted">
          Of the {priced.length} players currently rostered in this league,{" "}
          <span className="text-ink">{backed.length}</span> ({backedPct}%) are priced with
          a real production record. {unbacked.length === 0 ? "Every one of them is." : null}
        </p>
        {unbacked.length > 0 ? (
          <div className="mt-3">
            {/* The sentence moved into lib/valuation/production.js. The condition it
                describes lives there (eight rostered weeks, `productionBacked`), so the
                words belong there too - a page that writes its own reason string is a
                page that can drift from the flag it is describing. */}
            <RefusalMark>
              <span className="text-body leading-relaxed text-muted">
                {refusalSentence(
                  productionBackingRefusal(unbacked.length, priced.length),
                )}
              </span>
            </RefusalMark>
            {/* THE WEEK COUNT, not just the exclusion. "No eight-week record" and
                "four rostered weeks against a floor of eight" are the same condition,
                but only the second lets a reader judge whether the floor is the right
                floor. `BELOW_FLOOR_WEEKS` exists to supply it; a null means this league
                never rostered him in the window at all, which reads differently and
                must never be printed as a zero. */}
            <ul className="mt-2 space-y-0.5">
              {unbacked.map((x) => {
                const weeks = rosteredWeeksBelowFloor(x.id);
                return (
                  <li key={x.id} className="text-body text-muted">
                    <span className="text-ink">{x.p?.fullName ?? x.id}</span>
                    <span className="text-faint">
                      {" "}
                      ·{" "}
                      {weeks != null
                        ? `${weeks} rostered ${weeks === 1 ? "week" : "weeks"}, floor is ${PRODUCTION_PROVENANCE.minWeeks}`
                        : "never rostered here in the window"}{" "}
                      · consensus #{x.v.searchRank} · value{" "}
                      {x.v.value.toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <p className="mt-3 text-body leading-relaxed text-muted">
          That share is high for a temporary reason, and it is stated as a fraction rather
          than drawn as a full ring or a near-complete bar on purpose: those shapes assert
          &ldquo;essentially done&rdquo;, and this one is about to stop being true. The{" "}
          {h.currentLeague.season} rookie draft has not run yet, so every roster is still
          last season&apos;s roster. Once it runs, every rookie taken will be a player
          this table cannot price, and {backedPct}% will fall on its own.
        </p>
        <p className="mt-3 text-body leading-relaxed text-muted">
          <span className="text-ink">
            And {backedPct}% is the rostered share, which is the most flattering
            denominator available.
          </span>{" "}
          The board on <Link href="/values" className="text-accent-text underline decoration-border underline-offset-2">/values</Link>{" "}
          ranks the top {rankedRows.length} players by value across the whole{" "}
          {h.players.size.toLocaleString()}-player corpus, not just the ones somebody
          rosters - and{" "}
          <span className="text-ink">
            {rankedBacked} of those {rankedRows.length} ({rankedPct}%)
          </span>{" "}
          rest on a production record. The {rankedRows.length - rankedBacked} that do not are
          almost entirely incoming prospects who have never been rostered here and, in
          most cases, have not played an NBA game - which is the same coming-rookie gap
          arriving early, on a page that already shows it.
        </p>
        <p className="mt-3 text-body leading-relaxed text-muted">
          Being absent from the table says nothing about a player - this league holds
          around {h.rosters.length * 19} roster spots against roughly 500 NBA players who
          play real minutes, so absence is a fact about fourteen managers, not about him.
        </p>
      </Card>

      <Card className="mt-2">
        <h3 className="text-note font-semibold uppercase tracking-[0.16em] text-muted">
          What it is confounded by
        </h3>
        <ul className="mt-2 space-y-2">
          <li className="text-body leading-relaxed text-muted">
            <span className="text-ink">Opportunity.</span> Minutes are in here. A player
            on a bad team who plays 34 minutes outscores a better player on a deep team
            who plays 22. For a price that is mostly right - fantasy points are what you
            buy - but it is not a talent measure and should not be read as one.
          </li>
          <li className="text-body leading-relaxed text-muted">
            <span className="text-ink">The manager&apos;s lock.</span> In a lock-in league
            the owner picks which game counts, so a started week is production filtered
            through one manager&apos;s choice. Averaging over a season dilutes that; it
            does not remove it.
          </li>
          <li className="text-body leading-relaxed text-muted">
            <span className="text-ink">Who got rostered.</span> Only players someone
            rostered here appear, only for the seasons they were rostered. The seasons in
            a player&apos;s index were chosen by managers, not by us.
          </li>
          <li className="text-body leading-relaxed text-muted">
            <span className="text-ink">Injury, and this one overlaps the injury term.</span>{" "}
            A player hurt for eleven weeks banked eleven zeros, so production charges him
            for an absence the injury multiplier is also looking at. The counts are above,
            with the moves they qualify, rather than filed down here away from them.
            The two terms are not measuring the same thing - the injury multiplier prices
            the forward risk in a current flag and sits near 1.0 for most of them, while
            production records output that did not happen - but on an injured player they
            point the same way, and the combined effect is the largest single limitation
            here. It is stated rather than smoothed, and it is the first thing to
            re-measure.
          </li>
        </ul>
      </Card>
      </Subsection>

      <Subsection id="age" title="2 · Age curve, measured" defaultOpen>
      <Card>
        <LineChart
          data={ageExamples.map((a) => ({
            label: `${a}`,
            value: Math.round(ageMultiplier(a) * 100),
          }))}
          yLabel="age multiplier (%)"
          format={(n) => `${n}%`}
        />
        <p className="mt-3 text-body leading-relaxed text-muted">
          These multipliers used to be hand-set. They are now measured from{" "}
          <span className="figure text-ink">
            {AGE_CURVE_PROVENANCE.playerSeasons.toLocaleString()}
          </span>{" "}
          real NBA player-seasons ({AGE_CURVE_PROVENANCE.firstSeason} through{" "}
          {AGE_CURVE_PROVENANCE.lastSeason}), every one of them scored under
          this league&apos;s own settings. The league is only five seasons old;
          the games are not. Production is taken per 36 minutes and divided by
          that season&apos;s own league mean, so a role change is not read as
          decline and a scoring era is not read as everyone improving. Then the
          same players are followed {AGE_CURVE_PROVENANCE.horizon} seasons
          forward, discounted {AGE_CURVE_PROVENANCE.discountPerSeason} a year.
        </p>
        <p className="mt-2 text-body leading-relaxed text-muted">
          A player who stopped clearing the bar counts as a zero, not as missing
          data. That one choice is the difference between this and the age
          curves that conclude 36-year-olds hold up fine: the 36-year-olds still
          playing do hold up fine, and half of them are not still playing.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-meta">
            <caption className="sr-only">
              Measured age curve: multiplier, sample size and one-season
              survival at each age
            </caption>
            <thead>
              <tr className="text-secondary">
                <th scope="col" className="py-1 pr-2 text-left font-semibold">
                  age
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-semibold">
                  multiplier
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-semibold">
                  n
                </th>
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
                    {r.age === cliff && (
                      <span className="ml-1 text-secondary">▾</span>
                    )}
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
          ▾ marks {cliff}, the steepest single year anywhere before 34, and the
          age the quiet marker on /values and /roster points at. Below{" "}
          {CURVE_SUPPORTED_MIN} and above {CURVE_SUPPORTED_MAX} the curve holds
          flat: past {CURVE_SUPPORTED_MAX} the thinnest sample cell holds
          fifteen careers, which is not enough to draw a line through. The peak
          stays exactly <span className="figure text-ink">{peakAnchor}</span>,
          deliberately - it is folded into the constant every value in this app
          is divided by, so moving it would rescale every price here for no
          reason at all.
        </p>
      </Card>
      </Subsection>

      <Subsection id="star" title="2a · Star-tier adjustment (D74)">
      <Card>
        <p className="text-body leading-relaxed text-muted">
          The curve above is a POPULATION average - it does not condition on talent
          tier at all. Re-running the same derivation split into a top-decile
          &quot;star&quot; cohort (the mean cohort size across the 13 sampled
          seasons, {STAR_AGE_ADJUSTMENT_PROVENANCE.meanCohortPerSeason.toFixed(1)}{" "}
          players a season - roughly a season&apos;s All-NBA plus All-Star pool)
          against everyone else found the two tracking within noise from 21 to 26,
          then diverging cleanly from{" "}
          <span className="figure text-ink">
            {STAR_AGE_ADJUSTMENT_PROVENANCE.appliedFromAge}
          </span>{" "}
          on: a top-decile player keeps materially more of his own current
          production, discounted forward, than an average qualifying player of the
          same age.
        </p>
        <p className="mt-2 text-body leading-relaxed text-muted">
          Applied only where the data is clean (
          {STAR_AGE_ADJUSTMENT_PROVENANCE.appliedFromAge}+, not the noisier 21-26
          span) and only to a player Sleeper&apos;s own live consensus ranks{" "}
          {STAR_SEARCH_RANK_CUTOFF} or better - the same rank the base-value term
          already trusts as this model&apos;s stand-in for &quot;how good a player
          looks right now.&quot; It multiplies onto the ordinary age multiplier
          above; it changes nothing for anyone else.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-meta">
            <caption className="sr-only">
              Star-tier age adjustment: ratio, sample size and thinnest supporting
              horizon cell at each age
            </caption>
            <thead>
              <tr className="text-secondary">
                <th scope="col" className="py-1 pr-2 text-left font-semibold">
                  age
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-semibold">
                  adjustment
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-semibold">
                  n
                </th>
                <th scope="col" className="py-1 text-right font-semibold">
                  thinnest cell
                </th>
              </tr>
            </thead>
            <tbody>
              {STAR_AGE_ADJUSTMENT.map((r) => (
                <tr key={r.age} className="border-t border-border">
                  <th
                    scope="row"
                    className="figure py-1 pr-2 text-left font-normal text-ink"
                  >
                    {r.age}
                  </th>
                  <td className="figure py-1 pr-2 text-right text-ink">
                    ×{r.ratio.toFixed(3)}
                  </td>
                  <td className="figure py-1 pr-2 text-right text-secondary">
                    {r.cohort}
                  </td>
                  <td className="figure py-1 text-right text-secondary">
                    {r.thinnestCell}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-meta leading-snug text-secondary">
          Below {STAR_AGE_ADJUSTMENT_PROVENANCE.appliedFromAge} the adjustment is
          exactly 1.0 - no correction, not because none exists but because the raw
          data there does not clear its own noise. Beyond{" "}
          {STAR_AGE_ADJUSTMENT[STAR_AGE_ADJUSTMENT.length - 1].age} it holds flat
          at the last measured ratio, the same convention the curve above uses past
          its own supported range.
        </p>
      </Card>
      </Subsection>

      <Subsection id="market" title="2b · What this league actually paid">
      <Card>
        <p className="text-body leading-relaxed text-muted">
          The curve above says when production declines. It does not say when{" "}
          <span className="text-ink">this league</span> stops paying, and those
          are different questions. A price is what fourteen people believed on a
          given day, and no amount of box-score arithmetic recovers that for
          seasons the league did not exist for. So this half gets only the five
          seasons it has:{" "}
          <span className="figure text-ink">{market.tradesRead}</span> trades,
          yielding{" "}
          <span className="figure text-ink">{market.acquisitions}</span> usable
          player acquisitions after setting aside {market.sidesPickOnly}{" "}
          pick-only sides, {market.sidesNoPricedCost} with no priced cost, and{" "}
          {market.sidesPickHeavy} where picks outweighed the players.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-meta">
            <caption className="sr-only">
              Realised return by age at the time of the trade, with sample size
              and, for every bucket, the code naming why its ratio is not a
              reading
            </caption>
            <thead>
              <tr className="text-secondary">
                <th scope="col" className="py-1 pr-2 text-left font-semibold">
                  age when traded
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-semibold">
                  n
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-semibold">
                  back per 100 paid
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-semibold">
                  biggest single deal
                </th>
                {/* THE COLUMN THAT MAKES THE OTHER THREE SAFE TO PRINT. Every row
                    here is a refused reading, and before this column the only thing
                    saying so was a paragraph underneath - so a reader who scanned the
                    grid, or copied it, or heard it read out row by row, got four
                    columns of figures with the refusal left behind on the page. The
                    code travels in the row now (`bucket.refusal`, lib/refusal.js). */}
                <th scope="col" className="py-1 text-left font-semibold">
                  reading
                </th>
              </tr>
            </thead>
            <tbody>
              {market.buckets.map((b) => (
                <tr key={b.label} className="border-t border-border">
                  <th
                    scope="row"
                    className="py-1 pr-2 text-left font-normal text-ink"
                  >
                    {b.label}
                  </th>
                  <td className="figure py-1 pr-2 text-right text-ink">
                    {b.n}
                  </td>
                  <td className="figure py-1 pr-2 text-right text-secondary">
                    {b.n ? Math.round(b.ratio * 100) : "-"}
                  </td>
                  <td className="figure py-1 pr-2 text-right text-secondary">
                    {b.n ? `${Math.round(b.concentration * 100)}%` : "-"}
                  </td>
                  <td className="py-1 text-left text-faint">
                    {b.refusal ? b.refusal.code : "calibrated"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* THE REFUSAL WAS ALREADY IN THE DATA AND NOTHING RENDERED IT.
            `deriveExitWindow` has returned a `refusal` since it was written, and this
            page hand-wrote an equivalent paragraph beside it - so the sentence a reader
            saw and the sentence the module produced could drift apart, and did (the
            paragraph said every bucket fails on concentration; the module's own bar
            fails most of them on count first). One string now, from the derivation,
            with the code in front of it and the figure it declined to publish printed
            immediately before the reason that figure cannot be trusted. */}
        {market.refusal && (
          <div className="mt-2">
            <RefusalMark>
              <span className="text-meta leading-snug text-secondary">
                {refusalSentence(market.refusal)}
              </span>
            </RefusalMark>
          </div>
        )}
        <p className="mt-2 text-meta leading-snug text-secondary">
          The table is published anyway, because looking and finding nothing is a
          result, and because the count of trades at each age is itself the thing
          worth knowing.
        </p>
        <p className="mt-2 text-meta leading-snug text-secondary">
          Two limits, stated rather than buried. Everything here is priced at
          today&apos;s value, so it describes how deals turned out, not how they
          were reasoned, and it is not a forecast. And picks are a separate
          model, so a side that was mostly picks is weak evidence about the
          player who came with it; commissioner-run trades record no picks at
          all, which is not detectable and not corrected for.
        </p>
        <p className="mt-2 text-meta leading-snug text-secondary">
          The gap between the two halves is the finding. Production keeps a
          measured schedule:{" "}
          <span className="figure text-ink">{decline29to34}%</span> of a
          player&apos;s dynasty value goes between 29 and 34, and that is what
          the price above already charges him. Whether this league charges the
          same is the part that cannot be answered. The correlation between age
          at the trade and how the deal turned out is{" "}
          <span className="figure text-ink">
            {market.rho != null ? market.rho.toFixed(2) : "-"}
          </span>
          , and its sign is worth nothing: every bucket behind it fails the bar.
          One half of this section rests on{" "}
          {AGE_CURVE_PROVENANCE.playerSeasons.toLocaleString()} player-seasons
          and the other on {market.acquisitions}. Only the first half is allowed
          to move a price.
        </p>
      </Card>
      </Subsection>

      <Subsection id="position" title="3 · Positional value - from YOUR scoring">
      <Card>
        <p className="mb-3 text-body leading-relaxed text-muted">
          Each position&apos;s canonical stat line is scored under this
          league&apos;s actual settings, then normalized. Steals &amp; blocks
          are weighted {scoring.stl ?? 0}× / {scoring.blk ?? 0}× here, which
          lifts the positions that produce them.
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {Object.entries(posMults).map(([pos, m]) => (
            <div
              key={pos}
              className="rounded-[--radius-sm] border border-border bg-surface p-2 text-center"
            >
              <div className="text-meta text-secondary">{pos}</div>
              <div className="figure text-body leading-relaxed font-semibold text-ink">
                {m.toFixed(2)}×
              </div>
            </div>
          ))}
        </div>
      </Card>
      </Subsection>

      <Subsection id="injury" title="4 · Injury - by body part, note and age">
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
          {cfg.injury.ageReference}-year-old. The age column is how much that
          grows per decade older, and it is the whole point: an Achilles rupture
          at 33 is often career-altering, at 23 it is a lost season.
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
                      <span className="block text-micro text-faint">
                        {c.parts}
                      </span>
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
          Status barely moves anything, on purpose. Sleeper marks {liveDtdShare}{" "}
          of all flagged NBA players &quot;DTD&quot;, and that bucket holds both
          a bruised quad and a ruptured Achilles. A field that calls a
          season-ending injury day-to-day cannot be trusted to say how bad
          something is.
        </p>
      </Card>

      <Card className="mt-2">
        <p className="text-body leading-relaxed font-semibold text-ink">
          What this cannot see
        </p>
        <p className="mt-1.5 text-body leading-relaxed text-muted">
          Only the injury a player is carrying{" "}
          <span className="text-ink">today</span>. Sleeper publishes no injury
          history at all: no past injuries, no dates, no games missed. So a
          28-year-old with three back surgeries behind him and no current flag
          prices at a clean 1.00×, exactly like a 22-year-old who has never been
          hurt.
        </p>
        <p className="mt-2 text-body leading-relaxed text-muted">
          That is a real hole and it is left open on purpose. Filling it would
          mean inventing a history the data does not contain, or hardcoding a
          list of players we happen to think are fragile. An acknowledged gap
          beats a confident guess.
        </p>
      </Card>
      </Subsection>

      <Subsection id="role" title="5 · Role">
      <Card>
        <ul className="space-y-0.5 font-mono text-note leading-snug text-muted">
          <li>starter: {cfg.role.starter}×</li>
          <li>2nd unit: {cfg.role.secondary}×</li>
          <li>bench: {cfg.role.bench}×</li>
        </ul>
      </Card>
      </Subsection>

      <Subsection id="picks" title="6 · Draft picks - slot-aware, lottery-aware">
      <Card>
        <p className="text-body leading-relaxed text-muted">
          Picks are NOT priced by round. The 1.01 and the 1.
          {String(teams).padStart(2, "0")} are wildly different assets, so value
          decays exponentially over the OVERALL pick number, toward a floor:
        </p>
        <p className="mt-2 rounded-[--radius-sm] bg-bg/60 p-2.5 text-center font-mono text-note text-accent-text">
          value = {cfg.pick.floor} + ({cfg.pick.topPickValue.toLocaleString()} −{" "}
          {cfg.pick.floor}) · e^(−{cfg.pick.slotDecay} · (overall − 1))
        </p>
        <LineChart data={slotSamples} format={(n) => n.toLocaleString()} />
        <p className="mt-1 text-center text-meta text-secondary">
          The raw slot curve across all {rounds} rounds ({teams * rounds}{" "}
          picks), before time and class adjustments.
        </p>
      </Card>

      <Card className="mt-2">
        <p className="text-body leading-relaxed font-semibold text-ink">
          Which slot? A distribution, not a guess.
        </p>
        <ul className="mt-1.5 space-y-1.5 text-body leading-relaxed text-muted">
          <li>
            <span className="font-semibold text-ink">Known slot</span> (draft
            order set): priced exactly.
          </li>
          <li>
            <span className="font-semibold text-ink">Future pick:</span>{" "}
            estimated from the current strength of the team that ORIGINALLY owes
            it - a first from a bad team is close to a top pick, a first from
            the champion is a late one. In the preseason, strength is read from
            roster talent, because every record is 0-0.
          </li>
          <li>
            <span className="font-semibold text-ink">The lottery:</span> this
            league sends {playoffTeams ?? "?"} of {teams} teams to the playoffs,
            so the {lotterySize || "remaining"} teams that miss are all
            lottery-eligible for picks 1-{lotterySize || "?"}. A bad team&apos;s
            first is therefore a SPREAD over the lottery range, not a fixed slot
            {cfg.pick.lotteryWeighting === 0
              ? " (flat odds by default - the exact odds are unconfirmed, and flat adds the least unearned precision)"
              : ""}
            . Playoff teams pick after the lottery in reverse standings,
            champion last.
          </li>
          <li>
            <span className="font-semibold text-ink">
              Expected value, not value at the expected slot.
            </span>{" "}
            The slot curve is convex, so averaging value across the distribution
            is worth more than pricing the average slot. The model does the
            former - the honest one.
          </li>
          <li>
            <span className="font-semibold text-ink">
              Uncertainty and time:
            </span>{" "}
            the slot estimate regresses toward mid-round by{" "}
            {cfg.pick.slotUncertaintyPerYear}/season (you can guess next
            year&apos;s order; you cannot guess one three years out), and the
            whole pick is discounted{" "}
            {Math.round((1 - cfg.pick.discountPerYear) * 100)}% per season into
            the future.
          </li>
        </ul>
        <div className="mt-3 space-y-1">
          {pickExamples.map((e) => (
            <div
              key={e.label}
              className="flex items-baseline justify-between gap-2 rounded-[--radius-sm] border border-border bg-surface px-2.5 py-1.5"
            >
              <span className="min-w-0 line-clamp-1 text-note text-ink">
                {e.label}
              </span>
              <span className="shrink-0 figure text-note text-muted">
                <span className="font-semibold text-ink">
                  {e.now.toLocaleString()}
                </span>{" "}
                now · {e.later.toLocaleString()} in 2yr
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* MOVED HERE FROM THE /roster PICK PANEL. The claim "a future pick's price
          tracks the owing roster's rank" rests on the draft actually being ordered by
          the standings, so the measurement of whether it is belongs beside the model,
          not beside one page's reading of it. */}
      <Card className="mt-2">
        <p className="text-body leading-relaxed font-semibold text-ink">
          Does this league&apos;s order actually follow reverse standings?
        </p>
        <p className="mt-1.5 text-body leading-relaxed text-muted">
          {orderFidelity.note}
        </p>
        {orderFidelity.seasons.length > 0 && (
          <div className="mt-2 space-y-1">
            {orderFidelity.seasons.map((s) => (
              <div
                key={s.season}
                className="flex items-baseline justify-between gap-2 rounded-[--radius-sm] border border-border bg-surface px-2.5 py-1.5"
              >
                <span className="min-w-0 line-clamp-1 figure text-note text-ink">
                  {s.season} draft
                  <span className="text-secondary">
                    {" "}
                    off {s.fromSeason}
                  </span>
                </span>
                <span className="shrink-0 figure text-note text-muted">
                  {s.exact ? (
                    <span className="text-ink">exact</span>
                  ) : (
                    <>
                      <span className="font-semibold text-ink">
                        {s.deviations}
                      </span>{" "}
                      of {s.teams} off · up to {s.maxShift}
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-note leading-relaxed text-secondary">
          This is also what the{" "}
          <span className="figure font-semibold text-ink">est</span> marker in
          the pick lists means. A pick whose ordering season is over has a
          published slot and an exact price; a pick whose season has not been
          played is priced as a spread over the slots it could land on, and
          carries the marker.
        </p>
      </Card>

      <Card className="mt-2">
        <p className="text-body leading-relaxed font-semibold text-ink">
          Class strength - subjective, on purpose.
        </p>
        <p className="mt-1 text-body leading-relaxed text-muted">
          A class can be strong at the very top (a generational talent lifts the
          1.01 and almost nothing else) or deep (the middle and late picks lift
          while the top is ordinary). Each season carries a{" "}
          <span className="font-mono">top</span> and{" "}
          <span className="font-mono">depth</span> multiplier, interpolated by
          where the pick sits. Converting consensus opinion about a class into
          value is a real part of pick trading; these are exposed so they can be
          argued with rather than buried.
        </p>
        <ul className="mt-2 space-y-0.5 font-mono text-note leading-snug text-muted">
          {classEntries.length === 0 && (
            <li>all classes currently neutral (1.0 / 1.0)</li>
          )}
          {classEntries.map(([season, s]) => (
            <li key={season}>
              {season}: top {(s.top ?? 1).toFixed(2)}× · depth{" "}
              {(s.depth ?? 1).toFixed(2)}×
            </li>
          ))}
          <li>any unlisted season: neutral (1.0 / 1.0)</li>
        </ul>
      </Card>
      </Subsection>

      <Subsection id="timelines" title="7 · Timelines - Dynasty Duration & TCI">
      <Card>
        <p className="text-body leading-relaxed text-muted">
          Every asset is a claim on production at some point in TIME. Borrowing
          Macaulay duration from fixed income, each asset&apos;s{" "}
          <span className="font-semibold text-ink">duration</span> is the
          value-weighted average number of seasons until it pays out - the age
          curve is the payout profile, and a pick is the wait until it converts
          plus the duration of the rookie it becomes.
        </p>
        <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
          {durationExamples.map((e) => (
            <div
              key={e.label}
              className="rounded-[--radius-sm] border border-border bg-surface p-2"
            >
              <div className="text-meta leading-tight text-secondary">
                {e.label}
              </div>
              <div className="mt-0.5 figure text-body leading-relaxed font-semibold text-ink">
                {e.d.toFixed(1)}s
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-body leading-relaxed text-muted">
          A roster&apos;s duration says WHEN its value arrives. The{" "}
          <span className="font-semibold text-ink">
            Timeline Coherence Index
          </span>{" "}
          says whether its assets AGREE: it is the value-weighted dispersion of
          duration, inverted onto 0-100.
        </p>
        <p className="mt-2 rounded-[--radius-sm] bg-bg/60 p-2.5 text-center font-mono text-note text-accent-text">
          TCI = 100 · (1 − min(1, dispersion / 3))
        </p>
        <ul className="mt-2 space-y-1.5 text-body leading-relaxed text-muted">
          <li>
            <span className="font-semibold text-ink">
              Coherence is direction-free.
            </span>{" "}
            A great rebuild and a great contender both score high - the index
            measures whether you have a plan, not whether we approve of it.
          </li>
          <li>
            <span className="font-semibold text-ink">
              Below TCI 55 a roster is straddling
            </span>{" "}
            - a 33-year-old star next to a stack of far-out firsts. It owns two
            teams that share a logo, and neither timeline is served. That is the
            only bad quadrant.
          </li>
          <li>
            <span className="font-semibold text-ink">
              A roster&apos;s WINDOW is the middle half of its value.
            </span>{" "}
            Duration and dispersion describe one roster; a window puts fourteen
            of them on one axis of seasons. It is the value-weighted 25th, 50th
            and 75th percentile of asset duration - where the value actually is,
            rather than a centre plus a spread, which would assume a symmetry a
            straddled roster does not have. A roster below the coherence floor
            is drawn as its two ends with nothing between them: the range is
            real, the peak is not.
          </li>
          <li>
            <span className="font-semibold text-ink">
              Posture is league-relative.
            </span>{" "}
            A 3.8-season roster is the shortest-dated in a league of rebuilders
            and the longest-dated in a league of veterans, so contending /
            ascending / rebuilding are assigned by within-league percentile of
            duration. Posture is the only thing in the app that uses those three
            words; a roster&rsquo;s core AGE is a separate reading with its own
            vocabulary (young / mixed-age / veteran core), because an old core is
            not evidence that anybody chose to win now.
          </li>
          <li>
            <span className="font-semibold text-ink">
              Which makes posture a forced curve, and that is worth saying.
            </span>{" "}
            Because the cutoffs are quartiles, about a quarter of coherent
            rosters are labelled contending in every league, however that league
            is built. &ldquo;Contending&rdquo; is the claim that you are in the
            shortest-dated quarter of THIS league, not that you are ready to win
            a title. Read it as a rank, because that is what it is.
          </li>
          <li>
            <span className="font-semibold text-ink">
              The index is on one formula, not proven to be on one scale.
            </span>{" "}
            A roster&apos;s TCI depends only on its own assets, so the same
            roster scores the same anywhere and two readings of this league can
            be subtracted. But the 3 in that formula was calibrated to the
            dispersion actually observed across this league&apos;s fourteen
            rosters, so comparing a TCI here against one from a league of a
            different size or shape is not something we have established.
          </li>
        </ul>
        <p className="mt-2 text-meta leading-relaxed text-secondary">
          This is only computable because players and picks are valued on one
          common scale (sections 1-5). See the league quadrant on the League
          page.
        </p>
      </Card>
      </Subsection>

      <Subsection id="fragility" title="8 · Fragility - the RFI">
      <Card>
        <p className="text-body leading-relaxed text-muted">
          Duration says WHEN a roster&apos;s value arrives; the{" "}
          <span className="font-semibold text-ink">Roster Fragility Index</span>{" "}
          asks what breaks first. Two rosters can hold the same value on the
          same timeline and be in completely different danger: one loses its
          season the night a knee goes, the other re-solves around the loss. RFI
          is three measurements of that difference, weighted and combined onto
          0-100, higher = more fragile:
        </p>
        <p className="mt-2 rounded-[--radius-sm] bg-bg/60 p-2.5 text-center font-mono text-note text-accent-text">
          RFI = 100 · ({W_LOO} · damage + {W_CONCENTRATION} · concentration +{" "}
          {W_EXPOSURE} · exposure)
        </p>
        <ul className="mt-2 space-y-1.5 text-body leading-relaxed text-muted">
          <li>
            <span className="font-semibold text-ink">
              Leave-one-out damage ({W_LOO}).
            </span>{" "}
            Delete each player, RE-SOLVE the best legal lineup out of who is
            left, and measure the startable value lost - so a star with a real
            backup shows small damage, and the biggest loss names your single
            point of failure. Scored on the top {LOO_TOP_K} damages together.
            Weighted heaviest because it is the only component that runs an
            actual counterfactual.
          </li>
          <li>
            <span className="font-semibold text-ink">
              Concentration ({W_CONCENTRATION}).
            </span>{" "}
            A normalized Herfindahl-Hirschman index over starter-weighted value
            - the shape of the whole distribution, which leave-one-out cannot
            see. A roster whose stars are individually replaceable can still
            hold every real point of value in four men.
          </li>
          <li>
            <span className="font-semibold text-ink">
              Availability exposure ({W_EXPOSURE}).
            </span>{" "}
            How much value sits in bodies that may not play, priced with the
            value model&apos;s own injury term and the duration curve&apos;s age
            taper, so the three models cannot disagree. Weighted least: injury
            status is a snapshot that can change in a day, so it adjusts the
            index rather than driving it.
          </li>
        </ul>
        <p className="mt-3 text-body leading-relaxed text-muted">
          <span className="font-semibold text-ink">
            What it refuses to count.
          </span>{" "}
          Picks are excluded: a future first cannot fill a lineup slot tonight,
          and folding pick capital in would make the most extreme teardown in
          the league read as robust, which is the opposite of true. And RFI is
          not a quality score - low fragility is not the same as good. A
          torn-down roster with nothing to lose scores mid-pack, because there
          is nothing left to fail.
        </p>
        <p className="mt-2 text-meta leading-relaxed text-secondary">
          Bands (resilient / balanced / brittle) are league-relative quartiles,
          for the same reason posture is: brittle only means something next to
          the rosters you actually have to beat. Each reference constant was
          calibrated against the observed spread of a real 14-team league, not a
          theoretical worst case.
        </p>
      </Card>
      </Subsection>

      <p className="mt-6 text-center text-meta leading-relaxed text-secondary">
        Player and pick constants live in{" "}
        <span className="font-mono">lib/valuation/config.ts</span>; the timeline
        math in <span className="font-mono">lib/metrics/duration.ts</span> and{" "}
        <span className="font-mono">lib/metrics/window.ts</span>; fragility in{" "}
        <span className="font-mono">lib/metrics/fragility.ts</span>. Ranking
        tiers are not part of the model - they break where the value
        distribution actually cliffs, instead of at fixed thresholds. A
        crowdsourced vote-driven market is intentionally deferred until
        there&apos;s enough participation to trust it.
      </p>
      <Onward from="/methodology" />
    </div>
  );
}
