import { Fragment } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { getLeagueHistory } from "@/lib/history";
import { leagueValueRanking, currentFormByRoster } from "@/lib/roster";
import { depthChartsByTeam, depthRowFor } from "@/lib/depth";
import { leagueTimelines } from "@/lib/metrics/duration";
import { leagueFragility, lineupSlots } from "@/lib/metrics/fragility";
import {
  BarList,
  Card,
  Chip,
  Disclosure,
  List,
  ListRow,
  PageHeader,
  SectionHeader,
  Sheet,
  StatTile,
  Tabs,
} from "@/components/ui";
import { PostureTag } from "@/components/PostureTag";
import { TeamAvatar } from "@/components/TeamAvatar";
import { ValueAssetDetail } from "@/components/ValuesList";
import { ProvenanceRail } from "@/components/ProvenanceRail";
import { buildProvenance } from "@/lib/provenance";
import { loadProvenanceSource } from "@/lib/provenance/source";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { AgeStrip } from "@/components/charts";
import { DistributionStrip } from "@/components/DistributionStrip";
import { Onward } from "@/components/Onward";
import { ageMultiplier, isStarTier } from "@/lib/valuation";
import { fmtValue } from "@/lib/ui";
import { OpenInSleeper } from "@/components/OpenInSleeper";
import { sleeperTeamUrl } from "@/lib/sleeperLinks";
import {
  awayPicks,
  posturesByRoster,
  readPickAgency,
  summarizeAgency,
} from "@/lib/agency";
import { loadDraftOrderFidelity, loadPickSlots } from "@/lib/agency/source";
import { PickAgencyPanel } from "@/components/PickAgencyPanel";
import { RosterCrunchPanel } from "@/components/RosterCrunchPanel";
import { DirectionCard } from "@/components/team/DirectionCard";
import { TabIndex } from "@/components/TabIndex";
import { getPrincipals } from "@/lib/principals";
import { diagnose } from "@/lib/gameplan";
import { directionSummary } from "@/lib/team";
/**
 * TEAM. The first screen answers "where does my team stand?": total value and its
 * rank, then the plan's direction with its three inputs. Players, picks and the
 * league-relative outlook sit behind tabs; a player row opens his detail in a bottom
 * sheet. All numbers come from lib/; this page only composes.
 */
