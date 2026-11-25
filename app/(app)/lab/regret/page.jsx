import { AlertTriangle, FlaskConical } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { loadRegretLedger, regretSeasons } from "@/lib/lab/regret/load";
import { parPercentile, quantile } from "@/lib/lab/regret/slotPar";
import { CHART_ACCENT, CHART_GRID, CHART_NEUTRAL } from "@/lib/chart-colors";
import {
  Chip,
  Disclosure,
  EmptyState,
  List,
  ListRow,
  PageHeader,
  SectionHeader,
  Sheet,
  StatTile,
} from "@/components/ui";
import { SeasonLinks } from "@/components/league/SeasonLinks";
import { Onward } from "@/components/Onward";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Week by week - Parquet",
};
/*
 * WEEK BY WEEK. The page answers "how did my lock-in weeks turn out?": the season's
 * banked, available and on-the-table totals as tiles, then one row per week that opens
 * the week's slots against the best seven games available. Slot par (what a slot has
 * been worth across the league) sits under it. The live lock-or-hold board is /lockin;
 * this is the history beside it. Best in hindsight is not best decision, so nothing
 * here reads as a mistake (D6). All figures come from lib/lab/regret.
 */
const fmt = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

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

/** Banked against available, as one track: length carries the figure, printed beside. */
function WeekBar({ banked, best, max }) {
  const bestPct = Math.round((best / max) * 100);
  const pct = Math.round((banked / max) * 100);
  return (
    <span aria-hidden="true" className="relative mt-1.5 block h-2 overflow-hidden rounded-full bg-elevated">
      <span className="absolute inset-y-0 left-0 rounded-full bg-border-strong" style={{ width: `${bestPct}%` }} />
      <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </span>
  );
}

