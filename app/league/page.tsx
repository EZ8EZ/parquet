import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { leagueValueRanking, currentFormByRoster } from "@/lib/roster";
import { leagueTimelines } from "@/lib/metrics/duration";
import { leagueFragility } from "@/lib/metrics/fragility";
import { buildQuadrantView } from "@/lib/metrics/quadrant";
import { LeagueBoard } from "@/components/LeagueBoard";
import { DeltaValue, SectionHeader } from "@/components/ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { fmtValue } from "@/lib/ui";
import { ordinal } from "@/lib/derive/describe";
import { OpenInSleeper } from "@/components/OpenInSleeper";
import { sleeperLeagueUrl } from "@/lib/sleeperLinks";
import { curatedSurfaces } from "@/lib/nav";
import { Onward } from "@/components/Onward";

export const dynamic = "force-dynamic";

const WINDOW_INK = {
  rebuilding: "text-info",
  "win-now": "text-accent-text",
  balanced: "text-muted",
} as const;

/**
 * Posture as ink on the TCI figure rather than as a `<Tag>` pill. Same four readings
 * the deleted timelines list carried, at a fraction of the row height, and it keeps
 * the one negative reading (straddling) legible without giving the other three the
 * visual weight of a chip.
 */
const POSTURE_INK: Record<string, string> = {
  contending: "text-accent-text",
  ascending: "text-positive",
  rebuilding: "text-info",
  straddling: "text-negative",
};

