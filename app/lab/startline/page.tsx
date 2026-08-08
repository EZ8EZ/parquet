/**
 * /lab/startline - the first surface in Parquet that is about tonight.
 *
 * Everything else here is stable between visits: a season recap reads the same at
 * breakfast and at midnight. This page is stale in ten minutes, which is why it wears
 * a visible "as of" stamp and why the Sleeper link sits at the top rather than the
 * bottom - for a decision made while a game is on, the app-switch is most of the cost
 * of the decision.
 *
 * THE SCOPE LINE, and it is the whole design: this page shows STATE and CONTEXT and
 * then stops. It never ranks the roster, never proposes a lineup, never says lock and
 * never says wait. See lib/lab/startline/index.ts for the argument; every refusal
 * below is printed on the surface in the reader's own words, not buried in a
 * disclosure, because a refusal a reader has to go looking for is not one.
 */
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import {
  loadStartLine,
  startLineSeasons,
  type StartLineSeason,
} from "@/lib/lab/startline/load";
import {
  parPercentile,
  type BoardGame,
  type GameLogRow,
  type SlotPar,
  type WeekBoard,
} from "@/lib/lab/startline";
import { describeGame } from "@/lib/lab/startline";
import { CHART_ACCENT, CHART_GRID, CHART_NEUTRAL } from "@/lib/chart-colors";
import { sleeperMatchupUrl } from "@/lib/sleeperLinks";
import { Card, Disclosure, EmptyState, PageHeader, SectionHeader } from "@/components/ui";
import { ExperimentBadge } from "@/components/ExperimentBadge";
import { OpenInSleeper } from "@/components/OpenInSleeper";
import { LocalTime } from "@/components/LocalDate";
import { Onward } from "@/components/Onward";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "The start line - Parquet Lab",
};

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** "2025-11-18" -> "Tue 18 Nov". Date-only, so it is parsed and printed in UTC. */
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// ------------------------------------------------------------------ 1. slot par

/**
 * THE PAR STRIP. What a lock-in slot has been worth in this league, drawn as the
 * distribution it is rather than as the single number it is usually reduced to.
 *
 * Hand-rolled inline SVG (D3), integer coordinates only - unrounded floats serialize
 * differently on the server and the client and have broken hydration on this project.
 * The two reference marks are median and p90 and they are LABELLED AS QUANTILES, not
 * as thresholds: half the league's slots are under the median by construction, so
 * calling it a pass mark would be a grade, and D6 forbids grades.
 */