function WeekDetail({ w }) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <StatTile className="bg-surface-2" size="sm" label="Banked" value={fmt(w.banked)} />
        <StatTile className="bg-surface-2" size="sm" label="Available" value={fmt(w.best)} />
        <StatTile className="bg-surface-2" size="sm" label="On the table" value={fmt(w.gap)} />
      </div>
      <h3 className="mt-4 text-note font-semibold text-ink">Banked, slot by slot</h3>
      <ul className="mt-1 divide-y divide-border">
        {w.slots.map((s) => (
          <li key={s.index} className="flex items-center gap-3 py-2">
            <span className="w-10 shrink-0 figure text-meta text-secondary">{s.label}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-note text-ink">{s.playerName ?? "Nobody"}</span>
              {!s.empty && (
                <span className="block text-meta text-secondary">
                  {s.bankedOpponent ? `vs ${s.bankedOpponent}` : s.verified ? "several games matched" : "no game matched"}
                  {s.playerBest != null && s.playerBest > s.banked ? ` · his best was ${fmt(s.playerBest)}` : ""}
                </span>
              )}
            </span>
            {s.empty ? (
              <Chip size="sm" tone="warn" icon={AlertTriangle}>
                empty
              </Chip>
            ) : (
              <span className="shrink-0 figure text-note font-semibold text-ink">{fmt(s.banked)}</span>
            )}
          </li>
        ))}
      </ul>
      <h3 className="mt-4 text-note font-semibold text-ink">Best seven available</h3>
      <ul className="mt-1 divide-y divide-border">
        {w.bestSeven.map((g) => (
          <li key={g.playerId} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1 text-note text-ink">
              {g.name}
              {g.opponent && <span className="text-secondary"> vs {g.opponent}</span>}
            </span>
            {g.banked && (
              <Chip size="sm" tone="accent">
                banked
              </Chip>
            )}
            <span className="shrink-0 figure text-note font-semibold text-ink">{fmt(g.points)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function RegretPage({ searchParams }) {
  const sp = await searchParams;
  const h = await getLeagueHistory();
  const options = regretSeasons(h);
  const played = options.filter((o) => o.lastScoredWeek > 0);
  // An explicitly requested season is honoured even when it has not been played, so
  // ?season=2026 says "not played" rather than quietly serving another season.
  const chosen = options.find((o) => o.season === sp.season) ?? played[0] ?? options[0] ?? null;
  const rosterId = h.me.rosterId ?? h.rosters[0]?.rosterId;
  const header = (
    <PageHeader
      kicker={h.me.teamName ?? h.me.displayName}
      title="Week by week"
      subtitle="How each lock-in week turned out"
      aside={
        <Chip tone="warn" size="sm" icon={FlaskConical}>
          Experiment
        </Chip>
      }
    />
  );
  const seasonNav = (list) => (
    <SeasonLinks
      className="mb-3"
      seasons={list.map((o) => o.season)}
      active={chosen?.season}
      hrefFor={(s) => `/lab/regret?season=${s}`}
    />
  );
  if (!chosen || rosterId == null) {
    return (
      <div>
        {header}
        <SectionHeader title="Weeks" />
        <EmptyState title="No season to read">This league has no scored weeks on record yet.</EmptyState>
      </div>
    );
  }
  if (chosen.lastScoredWeek === 0) {
    return (
      <div>
        {header}
        {seasonNav(options)}
        <SectionHeader title="Weeks" />
        <EmptyState title={`${chosen.season} has not been played`}>
          No scored weeks for this season; nothing is estimated to fill the gap.
        </EmptyState>
      </div>
    );
  }
  const { ledger, par, playersFetched, weeksRead } = await loadRegretLedger(h, rosterId, chosen);
  const share = ledger.bestTotal > 0 ? Math.round((ledger.bankedTotal / ledger.bestTotal) * 100) : 0;
  const emptyRate = ledger.slotsTotal ? (ledger.emptySlots / ledger.slotsTotal) * 100 : 0;
  // One mark on the par strip: this manager's median scoring slot.
  const myScoring = ledger.weeks
    .flatMap((w) => w.slots)
    .filter((s) => !s.empty && s.banked > 0)
    .map((s) => s.banked)
    .sort((a, b) => a - b);
  const myMedian = myScoring.length ? quantile(myScoring, 0.5) : null;
  const parTeamWeeks = Math.round(par.totalSlots / Math.max(1, chosen.slotLabels.length));
  const parDeadRate = par.totalSlots ? (par.deadSlots / par.totalSlots) * 100 : 0;
  const max = Math.max(1, ...ledger.weeks.map((w) => w.best));
  const widest = ledger.widestWeek?.week;
  const weeksNewestFirst = [...ledger.weeks].reverse();

  return (
    <div>
      {header}
      {seasonNav(played)}

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Banked" value={fmt(ledger.bankedTotal)} sub={`${share}% of available`} />
        <StatTile label="Available" value={fmt(ledger.bestTotal)} sub={`${ledger.slotsTotal} slots`} />
        <StatTile
          label="On the table"
          value={fmt(ledger.gapTotal)}
          tone="accent"
          sub={`${ledger.weeks.length} weeks`}
        />
      </div>

      {ledger.emptySlots > 0 && (
        <Disclosure
          className="mt-1"
          icon={<AlertTriangle size={14} className="text-warn" />}
          summary={`${ledger.emptySlots} of ${ledger.slotsTotal} slots never filled (${emptyRate.toFixed(1)}%)`}
        >
          <p>
            {ledger.zeroSlots} more banked a name that scored nothing. An empty slot needed no foresight to
            avoid, but this cannot tell a forgotten slot from a deliberate one, and a team playing for draft
            position leaves the same trace.
          </p>
        </Disclosure>
      )}

      <SectionHeader title="Weeks" href="/lockin" cta="This week's board" />
      <p className="-mt-1 mb-2 text-meta text-secondary">Violet is banked, grey is what the roster produced.</p>
      <List aria-label={`Weeks of ${chosen.season}, newest first`}>
        {weeksNewestFirst.map((w) => {
          const name = `${w.playoff ? "Playoff week" : "Week"} ${w.week}`;
          return (
            <li key={w.week}>
              <Sheet
                triggerHint="Show details"
                title={name}
                subtitle={`${fmt(w.banked)} banked of ${fmt(w.best)} available`}
                trigger={
                  <ListRow
                    as="span"
                    chevron
                    title={name}
                    badge={
                      <>
                        {w.week === widest && (
                          <Chip size="sm" tone="info">
                            widest gap
                          </Chip>
                        )}
                        {w.emptySlots > 0 && (
                          <Chip size="sm" tone="warn" icon={AlertTriangle}>
                            {w.emptySlots} empty
                          </Chip>
                        )}
                      </>
                    }
                    value={
                      <>
                        {fmt(w.banked)}
                        <span className="sr-only"> banked</span>
                      </>
                    }
                    valueSub={
                      <>
                        of {fmt(w.best)}
                        <span className="sr-only"> available</span>
                      </>
                    }
                  >
                    <WeekBar banked={w.banked} best={w.best} max={max} />
                  </ListRow>
                }
              >
                <WeekDetail w={w} />
              </Sheet>
            </li>
          );
        })}
      </List>

      <SectionHeader title="Slot par" />
      {par.n === 0 ? (
        <EmptyState title="No slot scored">
          No slot scored in {chosen.season}; no default stands in for this league&apos;s own history.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatTile size="sm" label="League median" value={fmt(par.median)} sub="per slot" />
            <StatTile size="sm" label="Top tenth from" value={fmt(par.p90)} sub="p90" />
            <StatTile
              size="sm"
              label="Your median"
              value={myMedian != null ? fmt(myMedian) : "unknown"}
              sub={myMedian != null ? `above ${parPercentile(par, myMedian)}%` : "no scoring slot"}
              tone={myMedian != null ? "accent" : "neutral"}
            />
          </div>
          <div className="mt-2 rounded-card bg-surface p-3">
            <ParStrip par={par} marks={myMedian != null ? [myMedian] : []} />
            <p className="mt-1 figure text-meta text-secondary">
              0 to {fmt(par.max)} · dashed: median and p90
              {myMedian != null && <> · violet: your median slot</>}
            </p>
          </div>
          <Disclosure className="mt-1" summary="How slot par is counted">
            <p>
              {par.n.toLocaleString("en-US")} scoring slots across {parTeamWeeks} team-weeks in {chosen.season}.
              Mean {fmt(par.mean)}. Half of all slots are under the median by construction, so it is a middle and
              not a pass mark. {par.deadSlots} of {par.totalSlots.toLocaleString("en-US")} slots (
              {parDeadRate.toFixed(1)}%) banked exactly nothing and are counted rather than plotted
              {par.negativeSlots > 0 && (
                <>, as are the {par.negativeSlots} that finished below zero, which this league&apos;s scoring permits</>
              )}
              .
            </p>
          </Disclosure>
        </>
      )}

      <Disclosure summary="How this is built, and what it cannot see">
        <ul className="list-disc space-y-1.5 pl-4">
          <li>
            Best in hindsight is not best decision: a manager who banked 28 on Tuesday could not know Thursday
            would bring 41. Nothing here is a mistake.
          </li>
          <li>
            Banked figures are Sleeper&apos;s own <code className="font-mono">starters_points</code>, checked
            against box scores under this league&apos;s scoring: {ledger.verifiedSlots} of {ledger.filledSlots}{" "}
            filled slots matched a real game. Anything unmatched is flagged, not adjusted.
          </li>
          <li>
            Available is the best single game each rostered player produced that week, seven distinct players,
            one game each.
          </li>
          <li>
            Position eligibility is not applied (Sleeper reports only today&apos;s), and IR and taxi players sit
            in the pool, so available is an upper bound.
          </li>
          <li>
            {ledger.slotsAtPlayerBest} of {ledger.filledSlots} filled slots banked that player&apos;s own best
            game of the week. A fact about the week, not a score.
          </li>
          <li>
            Read on demand: {weeksRead} lineup requests and {playersFetched} player stat requests, cached for 30
            minutes.
          </li>
        </ul>
      </Disclosure>
      <Onward from="/lab/regret" />
    </div>
  );
}