export const dynamic = "force-dynamic";
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
  // One rank scale for this roster's rows, so two open rows are comparable.
  const rosterRankAxisMax = Math.max(
    1,
    ...a.valued.flatMap((v) =>
      [v.consensusRank, v.pricedRank].filter((n) => typeof n === "number"),
    ),
  );
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
  const principals = await getPrincipals(h);
  let dx = null;
  try {
    dx = diagnose(h, rosterId, principals);
  } catch (err) {
    console.error(`[roster] direction unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }
  const direction = directionSummary({ dx, analysis: a, form });
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
  const record = form ? `${form.wins}-${form.losses}` : `${a.record.wins}-${a.record.losses}`;
  const roundLabel = (r) => (r === 1 ? "1st" : r === 2 ? "2nd" : r === 3 ? "3rd" : `${r}th`);
  const players = (
    <>
      <RosterCrunchPanel h={h} rosterId={rosterId} onlyWhenRelevant className="mb-3" />
      <List aria-label="Players by value">
        {a.valued.map((v, i) => {
          const traj = valueTrajectory(v);
          const meta = [v.position ?? "-", v.team, v.age != null ? `${v.age}` : null]
            .filter(Boolean)
            .join(" · ");
          return (
            <Fragment key={v.playerId}>
              {(i === 0 || a.valued[i - 1].tier !== v.tier) && (
                <li aria-hidden="true" className="bg-surface-2 px-4 py-1.5 text-meta font-semibold text-secondary">
                  {v.tier}
                </li>
              )}
              <li>
                <Sheet
                  triggerLabel={`${v.name}, value ${fmtValue(v.value)}. Show details`}
                  title={v.name}
                  subtitle={`${meta}${v.tier ? ` · ${v.tier}` : ""}`}
                  trigger={
                    <ListRow
                      as="span"
                      chevron
                      avatar={<PlayerAvatar name={v.name} team={v.team} playerId={v.playerId} size="sm" />}
                      title={v.name}
                      badge={
                        v.injury ? (
                          <Chip tone="negative" size="sm" icon={AlertTriangle}>
                            {v.injury}
                          </Chip>
                        ) : null
                      }
                      meta={meta}
                      value={fmtValue(v.value)}
                      valueSub={a.playerValue ? `${Math.round((v.value / a.playerValue) * 100)}% of team` : null}
                    />
                  }
                >
                  <div className="grid grid-cols-2 gap-2">
                    <StatTile className="bg-surface-2" label="Value" value={fmtValue(v.value)} sub={v.tier} />
                    <StatTile
                      className="bg-surface-2"
                      label="Share of team"
                      value={a.playerValue ? `${Math.round((v.value / a.playerValue) * 100)}%` : "unknown"}
                      sub={`of ${fmtValue(a.playerValue)} player value`}
                    />
                  </div>
                  {traj && (
                    <div className="mt-3 rounded-card bg-surface-2 p-3">
                      <p className="text-meta font-medium text-secondary">
                        Age curve alone, against this season
                      </p>
                      <ol className="mt-2 grid grid-cols-3 gap-2">
                        {traj.slice(1).map((t, n) => {
                          const pct = traj[0] ? Math.round((t / traj[0] - 1) * 100) : 0;
                          return (
                            <li key={n}>
                              <span className="block text-micro text-secondary">+{n + 1} yr</span>
                              <span className="block figure text-note font-semibold text-ink">
                                {pct > 0 ? `+${pct}` : pct}%
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                      <p className="mt-1.5 text-micro text-secondary">Injury, role and position held fixed.</p>
                    </div>
                  )}
                  <div className="mt-3">
                    <ValueAssetDetail
                      name={v.name}
                      age={v.age}
                      tier={v.tier}
                      playerId={v.playerId}
                      injury={v.injury}
                      injuryDetail={v.injuryDetail}
                      consensusRank={v.consensusRank}
                      pricedRank={v.pricedRank}
                      productionBacked={v.productionBacked}
                      productionRefusal={v.productionRefusal}
                      rankAxisMax={rosterRankAxisMax}
                      depth={depthRowFor(charts, h.players.get(v.playerId))}
                      provenance={
                        provenance[v.playerId] && (
                          <ProvenanceRail chain={provenance[v.playerId]} names={ctx.names} showTitle />
                        )
                      }
                    />
                  </div>
                </Sheet>
              </li>
            </Fragment>
          );
        })}
      </List>
      <Link
        href="/values"
        className="mt-1 inline-flex min-h-11 items-center gap-0.5 text-note font-semibold text-accent-text"
      >
        Every asset in the league
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
    </>
  );

  const picks = (
    <>
      {a.picks.picks.length === 0 ? (
        <Card>
          <p className="text-body text-muted">No draft picks owned; every future pick has been traded away.</p>
        </Card>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <StatTile label="Pick capital" value={fmtValue(a.picks.total)} sub={`${a.picks.picks.length} picks`} />
            <StatTile
              label="Firsts"
              value={String(a.picks.firsts)}
              sub={
                a.picks.extraFirsts === 0
                  ? "at baseline"
                  : `${a.picks.extraFirsts > 0 ? "+" : ""}${a.picks.extraFirsts} against baseline`
              }
            />
          </div>
          <List aria-label="Picks by season">
            {a.picks.seasons.map((season) => {
              const forSeason = a.picks.picks.filter((p) => p.season === season);
              if (!forSeason.length) return null;
              return (
                <li key={season}>
                  <ListRow
                    href="/drafts"
                    title={season}
                    value={fmtValue(forSeason.reduce((s, p) => s + p.value, 0))}
                    valueSub={`${forSeason.length} ${forSeason.length === 1 ? "pick" : "picks"}`}
                  >
                    <span className="mt-1 flex flex-wrap gap-1">
                      {forSeason.map((p) => (
                        <Chip
                          key={`${p.season}-${p.round}-${p.originalRoster}`}
                          size="sm"
                          tone={p.round === 1 ? "accent" : "neutral"}
                        >
                          {roundLabel(p.round)}
                          {p.acquired && p.fromName ? ` via ${p.fromName}` : ""}
                        </Chip>
                      ))}
                    </span>
                  </ListRow>
                </li>
              );
            })}
          </List>
        </>
      )}
      {agencyReads.length > 0 && (
        <>
          <SectionHeader title="Whose season decides them" href="/league" cta="Postures" />
          <PickAgencyPanel reads={agencyReads} summary={agency} orderLine={orderFidelity.panelLine} />
        </>
      )}
    </>
  );

  const outlook = (
    <>
      <SectionHeader title="Against the league" className="mt-1" />
      <Card pad="sm" className="space-y-1.5">
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
          sub={`${a.picks.firsts} firsts`}
          values={dist.pickCapital}
          mine={a.picks.total}
          format={fmtValue}
          betterEnd="high"
        />
        <DistributionStrip
          href="/plan"
          label="Top 5 share"
          sub="of player value, in your best five"
          values={dist.top5}
          mine={top5Share}
          format={(n) => `${n}%`}
        />
        <Disclosure className="px-1.5" summary="How to read these strips">
          Every tick is one of the {dist.totalValue.length} rosters. The dashed line is the
          league median, not a pass mark. Top 5 share has no better end: concentration is a
          shape, not a score.
        </Disclosure>
      </Card>

      {tl && (
        <>
          <SectionHeader title="Your timeline" href="/methodology" cta="How TCI works" />
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-6">
                <div>
                  <p className="text-meta font-medium text-secondary">Duration</p>
                  <p className="figure text-display font-bold text-ink">{tl.rosterDuration.toFixed(1)}s</p>
                </div>
                <div>
                  <p className="text-meta font-medium text-secondary">TCI</p>
                  <p className="figure text-display font-bold text-ink">{tl.tci}</p>
                </div>
              </div>
              <PostureTag posture={tl.posture} />
            </div>
            <p className="mt-1 figure text-meta text-secondary">
              {Math.round(tl.nowShare * 100)}% pays off inside 2 seasons ·{" "}
              {Math.round(tl.laterShare * 100)}% arrives 4+ out
            </p>
            <DistributionStrip label="League TCI" values={dist.tci} mine={tl.tci} betterEnd="high" className="mt-2" />
            {fr && fr.singlePointOfFailure && (
              <div className="mt-3 flex items-center gap-2.5 rounded-control bg-surface-2 p-2.5">
                <PlayerAvatar
                  name={fr.singlePointOfFailure.name}
                  team={spofTeam}
                  playerId={fr.singlePointOfFailure.playerId}
                  size="sm"
                  teamBadge
                />
                <p className="min-w-0 text-note text-muted">
                  Season hinges on <span className="font-semibold text-ink">{fr.singlePointOfFailure.name}</span>{" "}
                  <span className="figure">({Math.round(fr.singlePointOfFailure.damageShare * 100)}% of startable value)</span>
                </p>
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3">
              {[
                ["Longest-dated", longest],
                ["Shortest-dated", shortest],
              ].map(([label, list]) => (
                <div key={label} className="min-w-0">
                  <p className="text-meta font-medium text-secondary">{label}</p>
                  <ul className="mt-1 space-y-1">
                    {list.map((as) => (
                      <li key={as.id} className="flex items-baseline justify-between gap-1.5 text-meta">
                        <span className="min-w-0 text-ink">{as.label}</span>
                        <span className="shrink-0 figure text-muted">{as.duration.toFixed(1)}s</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <Disclosure className="mt-2" summary="What the timeline says">
              <p>{tl.read}</p>
              {fr && (
                <p className="mt-2">
                  Depth: {depthPhrase(fr.depthBeyondStarters, slotCount)}. Value spread
                  (dispersion) {tl.dispersion.toFixed(2)}s.
                </p>
              )}
            </Disclosure>
            <Disclosure summary="Every asset, by duration">
              <ul className="space-y-1">
                {tl.assets.map((as) => (
                  <li key={as.id} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 text-ink">{as.label}</span>
                    <span className="shrink-0 figure">
                      {as.duration.toFixed(1)}s · {fmtValue(as.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          </Card>
        </>
      )}

      <SectionHeader title="Roster shape" />
      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-note font-semibold text-ink">Ages</p>
          <p className="figure text-meta text-secondary">
            {ages.length} players · core {a.coreAge ?? "unknown"}
          </p>
        </div>
        <AgeStrip ages={ages} height={58} />
        <p className="text-center text-meta text-secondary">One dot per player; dashed line is your average.</p>
        <div className="mt-4 flex items-baseline justify-between gap-2">
          <p className="text-note font-semibold text-ink">Value by position</p>
          <p className="figure text-meta text-secondary">{posCounts}</p>
        </div>
        <BarList
          className="mt-2"
          label="Player value by position"
          items={[...posData]
            .sort((x, y) => y.value - x.value)
            .map((p, i) => ({ key: p.label, label: p.label, value: p.value, highlight: i === 0 }))}
          format={fmtValue}
        />
      </Card>
    </>
  );

  return (
    <div>
      <PageHeader
        leading={
          <TeamAvatar
            name={a.teamName ?? a.ownerName}
            avatarId={user?.avatar}
            teamLogoUrl={user?.teamLogoUrl}
            size="lg"
            isMe
          />
        }
        kicker={a.teamName && a.teamName !== a.ownerName ? `Your team · ${a.ownerName}` : "Your team"}
        title={a.teamName ?? a.ownerName}
        aside={<OpenInSleeper href={sleeperTeamUrl(h.currentLeague.leagueId, rosterId)} label="Sleeper" />}
        below={
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Chip>
              {record}
              {form && !form.isLive ? ` · ${form.season} final` : ""}
            </Chip>
            <Chip>{a.valued.length} players</Chip>
            <Chip>{a.picks.picks.length} picks</Chip>
            {injured > 0 && (
              <Chip tone="negative" icon={AlertTriangle}>
                {injured} injured
              </Chip>
            )}
          </div>
        }
      />

      <Card className="mb-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-meta font-medium text-secondary">Total value</p>
            <p className="figure text-hero font-bold tracking-tight text-ink">{fmtValue(a.totalValue)}</p>
          </div>
          <dl className="shrink-0 space-y-1 pb-1 text-right">
            <div>
              <dt className="text-micro text-secondary">Players</dt>
              <dd className="figure text-note font-semibold text-ink">{fmtValue(a.playerValue)}</dd>
            </div>
            <div>
              <dt className="text-micro text-secondary">Picks</dt>
              <dd className="figure text-note font-semibold text-ink">{fmtValue(a.picks.total)}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <DirectionCard summary={direction} />

      <Tabs
        className="mt-5"
        label="Team sections"
        items={[
          { id: "players", label: "Players", count: a.valued.length, content: players },
          { id: "picks", label: "Picks", count: a.picks.picks.length, content: picks },
          { id: "outlook", label: "Outlook", content: outlook },
        ]}
      />

      <TabIndex tab="team" title="More on your team" className="mt-6" />
      <Onward from="/roster" />
    </div>
  );
}