function ParStrip({ par, marks }: { par: SlotPar; marks: number[] }) {
  const W = 320;
  const H = 62;
  const PAD = 6;
  const BASE = 46;
  const TOP = 14;
  const hi = Math.max(par.max, ...marks, 1);
  const x = (v: number) => Math.round(PAD + (v / hi) * (W - PAD * 2));
  const tallest = Math.max(1, ...par.bins.map((b) => b.count));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={
        `Every scoring lock-in slot this league has banked: ${par.n} of them, ` +
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
      <line x1={PAD} y1={BASE} x2={W - PAD} y2={BASE} stroke={CHART_GRID} strokeWidth={1} />
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

// ------------------------------------------------------------------ 2. the board

function SlotChips({ board }: { board: WeekBoard }) {
  return (
    <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {board.slots.map((s) => (
        <li
          key={s.index}
          className={
            s.empty
              ? "rounded-[--radius-sm] border border-dashed border-border-strong bg-transparent p-2"
              : "rounded-[--radius-sm] border border-border bg-surface p-2"
          }
        >
          <div className="text-micro uppercase tracking-wide text-faint">{s.label}</div>
          <div className="truncate text-meta leading-tight text-ink">
            {s.playerName ?? "open"}
          </div>
          <div
            className={`figure text-meta ${s.empty ? "text-secondary" : "text-accent-text"}`}
          >
            {s.empty ? "not spent" : fmt(s.banked)}
          </div>
        </li>
      ))}
    </ul>
  );
}

function GameRow({ g }: { g: BoardGame }) {
  return (
    <li className="flex items-center gap-2 border-b border-border py-1.5 last:border-0">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-meta leading-tight text-ink">
          {g.playerName}
          {g.slotted && <span className="text-faint"> · already slotted</span>}
        </span>
        <span className="block truncate text-micro leading-tight text-secondary">
          {g.home ? "vs" : "at"} {g.opponent ?? "unlisted"}
          {g.backToBack && " · second night in two"}
          {/* "Left" is only true of a game that has not been played. On a finished
              week this label disappears rather than counting played games as
              remaining, which is the same refusal as the zero above the board. */}
          {!g.slotted && !g.played && g.gamesLeftForPlayer > 1 && (
            <> · {g.gamesLeftForPlayer} games left this week</>
          )}
        </span>
      </span>
      <span className="shrink-0 figure text-micro text-faint">
        {g.played ? "played" : "to play"}
      </span>
    </li>
  );
}

// ------------------------------------------------------------------ 3. the log

function LogRow({ row }: { row: GameLogRow }) {
  return (
    <li className="border-b border-border py-0.5 last:border-0">
      {/* Native <details> rather than the house `Disclosure`: this summary is a whole
          data row, not a one-line topic, so it takes the row layout instead. Still no
          JS, still keyboard and screen-reader correct, still survives a print. */}
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2">
          <span className="w-20 shrink-0 figure text-micro text-faint">{row.date}</span>
          <span className="min-w-0 flex-1 truncate text-meta text-ink">
            {row.home === null ? "" : row.home ? "vs " : "at "}
            {row.opponent ?? "unlisted"}
            {row.started === false && (
              <span className="ml-1 text-micro text-secondary">not in the five</span>
            )}
            {row.lateMargin && (
              <span className="ml-1 text-micro text-warn">wide by the third</span>
            )}
          </span>
          <span className="w-12 shrink-0 text-right figure text-micro text-secondary">
            {row.minutes != null ? `${fmt(row.minutes)}m` : "-"}
          </span>
          <span className="w-12 shrink-0 text-right figure text-meta text-ink">
            {fmt(row.points)}
          </span>
          <ChevronRight
            size={12}
            aria-hidden="true"
            className="shrink-0 text-faint transition-transform group-open:rotate-90"
          />
        </summary>
        <p className="mb-1.5 rounded-[--radius-sm] border border-border bg-surface p-2 text-note leading-snug text-muted">
          {describeGame(row)}
        </p>
      </details>
    </li>
  );
}

// ------------------------------------------------------------------ the page

function Pills({
  seasons,
  active,
}: {
  seasons: StartLineSeason[];
  active: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {seasons.map((s) => (
        <Link
          key={s.season}
          href={`/lab/startline?season=${s.season}`}
          aria-current={s.season === active ? "page" : undefined}
          className={`inline-flex min-h-11 items-center rounded-full border px-3 figure text-meta ${
            s.season === active
              ? "border-accent-edge bg-accent-wash text-accent-text"
              : "border-border text-muted"
          }`}
        >
          {s.season}
        </Link>
      ))}
    </div>
  );
}

export default async function StartLinePage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; week?: string; player?: string }>;
}) {
  const sp = await searchParams;
  const h = await getLeagueHistory();
  const options = startLineSeasons(h);
  const played = options.filter((o) => o.lastScoredWeek > 0);
  const chosen =
    options.find((o) => o.season === sp.season) ?? played[0] ?? options[0] ?? null;
  const rosterId = h.me.rosterId ?? h.rosters[0]?.rosterId;

  const header = (
    <PageHeader
      kicker="The Lab"
      title="The start line"
      subtitle="Seven lock-in slots a week. This shows you where they stand. It does not tell you what to do with them."
      action={<ExperimentBadge />}
    />
  );

  if (!chosen || rosterId == null) {
    return (
      <div>
        {header}
        <EmptyState title="No week to read">
          This league has no scored weeks on record yet.
        </EmptyState>
        <Onward steps={LAB_STEPS} />
      </div>
    );
  }

  if (!chosen.lockIn) {
    return (
      <div>
        {header}
        <EmptyState title={`${chosen.season} was not a lock-in season`}>
          Everything on this page is arithmetic about spending a slot on one night.
          Under head-to-head scoring the question does not exist, so the page does not
          pretend to answer it.
        </EmptyState>
        <Onward steps={LAB_STEPS} />
      </div>
    );
  }

  if (chosen.lastScoredWeek === 0) {
    return (
      <div>
        {header}
        <Pills seasons={options} active={chosen.season} />
        <EmptyState title={`${chosen.season} has not tipped off`}>
          The league reports no scored weeks, and the NBA schedule feed returns nothing
          for this season yet. There is no week in front of you, so none is drawn and
          none is estimated.
          {played.length > 0 && (
            <>
              {" "}
              <Link href={`/lab/startline?season=${played[0].season}`} className="text-accent-text underline">
                Read {played[0].season} instead
              </Link>
              , as it finished.
            </>
          )}
        </EmptyState>
        <Onward steps={LAB_STEPS} />
      </div>
    );
  }

  const requestedWeek = sp.week ? Number(sp.week) : undefined;
  const s = await loadStartLine(h, rosterId, chosen, {
    week: requestedWeek,
    playerId: sp.player,
  });
  const { par, board, live, week } = s;

  const banked = board.slots.filter((x) => !x.empty).map((x) => x.banked);
  const latest = banked.length ? banked[banked.length - 1] : null;
  const deadRate = par.totalSlots ? (par.deadSlots / par.totalSlots) * 100 : 0;
  const teamWeeks = Math.round(par.totalSlots / Math.max(1, chosen.slotLabels.length));

  const weekHref = (w: number) =>
    `/lab/startline?season=${chosen.season}&week=${w}${sp.player ? `&player=${sp.player}` : ""}`;

  return (
    <div>
      {header}

      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-micro leading-snug text-secondary">
          Read at <LocalTime ts={s.asOf} className="figure" />. Every other page in
          Parquet is the same when you come back. This one is not.
        </p>
        <OpenInSleeper
          href={sleeperMatchupUrl(chosen.leagueId)}
          label="Sleeper"
          variant="button"
        />
      </div>

      <Card className="mb-3">
        <p className="text-body leading-relaxed text-ink">
          This page will not tell you to lock a player, and it will not tell you to
          wait.
        </p>
        <p className="mt-1.5 text-body leading-relaxed text-muted">
          Nothing here knows what anybody will score tonight. What it can do is put the
          state of your week and the shape of this league&apos;s own history on one
          screen, so the decision is made against real numbers instead of a feeling
          about a number. The decision stays yours, and it is executed in Sleeper,
          which is read-only to us.
        </p>
      </Card>

      <Pills seasons={played} active={chosen.season} />

      {!live && (
        <Card className="mb-3 border-warn/30 bg-warn/5">
          <p className="text-body leading-relaxed text-ink">
            {chosen.status === "complete"
              ? `The ${chosen.season} season is over.`
              : `The league is not in season.`}{" "}
            You are reading week {week} as it finished, not as it stood.
          </p>
          <p className="mt-1.5 text-meta leading-snug text-muted">
            Every game below has already been played, so &quot;player-games left&quot;
            is zero and says so rather than printing a hopeful number. The par
            distribution is unaffected: it is history either way.
          </p>
        </Card>
      )}

      {/* ---------------------------------------------------------- slot par */}
      <SectionHeader title="Slot par" />
      <p className="mb-1.5 text-note leading-snug text-muted">
        What one slot has been worth in this league, over every slot every manager has
        banked. The gold marks are your {banked.length} spent slots this week.
      </p>
      {par.n === 0 ? (
        <EmptyState title="No slot has been scored yet">
          Par is this league&apos;s own history and there is none to read. No default
          distribution is substituted for it.
        </EmptyState>
      ) : (
        <>
          <ParStrip par={par} marks={banked} />
          {/* A LEGEND, not an axis. Spreading four labels edge to edge under the
              drawing would put "p90" a centimetre from the dashed line it names, and
              a caption that lies about a position is worse than no caption. The two
              range ends and the two quantiles read as one sentence instead. */}
          <p className="figure text-micro leading-snug text-secondary">
            0 to {fmt(par.max)} · dashed marks are median {fmt(par.median)} and p90{" "}
            {fmt(par.p90)}
          </p>
          <p className="mt-1.5 figure text-note leading-snug text-ink">
            {board.openSlots} {board.openSlots === 1 ? "slot" : "slots"} left ·{" "}
            {board.gamesLeft} player-{board.gamesLeft === 1 ? "game" : "games"} left
          </p>
          <p className="mt-1 text-note leading-snug text-muted">
            {par.n.toLocaleString("en-US")} scoring slots across {teamWeeks} team-weeks
            of {chosen.season}. Mean {fmt(par.mean)}, median {fmt(par.median)}, and the
            top tenth start at {fmt(par.p90)}.{" "}
            {latest != null && (
              <>
                Your last spent slot, {fmt(latest)}, sits above{" "}
                {parPercentile(par, latest)}% of them.
              </>
            )}
          </p>
          <p className="mt-1 text-micro leading-snug text-secondary">
            Half of all slots are under the median by construction, so it is a middle
            and not a pass mark. Neither figure is a forecast of tonight.
          </p>
        </>
      )}

      {/* ------------------------------------------------------- the week board */}
      <SectionHeader
        title={`Week ${week}`}
        action={
          <span className="flex items-center gap-1">
            {week > 1 && (
              <Link
                href={weekHref(week - 1)}
                aria-label={`Week ${week - 1}`}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </Link>
            )}
            {week < chosen.lastScoredWeek && (
              <Link
                href={weekHref(week + 1)}
                aria-label={`Week ${week + 1}`}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            )}
          </span>
        }
      />
      <SlotChips board={board} />
      <p className="mt-1.5 figure text-note leading-snug text-muted">
        {fmt(board.bankedSoFar)} banked · {board.openSlots} of{" "}
        {chosen.slotLabels.length} slots open
      </p>

      {s.scheduleEmpty ? (
        <Card className="mt-2">
          <p className="text-note leading-snug text-muted">
            The NBA schedule feed returns nothing for {chosen.season}, so the nights
            cannot be listed. The seven chips above come from the league itself and are
            unaffected.
          </p>
        </Card>
      ) : board.days.length === 0 ? (
        <Card className="mt-2">
          <p className="text-note leading-snug text-muted">
            No rostered player has a game in week {week}.
          </p>
        </Card>
      ) : (
        <div className="mt-2">
          {board.days.map((d) => (
            <div key={d.date} className="mb-2">
              <h3 className="mb-0.5 text-micro font-semibold uppercase tracking-[0.14em] text-faint">
                {dayLabel(d.date)}
              </h3>
              <ul>
                {d.games.map((g) => (
                  <GameRow key={`${g.gameId}-${g.playerId}`} g={g} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="mt-1 text-micro leading-snug text-secondary">
        A board, not a shortlist. The rows are in name order inside each night, because
        any other order would be a ranking and this page does not rank.
        {board.playersWithoutTeam > 0 && (
          <>
            {" "}
            {board.playersWithoutTeam} rostered{" "}
            {board.playersWithoutTeam === 1 ? "player has" : "players have"} no NBA team
            on file, so no nights could be found for{" "}
            {board.playersWithoutTeam === 1 ? "him" : "them"}.
          </>
        )}
      </p>

      {/* ------------------------------------------------------------- the log */}
      <SectionHeader title="Game log, with the context marked" />
      <div className="mb-2 flex flex-wrap gap-1.5">
        {s.logChoices.slice(0, 12).map((c) => (
          <Link
            key={c.playerId}
            href={`/lab/startline?season=${chosen.season}&week=${week}&player=${c.playerId}`}
            aria-current={c.playerId === s.logPlayerId ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border px-3 text-meta ${
              c.playerId === s.logPlayerId
                ? "border-accent-edge bg-accent-wash text-accent-text"
                : "border-border text-muted"
            }`}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {!s.logPlayerId ? (
        <Card>
          <p className="text-note leading-snug text-muted">
            Pick a player above to read his last ten games. One name at a time, on
            purpose: the log costs a request per player, and a wall of ten logs would be
            a ranking with extra steps.
          </p>
        </Card>
      ) : s.log.length === 0 ? (
        <EmptyState title={`No games on record for ${s.logPlayerName}`}>
          The stats feed returned nothing for him this season. Nothing is filled in.
        </EmptyState>
      ) : (
        <>
          <ul>
            {s.log.map((row) => (
              <LogRow key={`${row.gameId}-${row.date}`} row={row} />
            ))}
          </ul>
          <p className="mt-1.5 text-micro leading-snug text-secondary">
            Tap a row for the sentence. &quot;Not in the five&quot; means exactly that:
            the schedule proves who started, and Sleeper publishes no historical
            inactive list, so this page never says a player was out. &quot;Wide by the
            third&quot; marks a game whose margin was {18} or more after three quarters.
          </p>
          <p className="mt-1 text-micro leading-snug text-secondary">
            There is no adjusted figure here and there will not be one. A wide margin
            costs a star far more than it gives a reserve, it is only knowable after the
            fact, and a season gives any one player about a dozen such games. A
            &quot;true&quot; score built on that would be a guess wearing a decimal
            point.
          </p>
        </>
      )}

      <div className="mt-5">
        <Disclosure summary="How this is built, and what it cannot see">
          <ul className="space-y-1.5">
            <li>
              Par is every slot this league banked in {chosen.season}:{" "}
              {par.totalSlots.toLocaleString("en-US")} slots across {teamWeeks}{" "}
              team-weeks, straight from Sleeper&apos;s own{" "}
              <code className="font-mono">starters_points</code>. Slots that banked
              exactly nothing are excluded from the distribution and counted here
              instead: {par.deadSlots} of them, {deadRate.toFixed(1)}%, which is{" "}
              {(par.deadSlots / Math.max(1, teamWeeks)).toFixed(2)} wasted slots per
              team-week.{" "}
              {par.negativeSlots > 0 && (
                <>
                  A further {par.negativeSlots}{" "}
                  {par.negativeSlots === 1 ? "slot" : "slots"}{" "}
                  finished below zero,
                  which this league&apos;s scoring permits; they are counted here and
                  not plotted, because a strip that starts at zero cannot hold them
                  without distorting the shape of the other{" "}
                  {par.n.toLocaleString("en-US")}.
                </>
              )}
            </li>
            <li>
              A slot holds one player-GAME, not a player-week, and a player can fill at
              most one slot. That is why the arithmetic counts player-games and why an
              already-slotted player&apos;s remaining nights do not count toward what is
              left.
            </li>
            <li>
              Nights come from the NBA schedule feed, which also carries each side&apos;s
              starting five. On a game that has not been played that five is a
              projection, and it is never shown as fact: the log leaves the mark blank
              until the game is complete.
            </li>
            <li>
              Position eligibility is NOT applied to the board. Sleeper reports only
              today&apos;s eligibility, so a night listed here is not a promise that the
              player is legal in the slot you have open.
            </li>
            <li>
              Reserve and taxi players sit in the weekly roster list and could not
              legally be started. Per-week reserve status is not recoverable from any
              endpoint, so a little of the board was never actually startable.
            </li>
            <li>
              Read on demand: {s.requests} requests this render, memoized for 30 minutes
              in-process and never touched by the rest of the app. The season&apos;s
              lineups are the same cache the regret ledger fills.
            </li>
          </ul>
        </Disclosure>
      </div>

      <Onward steps={LAB_STEPS} />
    </div>
  );
}

/**
 * This surface is deliberately not in the registry (see lib/lab/index.ts), so its next
 * steps are stated rather than resolved. Two of them, which is the floor `nav.test.ts`
 * enforces for everything that IS registered - a Lab page should not be a dead end
 * either.
 */
const LAB_STEPS = [
  {
    href: "/lab/regret",
    label: "The regret ledger",
    why: "How did the weeks I already spent turn out?",
  },
  {
    href: "/roster",
    label: "Roster",
    why: "Who is actually on this team?",
  },
  {
    href: "/lab",
    label: "The Lab",
    why: "What else is being tried?",
  },
];