export default async function LeaguePage() {
  const h = await getLeagueHistory();
  const ranked = leagueValueRanking(h);
  const timelines = leagueTimelines(h);
  const fragility = leagueFragility(h);
  const form = await currentFormByRoster(h);
  const meId = h.me.rosterId;
  // Most of a dynasty league's calendar has the live season sitting at 0-0 in
  // pre-draft, so the whole-league form is worth a callout when nobody has played yet.
  const seasonLive = [...form.values()].some((f) => f.isLive);

  const contenders = ranked.filter((r) => r.window === "win-now").length;
  const rebuilders = ranked.filter((r) => r.window === "rebuilding").length;
  const balanced = ranked.length - contenders - rebuilders;

  const leaderValue = ranked[0]?.totalValue ?? 1;
  const leagueValue = ranked.reduce((s, r) => s + r.totalValue, 0);
  const median = ranked.length
    ? ranked[Math.floor(ranked.length / 2)].totalValue
    : 0;
  const myRank = meId != null ? ranked.findIndex((r) => r.rosterId === meId) + 1 : 0;

  // The two proprietary metrics on one pair of axes. Both passes are already computed
  // above / here, so the board costs a join rather than a third walk of the league.
  const built = buildQuadrantView(
    timelines,
    fragility.map((f) => ({
      rosterId: f.rosterId,
      fragility: f.fragility,
      percentile: f.percentile,
      band: f.band,
      spofName: f.singlePointOfFailure?.name ?? null,
      spofShare: f.singlePointOfFailure?.damageShare ?? null,
    })),
    meId,
  );

  /*
   * ONE NUMBERING FOR THE WHOLE PAGE.
   *
   * The page now renders one chart and one list, so the dot labelled 7 has to be row 7
   * or the chart is decoration. `buildQuadrantView` numbers by its own reading order
   * (worst corner first) and the timeline chart used to number by TCI rank - three
   * renderings, three numberings, which was survivable only because each had its own
   * list directly under it. Both charts now key to the power ranking instead.
   */
  const nByRoster = new Map(ranked.map((r, i) => [r.rosterId, i + 1]));
  const board = {
    ...built,
    points: built.points.map((p) => ({ ...p, n: nByRoster.get(p.rosterId) ?? p.n })),
  };

  // Same join, for the roster list: one row now carries what three lists used to.
  const metricByRoster = new Map(board.points.map((p) => [p.rosterId, p]));
  const durationByRoster = new Map(timelines.map((t) => [t.rosterId, t.rosterDuration]));

  return (
    <div>
      <header className="mb-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-meta font-semibold uppercase tracking-[0.18em] text-accent-text">
              {h.currentLeague.name}
            </p>
            <h1 className="font-display text-display font-semibold leading-tight text-ink">
              The League
            </h1>
          </div>
          <OpenInSleeper
            href={sleeperLeagueUrl(h.currentLeague.leagueId)}
            label="Sleeper"
            className="shrink-0"
          />
        </div>
        <p className="mt-1 figure text-meta text-secondary">
          {h.currentLeague.totalRosters} teams · {h.chain.length} seasons ·{" "}
          {h.currentLeague.season} · {fmtValue(h.transactions.length)} transactions
        </p>
      </header>

      {/* Window split as one rail rather than three tall cards. */}
      <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-[--radius-sm] border border-border bg-surface">
        <Split n={contenders} label="win-now" className="text-accent-text" />
        <Split n={balanced} label="balanced" className="text-ink" />
        <Split n={rebuilders} label="rebuilding" className="text-info" />
      </div>

      <p className="mt-1.5 figure text-meta text-secondary">
        league value {fmtValue(leagueValue)} · median {fmtValue(median)}
        {myRank > 0 && (
          <>
            {" "}
            · you rank{" "}
            <span className="font-semibold text-accent-text">
              {myRank}/{ranked.length}
            </span>
          </>
        )}
      </p>

      {/* Same registry Home's grid and /more read (lib/nav.ts) - this pill row and
          Home's grid used to be two independently hand-kept lists that had already
          silently diverged before round 6 (neither included Manager Compare or
          /rank). One shared source instead of two, plus a real full index for
          everything not curated here. */}
      <nav aria-label="League sections" className="scroll-x mt-2 flex gap-1.5">
        {curatedSurfaces().map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-border bg-surface px-3 text-note font-semibold text-muted transition-colors hover:border-accent hover:text-accent-text"
          >
            {s.label}
          </Link>
        ))}
        <Link
          href="/more"
          className="inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-full border border-dashed border-border px-3 text-note font-semibold text-muted transition-colors hover:border-accent hover:text-accent-text"
        >
          All surfaces
          <ChevronRight size={12} aria-hidden="true" />
        </Link>
      </nav>

      {/*
        ONE CHART. It used to be two, each with its own fourteen-row list under it, and
        then the power ranking made a fourth rendering of the same fourteen rosters.
        Both scatters plot TCI on y and differ only in what sits on x, so they are one
        toggled board now - see components/LeagueBoard.tsx and lib/league/url.ts.
      */}
      <SectionHeader
        title="The board"
        href="/methodology"
        cta="how TCI and RFI work"
      />
      {/* Suspense because LeagueBoard reads the query string through useSearchParams,
          the same contract /values' list is mounted under. This page is force-dynamic,
          so the boundary never actually suspends. */}
      <Suspense fallback={null}>
        <LeagueBoard
          points={board.points.map((p) => ({
            n: p.n,
            duration: durationByRoster.get(p.rosterId) ?? 0,
            tci: p.tci,
            isMe: p.isMe,
          }))}
          view={board}
        />
      </Suspense>

      {/*
        ONE LIST, and it is the one the chart numbers key to. It carries what the two
        deleted lists carried - TCI with its posture, RFI with its band - on a second
        mono line, so nothing that was readable before is unreadable now; there is
        simply one row per roster instead of three.
      */}
      <SectionHeader
        title="Power ranking - by roster value"
        action={
          !seasonLive ? (
            <span className="min-w-0 shrink text-right text-meta leading-tight text-secondary">
              records are last season&rsquo;s final
            </span>
          ) : undefined
        }
      />

      <ul className="space-y-1">
        {ranked.map((r, i) => {
          const isMe = r.rosterId === meId;
          const ownerId = h.rostersById.get(r.rosterId)?.ownerId;
          const user = ownerId ? h.usersById.get(ownerId) : undefined;
          const pct = Math.max(3, Math.round((r.totalValue / leaderValue) * 100));
          const f = form.get(r.rosterId);
          const m = metricByRoster.get(r.rosterId);
          return (
            <li key={r.rosterId}>
              {/* The whole row is the hit area - one target, one destination. */}
              <Link
                href={`/managers/${r.rosterId}`}
                className={`flex min-h-11 items-center gap-2.5 rounded-[--radius-sm] border px-2.5 py-1.5 transition-colors hover:border-border-strong hover:bg-surface-2 ${
                  isMe
                    ? "border-accent-edge bg-accent-wash"
                    : "border-border bg-surface"
                }`}
              >
                <span className="w-4 shrink-0 text-center figure text-meta text-secondary">
                  {i + 1}
                </span>
                <TeamAvatar
                  name={r.teamName ?? r.ownerName}
                  avatarId={user?.avatar}
                  teamLogoUrl={user?.teamLogoUrl}
                  size="sm"
                  isMe={isMe}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-body font-semibold leading-tight text-ink">
                      {r.teamName ?? r.ownerName}
                    </span>
                    {isMe && (
                      <span className="shrink-0 rounded-full bg-accent-wash px-1.5 text-meta font-semibold leading-tight text-accent-text">
                        you
                      </span>
                    )}
                  </span>
                  <span className="mt-px block truncate figure text-meta text-secondary">
                    {r.ownerName} ·{" "}
                    {f ? (
                      <>
                        {f.wins}-{f.losses}
                        {!f.isLive && " (last)"} · {ordinal(f.rank)} of {f.teams} ·{" "}
                      </>
                    ) : (
                      `${r.record.wins}-${r.record.losses} · `
                    )}
                    <span className={WINDOW_INK[r.window]}>{r.window}</span>
                  </span>
                  {/* The line that used to be two separate fourteen-row lists.
                      NUMBERS FIRST, WORD LAST, and that ordering is the whole design of
                      this line: at 375px it is the first thing on the row with no room
                      to spare, so what truncation eats has to be the recoverable half.
                      Posture is a label the board itself prints; TCI and RFI are the
                      figures the two deleted lists existed to carry.

                      Posture is ink on the row rather than the `<Tag>` pill it wore in
                      the timelines list, and the fragility BAND is not printed here at
                      all - "resilient" as a chip on a torn-down roster is exactly the
                      claim D23 refuses, and the board's own panel says it properly, in
                      percentile terms, for the roster you selected. */}
                  {m && (
                    <span className="block truncate figure text-meta text-secondary">
                      TCI <span className="text-muted">{m.tci}</span> · RFI{" "}
                      <span className="text-muted">{m.fragility}</span> ·{" "}
                      <span className={POSTURE_INK[m.posture] ?? "text-muted"}>
                        {m.posture}
                      </span>
                    </span>
                  )}
                  <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-elevated">
                    <span
                      className={`block h-full rounded-full ${
                        isMe ? "bg-accent" : "bg-accent-strong"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block figure text-body font-semibold leading-tight text-ink">
                    {fmtValue(r.totalValue)}
                  </span>
                  <span className="block whitespace-nowrap figure text-meta leading-tight text-secondary">
                    1sts <DeltaValue n={r.picks.extraFirsts} />
                  </span>
                  <span className="block whitespace-nowrap figure text-meta leading-tight text-secondary">
                    age {r.coreAge ?? "-"}
                  </span>
                </span>
                <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-faint" />
              </Link>
            </li>
          );
        })}
      </ul>

      {/* This is also /commissioner's first inbound link in the app's history. The
          pill row above is the CURATED set and adding a commissioner-only surface to
          it would put a tool most of the league cannot use in front of all of them;
          the onward row is where a page says what a reader might want next, which is
          exactly the register that link belongs in. */}
      <Onward from="/league" />
    </div>
  );
}

function Split({
  n,
  label,
  className,
}: {
  n: number;
  label: string;
  className: string;
}) {
  return (
    <div className="px-2.5 py-1.5 text-center">
      <div className={`figure text-lede font-semibold leading-tight ${className}`}>
        {n}
      </div>
      <div className="text-meta uppercase tracking-wide text-secondary">{label}</div>
    </div>
  );
}
