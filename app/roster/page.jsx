import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { leagueValueRanking, currentFormByRoster } from "@/lib/roster";
import { depthChartsByTeam, depthRowFor } from "@/lib/depth";
import { leagueTimelines } from "@/lib/metrics/duration";
import { leagueFragility, lineupSlots } from "@/lib/metrics/fragility";
import { Card, PageHeader, SectionHeader, Tag } from "@/components/ui";
import { PostureTag } from "@/components/PostureTag";
import { TeamAvatar } from "@/components/TeamAvatar";
import { ValueAssetRow } from "@/components/ValuesList";
import { ProvenanceRail } from "@/components/ProvenanceRail";
import { buildProvenance } from "@/lib/provenance";
import { loadProvenanceSource } from "@/lib/provenance/source";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { AgeStrip, BarChart, PositionRadar } from "@/components/charts";
import { DistributionStrip } from "@/components/DistributionStrip";
import { Onward } from "@/components/Onward";
import { ageMultiplier, isStarTier } from "@/lib/valuation";
import { fmtValue } from "@/lib/ui";
import { OpenInSleeper } from "@/components/OpenInSleeper";
import { sleeperTeamUrl } from "@/lib/sleeperLinks";
import { ordinal } from "@/lib/derive/describe";
import {
  awayPicks,
  posturesByRoster,
  readPickAgency,
  summarizeAgency,
} from "@/lib/agency";
import { loadDraftOrderFidelity, loadPickSlots } from "@/lib/agency/source";
import { PickAgencyPanel } from "@/components/PickAgencyPanel";
export const dynamic = "force-dynamic";
/*
 * CORE AGE, SAYING ONLY WHAT IT MEASURES.
 *
 * These three used to be labelled "Rebuilding / ascending", "Win-now window" and
 * "Balanced" - three strategy words for a figure that is the value-weighted age of the
 * top 8 players and nothing else. Posture, a different classifier on a different input,
 * used two of the same words for a different question, and /league printed both on one
 * row. The notes below were always honest about this being an age; only the labels were
 * not. See lib/metrics/axes.js.
 *
 * Neutral tone for all three, for the reason components/PostureTag gives: an age is not
 * a grade, and a semantic colour hands the reader a verdict the sentence underneath
 * refuses to give (D6).
 */
const CORE_AGE_COPY = {
  "young core": {
    label: "Young core",
    note: "Your core skews young - time is on your side.",
  },
  "veteran core": {
    label: "Veteran core",
    note: "Your core is the oldest quarter of the league - production now, less of it later.",
  },
  "mixed-age core": {
    label: "Mixed-age core",
    note: "A mixed-age core - you can pivot either direction.",
  },
};
/** How many seasons of trajectory the sparkline shows, current season included. */
const TRAJECTORY_SEASONS = 4;
/**
 * A value-trend sparkline needs a series, and this app deliberately stores no
 * week-over-week value history (D3/D4: the valuation model is recomputed live, not
 * snapshotted - inventing a plausible-looking history would be exactly the kind of
 * fabricated-but-real-looking number this app refuses to ship). What genuinely exists
 * is the published age curve itself, so this projects THIS player's own value forward
 * on that curve, holding injury/role/position fixed - "if nothing else about this
 * player changes, here is what the model says happens as they age." That is an
 * honest, transparent trajectory, not a claim about the past.
 */
function valueTrajectory(v) {
  if (v.age == null || !v.breakdown.age) return undefined;
  // Back out the product of every OTHER multiplier from the already-computed value,
  // so re-walking the age curve at future ages reproduces the current value exactly
  // at offset 0 without re-deriving base/injury/role/position from scratch here.
  const restOfModel = v.value / v.breakdown.age;
  // D74: a top-decile-consensus player was priced on the star-tier curve, not the
  // plain population one - the projection has to walk the SAME curve or it would
  // silently disagree with the value it is supposedly a trajectory of.
  const star = isStarTier(v.consensusRank);
  return Array.from({ length: TRAJECTORY_SEASONS }, (_, n) =>
    Math.round(restOfModel * ageMultiplier(v.age + n, undefined, { star })),
  );
}
/**
 * Startable depth, said the way a manager would say it. Negative is the case worth
 * having the phrase for: it means the lineup is already short and there is no slack
 * left to absorb anything.
 */
