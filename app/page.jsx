import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getPrincipals } from "@/lib/principals";
import { loadDigest } from "@/lib/digest";
import { currentFormByRoster } from "@/lib/roster";
import { ordinal } from "@/lib/derive/describe";
import { actionQueue } from "@/lib/actions";
import { loadWeek } from "@/lib/week/load";
import { easternStamp } from "@/lib/lockin/view";
import { replayAllowed } from "@/lib/lockin/source";
import { DigestBeacon } from "@/components/DigestBeacon";
import { ActionQueue } from "@/components/ActionQueue";
import { RosterCrunchPanel } from "@/components/RosterCrunchPanel";
import { LockDeskBoard } from "@/components/lockin/LockDeskBoard";
import { DeadlineStrip } from "@/components/week/DeadlineStrip";
import { InjuredStarters } from "@/components/week/InjuredStarters";

export const dynamic = "force-dynamic";

export default async function ThisWeekPage({ searchParams }) {
  const at = (await searchParams)?.at;
  const replay = replayAllowed() && typeof at === "string" ? at : null;
  const h = await getLeagueHistory();
  const principals = await getPrincipals(h);
  const rosterId = h.me.rosterId;
  const [week, forms, digest] = await Promise.all([
    loadWeek(h, rosterId, { replay }),
    currentFormByRoster(h),
    loadDigest(h),
  ]);
  const form = forms.get(rosterId);
  const actions = actionQueue(h, rosterId, principals);
  const teamName = h.me.teamName ?? h.me.displayName;
  const hd = week.header;
  const season = h.currentLeague.season;

  return (
    <div>
      {h.provider === "fixture" && (
        <div className="mb-3 flex items-start gap-2.5 rounded-[--radius] border border-warn/40 bg-warn/[0.08] p-3">
          <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
          <p className="text-note leading-snug text-muted">
            <span className="block text-body font-semibold text-warn">
              Synthetic demo data, not your league
            </span>
            Every name, trade and value is invented. Remove{" "}
            <span className="font-mono">LEAGUE_PROVIDER=fixture</span> to load
            the real league.
          </p>
        </div>
      )}

      <header className="mb-3">
        <p className="text-meta font-semibold uppercase tracking-[0.18em] text-accent-text">
          {week.offseason ? "Offseason" : "This week"} · {teamName}
        </p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-display font-bold leading-none text-ink">
              {week.offseason
                ? `${season} offseason`
                : week.week != null
                  ? `Week ${week.week}`
                  : "Week unknown"}
            </h1>
            <span aria-hidden="true" className="mt-1.5 block h-[3px] w-14 rounded-full bg-accent" />
          </div>
          {form && (
            <Link
              href="/league"
              className="flex min-h-11 shrink-0 flex-col items-end justify-end text-right"
            >
              <span className="figure text-lede font-semibold leading-none text-ink">
                {form.wins}-{form.losses}
              </span>
              <span className="mt-0.5 figure text-meta text-secondary">
                {ordinal(form.rank)} of {form.teams}
                {form.isLive ? "" : `, ${form.season} final`}
              </span>
            </Link>
          )}
        </div>
        {!week.offseason && (
          <p className="mt-2 figure text-meta text-secondary">
            {(hd
              ? [hd.range, `${hd.locked} locked`, `${hd.open} open`, `${hd.points} pts`, week.desk?.generatedAt ? `as of ${easternStamp(week.desk.generatedAt)}` : null]
              : [week.desk?.message]
            )
              .filter(Boolean)
              .join(" · ") || "Dates unknown"}
          </p>
        )}
      </header>

      {week.offseason ? (
        <>
          <RosterCrunchPanel h={h} rosterId={rosterId} className="mb-3" />
          <Link
            href={`/drafts/${season}`}
            className="flex min-h-11 items-center gap-2.5 rounded-[--radius-sm] border border-border bg-surface px-3 py-2 transition-colors hover:bg-surface-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-micro font-semibold uppercase tracking-[0.14em] text-accent-text">
                Rookie draft
              </span>
              <span className="block text-body font-semibold text-ink">
                {h.completedDraftSeasons?.has?.(season)
                  ? `The ${season} draft is done: see the class`
                  : `The ${season} draft has not run yet`}
              </span>
            </span>
            <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-faint" />
          </Link>
        </>
      ) : (
        <>
          {week.desk && <LockDeskBoard rosterId={rosterId} desk={week.desk} mode="compact" showHeader={week.desk.status !== "in_season"} />}
        </>
      )}

      <DeadlineStrip deadlines={week.deadlines} week={week.week} window={week.window} />
      {week.desk?.status === "in_season" && <InjuredStarters injured={week.injured} />}
      <ActionQueue items={actions} compact className="mt-4" />

      <DigestBeacon metrics={digest.nextMetrics} />

      <nav aria-label="Also this week" className="mt-4 flex flex-wrap gap-x-4 text-meta">
        <Link
          href="/lab/pulse"
          className="inline-flex min-h-11 items-center gap-0.5 font-semibold text-accent-text"
        >
          What moved in the league
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
        {rosterId != null && (
          <Link
            href={`/managers/${rosterId}`}
            className="inline-flex min-h-11 items-center gap-0.5 font-semibold text-accent-text"
          >
            Your dossier
            <ChevronRight size={13} aria-hidden="true" />
          </Link>
        )}
      </nav>
    </div>
  );
}
