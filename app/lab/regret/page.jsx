import Link from "next/link";
import { getLeagueHistory } from "@/lib/history";
import { loadRegretLedger, regretSeasons } from "@/lib/lab/regret/load";
import { parPercentile, quantile } from "@/lib/lab/regret/slotPar";
import { CHART_ACCENT, CHART_GRID, CHART_NEUTRAL } from "@/lib/chart-colors";
import {
  Card,
  Disclosure,
  EmptyState,
  PageHeader,
  SectionHeader,
  Stat,
} from "@/components/ui";
import { ExperimentBadge } from "@/components/ExperimentBadge";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "The regret ledger - Parquet Lab",
};
const fmt = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
/**
 * Weekly banked-against-available, hand-rolled (D3). A faint full bar is what the
 * roster produced; the solid bar is what was banked. Integer coordinates only, for
 * the hydration reason charts.tsx documents.
 */
function WeeklyBars({ weeks }) {
  const W = 320;
  const H = 116;
  const padX = 3;
  const top = 6;
  const base = H - 18;
  const max = Math.max(1, ...weeks.map((w) => w.best));
  const slotW = (W - padX * 2) / Math.max(1, weeks.length);
  const barW = Math.max(3, Math.round(slotW) - 2);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Points banked each week against the best the roster produced"
    >
      <line
        x1={padX}
        y1={base}
        x2={W - padX}
        y2={base}
        stroke="var(--color-border)"
        strokeWidth={1}
      />
      {weeks.map((w, i) => {
        const x = Math.round(padX + i * slotW);
        const bestH = Math.round(((base - top) * w.best) / max);
        const bankH = Math.round(((base - top) * w.banked) / max);
        return (
          <g key={w.week}>
            <rect
              x={x}
              y={base - bestH}
              width={barW}
              height={Math.max(1, bestH)}
              rx={2}
              fill="var(--color-border-strong)"
            />
            <rect
              x={x}
              y={base - bankH}
              width={barW}
              height={Math.max(1, bankH)}
              rx={2}
              fill="var(--color-accent)"
            />
            {w.emptySlots > 0 && (
              <circle
                cx={x + Math.round(barW / 2)}
                cy={base + 6}
                r={2}
                fill="var(--color-warn)"
              />
            )}
            {(i === 0 || (i + 1) % 5 === 0) && (
              <text
                x={x + Math.round(barW / 2)}
                y={H - 3}
                textAnchor="middle"
                fontSize="9"
                fill="var(--color-faint)"
              >
                {w.week}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
/**
 * THE PAR STRIP. What a lock-in slot has been worth in this league, drawn as the
 * distribution it is rather than as the single number it is usually reduced to.
 *
 * Arrived here with `lib/lab/regret/slotPar.ts` when /lab/startline was shelved
 * (SHELVED.md, S1). It is the one part of that page that did not need a live week.
 *
 * Hand-rolled inline SVG (D3), integer coordinates only - unrounded floats serialize
 * differently on the server and the client and have broken hydration on this project.
 * The two reference marks are median and p90 and they are LABELLED AS QUANTILES, not
 * as thresholds: half the league's slots are under the median by construction, so
 * calling it a pass mark would be a grade, and D6 forbids grades.
 */
function ParStrip({ par, marks }) {
  const W = 320;
  const H = 62;
  const PAD = 6;
  const BASE = 46;
  const TOP = 14;
  const hi = Math.max(par.max, ...marks, 1);
  const x = (v) => Math.round(PAD + (v / hi) * (W - PAD * 2));
  const tallest = Math.max(1, ...par.bins.map((b) => b.count));
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={
        `Every scoring lock-in slot this league banked: ${par.n} of them, ` +
        `median ${fmt(par.median)}, ninetieth percentile ${fmt(par.p90)}, highest ${fmt(par.max)}.` +
        (marks.length
          ? ` Marked on it: ${marks.map((m) => fmt(m)).join(", ")}.`
          : "")
      }
    >
      {par.bins.map((b) => {
        const x0 = x(b.from);
        const x1 = x(b.to);
        const h = Math.round(((BASE - TOP) * b.count) / tallest);
        return (
          <rect
            key={b.from}
            x={x0}
            y={BASE - Math.max(1, h)}
            width={Math.max(1, x1 - x0 - 1)}
            height={Math.max(1, h)}
            fill={CHART_NEUTRAL}
            // Flat, one hue at one strength. A bar's height already states its count.
            opacity={0.7}
          />
        );
      })}
      <line
        x1={PAD}
        y1={BASE}
        x2={W - PAD}
        y2={BASE}
        stroke={CHART_GRID}
        strokeWidth={1}
      />
      {[par.median, par.p90].map((q) => (
        <line
          key={q}
          x1={x(q)}
          y1={TOP - 4}
          x2={x(q)}
          y2={BASE + 3}
          stroke={CHART_NEUTRAL}
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      ))}
      {marks.map((m, i) => (
        <g key={`${m}-${i}`}>
          <rect
            x={x(m) - 1}
            y={TOP - 8}
            width={2}
            height={BASE - TOP + 8}
            rx={1}
            fill={CHART_ACCENT}
          />
          {/* A shape as well as a colour: the reading never rests on the accent. */}
          <polygon
            points={`${x(m) - 4},${TOP - 14} ${x(m) + 4},${TOP - 14} ${x(m)},${TOP - 8}`}
            fill={CHART_ACCENT}
          />
        </g>
      ))}
      {/* Quantile labels are HTML below, not SVG text: this viewBox renders at up to
            2x on a wide phone, and a caption should stay on the type scale. */}
    </svg>
  );
}
function WeekList({ weeks }) {
  const max = Math.max(1, ...weeks.map((w) => w.best));
  return (
    <ul>
      {weeks.map((w) => {
        const pct = Math.round((w.banked / max) * 100);
        const bestPct = Math.round((w.best / max) * 100);
        return (
          <li
            key={w.week}
            className="flex items-center gap-2 border-b border-border py-1.5 last:border-0"
          >
            <span className="w-9 shrink-0 figure text-micro text-faint">
              {w.playoff ? "P" : "W"}
              {w.week}
            </span>
            <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-border-strong"
                style={{ width: `${bestPct}%` }}
              />
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-accent"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="w-12 shrink-0 text-right figure text-micro text-ink">
              {fmt(w.banked)}
            </span>
            <span className="w-12 shrink-0 text-right figure text-micro text-muted">
              {fmt(w.gap)}
            </span>
            {w.emptySlots > 0 && (
              <span className="w-3 shrink-0 text-right figure text-micro text-warn">
                {w.emptySlots}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
function WidestWeek({ w }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lede font-semibold leading-tight text-ink">
          Week {w.week}
        </h3>
        <span className="figure text-note text-muted">
          {fmt(w.banked)} banked / {fmt(w.best)} available
        </span>
      </div>
      <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-micro uppercase tracking-wide text-faint">
            Banked, slot by slot
          </div>
          {/* The seven slots in `roster_positions` order, each naming the GAME it
            banked rather than just the player. A lock-in slot is a player-game, and
            that is the vocabulary every manager in this league already reads a week
            in. */}
          <ul className="mt-1">
            {w.slots.map((s) => (
              <li
                key={s.index}
                className="flex items-center gap-2 border-b border-border py-1 last:border-0"
              >
                <span className="w-8 shrink-0 figure text-micro text-faint">
                  {s.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-micro leading-tight text-ink">
                    {s.playerName ?? "(nobody)"}
                  </span>
                  {!s.empty && (
                    <span className="block truncate text-micro leading-tight text-faint">
                      {s.bankedOpponent
                        ? `vs ${s.bankedOpponent}`
                        : s.verified
                          ? "several games matched"
                          : "no game matched"}
                      {s.playerBest != null && s.playerBest > s.banked
                        ? ` · his best was ${fmt(s.playerBest)}`
                        : ""}
                    </span>
                  )}
                </span>
                <span
                  className={`figure text-micro ${s.empty ? "text-warn" : "text-muted"}`}
                >
                  {s.empty ? "empty" : fmt(s.banked)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-micro uppercase tracking-wide text-faint">
            Best seven available
          </div>
          <ul className="mt-1">
            {w.bestSeven.map((g) => (
              <li
                key={g.playerId}
                className="flex items-center gap-2 border-b border-border py-1 last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-micro text-ink">
                  {g.name}
                  {g.opponent && (
                    <span className="text-faint"> vs {g.opponent}</span>
                  )}
                </span>
                <span
                  className={`figure text-micro ${g.banked ? "text-accent-text" : "text-muted"}`}
                >
                  {fmt(g.points)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
function SeasonPills({ seasons, active }) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {seasons.map((s) => (
        <Link
          key={s}
          href={`/lab/regret?season=${s}`}
          aria-current={s === active ? "page" : undefined}
          className={`inline-flex min-h-11 items-center rounded-full border px-3 figure text-meta ${
            s === active
              ? "border-accent-edge bg-accent-wash text-accent-text"
              : "border-border text-muted"
          }`}
        >
          {s}
        </Link>
      ))}
    </div>
  );
}
function Headline({ l }) {
  const share =
    l.bestTotal > 0 ? Math.round((l.bankedTotal / l.bestTotal) * 100) : 0;
  // Season totals round to whole points. A third of a 375pt row is 85pt of tile, and
  // "2,231.5" at the display size does not fit in it - while half a point across 161
  // slots is noise anyway. Week rows keep the decimal, where it is a real figure.
  const whole = (n) => Math.round(n).toLocaleString("en-US");
  return (
    <div className="grid grid-cols-3 gap-2">
      <Stat
        label="Banked"
        value={whole(l.bankedTotal)}
        sub={`${share}% of available`}
      />
      <Stat
        label="Available"
        value={whole(l.bestTotal)}
        sub={`${l.slotsTotal} slots`}
      />
      <Stat
        label="On the table"
        value={whole(l.gapTotal)}
        tone="accent"
        sub={`${l.weeks.length} weeks`}
      />
    </div>
  );
}
export default async function RegretPage({ searchParams }) {
  const sp = await searchParams;
  const h = await getLeagueHistory();
  const options = regretSeasons(h);
  const played = options.filter((o) => o.lastScoredWeek > 0);
  // An explicitly requested season is honoured even when it has not been played, so
  // /lab/regret?season=2026 says "not played" rather than quietly serving 2025.
  const chosen =
    options.find((o) => o.season === sp.season) ??
    played[0] ??
    options[0] ??
    null;
  const rosterId = h.me.rosterId ?? h.rosters[0]?.rosterId;
  const header = (
    <PageHeader
      kicker="The Lab"
      title="The regret ledger"
      subtitle={
        chosen
          ? `${h.me.teamName ?? h.me.displayName}, ${chosen.season}. Seven lock-in slots a week.`
          : "Seven lock-in slots a week."
      }
      action={<ExperimentBadge />}
    />
  );
  if (!chosen || rosterId == null) {
    return (
      <div>
        {header}
        {/* A real h2 before the empty state - EmptyState's own heading is an h3,
            and skipping straight from PageHeader's h1 to it is the same
            heading-order gap axe-core caught on /lab/pulse (D75). */}
        <SectionHeader title="Slot par" />
        <EmptyState title="No season to read">
          This league has no scored weeks on record yet.
        </EmptyState>
      </div>
    );
  }
  if (chosen.lastScoredWeek === 0) {
    return (
      <div>
        {header}
        <SeasonPills
          seasons={options.map((o) => o.season)}
          active={chosen.season}
        />
        <SectionHeader title="Slot par" />
        <EmptyState title={`${chosen.season} has not been played`}>
          The league reports no scored weeks for this season, so there are no
          lineups to read. Nothing here is estimated to fill the gap.
        </EmptyState>
      </div>
    );
  }
  const { ledger, par, playersFetched, weeksRead } = await loadRegretLedger(
    h,
    rosterId,
    chosen,
  );
  const emptyRate = ledger.slotsTotal
    ? (ledger.emptySlots / ledger.slotsTotal) * 100
    : 0;
  // ONE mark on the strip, not 161. Marking every slot this manager banked would
  // redraw the league's distribution in gold on top of itself and say nothing; the
  // median is the single figure that answers "where do I sit in this".
  const myScoring = ledger.weeks
    .flatMap((w) => w.slots)
    .filter((s) => !s.empty && s.banked > 0)
    .map((s) => s.banked)
    .sort((a, b) => a - b);
  const myMedian = myScoring.length ? quantile(myScoring, 0.5) : null;
  const parTeamWeeks = Math.round(
    par.totalSlots / Math.max(1, chosen.slotLabels.length),
  );
  const parDeadRate = par.totalSlots
    ? (par.deadSlots / par.totalSlots) * 100
    : 0;
  return (
    <div>
      {header}
      <SeasonPills
        seasons={played.map((o) => o.season)}
        active={chosen.season}
      />

      <Card className="mb-3">
        <p className="text-body leading-relaxed text-ink">
          Best in hindsight is not best decision. A manager who banked 28 on
          Tuesday could not know Thursday would bring 41.
        </p>
        <p className="mt-1.5 text-body leading-relaxed text-muted">
          This is a record of how the weeks turned out, not a reading of how
          they were chosen. Nothing below is a mistake.
        </p>
      </Card>

      <Headline l={ledger} />

      {ledger.emptySlots > 0 && (
        <Card className="mt-2 border-warn/30 bg-warn/5">
          <p className="text-body leading-relaxed text-ink">
            <span className="figure font-semibold text-warn">
              {ledger.emptySlots}
            </span>{" "}
            of your {ledger.slotsTotal} slots ({emptyRate.toFixed(1)}%) were
            never filled, and {ledger.zeroSlots} more banked a name that scored
            nothing.
          </p>
          <p className="mt-1.5 text-meta leading-snug text-muted">
            This is the one line here that is about you rather than about the
            week: an empty slot needed no foresight to avoid. It still cannot
            tell a forgotten slot from a deliberate one, and a team playing for
            draft position leaves the same trace.
          </p>
        </Card>
      )}

      {/* SLOT PAR. Rescued from /lab/startline when that surface was shelved
            (SHELVED.md, S1): it is the one thing on that page that did not need a live
            week, and it costs nothing here because the ledger already reads every
            roster's lineup for every week and used to throw thirteen of fourteen away. */}
      <SectionHeader title="Slot par" />
      <p className="mb-1.5 text-note leading-snug text-muted">
        What one slot has been worth in this league, over every slot every
        manager banked in {chosen.season}. The rest of this page is your own
        season; this is the field it sat in.
      </p>
      {par.n === 0 ? (
        <Card>
          <p className="text-note leading-snug text-muted">
            No slot scored in {chosen.season}, so there is no distribution to
            draw. No default is substituted for this league&apos;s own history.
          </p>
        </Card>
      ) : (
        <>
          <ParStrip par={par} marks={myMedian != null ? [myMedian] : []} />
          {/* A LEGEND, not an axis. Spreading four labels edge to edge under the
                drawing would put "p90" a centimetre from the dashed line it names, and
                a caption that lies about a position is worse than no caption. */}
          <p className="figure text-micro leading-snug text-secondary">
            0 to {fmt(par.max)} · dashed marks are median {fmt(par.median)} and
            p90 {fmt(par.p90)}
            {myMedian != null && <> · the gold mark is your own median slot</>}
          </p>
          <p className="mt-1.5 text-note leading-snug text-muted">
            {par.n.toLocaleString("en-US")} scoring slots across {parTeamWeeks}{" "}
            team-weeks. Mean {fmt(par.mean)}, median {fmt(par.median)}, and the
            top tenth start at {fmt(par.p90)}.{" "}
            {myMedian != null && (
              <>
                Your median slot, {fmt(myMedian)}, sits above{" "}
                {parPercentile(par, myMedian)}% of them.
              </>
            )}
          </p>
          <p className="mt-1 text-micro leading-snug text-secondary">
            Half of all slots are under the median by construction, so it is a
            middle and not a pass mark. {par.deadSlots} of{" "}
            {par.totalSlots.toLocaleString("en-US")} slots (
            {parDeadRate.toFixed(1)}%) banked exactly nothing and are counted
            rather than plotted
            {par.negativeSlots > 0 && (
              // The {" "} is load-bearing. Without it JSX eats the space after the
              // expression and this renders "4that finished below zero" - the exact
              // shape of the `areno` bug the committee found on /roster.
              <>
                , as are the {par.negativeSlots} that finished below zero, which
                this league&apos;s scoring permits
              </>
            )}
            .
          </p>
        </>
      )}

      <SectionHeader title="Week by week" />
      <WeeklyBars weeks={ledger.weeks} />
      <p className="mb-2 mt-1 text-micro text-faint">
        Solid is banked, faint is what the roster produced. A gold dot marks a
        week with an unfilled slot.
      </p>
      <WeekList weeks={ledger.weeks} />

      {ledger.widestWeek && (
        <>
          <SectionHeader title="The widest week" />
          <WidestWeek w={ledger.widestWeek} />
        </>
      )}

      <div className="mt-5">
        <Disclosure summary="How this is built, and what it cannot see">
          <ul className="space-y-1.5">
            <li>
              Every banked figure comes from Sleeper&apos;s own{" "}
              <code className="font-mono">starters_points</code>. Each one was
              checked back against the box scores under this league&apos;s
              scoring settings: {ledger.verifiedSlots} of {ledger.filledSlots}{" "}
              filled slots matched a real game. Anything that did not match is
              left in the record and flagged rather than adjusted.
            </li>
            <li>
              Available means the best single game each rostered player produced
              that week, seven distinct players, one game each. That is how the
              format works: a slot holds one player-game and a player can fill
              at most one slot.
            </li>
            <li>
              Position eligibility is NOT applied. Sleeper reports only
              today&apos;s eligibility, and 193 of the 2,244 filled slots this
              league actually played in 2025 would be illegal under it. Grading
              real lineups against a rulebook they did not play under would be
              worse than the upper bound this produces, so &quot;available&quot;
              is an upper bound and is stated as one.
            </li>
            <li>
              IR and taxi players sit in the weekly roster list and could not
              legally have been started. Per-week reserve status is not
              recoverable from any endpoint, so a little of the pool was never
              actually startable.
            </li>
            <li>
              {ledger.slotsAtPlayerBest} of {ledger.filledSlots} filled slots
              banked that player&apos;s own best game of the week. A fact about
              the week, not a score.
            </li>
            <li>
              Read on demand: {weeksRead} lineup requests and {playersFetched}{" "}
              player stat requests for this season, cached for 30 minutes and
              never touched by the rest of the app.
            </li>
          </ul>
        </Disclosure>
      </div>
    </div>
  );
}