function depthPhrase(depth, slots) {
  if (depth > 0)
    return `${depth} startable ${depth === 1 ? "body" : "bodies"} beyond your ${slots} slots`;
  if (depth === 0) return `exactly ${slots} startable bodies and no spares`;
  const short = Math.abs(depth);
  return `${short} ${short === 1 ? "body" : "bodies"} short of filling your ${slots} slots with startable quality`;
}
export default async function RosterPage() {
  const h = await getLeagueHistory();
  const rosterId = h.me.rosterId;
  if (rosterId == null) {
    return <p className="text-muted">Couldn&apos;t identify your roster.</p>;
  }
  // Pulled from the full league ranking rather than a standalone analyzeRoster call so
  // `coreAgeBand` is banded against the same league-relative distribution /league uses -
  // otherwise the same team could read "veteran core" on one page and "mixed-age core"
  // on another.
  const ranked = leagueValueRanking(h);
  const a = ranked.find((r) => r.rosterId === rosterId);
  const win = CORE_AGE_COPY[a.coreAgeBand];
  // One chain per rostered player, built from one assembly. `loadProvenanceSource`
  // costs `getPrincipals` and `buildDraftIndex`, both already loaded on demand and
  // memoized for five minutes by their own modules - it is the bill /drafts has always
  // paid, and nothing here is folded into the corpus (D25).
  const { ctx } = await loadProvenanceSource(h);
  const provenance = {};
  for (const v of a.valued) {
    const chain = buildProvenance(ctx, `p:${v.playerId}`);
    if (chain) provenance[v.playerId] = chain;
  }
  // Where each of these players sits on his REAL team's chart. One index for the
  // whole payload, seventeen O(1) reads off it (lib/depth).
  const charts = depthChartsByTeam(h.players);
  const ages = a.valued.map((v) => v.age).filter((x) => x != null);
  const posData = a.byPosition.map((p) => ({
    label: p.pos,
    value: Math.round(p.value),
  }));
  const posCounts = a.byPosition.map((p) => `${p.pos} ${p.count}`).join(" · ");
  const user = h.rostersById.get(rosterId)?.ownerId
    ? h.usersById.get(h.rostersById.get(rosterId).ownerId)
    : undefined;
  const top5 = a.valued.slice(0, 5).reduce((s, v) => s + v.value, 0);
  const top5Share = a.playerValue
    ? Math.round((top5 / a.playerValue) * 100)
    : 0;
  // Counts INJURIES, not flags. `injury` is null for load management ("Rest"), so a
  // roster stashing four young players on the inactive list no longer reads as an
  // infirmary. Five rostered players in this league carry that flag today.
  const injured = a.valued.filter((v) => v.injury).length;
  // Timeline profile, classified against the whole league (posture is relative).
  const timelines = leagueTimelines(h);
  const tl = timelines.find((t) => t.rosterId === rosterId);
  // Fragility, from the same league-wide pass for the same reason: the band is a
  // percentile. Only the SPOF and the depth are surfaced here - the 0-100 index is
  // ambiguous on its own and has its own homes.
  const fr = leagueFragility(h).find((f) => f.rosterId === rosterId);
  // Team for the SPOF's avatar - looked up from the same `a.valued` list rather than
  // threaded through leagueFragility(), which prices the roster and has no reason to
  // know team colors.
  const spofTeam = fr?.singlePointOfFailure
    ? (a.valued.find((v) => v.playerId === fr.singlePointOfFailure.playerId)
        ?.team ?? null)
    : null;
  const slotCount = lineupSlots(h).length;
  const tciRank = timelines.findIndex((t) => t.rosterId === rosterId) + 1;
  // THE COMPARISON THE HEADLINE NUMBERS WERE MISSING. Every figure in the stat rail
  // is scored against these same fourteen rosters and `ranked` is already in hand, so
  // the distribution costs an array walk over data the page has already paid for -
  // no second valuation pass, no new derivation (D25).
  const share5 = (r) =>
    r.playerValue
      ? Math.round(
          (r.valued.slice(0, 5).reduce((s, v) => s + v.value, 0) /
            r.playerValue) *
            100,
        )
      : 0;
  const dist = {
    totalValue: ranked.map((r) => r.totalValue),
    pickCapital: ranked.map((r) => r.picks.total),
    top5: ranked.map(share5),
    tci: timelines.map((t) => t.tci),
  };
  const longest = tl?.assets.slice(0, 3) ?? [];
  const shortest = tl ? [...tl.assets].slice(-3).reverse() : [];
  const forms = await currentFormByRoster(h);
  const form = forms.get(rosterId);
  /*
   * PICK AGENCY. The join nobody had made: a pick's outcome is decided by whoever's
   * season orders the draft it sits in, which the corpus has always known as the
   * pick's ORIGINAL roster. Both inputs are already in hand - `timelines` is the same
   * league-wide pass the timeline card uses, and `forms` is the map the header
   * already awaited - so the whole read costs one array walk (lib/agency).
   *
   * `loadDraftOrderFidelity` adds NO requests either: it reads the draft index and
   * the per-season rosters, both memoized on-demand loaders this page already pays
   * for through `loadProvenanceSource` and `currentFormByRoster`. It is here because
   * the premise "your own pick is an instrument" assumes a mapping from record to
   * slot, and in this league that mapping is loose. Printing the measurement beside
   * the claim is the honest version of making the claim at all.
   */
  const [orderFidelity, pickSlots] = await Promise.all([
    loadDraftOrderFidelity(h),
    loadPickSlots(h),
  ]);
  const agencyInputs = {
    postures: posturesByRoster(timelines),
    forms,
    slots: pickSlots,
  };
  const agencyReads = a.picks.picks.map((p) =>
    readPickAgency(h, rosterId, p, agencyInputs),
  );
  /*
   * THE SECOND HALF OF THE LEDGER. `awayPicks` is the reciprocal of the list above: the
   * picks this roster's own seasons will order that somebody else is holding. It reads
   * `pickCapital` in its "original" mode over data already in hand, so it costs one more
   * pass and no requests, and it is what makes the panel's middle row possible at all.
   */
  const agency = summarizeAgency(
    agencyReads,
    awayPicks(h, rosterId, a.picks.picks),
  );
  return (
    <div>
      {/* Identity, record, window and core age in one block - what used to be a
            header plus a separate window card. min-w-0 lets long names truncate
            instead of pushing the Sleeper link off a 390px screen. */}
      <PageHeader
        leading={
          <TeamAvatar
            name={a.teamName ?? a.ownerName}
            avatarId={user?.avatar}
            teamLogoUrl={user?.teamLogoUrl}
            size="md"
            isMe
          />
        }
        kicker={
          <span className="block truncate">{a.teamName ?? "Your team"}</span>
        }
        title={a.ownerName}
        truncateTitle
        aside={
          <OpenInSleeper
            href={sleeperTeamUrl(h.currentLeague.leagueId, rosterId)}
            label="Sleeper"
          />
        }
        below={
          <>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {/* One string, so a wrap never leaves a dangling separator. */}
              <span className="figure text-meta text-secondary">
                <span className="font-semibold text-ink">
                  {form
                    ? `${form.wins}-${form.losses}`
                    : `${a.record.wins}-${a.record.losses}`}
                </span>{" "}
                {form && !form.isLive && (
                  <span className="text-secondary">
                    ({form.season} final, {ordinal(form.rank)} of {form.teams}
                    ){" "}
                  </span>
                )}
                · {a.valued.length} players · {a.picks.picks.length} picks ·
                core age{" "}
                <span className="font-semibold text-ink">
                  {a.coreAge ?? "-"}
                </span>
                {injured > 0 && (
                  <>
                    {" "}
                    {/* Separator inside the nowrap span so a wrap never leaves it
                    stranded at the end of a line. */}
                    <span className="whitespace-nowrap">
                      · <span className="text-negative">{injured} injured</span>
                    </span>
                  </>
                )}
              </span>
              <Tag tone="neutral">{win.label}</Tag>
            </div>
            <p className="mt-1 text-note leading-snug text-muted">{win.note}</p>
          </>
        }
      />

      {/*
       * THE HEADLINE NUMBERS, WITH THE ONLY THING THAT MAKES THEM MEAN ANYTHING.
       *
       * This was two blocks: a three-cell rail printing "TOTAL VALUE 26,641" and,
       * directly under it, a strip printing "TOTAL VALUE 26,641 - 11th of 14". Same
       * three figures, twice, in 150px. One block now - each row keeps the
       * destination its cell linked to, and gains the distribution the cell could
       * never carry. A rank on its own ("11th") does not say whether the pack is
       * bunched or strung out, and the pack is the reading.
       */}
      <div className="space-y-1.5 rounded-[--radius-sm] border border-border bg-surface p-1.5">
        <DistributionStrip
          href="/values"
          label="Total value"
          sub={`${fmtValue(a.playerValue)} of it in players`}
          values={dist.totalValue}
          mine={a.totalValue}
          format={fmtValue}
          betterEnd="high"
        />
        <DistributionStrip
          href="/drafts"
          label="Pick capital"
          sub={`${a.picks.firsts} firsts${
            a.picks.extraFirsts === 0
              ? " at baseline"
              : ` (${a.picks.extraFirsts > 0 ? "+" : ""}${a.picks.extraFirsts} against baseline)`
          }`}
          values={dist.pickCapital}
          mine={a.picks.total}
          format={fmtValue}
          betterEnd="high"
        />
        {/* No `betterEnd`: concentration is a shape, not a score. A top-heavy roster
            is a contender's roster and a rebuild's problem, and the app does not get
            to decide which one you are (D23). */}
        <DistributionStrip
          href="/plan"
          label="Top 5 share"
          sub="of player value, in your best five"
          values={dist.top5}
          mine={top5Share}
          format={(n) => `${n}%`}
        />
        <p className="px-1.5 text-meta leading-snug text-secondary">
          Every tick is one of the {dist.totalValue.length} rosters. The dashed
          line is the league median, not a pass mark.
        </p>
      </div>

      {/* Timeline: WHEN this roster's value arrives, and whether the assets agree.
            The read is written to be useful, not flattering - do not soften it. */}
      {tl && (
        <>
          <SectionHeader
            title="Your timeline"
            href="/methodology"
            cta="how TCI works"
          />
          <Card className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-3">
                <span>
                  <span className="figure text-lede leading-tight font-semibold text-ink">
                    {tl.rosterDuration.toFixed(1)}s
                  </span>
                  <span className="ml-1 text-meta uppercase tracking-wide text-secondary">
                    duration
                  </span>
                </span>
                <span>
                  <span className="figure text-lede leading-tight font-semibold text-ink">
                    {tl.tci}
                  </span>
                  <span className="ml-1 text-meta uppercase tracking-wide text-secondary">
                    TCI · {tciRank}/{timelines.length}
                  </span>
                </span>
              </div>
              <PostureTag posture={tl.posture} />
            </div>
            <p className="mt-1 figure text-meta text-secondary">
              {Math.round(tl.nowShare * 100)}% of value pays off inside 2
              seasons · {Math.round(tl.laterShare * 100)}% arrives 4+ out ·
              dispersion {tl.dispersion.toFixed(2)}s
            </p>
            {/* TCI is the one number in this app most often read as a percentage,
                which it is not. Fourteen ticks say what "61" is worth here in a way
                the rank alone does not. */}
            <DistributionStrip
              label="League TCI"
              values={dist.tci}
              mine={tl.tci}
              betterEnd="high"
              className="mt-1.5"
            />
            <p className="mt-1.5 text-note leading-snug text-ink/85">
              {tl.read}
            </p>
            {/* Fragility's actionable half, on the page that owns your roster.
                Deliberately the two numbers and not the 0-100 index: a name and a
                share are directional and a score is not (D23), and both of these are
                already computed for every roster by leagueFragility(). */}
            {fr && fr.singlePointOfFailure && (
              <div className="mt-1 flex items-start gap-1.5">
                {/* The single highest-stakes name on this page - a face here is
                    worth more than anywhere else it could go, which is exactly why
                    it's the ONE inline avatar on this page rather than one per row. */}
                <PlayerAvatar
                  name={fr.singlePointOfFailure.name}
                  team={spofTeam}
                  playerId={fr.singlePointOfFailure.playerId}
                  size="sm"
                  className="mt-0.5"
                  // The sentence beside this never names his NBA team, so the crest
                  // is new information here rather than a second copy of one.
                  teamBadge
                />
                <p className="text-note leading-snug text-muted">
                  Season hinges on{" "}
                  <span className="font-semibold text-ink">
                    {fr.singlePointOfFailure.name}
                  </span>{" "}
                  <span className="figure">
                    ({Math.round(fr.singlePointOfFailure.damageShare * 100)}% of
                    startable value)
                  </span>{" "}
                  · {depthPhrase(fr.depthBeyondStarters, slotCount)}
                </p>
              </div>
            )}
            <div className="rule my-2.5" />
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <p className="text-meta uppercase tracking-wide text-info">
                  Longest-dated
                </p>
                <ul className="mt-0.5 space-y-0.5">
                  {longest.map((as) => (
                    <li
                      key={as.id}
                      className="flex items-baseline justify-between gap-1.5 text-meta leading-snug"
                    >
                      {/* Wraps instead of truncating: a pick label carrying an origin
                    qualifier ("2027 2nd (via 5-Year Plan)") no longer fits this
                    narrow column on one line, and clipping it loses exactly the
                    part that makes the qualifier worth having. */}
                      <span className="min-w-0 text-ink/85">{as.label}</span>
                      <span className="shrink-0 figure text-meta text-muted">
                        {as.duration.toFixed(1)}s
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="min-w-0">
                <p className="text-meta uppercase tracking-wide text-accent-text">
                  Shortest-dated
                </p>
                <ul className="mt-0.5 space-y-0.5">
                  {shortest.map((as) => (
                    <li
                      key={as.id}
                      className="flex items-baseline justify-between gap-1.5 text-meta leading-snug"
                    >
                      <span className="min-w-0 text-ink/85">{as.label}</span>
                      <span className="shrink-0 figure text-meta text-muted">
                        {as.duration.toFixed(1)}s
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <details className="group mt-1.5">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-meta font-semibold uppercase tracking-wide text-accent-text">
                <ChevronRight
                  size={13}
                  aria-hidden="true"
                  className="disclosure-chevron group-open:rotate-90"
                />
                Every asset, by duration
              </summary>
              <ul className="disclosure-body space-y-0.5 pb-1">
                {tl.assets.map((as) => (
                  <li
                    key={as.id}
                    className="flex items-baseline justify-between gap-2 text-meta leading-snug"
                  >
                    <span className="min-w-0 truncate text-ink/85">
                      {as.label}
                    </span>
                    <span className="shrink-0 figure text-meta text-muted">
                      {as.duration.toFixed(1)}s · {fmtValue(as.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </Card>
        </>
      )}

      {/* Pick capital - in dynasty, picks are assets, so they get real estate.
            One row per season instead of one card per season. */}
      <SectionHeader
        title={`Draft capital - ${a.picks.picks.length} picks`}
        href="/drafts"
        cta="lineage"
      />
      {a.picks.picks.length === 0 ? (
        <Card className="p-3">
          <p className="text-body leading-relaxed text-muted">
            No draft picks owned. Every future pick has been traded away - that
            caps how much this roster can change.
          </p>
        </Card>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-[--radius-sm] border border-border bg-surface">
          {a.picks.seasons.map((season) => {
            const forSeason = a.picks.picks.filter((p) => p.season === season);
            if (!forSeason.length) return null;
            return (
              <li key={season}>
                {/* Season label and total on one line, chips using the FULL width
                        below it - attribution ("via X") is long, and giving the chips
                        the whole row costs fewer lines than an inline column. */}
                <Link
                  href="/drafts"
                  className="block min-h-11 px-2.5 py-2 transition-colors hover:bg-surface-2"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="figure text-body font-semibold text-ink">
                      {season}
                    </span>
                    <span className="flex items-center gap-1 figure text-meta text-muted">
                      {forSeason.length} picks ·{" "}
                      {fmtValue(forSeason.reduce((s, p) => s + p.value, 0))}
                      <ChevronRight
                        size={13}
                        aria-hidden="true"
                        className="text-faint"
                      />
                    </span>
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {forSeason.map((p) => (
                      <Tag
                        key={`${p.season}-${p.round}-${p.originalRoster}`}
                        tone={p.round === 1 ? "accent" : "neutral"}
                      >
                        {p.round === 1
                          ? "1st"
                          : p.round === 2
                            ? "2nd"
                            : `${p.round}rd`}
                        {p.acquired && p.fromName ? ` via ${p.fromName}` : ""}
                      </Tag>
                    ))}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* WHOSE SEASON DECIDES THEM. The list above says what you hold; this says
            whether the outcome is yours. A pick set by your own season is an
            instrument you act on, and a pick set by somebody else's is a claim on
            their intentions - the same asset on the balance sheet, two different
            things to own. */}
      {agencyReads.length > 0 && (
        <>
          <SectionHeader
            title="Whose season decides them"
            href="/league"
            cta="every posture"
          />
          <PickAgencyPanel
            reads={agencyReads}
            summary={agency}
            orderLine={orderFidelity.panelLine}
          />
        </>
      )}

      {/* Both shape charts in one card - two section headers and two card
            paddings for the same information was pure vertical cost. */}
      <SectionHeader title="Roster shape" />
      <Card className="p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-meta font-semibold uppercase tracking-wide text-secondary">
            Age curve
          </span>
          <span className="figure text-meta text-muted">
            {ages.length} ages · core {a.coreAge ?? "-"}
          </span>
        </div>
        <AgeStrip ages={ages} height={58} />
        <p className="text-center text-meta text-secondary">
          Each dot is a rostered player. The dashed line is your average.
        </p>
        <div className="rule my-2.5" />
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-meta font-semibold uppercase tracking-wide text-secondary">
            Positional value
          </span>
          <span className="truncate figure text-meta text-muted">
            {posCounts}
          </span>
        </div>
        {/* Radar reads shape (balanced vs. concentrated) at a glance, which a bar
            chart can't; a roster missing 3+ distinct positions can't form a
            legible polygon, so that rare case keeps the bar chart instead. */}
        {posData.length >= 3 ? (
          <PositionRadar data={posData} format={(n) => fmtValue(n)} />
        ) : (
          <BarChart data={posData} height={112} format={(n) => fmtValue(n)} />
        )}
      </Card>

      <SectionHeader
        title="Roster - by value"
        href="/values"
        cta="all values"
      />
      <p className="-mt-1 mb-1.5 figure text-meta text-secondary">
        {a.valued.length} players · bar = share of {fmtValue(a.playerValue)}{" "}
        player value · line = {TRAJECTORY_SEASONS}-season age-curve trajectory
      </p>
      <ul className="space-y-1">
        {a.valued.map((v) => (
          <ValueAssetRow
            // WHY HE IS HERE, in place. This is the page that asks the question, so
            // this is the page that answers it without a navigation: expanding a row
            // shows the whole chain back to whichever of the five origins it ends on.
            // Seventeen rails is seventeen array walks over data already in hand -
            // the only real cost is `loadProvenanceSource` above, which is two
            // memoized on-demand loaders and not a corpus change (D25).
            provenance={
              provenance[v.playerId] && (
                <ProvenanceRail chain={provenance[v.playerId]} showTitle />
              )
            }
            key={v.playerId}
            name={v.name}
            team={v.team}
            position={v.position}
            age={v.age}
            value={v.value}
            tier={v.tier}
            playerId={v.playerId}
            injury={v.injury}
            injuryDetail={v.injuryDetail}
            share={a.playerValue ? v.value / a.playerValue : 0}
            consensusRank={v.consensusRank}
            depth={depthRowFor(charts, h.players.get(v.playerId))}
            trajectory={valueTrajectory(v)}
            // Young players' declining trajectory is just the age-curve premium unwinding,
            // not a warning - show it in muted color instead of red.
            trajectoryColor={
              v.age != null && v.age < 26 ? "var(--color-muted)" : undefined
            }
          />
        ))}
      </ul>

      <Onward from="/roster" />
    </div>
  );
}
