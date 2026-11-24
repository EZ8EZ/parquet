import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { getPrincipals } from "@/lib/principals";
import { loadDigest } from "@/lib/digest";
import { currentFormByRoster } from "@/lib/roster";
import { ordinal } from "@/lib/derive/describe";
import { actionQueue } from "@/lib/actions";
import { loadSlotPreview, weekContext } from "@/lib/week/load";
import { replayAllowed } from "@/lib/lockin/source";
import { parseAssume } from "@/lib/lockin/assume";
import { Chip, List, ListRow, PageHeader } from "@/components/ui";
import { DigestBeacon } from "@/components/DigestBeacon";
import { ActionQueue } from "@/components/ActionQueue";
import { RosterCrunchPanel } from "@/components/RosterCrunchPanel";
import { HomeWeek } from "@/components/week/HomeWeek";
import { SlotPreview } from "@/components/week/SlotPreview";

export const dynamic = "force-dynamic";

export default async function ThisWeekPage({ searchParams }) {
  const sp = await searchParams;
  const at = sp?.at;
  // the viewer's what-if lock states (?assume=m3L,t5O): URL only, never stored
  const assume = parseAssume(sp?.assume).list;
  const replay = replayAllowed() && typeof at === "string" ? at : null;
  const h = await getLeagueHistory();
  const rosterId = h.me.rosterId;
  const ctx = weekContext(h);
  const [principals, forms, digest, preview] = await Promise.all([
    getPrincipals(h),
    currentFormByRoster(h),
    loadDigest(h),
    ctx.offseason || rosterId == null || replay ? null : loadSlotPreview(h, rosterId),
  ]);
  const form = forms.get(rosterId);
  const actions = actionQueue(h, rosterId, principals);
  const teamName = h.me.teamName ?? h.me.displayName;
  const season = h.currentLeague.season;

  const inWeek = !ctx.offseason && rosterId != null;
  return (
    <div>
      {!inWeek && <PageHeader
        kicker={teamName}
        title={ctx.offseason ? `${season} offseason` : "This week"}
        aside={
          form ? (
            <Link href="/league" className="flex min-h-11 flex-col items-end justify-center text-right">
              <span className="figure text-lede font-bold text-ink">
                {form.wins}-{form.losses}
              </span>
              <span className="figure text-meta text-secondary">
                {ordinal(form.rank)} of {form.teams}
                {form.isLive ? "" : `, ${form.season} final`}
              </span>
            </Link>
          ) : null
        }
        below={
          h.provider === "fixture" ? (
            <Chip tone="warn" icon={AlertTriangle} className="mt-2">
              Demo data, not your league
            </Chip>
          ) : null
        }
      />}

      {ctx.offseason ? (
        <>
          <RosterCrunchPanel h={h} rosterId={rosterId} className="mb-3" />
          <List>
            <li>
              <ListRow
                href={`/drafts/${season}`}
                title={h.completedDraftSeasons?.has?.(season) ? `The ${season} draft is done: see the class` : `The ${season} draft has not run yet`}
                meta="Rookie draft"
              />
            </li>
          </List>
        </>
      ) : rosterId != null ? (
        <Suspense fallback={<SlotPreview preview={preview} />}>
          <HomeWeek h={h} rosterId={rosterId} replay={replay} assume={assume} record={form ? `${form.wins}-${form.losses}` : null} />
        </Suspense>
      ) : null}

      {/* In season, To do and the deadline list live on the Team tab (/roster). */}
      {ctx.offseason && <ActionQueue items={actions} compact className="mt-4" />}
      <DigestBeacon metrics={digest.nextMetrics} />

      <nav aria-label="Also this week" className="mt-4 flex flex-wrap gap-x-5">
        <Link href="/lab/pulse" className="inline-flex min-h-11 items-center gap-0.5 text-note font-semibold text-accent-text">
          What moved in the league
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
        {rosterId != null && (
          <Link href={`/managers/${rosterId}`} className="inline-flex min-h-11 items-center gap-0.5 text-note font-semibold text-accent-text">
            Your dossier
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        )}
      </nav>
    </div>
  );
}
